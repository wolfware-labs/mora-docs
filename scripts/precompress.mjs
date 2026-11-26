// Writes a .gz and a .br copy next to every text file of the built client folder, which
// server/app.mjs serves to clients that accept them. Runs after `astro build`.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const TEXT = /\.(html|css|js|mjs|json|txt|xml|svg|webmanifest)$/;
const gz = promisify(gzip);
const br = promisify(brotliCompress);

/** @param {string} dir */
export async function precompress(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && TEXT.test(e.name)).map((e) => join(e.parentPath, e.name));
  await Promise.all(
    files.map(async (file) => {
      const body = await readFile(file);
      await writeFile(`${file}.gz`, await gz(body, { level: 9 }));
      await writeFile(`${file}.br`, await br(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
    }),
  );
  return files.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? 'dist/client';
  console.log(`precompress: ${await precompress(dir)} files in ${dir}`);
}
