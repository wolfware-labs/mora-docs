import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../server/app.mjs';

type Ssr = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

let dir: string;
let server: Server;
let base: string;

// Stands in for Astro's handler: renders /roadmap/, throws on /boom/, and passes every other
// path on. `rendered` lists every path it was asked for.
const rendered: string[] = [];
const ssr: Ssr = (req, res, next) => {
  rendered.push(req.url ?? '');
  if (req.url === '/boom/') throw new Error('render failed');
  if (req.url === '/roadmap/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>live roadmap</title>');
    return;
  }
  next();
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mora-server-'));
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, '_astro'));
  writeFileSync(join(dir, 'docs', 'index.html'), '<title>docs</title>');
  writeFileSync(join(dir, '_astro', 'site.abc123.css'), 'body{}');
  writeFileSync(join(dir, '404.html'), '<title>Not found</title>');
  writeFileSync(join(dir, 'llms.txt'), 'Mora');
  writeFileSync(join(dir, '_astro', 'site.abc123.css.gz'), gzipSync('body{}'));
  server = createServer(createApp({ clientDir: dir, ssr, ssrPaths: ['/roadmap/', '/boom/'] }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string) => fetch(`${base}${path}`, { redirect: 'manual' });

function expectSecurityHeaders(res: Response) {
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
}

describe('createApp', () => {
  it('serves a prerendered page with the security headers and no-cache', async () => {
    const res = await get('/docs/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<title>docs</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expectSecurityHeaders(res);
  });

  it('caches hashed build assets for a year', async () => {
    const res = await get('/_astro/site.abc123.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expectSecurityHeaders(res);
  });

  it('serves the gzip copy of a file to a client that accepts it', async () => {
    const res = await fetch(`${base}/_astro/site.abc123.css`, { headers: { 'Accept-Encoding': 'gzip' } });
    expect(res.headers.get('content-encoding')).toBe('gzip');
    expect(res.headers.get('content-type')).toMatch(/^text\/css/);
    expect(await res.text()).toBe('body{}');
  });

  it('redirects a folder without its slash, with a relative Location', async () => {
    const res = await get('/docs');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/docs/');
  });

  it('never redirects to another host', async () => {
    for (const path of ['//docs', '/\\docs', '/%2Fdocs']) {
      const res = await get(path);
      const location = res.headers.get('location');
      if (location !== null) expect(location).toBe('/docs/');
    }
  });

  it('hands pages it has no file for to the renderer, with the same headers', async () => {
    const res = await get('/roadmap/');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<title>live roadmap</title>');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expectSecurityHeaders(res);
  });

  it('answers 404 with the 404 page when nothing matches', async () => {
    const res = await get('/no-such-page/');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('<title>Not found</title>');
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expectSecurityHeaders(res);
  });

  it('survives an inverted Range header and keeps answering', async () => {
    const res = await fetch(`${base}/docs/`, { headers: { Range: 'bytes=10-5' } });
    expect([200, 416]).toContain(res.status);
    await res.arrayBuffer();
    expect((await get('/docs/')).status).toBe(200);
  });

  it('sends the whole file for a Range past the largest safe integer', async () => {
    const res = await fetch(`${base}/docs/`, { headers: { Range: 'bytes=0-99999999999999999999' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<title>docs</title>');
  });

  it('answers 500 when rendering throws, and keeps answering', async () => {
    const res = await get('/boom/');
    expect(res.status).toBe(500);
    expect((await get('/docs/')).status).toBe(200);
  });

  it('passes only the on-demand pages to the renderer', async () => {
    rendered.length = 0;
    for (const path of ['/_image?href=/x.png&w=64', '/_server-islands/x', '/no-such-page/']) {
      expect((await get(path)).status).toBe(404);
    }
    expect(rendered).toEqual([]);
  });

  it('redirects an on-demand page without its slash', async () => {
    const res = await get('/roadmap');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/roadmap/');
  });

  it('never serves a file outside the client folder', async () => {
    writeFileSync(join(dir, '..', 'mora-secret.txt'), 'secret');
    const res = await get('/..%2Fmora-secret.txt');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('secret');
    rmSync(join(dir, '..', 'mora-secret.txt'));
  });

  it('does not name its server software', async () => {
    const res = await get('/docs/');
    expect(res.headers.get('server')).toBeNull();
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
