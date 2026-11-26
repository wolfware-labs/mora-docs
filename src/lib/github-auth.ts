import { createSign } from 'node:crypto';

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
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
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
 * else GITHUB_TOKEN (local runs and CI), else no token.
 */
export function authFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetch: typeof globalThis.fetch = globalThis.fetch,
): TokenSource {
  const { GITHUB_APP_ID: appId, GITHUB_TOKEN: token } = env;
  // A secret store with one-line fields keeps the PEM with a literal \n for each line break.
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replaceAll('\\n', '\n');
  if (appId && privateKey) {
    return createAppTokenSource({ appId, privateKey, owner: 'wolfware-labs', repo: 'mora-lang', fetch });
  }
  if (appId) throw new Error('GITHUB_APP_ID is set without GITHUB_APP_PRIVATE_KEY');
  if (privateKey) throw new Error('GITHUB_APP_PRIVATE_KEY is set without GITHUB_APP_ID');
  return () => Promise.resolve(token || undefined);
}
