import snapshot from '../data/roadmap.snapshot.json' with { type: 'json' };

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
  /** ISO date of the data, the day it was fetched. */
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
  token?: string | undefined;
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

/** Fetches the roadmap from GitHub. Throws on any failure or unexpected shape. */
export async function fetchRoadmap({
  fetch = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  now = new Date(),
}: Options = {}): Promise<Roadmap> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'mora-site',
  };
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
    asOf: now.toISOString().slice(0, 10),
    milestones: milestones.filter((m) => m.code !== '').sort(byNumber),
    explorations: await issues(`milestone=none&labels=${EXPLORE_LABEL}`),
  };
}

/**
 * The live roadmap, or the committed snapshot when ROADMAP_OFFLINE is set or GitHub
 * cannot be reached. A failed fetch never fails the build.
 */
export async function loadRoadmap(options: Options = {}): Promise<Roadmap> {
  if (process.env.ROADMAP_OFFLINE) return fromSnapshot();
  try {
    return await fetchRoadmap(options);
  } catch (err) {
    console.warn(`roadmap: using the committed snapshot (${(err as Error).message})`);
    return fromSnapshot();
  }
}

let cached: Promise<Roadmap> | undefined;

/** loadRoadmap, fetched once per build and shared by every page. */
export function roadmap(): Promise<Roadmap> {
  cached ??= loadRoadmap();
  return cached;
}
