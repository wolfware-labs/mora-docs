import { describe, expect, it } from 'vitest';
import { fetchRoadmap, loadRoadmap, milestoneStatus, parseTitle, progress } from '../../src/lib/roadmap';

const milestone = (number: number, title: string, open: number, closed: number) => ({
  number,
  title,
  html_url: `https://github.com/wolfware-labs/mora-lang/milestone/${number}`,
  open_issues: open,
  closed_issues: closed,
});

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('[]', { status: 200 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as typeof fetch;
}

describe('parseTitle', () => {
  it('splits the code from the name', () => {
    expect(parseTitle('M6: Async and HTTP')).toEqual({ code: 'M6', name: 'Async and HTTP' });
    expect(parseTitle('M12 Registry and signing')).toEqual({ code: 'M12', name: 'Registry and signing' });
  });

  it('leaves a title without a code as the name', () => {
    expect(parseTitle('Someday')).toEqual({ code: '', name: 'Someday' });
  });
});

describe('milestoneStatus', () => {
  it('reads done, in progress and planned from the counts', () => {
    expect(milestoneStatus({ open: 0, closed: 4 })).toBe('done');
    expect(milestoneStatus({ open: 1, closed: 21 })).toBe('in-progress');
    expect(milestoneStatus({ open: 16, closed: 0 })).toBe('planned');
  });
});

describe('progress', () => {
  it('sums closed and total issues and rounds the percentage', () => {
    expect(progress([{ open: 1, closed: 21 }, { open: 15, closed: 16 }])).toEqual({ closed: 37, total: 53, percent: 70 });
  });

  it('is zero percent with no issues', () => {
    expect(progress([])).toEqual({ closed: 0, total: 0, percent: 0 });
  });
});

describe('fetchRoadmap', () => {
  it('lists issues for post-MVP milestones only, without pull requests', async () => {
    const calls: string[] = [];
    const roadmap = await fetchRoadmap({
      now: new Date('2026-11-02T12:00:00Z'),
      fetch: fakeFetch(
        {
          'milestones?': [milestone(9, 'M8: WebAssembly and libraries', 2, 0), milestone(1, 'M0: Foundations', 1, 21)],
          'milestone=9': [
            { number: 184, title: 'Stable plugin ABI', html_url: 'https://github.com/x/184' },
            { number: 300, title: 'A pull request', html_url: 'https://github.com/x/300', pull_request: {} },
          ],
          'milestone=none': [{ number: 211, title: 'Small plain values', html_url: 'https://github.com/x/211' }],
        },
        calls,
      ),
    });
    expect(roadmap.asOf).toBe('2026-11-02');
    expect(roadmap.milestones.map((m) => m.code)).toEqual(['M0', 'M8']);
    expect(roadmap.milestones[0].issues).toEqual([]);
    expect(roadmap.milestones[1].issues.map((i) => i.number)).toEqual([184]);
    expect(roadmap.explorations.map((i) => i.number)).toEqual([211]);
    expect(calls.some((c) => c.includes('milestone=1&'))).toBe(false);
  });

  it('rejects an unexpected response', async () => {
    await expect(fetchRoadmap({ fetch: fakeFetch({ 'milestones?': [{ number: 'one' }] }) })).rejects.toThrow();
  });
});

describe('loadRoadmap', () => {
  it('falls back to the snapshot when GitHub fails', async () => {
    const failing = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const roadmap = await loadRoadmap({ fetch: failing });
    expect(roadmap.milestones.length).toBeGreaterThan(0);
  });
});
