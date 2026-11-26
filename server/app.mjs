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

  /**
   * The canonical URL of the folder `path` names, when it is a folder of the client dir that
   * holds an index.html; undefined otherwise. Built from the normalized path, never the raw
   * one, so "//docs" cannot become a redirect to another host.
   */
  function folderUrl(path) {
    let decoded;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return undefined;
    }
    const full = normalize(join(root, decoded));
    if (!full.startsWith(root) || !existsSync(join(full, 'index.html'))) return undefined;
    const segments = full.slice(root.length).split(sep).filter(Boolean);
    return `/${segments.map(encodeURIComponent).join('/')}/`;
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
    const folder = path.endsWith('/') ? undefined : folderUrl(path);
    if (folder !== undefined && folder !== '/') {
      // Relative, since requests reach the pod through a tunnel on another host and port.
      res.statusCode = 301;
      res.setHeader('Location', folder);
      res.end();
      return;
    }

    files(req, res, () => ssr(req, res, () => notFound(res)));
  };
}
