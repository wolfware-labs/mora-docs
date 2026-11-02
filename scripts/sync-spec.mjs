// Generates the docs pages from wolfware-labs/mora-lang: the spec sections listed in
// scripts/lib/doc-pages.mjs, one page per error in docs/errors/, and the grammar.
// Runs before `astro dev` and `astro build`. MORA_LANG_DIR points at a local checkout;
// without it the script clones main into node_modules/.cache.
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_PAGES } from './lib/doc-pages.mjs';
import {
  SPEC_URL,
  buildErrorIndex,
  buildErrorPage,
  buildPage,
  expandSections,
  githubSlug,
  pageHeading,
  parseSpec,
} from './lib/spec.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const outDir = join(root, 'src/content/docs/docs');
const REPO = 'https://github.com/wolfware-labs/mora-lang';

async function sourceDir() {
  if (process.env.MORA_LANG_DIR) return resolve(process.env.MORA_LANG_DIR);
  const cache = join(root, 'node_modules/.cache/mora-lang');
  await rm(cache, { recursive: true, force: true });
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', 'main', REPO, cache], { stdio: 'inherit' });
  return cache;
}

const src = await sourceDir();
const sections = parseSpec(await readFile(join(src, 'docs/design/mora.md'), 'utf8'));
const pageUrl = (slug) => (slug === 'index' ? '/docs/' : `/docs/${slug}/`);
const errorUrl = (code) => `/docs/errors/${code.toLowerCase()}/`;

// Where each spec section is shown on the site.
const shownAt = new Map();
for (const page of DOC_PAGES) {
  const numbers = expandSections(page.sections, sections);
  for (const n of numbers) {
    const hash = numbers.length === 1 || !n.includes('.') ? '' : `#${githubSlug(pageHeading(sections.get(n)))}`;
    shownAt.set(n, `${pageUrl(page.slug)}${hash}`);
  }
}
const where = (n) => shownAt.get(n);

async function write(path, text) {
  const file = join(outDir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

await rm(outDir, { recursive: true, force: true });

for (const [i, page] of DOC_PAGES.entries()) {
  await write(`${page.slug}.md`, buildPage(page, sections, where, i));
}

const errorFiles = (await readdir(join(src, 'docs/errors'))).filter((f) => /^MR\d{4}\.md$/.test(f)).sort();
const errors = [];
for (const file of errorFiles) {
  const code = file.slice(0, -3);
  const markdown = await readFile(join(src, 'docs/errors', file), 'utf8');
  errors.push({ code, summary: markdown.split('\n')[0].replace(/^#\s*MR\d{4}:\s*/, '').trim() });
  await write(`errors/${code.toLowerCase()}.md`, buildErrorPage(code, markdown, sections, where, errorUrl));
}
await write('errors/index.md', buildErrorIndex(errors, errorUrl));

const grammar = await readFile(join(src, 'crates/mora-syntax/mora.ungram'), 'utf8');
await write(
  'reference/grammar.md',
  `---\ntitle: Grammar\ndescription: The normative grammar of Mora, as an ungrammar.\nsidebar:\n  order: 100\n---\n\nThis is \`mora.ungram\`, the grammar the parser is generated from. It describes the shape of the syntax tree; the parser accepts exactly these trees.\n\n\`\`\`text\n${grammar.trimEnd()}\n\`\`\`\n\n---\n\nSource: [crates/mora-syntax/mora.ungram](${REPO}/blob/main/crates/mora-syntax/mora.ungram).\n`,
);

const chapters = [...sections.values()].filter((s) => !s.number.includes('.'));
await write(
  'reference/specification.md',
  `---\ntitle: Specification\ndescription: The full language specification, the source every docs page is generated from.\nsidebar:\n  order: 101\n---\n\nThe specification is one document in the language repository. Every page of these docs is generated from it, and every code sample on them comes from it.\n\n[Read the specification on GitHub](${SPEC_URL}).\n\n${chapters.map((c) => `- [${c.number}. ${c.title.replaceAll('`', '')}](${SPEC_URL}#${c.anchor})`).join('\n')}\n`,
);

const commit = execFileSync('git', ['-C', src, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
console.log(`docs: ${DOC_PAGES.length} pages, ${errors.length} error pages and the grammar from mora-lang ${commit}`);
