import { createSign } from 'node:crypto';
import { appSettings } from '../../server/github-app-config.mjs';

const API = 'https://api.github.com';
/** A token is renewed this long before GitHub says it expires. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Resolves to the token for the next GitHub call, or undefined to call without one. */
export type TokenSource = () => Promise<string | undefined>;

/** The JWT a GitHub App signs to ask for installation tokens: RS256, valid for ten minutes. */
export function appJwt(appId: string, privateKey: string, nowMs: number): string {
  // Issued a minute back, as GitHub advises, to allow for clock drift.
  const iat = Math.floor(nowMs / 1000) - 60;
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat, exp: iat + 600, iss: appId })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

/** A GitHub answer whose status the caller does not accept, with that status. */
export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, path: string) {
    super(`GitHub answered ${status} for ${path}`);
    this.status = status;
  }
}

type AppOptions = {
  appId: string;
  privateKey: string;
  owner: string;
  repo: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
};

/**
 * Installation tokens of a GitHub App, each limited to one repository and to reading its
 * issues. A token is reused until shortly before it expires; calls that arrive while one is
 * being minted wait for it. A failure is not cached, so the next call tries again.
 */
export function createAppTokenSource({
  appId,
  privateKey,
  owner,
  repo,
  fetch = globalThis.fetch,
  now = Date.now,
}: AppOptions): () => Promise<string> {
  let installationId: number | undefined;
  let cached: { token: string; renewAt: number } | undefined;
  let minting: Promise<string> | undefined;

  async function call(method: string, path: string, body?: object): Promise<Record<string, unknown>> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${appJwt(appId, privateKey, now())}`,
        'User-Agent': 'mora-site',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new GitHubError(res.status, path);
    return (await res.json()) as Record<string, unknown>;
  }

  async function mint(): Promise<string> {
    if (installationId === undefined) {
      const installation = await call('GET', `/repos/${owner}/${repo}/installation`);
      if (!Number.isInteger(installation.id)) throw new Error('unexpected installation shape');
      installationId = installation.id as number;
    }
    const answer = await call('POST', `/app/installations/${installationId}/access_tokens`, {
      repositories: [repo],
      permissions: { issues: 'read', metadata: 'read' },
    }).catch((err: unknown) => {
      // A reinstalled App has a new installation id, so the next mint looks it up again.
      if (err instanceof GitHubError && err.status === 404) installationId = undefined;
      throw err;
    });
    const expiresAt = Date.parse(String(answer.expires_at));
    if (typeof answer.token !== 'string' || Number.isNaN(expiresAt)) throw new Error('unexpected token shape');
    cached = { token: answer.token, renewAt: expiresAt - RENEW_BEFORE_MS };
    return answer.token;
  }

  return () => {
    if (cached && now() < cached.renewAt) return Promise.resolve(cached.token);
    minting ??= mint().finally(() => {
      minting = undefined;
    });
    return minting;
  };
}

/**
 * The GitHub App when GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are set (the deployed site),
 * with tokens limited to `repository`; else GITHUB_TOKEN (local runs and CI), else no token.
 */
export function authFromEnv(
  repository: { owner: string; repo: string },
  env: Record<string, string | undefined> = process.env,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): TokenSource {
  const app = appSettings(env);
  if (app) return createAppTokenSource({ ...app, ...repository, fetch });
  const token = env.GITHUB_TOKEN;
  return () => Promise.resolve(token || undefined);
}
