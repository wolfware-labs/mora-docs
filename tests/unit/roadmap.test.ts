import { describe, expect, it } from 'vitest';
import {
  createRoadmapCache,
  fetchRoadmap,
  milestoneStatus,
  parseTitle,
  progress,
  type Roadmap,
  updatedText,
} from '../../src/lib/roadmap';

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
    expect(roadmap.asOf).toBe('2026-11-02T12:00:00.000Z');
    expect(roadmap.milestones.map((m) => m.code)).toEqual(['M0', 'M8']);
    expect(roadmap.milestones[0].issues).toEqual([]);
    expect(roadmap.milestones[1].issues.map((i) => i.number)).toEqual([184]);
    expect(roadmap.explorations.map((i) => i.number)).toEqual([211]);
    expect(calls.some((c) => c.includes('milestone=1&'))).toBe(false);
  });

  it('sends the token its auth source gives on every call', async () => {
    const auths: (string | null)[] = [];
    const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      auths.push(new Headers(init?.headers).get('authorization'));
      const body = auths.length === 1 ? [milestone(1, 'M0: Foundations', 0, 27)] : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof globalThis.fetch;
    await fetchRoadmap({ fetch, auth: () => Promise.resolve('ghs_app') });
    expect(auths).toEqual(['Bearer ghs_app', 'Bearer ghs_app']);
  });

  it('rejects an unexpected response', async () => {
    await expect(fetchRoadmap({ fetch: fakeFetch({ 'milestones?': [{ number: 'one' }] }) })).rejects.toThrow();
  });
});

describe('createRoadmapCache', () => {
  const data = (asOf: string): Roadmap => ({ asOf, milestones: [], explorations: [] });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  function setup(load: () => Promise<Roadmap>) {
    let t = 1_000_000;
    let loads = 0;
    const cache = createRoadmapCache({
      initial: data('snapshot'),
      ttlMs: 300_000,
      now: () => t,
      load: () => {
        loads += 1;
        return load();
      },
    });
    return { cache, loads: () => loads, advance: (ms: number) => (t += ms) };
  }

  it('answers with the snapshot at once and refreshes it in the background', async () => {
    const { cache, loads } = setup(async () => data('live'));
    expect(cache.get().asOf).toBe('snapshot');
    expect(loads()).toBe(1);
    await tick();
    expect(cache.get().asOf).toBe('live');
  });

  it('does not ask GitHub again within the TTL', async () => {
    const { cache, loads, advance } = setup(async () => data('live'));
    cache.get();
    await tick();
    advance(299_000);
    cache.get();
    expect(loads()).toBe(1);
  });

  it('refreshes once when stale, however many requests arrive', async () => {
    const { cache, loads, advance } = setup(async () => data('live'));
    cache.get();
    await tick();
    advance(300_001);
    cache.get();
    cache.get();
    cache.get();
    expect(loads()).toBe(2);
  });

  it('keeps the last good data when a refresh fails, and waits a TTL before retrying', async () => {
    let fail = false;
    const { cache, loads, advance } = setup(async () => {
      if (fail) throw new Error('GitHub answered 503');
      return data('live');
    });
    cache.get();
    await tick();
    fail = true;
    advance(300_001);
    cache.get();
    await tick();
    expect(cache.get().asOf).toBe('live');
    expect(loads()).toBe(2);
    advance(300_001);
    cache.get();
    expect(loads()).toBe(3);
  });
});

describe('updatedText', () => {
  it('shows the date and the UTC time', () => {
    expect(updatedText('2026-11-26T15:04:09.000Z')).toBe('November 26, 2026, 15:04 UTC');
  });
});
