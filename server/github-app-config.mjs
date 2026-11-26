// The GitHub App settings: how they are read from the environment (src/lib/github-auth.ts mints
// the tokens with them) and the check at start, so bad credentials stop the server at once
// instead of failing every roadmap refresh. Plain JS, so server/main.mjs runs it before it
// loads the Astro bundle. Local only: a GitHub outage must not stop the server.
import { createPrivateKey, createSign } from 'node:crypto';

/**
 * The App id and key from `env`, or undefined when neither is set (the site then reads GitHub
 * with GITHUB_TOKEN or no token). Throws when only one of them is set.
 * @param {Record<string, string | undefined>} env
 * @returns {{ appId: string, privateKey: string } | undefined}
 */
export function appSettings(env) {
  const appId = env.GITHUB_APP_ID;
  // A secret store with one-line fields keeps the PEM with a literal \n for each line break.
  const privateKey = env.GITHUB_APP_PRIVATE_KEY?.replaceAll('\\n', '\n');
  if (appId && privateKey) return { appId, privateKey };
  if (appId) throw new Error('GITHUB_APP_ID is set without GITHUB_APP_PRIVATE_KEY');
  if (privateKey) throw new Error('GITHUB_APP_PRIVATE_KEY is set without GITHUB_APP_ID');
  return undefined;
}

/**
 * What is wrong with the App settings in `env`, as one line that never quotes the key, or
 * undefined when they are usable or absent.
 * @param {Record<string, string | undefined>} env
 * @returns {string | undefined}
 */
export function appConfigProblem(env) {
  let settings;
  try {
    settings = appSettings(env);
  } catch (err) {
    return /** @type {Error} */ (err).message;
  }
  if (settings === undefined) return undefined;
  try {
    // GitHub takes only RS256 for the App JWT.
    if (createPrivateKey(settings.privateKey).asymmetricKeyType !== 'rsa') throw new Error('not RSA');
    createSign('RSA-SHA256').update('check').sign(settings.privateKey);
  } catch {
    return 'GITHUB_APP_PRIVATE_KEY is not an RSA private key that can sign the App JWT';
  }
  return undefined;
}
