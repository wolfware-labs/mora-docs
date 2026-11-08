import { expect, test } from '@playwright/test';
import snapshot from '../../src/data/roadmap.snapshot.json' with { type: 'json' };
import { RELEASES } from '../../src/data/releases';
import { progress } from '../../src/lib/roadmap';
import { INTRO, POINTS, plain } from '../../src/data/pitch';

const mvp = snapshot.milestones.filter((m) => RELEASES[0].milestones.includes(m.code));
const mvpProgress = progress(mvp);
const mvpText = `${mvpProgress.closed} of ${mvpProgress.total} issues closed`;

test('the landing page shows the hero program and the MVP progress', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Mora/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Clear syntax.');
  await expect(page.locator('pre').first()).toContainText('WebApp.Create<App>(args)');
  await expect(page.locator('pre').first()).toContainText('return match (users.Find(id))');
  await expect(page.getByTestId('mvp-progress')).toHaveText(mvpText);
  await expect(page.locator('footer')).toContainText(`© ${new Date().getFullYear()} Wolfware LLC.`);
});

test('the hero tabs switch between the example files', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Example files' });
  const tab = (name: string) => tabs.getByRole('tab', { name });
  const panel = page.getByRole('tabpanel');
  const height = async () => (await page.locator('.hero-panels').boundingBox())!.height;
  const program = 'WebApp.Create<App>(args)';
  const services = 'decorate IUserStore with CachingUserStore;';
  const model = 'struct User(Id: int, Name: string, Email: string?);';
  const start = await height();

  await tab('Services.mr').click();
  await expect(tab('Services.mr')).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toContainText(services);
  expect(await height()).toBe(start);

  await page.keyboard.press('ArrowRight');
  await expect(tab('Model.mr')).toBeFocused();
  await expect(panel).toContainText(model);
  expect(await height()).toBe(start);

  await page.keyboard.press('ArrowRight');
  await expect(tab('Program.mr')).toBeFocused();
  await expect(panel).toContainText(program);

  await page.keyboard.press('ArrowLeft');
  await expect(tab('Model.mr')).toBeFocused();
  await expect(panel).toContainText(model);

  await page.keyboard.press('Home');
  await expect(tab('Program.mr')).toBeFocused();
  await expect(panel).toContainText(program);

  await page.keyboard.press('End');
  await expect(tab('Model.mr')).toBeFocused();
  await expect(panel).toContainText(model);

  await page.keyboard.press('Control+Home');
  await expect(tab('Model.mr')).toBeFocused();
  await expect(panel).toContainText(model);
});

test('the landing page links to the docs and the roadmap', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'See the full roadmap →' }).click();
  await expect(page).toHaveURL(/\/roadmap\/$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'Read the docs' }).click();
  await expect(page).toHaveURL(/\/docs\/$/);
});

test('the roadmap matches the snapshot', async ({ page }) => {
  await page.goto('/roadmap/');
  await expect(page.getByTestId('as-of')).toHaveAttribute('datetime', snapshot.asOf);
  await expect(page.getByTestId('release-v0.1')).toContainText(mvpText);
  for (const m of mvp) {
    await expect(page.getByTestId(`milestone-${m.code}`)).toContainText(`${m.closed} of ${m.open + m.closed} issues closed`);
  }
  for (const e of snapshot.explorations) {
    await expect(page.getByRole('link', { name: `#${e.number} ${e.title}` })).toBeVisible();
  }
});

test('docs pages are generated from the spec, with match in code', async ({ page }) => {
  await page.goto('/docs/language/dependency-injection/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dependency injection');
  await expect(page.locator('.expressive-code').first()).toContainText('services Storage {');
  await page.goto('/docs/tour/complete-program/');
  await expect(page.locator('main')).toContainText('match (store.Find(id))');
  await expect(page.locator('main')).not.toContainText('switch (store.Find(id))');
});

test('every error page is listed', async ({ page }) => {
  await page.goto('/docs/errors/');
  const links = page.locator('main table a');
  expect(await links.count()).toBeGreaterThan(0);
  await links.first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^MR\d{4}$/);
});

test('llms.txt lists the docs', async ({ request }) => {
  const res = await request.get('/llms.txt');
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).toMatch(/^# Mora/);
  expect(text).toContain('[Dependency injection](https://moralang.org/docs/language/dependency-injection/)');
});

test('the hero and llms.txt show the same pitch', async ({ page, request }) => {
  await page.goto('/');
  const hero = page.getByRole('heading', { level: 1 }).locator('..');
  await expect(hero).toContainText(INTRO);
  const points = page.getByTestId('hero-points').getByRole('listitem');
  await expect(points).toHaveCount(POINTS.length);
  for (const [i, p] of POINTS.entries()) {
    await expect(points.nth(i).locator('strong')).toHaveText(p.title);
    await expect(points.nth(i).locator('span')).toHaveText(plain(p.detail));
  }

  const text = await (await request.get('/llms.txt')).text();
  expect(text).toContain(`> ${INTRO}`);
  for (const p of POINTS) expect(text).toContain(`- ${p.title}: ${p.detail}`);
});

for (const path of ['/', '/roadmap/', '/docs/memory/ownership/']) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

for (const path of ['/', '/roadmap/', '/docs/language/expressions/']) {
  test(`${path} has a back-to-top button once scrolled`, async ({ page }) => {
    await page.goto(path);
    const button = page.getByRole('button', { name: 'Back to top' });
    await expect(button).toHaveAttribute('data-shown', 'false');
    await page.mouse.wheel(0, 2000);
    await expect(button).toHaveAttribute('data-shown', 'true');
    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(button).toHaveAttribute('data-shown', 'false');
  });
}

test('the docs use the site domain, not the old one', async ({ page }) => {
  await page.goto('/docs/install/');
  await expect(page.locator('main')).toContainText('https://moralang.org/install.sh');
  await expect(page.locator('main')).not.toContainText('mora-lang.dev');
});

test('the favicon is square', async ({ request }) => {
  const res = await request.get('/brand/favicon-32.png');
  expect(res.ok()).toBe(true);
  const png = await res.body();
  // Width and height sit at bytes 16 and 20 of the IHDR chunk.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([32, 32]);
  expect((await request.get('/favicon.ico')).ok()).toBe(true);
});

test('the docs header has one bottom border, across the full width', async ({ page }) => {
  await page.goto('/docs/');
  const borders = await page.evaluate(() =>
    [...document.querySelectorAll('.header')].map((e) => ({
      outer: e.tagName === 'HEADER',
      width: getComputedStyle(e).borderBottomWidth,
    })),
  );
  expect(borders).toEqual([
    { outer: true, width: '1px' },
    { outer: false, width: '0px' },
  ]);
});
