// The site's HTTP handler: prerendered files from the client folder, the pages Astro renders on
// each request (the landing and the roadmap), and the 404 page for everything else.
// scripts/smoke-image.sh checks the same behaviour on the built image.
import { readdirSync, readFileSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { createBrotliCompress, createGzip } from 'node:zlib';
import sirv from 'sirv';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The pages with `export const prerender = false`, which Astro renders on each request. */
export const ON_DEMAND_PATHS = ['/', '/roadmap/'];

/**
 * The encoding for a rendered page: br, then gzip, when the Accept-Encoding header allows it,
 * else undefined.
 * @param {string | undefined} header
 */
function pickEncoding(header = '') {
  const weights = new Map();
  for (const part of header.toLowerCase().split(',')) {
    const [name, ...params] = part.split(';').map((s) => s.trim());
    const q = params.find((param) => param.startsWith('q='));
    weights.set(name, q === undefined ? 1 : Number(q.slice(2)));
  }
  return ['br', 'gzip'].find((name) => (weights.get(name) ?? weights.get('*') ?? 0) > 0);
}

/**
 * Compresses what `res` is about to send, as it is written, with the encoding the request
 * accepts. Astro writes a rendered page with writeHead, write and end, so those three go
 * through the compressor; a response with no body (1xx, 204, 304) is sent as it is.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function compress(req, res) {
  const encoding = pickEncoding(req.headers['accept-encoding']);
  const { writeHead, write, end } = res;
  /** @type {import('node:zlib').Gzip | import('node:zlib').BrotliCompress | null | undefined} */
  let zip;

  function start(status) {
    if (zip !== undefined) return;
    zip = null;
    const vary = res.getHeader('Vary');
    res.setHeader('Vary', vary ? `${vary}, Accept-Encoding` : 'Accept-Encoding');
    const empty = status < 200 || status === 204 || status === 304;
    if (encoding === undefined || empty || res.hasHeader('Content-Encoding')) return;
    res.setHeader('Content-Encoding', encoding);
    res.removeHeader('Content-Length');
    zip = encoding === 'br' ? createBrotliCompress() : createGzip();
    zip.on('data', (chunk) => write.call(res, chunk));
    zip.on('end', () => end.call(res));
    zip.on('error', (err) => res.destroy(err));
    res.once('close', () => zip?.destroy());
  }

  res.writeHead = function (status, ...rest) {
    // Headers given here would replace the ones start() sets, so they are set first.
    const headers = rest.find((arg) => typeof arg === 'object' && arg !== null);
    const pairs = Array.isArray(headers)
      ? headers.flatMap((value, i) => (i % 2 === 0 ? [[value, headers[i + 1]]] : []))
      : Object.entries(headers ?? {});
    for (const [name, value] of pairs) if (value !== undefined) res.setHeader(name, value);
    start(status);
    return writeHead.call(res, status, ...rest.filter((arg) => typeof arg === 'string'));
  };
  res.write = function (chunk, ...rest) {
    start(res.statusCode);
    return zip ? zip.write(chunk, ...rest) : write.call(res, chunk, ...rest);
  };
  res.end = function (...args) {
    start(res.statusCode);
    if (!zip) return end.apply(res, args);
    if (typeof args.at(-1) === 'function') res.once('finish', args.pop());
    zip.end(...args);
    return res;
  };
}

/**
 * @param {{
 *   clientDir: string,
 *   ssr: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, next: () => void) => unknown,
 *   ssrPaths: string[],
 * }} options
 * @returns {import('node:http').RequestListener}
 */
export function createApp({ clientDir, ssr, ssrPaths }) {
  const onDemand = new Set(ssrPaths);
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
  // The folders that hold an index.html ("docs/language"), listed once at start as sirv does.
  const folders = new Set(
    readdirSync(clientDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name === 'index.html')
      .map((entry) => relative(clientDir, entry.parentPath).split(sep).join('/')),
  );

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
    if (!full.startsWith(root)) return undefined;
    const segments = full.slice(root.length).split(sep).filter(Boolean);
    if (!folders.has(segments.join('/'))) return undefined;
    return `/${segments.map(encodeURIComponent).join('/')}/`;
  }

  /**
   * Keeps a Range header only when it is one well-formed range of at most 15 digits per number.
   * sirv passes `bytes=10-5`, or an end above 2^53, to createReadStream, which throws; without
   * the header the file is sent whole.
   */
  function dropBadRange(req) {
    const range = req.headers.range;
    if (range === undefined) return;
    const match = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(range);
    const ok = match !== null && (match[1] !== '' || match[2] !== '') &&
      (match[1] === '' || match[2] === '' || Number(match[1]) <= Number(match[2]));
    if (!ok) delete req.headers.range;
  }

  function fail(res, err) {
    console.error(`site: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Internal Server Error');
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

    const url = req.url ?? '/';
    const queryAt = url.indexOf('?');
    const path = queryAt === -1 ? url : url.slice(0, queryAt);
    // Redirects keep the query string, so campaign and search parameters survive the slash.
    const query = queryAt === -1 ? '' : url.slice(queryAt);
    if (!path.endsWith('/') && onDemand.has(`${path}/`)) {
      res.statusCode = 301;
      res.setHeader('Location', `${path}/${query}`);
      res.end();
      return;
    }
    const folder = path.endsWith('/') ? undefined : folderUrl(path);
    if (folder !== undefined && folder !== '/') {
      // Relative, since requests reach the pod through a tunnel on another host and port.
      res.statusCode = 301;
      res.setHeader('Location', `${folder}${query}`);
      res.end();
      return;
    }

    dropBadRange(req);
    // Only the pages rendered on request reach Astro, so its built-in routes (/_image,
    // /_server-islands) are never served. A throw here must not end the process.
    const render = () => {
      if (!onDemand.has(path)) return notFound(res);
      compress(req, res);
      return Promise.resolve(ssr(req, res, () => notFound(res))).catch((err) => fail(res, err));
    };
    try {
      files(req, res, () => {
        try {
          return render();
        } catch (err) {
          fail(res, err);
        }
      });
    } catch (err) {
      fail(res, err);
    }
  };
}
