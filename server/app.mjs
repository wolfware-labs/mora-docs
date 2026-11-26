// The site's HTTP handler: prerendered files from the client folder, the pages Astro renders on
// each request (the landing and the roadmap), and the 404 page for everything else.
// scripts/smoke-image.sh checks the same behaviour on the built image.
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import sirv from 'sirv';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * @param {{
 *   clientDir: string,
 *   ssr: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => unknown,
 * }} options
 * @returns {import('node:http').RequestListener}
 */
export function createApp({ clientDir, ssr }) {
  const root = normalize(clientDir + sep);
  // Without dev mode sirv lists the folder once at start, so it can only ever serve files in it.
  const files = sirv(clientDir, {
    dev: false,
    etag: true,
    dotfiles: false,
    // scripts/precompress.mjs writes a .br and a .gz copy next to each text file at build time.
    gzip: true,
    brotli: true,
    setHeaders(res, pathname) {
      if (pathname.startsWith('/_astro/')) res.setHeader('Cache-Control', IMMUTABLE);
    },
  });
  const notFoundPage = readFileSync(join(clientDir, '404.html'));

  /** True when `path` names a folder of the client dir that holds an index.html. */
  function isFolder(path) {
    let decoded;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return false;
    }
    const full = normalize(join(root, decoded));
    return full.startsWith(root) && existsSync(join(full, 'index.html'));
  }

  function notFound(res) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(notFoundPage);
  }

  return (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const path = (req.url ?? '/').split('?')[0];
    if (!path.endsWith('/') && isFolder(path)) {
      // Relative, since requests reach the pod through a tunnel on another host and port.
      res.statusCode = 301;
      res.setHeader('Location', `${path}/`);
      res.end();
      return;
    }

    files(req, res, () => ssr(req, res, () => notFound(res)));
  };
}
