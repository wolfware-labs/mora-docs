import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { precompress } from '../../scripts/precompress.mjs';

let dir: string;

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('precompress', () => {
  it('writes a gzip and a brotli copy of each text file, in subfolders too', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mora-precompress-'));
    mkdirSync(join(dir, '_astro'));
    const css = 'body { color: red }'.repeat(50);
    writeFileSync(join(dir, '_astro', 'site.css'), css);
    writeFileSync(join(dir, 'index.html'), '<title>Mora</title>');

    await precompress(dir);

    expect(gunzipSync(readFileSync(join(dir, '_astro', 'site.css.gz'))).toString()).toBe(css);
    expect(brotliDecompressSync(readFileSync(join(dir, '_astro', 'site.css.br'))).toString()).toBe(css);
    expect(existsSync(join(dir, 'index.html.gz'))).toBe(true);
  });

  it('leaves images and fonts alone', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mora-precompress-'));
    writeFileSync(join(dir, 'card.png'), 'png');
    writeFileSync(join(dir, 'font.woff2'), 'woff2');

    await precompress(dir);

    expect(existsSync(join(dir, 'card.png.gz'))).toBe(false);
    expect(existsSync(join(dir, 'font.woff2.br'))).toBe(false);
  });
});
