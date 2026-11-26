// Checks the GitHub App settings at start, so bad credentials stop the server at once instead
// of failing every roadmap refresh. Local only: a GitHub outage must not stop the server.
// src/lib/github-auth.ts reads the same variables to mint the tokens.
import { createPrivateKey, createSign } from 'node:crypto';

/**
 * What is wrong with the App settings in `env`, as one line that never quotes the key, or
 * undefined when they are usable or absent (the site then reads GitHub with GITHUB_TOKEN or
 * no token).
 * @param {Record<string, string | undefined>} env
 * @returns {string | undefined}
 */
export function appConfigProblem(env) {
  const appId = env.GITHUB_APP_ID;
  // A secret store with one-line fields keeps the PEM with a literal \n for each line break.
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replaceAll('\\n', '\n');
  if (!appId && !privateKey) return undefined;
  if (!privateKey) return 'GITHUB_APP_ID is set without GITHUB_APP_PRIVATE_KEY';
  if (!appId) return 'GITHUB_APP_PRIVATE_KEY is set without GITHUB_APP_ID';
  try {
    // GitHub takes only RS256 for the App JWT.
    if (createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') throw new Error('not RSA');
    createSign('RSA-SHA256').update('check').sign(privateKey);
  } catch {
    return 'GITHUB_APP_PRIVATE_KEY is not an RSA private key that can sign the App JWT';
  }
  return undefined;
}
