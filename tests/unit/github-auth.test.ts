import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { appJwt, authFromEnv, createAppTokenSource } from '../../src/lib/github-auth';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

type Call = { method: string; url: string; auth: string | null; body: unknown };

/** Answers like GitHub: the installation lookup, then a token that expires at `expiresAt()`. */
function fakeGitHub(expiresAt: () => string, calls: Call[] = [], status = 201): typeof fetch {
  let minted = 0;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      method: init?.method ?? 'GET',
      url,
      auth: headers.get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    if (url.endsWith('/repos/wolfware-labs/mora-lang/installation')) {
      return new Response(JSON.stringify({ id: 42 }), { status: 200 });
    }
    if (url.endsWith('/app/installations/42/access_tokens')) {
      minted += 1;
      return new Response(JSON.stringify({ token: `ghs_${minted}`, expires_at: expiresAt() }), { status });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

describe('appJwt', () => {
  it('signs an RS256 token for the App, issued a minute back and valid for ten minutes', () => {
    const jwt = appJwt('123', pem, Date.parse('2026-11-26T12:00:00Z'));
    const [header, payload, signature] = jwt.split('.');
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const iat = Date.parse('2026-11-26T11:59:00Z') / 1000;
    expect(decode(payload)).toEqual({ iat, exp: iat + 600, iss: '123' });
    const verify = createVerify('RSA-SHA256');
    verify.update(`${header}.${payload}`);
    expect(verify.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });
});

describe('createAppTokenSource', () => {
  const options = (fetch: typeof globalThis.fetch, now: () => number) => ({
    appId: '123',
    privateKey: pem,
    owner: 'wolfware-labs',
    repo: 'mora-lang',
    fetch,
    now,
  });

  it('asks for a token limited to the repo and to reading issues', async () => {
    const calls: Call[] = [];
    const t = Date.parse('2026-11-26T12:00:00Z');
    const token = createAppTokenSource(options(fakeGitHub(() => '2026-11-26T13:00:00Z', calls), () => t));

    expect(await token()).toBe('ghs_1');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET https://api.github.com/repos/wolfware-labs/mora-lang/installation',
      'POST https://api.github.com/app/installations/42/access_tokens',
    ]);
    expect(calls.every((c) => c.auth?.startsWith('Bearer ey'))).toBe(true);
    expect(calls[1].body).toEqual({ repositories: ['mora-lang'], permissions: { issues: 'read', metadata: 'read' } });
  });

  it('reuses the token until five minutes before it expires', async () => {
    const calls: Call[] = [];
    let t = Date.parse('2026-11-26T12:00:00Z');
    const expiry = () => new Date(t + 60 * 60 * 1000).toISOString();
    const token = createAppTokenSource(options(fakeGitHub(expiry, calls), () => t));

    expect(await token()).toBe('ghs_1');
    t += 54 * 60 * 1000;
    expect(await token()).toBe('ghs_1');
    t += 2 * 60 * 1000;
    expect(await token()).toBe('ghs_2');
    expect(calls.filter((c) => c.url.endsWith('/installation'))).toHaveLength(1);
  });

  it('mints one token for calls that arrive together', async () => {
    const calls: Call[] = [];
    const t = Date.parse('2026-11-26T12:00:00Z');
    const token = createAppTokenSource(options(fakeGitHub(() => '2026-11-26T13:00:00Z', calls), () => t));

    expect(await Promise.all([token(), token(), token()])).toEqual(['ghs_1', 'ghs_1', 'ghs_1']);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('looks the installation up again after GitHub answers 404 for its tokens', async () => {
    const calls: Call[] = [];
    let installation = 42;
    let t = Date.parse('2026-11-26T12:00:00Z');
    // A reinstalled App gets a new installation id; tokens for the old one answer 404.
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? 'GET', url, auth: null, body: undefined });
      if (url.endsWith('/installation')) return new Response(JSON.stringify({ id: installation }), { status: 200 });
      if (url.endsWith(`/app/installations/${installation}/access_tokens`)) {
        const answer = { token: `ghs_${installation}`, expires_at: '2026-11-26T12:30:00Z' };
        return new Response(JSON.stringify(answer), { status: 201 });
      }
      return new Response('{}', { status: 404 });
    }) as typeof globalThis.fetch;
    const token = createAppTokenSource(options(fetch, () => t));

    expect(await token()).toBe('ghs_42');
    installation = 77;
    t += 30 * 60 * 1000;
    await expect(token()).rejects.toThrow('GitHub answered 404');
    expect(await token()).toBe('ghs_77');
    expect(calls.filter((c) => c.url.endsWith('/installation'))).toHaveLength(2);
  });

  it('rejects when GitHub refuses the token, and tries again on the next call', async () => {
    let status = 403;
    const t = Date.parse('2026-11-26T12:00:00Z');
    const inner = fakeGitHub(() => '2026-11-26T13:00:00Z');
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await inner(input, init);
      return String(input).endsWith('/access_tokens') ? new Response(await res.text(), { status }) : res;
    }) as typeof globalThis.fetch;
    const token = createAppTokenSource(options(fetch, () => t));

    await expect(token()).rejects.toThrow('GitHub answered 403');
    status = 201;
    expect(await token()).toBe('ghs_2');
  });
});

describe('authFromEnv', () => {
  const moraLang = { owner: 'wolfware-labs', repo: 'mora-lang' };

  it('uses the App when its id and key are set', async () => {
    const auth = authFromEnv(
      moraLang,
      { GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: pem, GITHUB_TOKEN: 'ignored' },
      fakeGitHub(() => '2099-01-01T00:00:00Z'),
    );
    expect(await auth()).toBe('ghs_1');
  });

  it('reads a key stored on one line, with \\n for each line break', async () => {
    const auth = authFromEnv(
      moraLang,
      { GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: pem.trim().replaceAll('\n', '\\n') },
      fakeGitHub(() => '2099-01-01T00:00:00Z'),
    );
    expect(await auth()).toBe('ghs_1');
  });

  it('asks for tokens of the repository it is given', async () => {
    const calls: Call[] = [];
    const auth = authFromEnv(
      { owner: 'someone', repo: 'other' },
      { GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: pem },
      fakeGitHub(() => '2099-01-01T00:00:00Z', calls),
    );
    await expect(auth()).rejects.toThrow('GitHub answered 404');
    expect(calls.map((c) => c.url)).toEqual(['https://api.github.com/repos/someone/other/installation']);
  });

  it('falls back to GITHUB_TOKEN, then to no token', async () => {
    expect(await authFromEnv(moraLang, { GITHUB_TOKEN: 'local' })()).toBe('local');
    expect(await authFromEnv(moraLang, {})()).toBeUndefined();
  });

  it('refuses half an App configuration', () => {
    expect(() => authFromEnv(moraLang, { GITHUB_APP_ID: '123' })).toThrow('GITHUB_APP_PRIVATE_KEY');
    expect(() => authFromEnv(moraLang, { GITHUB_APP_PRIVATE_KEY: pem })).toThrow('GITHUB_APP_ID');
  });
});
