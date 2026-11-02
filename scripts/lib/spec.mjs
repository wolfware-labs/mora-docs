// Turns the language spec and the error pages of wolfware-labs/mora-lang into docs pages.
// Pure functions: scripts/sync-spec.mjs does the reading and writing.

export const SPEC_URL = 'https://github.com/wolfware-labs/mora-lang/blob/main/docs/design/mora.md';
export const ERRORS_URL = 'https://github.com/wolfware-labs/mora-lang/blob/main/docs/errors/';

const HEADING = /^(#{2,3}) (\d+(?:\.\d+)*)\.? (.+)$/;

/** The anchor GitHub gives a heading: `16.4 Dependency injection (`Std.Inject`)` is `164-dependency-injection-stdinject`. */
export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/**
 * The numbered sections of the spec, in order. A chapter's body is its text before its first
 * subsection; `children` lists the subsections.
 * @returns {Map<string, { number: string, title: string, anchor: string, body: string, children: string[] }>}
 */
export function parseSpec(text) {
  const sections = new Map();
  let current = null;
  let inFence = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const match = inFence ? null : HEADING.exec(line);
    if (match) {
      const [, , number, title] = match;
      current = { number, title, anchor: githubSlug(`${number} ${title}`), lines: [], children: [] };
      sections.set(number, current);
      const parent = number.includes('.') ? sections.get(number.split('.')[0]) : undefined;
      parent?.children.push(number);
      continue;
    }
    if (/^## /.test(line) && !inFence) current = null;
    current?.lines.push(line);
  }
  for (const s of sections.values()) {
    s.body = s.lines.join('\n').trim();
    delete s.lines;
  }
  return sections;
}

/** Expands chapter numbers ("15") to the chapter followed by its subsections. */
export function expandSections(numbers, sections) {
  return numbers.flatMap((n) => (n.includes('.') ? [n] : [n, ...(sections.get(n)?.children ?? [])]));
}

/** Applies `fn` to the prose of a Markdown text: everything outside code fences and inline code. */
function mapProse(markdown, fn) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 === 1 ? part : fn(part)))
        .join('');
    })
    .join('\n');
}

/** Applies `fn` to code: fenced blocks and inline code spans. */
function mapCode(markdown, fn) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return fn(line);
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 === 1 ? fn(part) : part))
        .join('');
    })
    .join('\n');
}

/**
 * The keyword `switch` is being renamed to `match`; the site shows the new spelling in code.
 * Prose keeps the English verb.
 */
export function renameSwitch(markdown) {
  return mapCode(markdown, (code) => code.replace(/\bswitch\b/g, 'match'));
}

/**
 * Links every `§10.4` in prose: to the docs page that shows that section when there is one,
 * otherwise to the spec on GitHub. `where(number)` returns the docs URL or undefined.
 */
export function linkSectionRefs(markdown, sections, where) {
  return mapProse(markdown, (text) =>
    text.replace(/(?<!\[)§(\d+(?:\.\d+)*)(?![\d\]])/g, (ref, number) => {
      const section = sections.get(number);
      if (!section) return ref;
      return `[${ref}](${where(number) ?? `${SPEC_URL}#${section.anchor}`})`;
    }),
  );
}

/** Rewrites the error pages' relative links (`MR0310.md`, `../design/mora.md#...`) to absolute URLs. */
export function absoluteLinks(markdown, errorUrl) {
  return mapProse(markdown, (text) =>
    text
      .replace(/\]\(\.\.\/design\/mora\.md(#[^)]*)?\)/g, (_, hash = '') => `](${SPEC_URL}${hash})`)
      .replace(/\]\((MR\d{4})\.md\)/g, (_, code) => `](${errorUrl(code)})`),
  );
}

/** One level down: `###` becomes `####`. Subsection bodies sit under the page's own `##` headings. */
export function demoteHeadings(markdown, levels = 1) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (inFence || !/^#{1,5} /.test(line)) return line;
      return '#'.repeat(levels) + line;
    })
    .join('\n');
}

/** The heading text a section gets on a docs page, without its number. */
export function pageHeading(section) {
  return renameSwitch(section.title.replace(/\s*\[(post-)?MVP\]$/, ''));
}

const frontmatter = (fields) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? `\n${Object.entries(v).map(([a, b]) => `  ${a}: ${JSON.stringify(b)}`).join('\n')}` : JSON.stringify(v)}`)
    .join('\n')}\n---\n`;

/**
 * Builds a docs page from spec sections. A page of one section shows its body directly; a page of
 * several gives each one an `##` heading.
 */
export function buildPage(page, sections, where, order) {
  const numbers = expandSections(page.sections, sections);
  const missing = numbers.filter((n) => !sections.has(n));
  if (missing.length > 0) throw new Error(`${page.slug}: no spec section ${missing.join(', ')}`);
  const single = numbers.length === 1;
  const parts = numbers.map((n) => {
    const s = sections.get(n);
    const body = demoteHeadings(s.body, single ? 0 : 1);
    if (single) return body;
    // A chapter's intro sits under the page title, not a heading of its own.
    if (!n.includes('.')) return body;
    return `## ${pageHeading(s)}\n\n${body}`;
  });
  const sources = numbers
    .filter((n) => n.includes('.') || numbers.length === 1)
    .map((n) => `[§${n}](${SPEC_URL}#${sections.get(n).anchor})`);
  const text = [page.lead, ...parts.filter(Boolean)].filter(Boolean).join('\n\n');
  const fields = { title: page.title, description: page.description };
  if (order !== undefined) fields.sidebar = { order };
  // Shiki has no EBNF grammar; the fragments read fine as plain text.
  const body = linkSectionRefs(renameSwitch(text), sections, where).replace(/^```ebnf$/gm, '```text');
  return `${frontmatter(fields)}\n${body}\n\n---\n\nFrom the specification: ${sources.join(', ')}.\n`;
}

/**
 * The docs page for one error page of `docs/errors/`: `# MR0012: a string ... is not closed`
 * becomes a page titled `MR0012` with that description.
 */
export function buildErrorPage(code, markdown, sections, where, errorUrl) {
  const [first, ...rest] = markdown.split('\n');
  const summary = first.replace(/^#\s*MR\d{4}:\s*/, '').trim();
  const body = linkSectionRefs(renameSwitch(absoluteLinks(rest.join('\n').trim(), errorUrl)), sections, where);
  return `${frontmatter({ title: code, description: summary })}\n**${summary}**\n\n${body}\n\n---\n\nSource: [${code}.md](${ERRORS_URL}${code}.md).\n`;
}

/** The index of error codes: one row per error page. */
export function buildErrorIndex(errors, errorUrl) {
  const rows = errors.map(({ code, summary }) => `| [${code}](${errorUrl(code)}) | ${summary.replaceAll('|', '\\|')} |`);
  return `${frontmatter({
    title: 'Error codes',
    description: 'Every diagnostic code with a page of its own: what it means and how to fix it.',
  })}\nEach page explains one diagnostic, with a failing example and the fix.\n\n| Code | Meaning |\n|---|---|\n${rows.join('\n')}\n`;
}
