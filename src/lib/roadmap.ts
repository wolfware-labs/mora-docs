import snapshot from '../data/roadmap.snapshot.json' with { type: 'json' };
import { authFromEnv, type TokenSource } from './github-auth';

const REPO = 'wolfware-labs/mora-lang';
const API = `https://api.github.com/repos/${REPO}`;
/** Ideas being evaluated carry this label and no milestone. */
const EXPLORE_LABEL = 'explore';
/** Milestones from this one on are post-MVP; the roadmap lists their issues. */
const FIRST_POST_MVP = 8;

export type Issue = { number: number; title: string; url: string };

export type Milestone = {
  number: number;
  /** "M6" */
  code: string;
  /** "Async and HTTP" */
  name: string;
  url: string;
  open: number;
  closed: number;
  issues: Issue[];
};

export type Roadmap = {
  /** When the data was fetched: an ISO timestamp, or a bare date in older snapshots. */
  asOf: string;
  milestones: Milestone[];
  explorations: Issue[];
};

export type MilestoneStatus = 'done' | 'in-progress' | 'planned';

export function milestoneStatus(m: Pick<Milestone, 'open' | 'closed'>): MilestoneStatus {
  if (m.closed > 0 && m.open === 0) return 'done';
  if (m.closed > 0) return 'in-progress';
  return 'planned';
}

/** "November 26, 2026, 15:04 UTC" for a timestamp, "November 2, 2026" for a bare date. */
export function updatedText(asOf: string): string {
  const bareDate = /^\d{4}-\d{2}-\d{2}$/.test(asOf);
  const when = new Date(bareDate ? `${asOf}T00:00:00Z` : asOf);
  const date = when.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  if (bareDate) return date;
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${date}, ${time} UTC`;
}

/** "M6: Async and HTTP" becomes { code: "M6", name: "Async and HTTP" }. */
export function parseTitle(title: string): { code: string; name: string } {
  const match = /^(M\d+):?\s+(.+)$/.exec(title.trim());
  return match ? { code: match[1], name: match[2] } : { code: '', name: title.trim() };
}

export function milestoneNumber(code: string): number {
  return Number(code.slice(1));
}

/** Closed and total issues over the given milestones. */
export function progress(milestones: Pick<Milestone, 'open' | 'closed'>[]): {
  closed: number;
  total: number;
  percent: number;
} {
  const closed = milestones.reduce((n, m) => n + m.closed, 0);
  const total = milestones.reduce((n, m) => n + m.open + m.closed, 0);
  return { closed, total, percent: total === 0 ? 0 : Math.round((closed / total) * 100) };
}

type ApiMilestone = {
  number: number;
  title: string;
  html_url: string;
  open_issues: number;
  closed_issues: number;
};

type ApiIssue = { number: number; title: string; html_url: string; pull_request?: unknown };

type Options = {
  fetch?: typeof globalThis.fetch;
  /** Where the token comes from; by default the App or GITHUB_TOKEN from the environment. */
  auth?: TokenSource;
  now?: Date;
};

function isApiMilestone(m: unknown): m is ApiMilestone {
  if (typeof m !== 'object' || m === null) return false;
  const x = m as Record<string, unknown>;
  return (
    Number.isFinite(x.number) &&
    Number.isFinite(x.open_issues) &&
    Number.isFinite(x.closed_issues) &&
    typeof x.title === 'string' &&
    typeof x.html_url === 'string'
  );
}

function isApiIssue(i: unknown): i is ApiIssue {
  if (typeof i !== 'object' || i === null) return false;
  const x = i as Record<string, unknown>;
  return Number.isFinite(x.number) && typeof x.title === 'string' && typeof x.html_url === 'string';
}

const toIssue = (i: ApiIssue): Issue => ({ number: i.number, title: i.title, url: i.html_url });
const byNumber = <T extends { number: number }>(a: T, b: T) => a.number - b.number;

export function fromSnapshot(): Roadmap {
  return snapshot as Roadmap;
}

let envAuth: TokenSource | undefined;
/** Read from the environment on first use, so one App token serves every refresh. */
function defaultAuth(): TokenSource {
  envAuth ??= authFromEnv();
  return envAuth;
}

/** Fetches the roadmap from GitHub. Throws on any failure or unexpected shape. */
export async function fetchRoadmap({
  fetch = globalThis.fetch,
  auth = defaultAuth(),
  now = new Date(),
}: Options = {}): Promise<Roadmap> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mora-site',
  };
  const token = await auth();
  if (token) headers.Authorization = `Bearer ${token}`;

  async function get(path: string): Promise<unknown[]> {
    const res = await fetch(`${API}/${path}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.status !== 200) throw new Error(`GitHub answered ${res.status} for ${path}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error(`unexpected response shape for ${path}`);
    return body;
  }

  async function issues(query: string): Promise<Issue[]> {
    const body = await get(`issues?state=all&per_page=100&${query}`);
    if (!body.every(isApiIssue)) throw new Error('unexpected issue shape');
    return body.filter((i) => !i.pull_request).map(toIssue).sort(byNumber);
  }

  const raw = await get('milestones?state=all&per_page=100');
  if (raw.length === 0 || !raw.every(isApiMilestone)) throw new Error('unexpected milestone shape');

  const milestones = await Promise.all(
    raw.map(async (m): Promise<Milestone> => {
      const { code, name } = parseTitle(m.title);
      const postMvp = code !== '' && milestoneNumber(code) >= FIRST_POST_MVP;
      return {
        number: m.number,
        code,
        name,
        url: m.html_url,
        open: m.open_issues,
        closed: m.closed_issues,
        issues: postMvp ? await issues(`milestone=${m.number}`) : [],
      };
    }),
  );

  return {
    asOf: now.toISOString(),
    milestones: milestones.filter((m) => m.code !== '').sort(byNumber),
    explorations: await issues(`milestone=none&labels=${EXPLORE_LABEL}`),
  };
}

type CacheOptions = {
  /** What to serve until the first refresh lands. */
  initial: Roadmap;
  load: () => Promise<Roadmap>;
  ttlMs: number;
  now?: () => number;
};

/**
 * Stale-while-revalidate: get() answers at once with the data it holds and, when that is
 * older than the TTL, starts one background refresh. A failed refresh keeps the last good
 * data and is retried after another TTL, so an outage at GitHub never reaches a reader.
 */
export function createRoadmapCache({ initial, load, ttlMs, now = Date.now }: CacheOptions) {
  let data = initial;
  let checkedAt = Number.NEGATIVE_INFINITY;
  let refreshing = false;

  function refresh() {
    refreshing = true;
    checkedAt = now();
    load()
      .then((fresh) => {
        data = fresh;
      })
      .catch((err: Error) => console.warn(`roadmap: keeping the data from ${data.asOf} (${err.message})`))
      .finally(() => {
        refreshing = false;
      });
  }

  return {
    get(): Roadmap {
      if (!refreshing && now() - checkedAt > ttlMs) refresh();
      return data;
    },
  };
}

/** How long the server serves the roadmap before it asks GitHub again. */
const TTL_MS = 5 * 60 * 1000;

const live = createRoadmapCache({
  initial: fromSnapshot(),
  load: () => (process.env.ROADMAP_OFFLINE ? Promise.resolve(fromSnapshot()) : fetchRoadmap()),
  ttlMs: TTL_MS,
});

/** The roadmap the server renders: live from GitHub, at most a TTL old. */
export function roadmap(): Roadmap {
  return live.get();
}
