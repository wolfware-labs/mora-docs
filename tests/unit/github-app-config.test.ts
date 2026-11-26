import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appConfigProblem, appSettings } from '../../server/github-app-config.mjs';

const pem = (type: 'rsa' | 'ec') =>
  (type === 'rsa'
    ? generateKeyPairSync('rsa', { modulusLength: 2048 })
    : generateKeyPairSync('ec', { namedCurve: 'P-256' })
  ).privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
const rsa = pem('rsa');

describe('appSettings', () => {
  it('reads the App id and key, turning a literal \\n into a line break', () => {
    const oneLine = rsa.trim().replaceAll('\n', '\\n');
    expect(appSettings({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: oneLine })).toEqual({
      appId: '123',
      privateKey: rsa.trim(),
    });
  });

  it('answers undefined when neither is set', () => {
    expect(appSettings({ GITHUB_TOKEN: 'local' })).toBeUndefined();
  });

  it('throws on half an App configuration', () => {
    expect(() => appSettings({ GITHUB_APP_ID: '123' })).toThrow('GITHUB_APP_ID is set without GITHUB_APP_PRIVATE_KEY');
    expect(() => appSettings({ GITHUB_APP_PRIVATE_KEY: rsa })).toThrow(
      'GITHUB_APP_PRIVATE_KEY is set without GITHUB_APP_ID',
    );
  });
});

describe('appConfigProblem', () => {
  it('accepts no App at all, and a full App with an RSA key', () => {
    expect(appConfigProblem({})).toBeUndefined();
    expect(appConfigProblem({ GITHUB_TOKEN: 'local' })).toBeUndefined();
    expect(appConfigProblem({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: rsa })).toBeUndefined();
  });

  it('accepts a key stored on one line, with \\n for each line break', () => {
    const oneLine = rsa.trim().replaceAll('\n', '\\n');
    expect(appConfigProblem({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: oneLine })).toBeUndefined();
  });

  it('names the missing half of an App configuration', () => {
    expect(appConfigProblem({ GITHUB_APP_ID: '123' })).toBe('GITHUB_APP_ID is set without GITHUB_APP_PRIVATE_KEY');
    expect(appConfigProblem({ GITHUB_APP_PRIVATE_KEY: rsa })).toBe(
      'GITHUB_APP_PRIVATE_KEY is set without GITHUB_APP_ID',
    );
  });

  it('refuses a key that cannot sign the App JWT, without quoting it', () => {
    for (const key of ['not a key', rsa.replace(/[A-Za-z0-9+/]{20}\n/, '\n'), pem('ec')]) {
      const problem = appConfigProblem({ GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: key });
      expect(problem).toBe('GITHUB_APP_PRIVATE_KEY is not an RSA private key that can sign the App JWT');
    }
  });
});

describe('server start', () => {
  const main = fileURLToPath(new URL('../../server/main.mjs', import.meta.url));

  it('exits non-zero with one line naming the problem, before it listens', () => {
    const run = spawnSync(process.execPath, [main], {
      env: { PATH: process.env.PATH, GITHUB_APP_ID: '123', GITHUB_APP_PRIVATE_KEY: 'secret-not-a-key', PORT: '0' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(run.status).not.toBe(0);
    expect(run.stderr.trim()).toBe(
      'site: GITHUB_APP_PRIVATE_KEY is not an RSA private key that can sign the App JWT',
    );
    expect(run.stderr + run.stdout).not.toContain('secret-not-a-key');
  });
});
