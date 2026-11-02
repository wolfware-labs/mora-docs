import { describe, expect, it } from 'vitest';
import {
  buildPage,
  demoteHeadings,
  githubSlug,
  linkSectionRefs,
  parseSpec,
  renameSwitch,
} from '../../scripts/lib/spec.mjs';

const SPEC = `# Mora

## 7. Expressions and statements

Intro to seven.

### 7.4 Propagation: \`?\`

See §7.7 and §9.9.

### 7.7 \`switch\` expressions and statements

\`\`\`mora
### not a heading
let status = switch (store.Find(id)) {
    User u => Results.Json(u),
    none => Results.NotFound(),
};
\`\`\`

## 8. Generics
`;

describe('githubSlug', () => {
  it('matches the anchors GitHub gives spec headings', () => {
    expect(githubSlug('16.4 Dependency injection (`Std.Inject`)')).toBe('164-dependency-injection-stdinject');
    expect(githubSlug('7.4 Propagation: `?`')).toBe('74-propagation-');
  });
});

describe('parseSpec', () => {
  const sections = parseSpec(SPEC);

  it('finds chapters and subsections, ignoring headings in code', () => {
    expect([...sections.keys()]).toEqual(['7', '7.4', '7.7', '8']);
    expect(sections.get('7')?.children).toEqual(['7.4', '7.7']);
    expect(sections.get('7')?.body).toBe('Intro to seven.');
    expect(sections.get('7.7')?.body).toContain('### not a heading');
  });
});

describe('renameSwitch', () => {
  it('renames the keyword in code and keeps the English verb in prose', () => {
    const text = 'A `switch` over it.\nStrings switch on first send.\n```mora\nreturn switch (x) {\n```';
    expect(renameSwitch(text)).toBe('A `match` over it.\nStrings switch on first send.\n```mora\nreturn match (x) {\n```');
  });
});

describe('linkSectionRefs', () => {
  const sections = parseSpec(SPEC);

  it('links to the docs page when one shows the section, otherwise to the spec', () => {
    const where = (n: string) => (n === '7.7' ? '/docs/language/expressions/#match-expressions-and-statements' : undefined);
    expect(linkSectionRefs('See §7.7, §7.4 and §99.', sections, where)).toBe(
      'See [§7.7](/docs/language/expressions/#match-expressions-and-statements), [§7.4](https://github.com/wolfware-labs/mora-lang/blob/main/docs/design/mora.md#74-propagation-) and §99.',
    );
  });

  it('leaves code alone', () => {
    expect(linkSectionRefs('`§7.4`', sections, () => '/x/')).toBe('`§7.4`');
  });
});

describe('demoteHeadings', () => {
  it('moves headings down outside code', () => {
    expect(demoteHeadings('### A\n```\n### B\n```')).toBe('#### A\n```\n### B\n```');
  });
});

describe('buildPage', () => {
  const sections = parseSpec(SPEC);

  it('gives each section a heading on a page of several, and cites its sources', () => {
    const page = buildPage(
      { slug: 'language/expressions', title: 'Expressions', description: 'Operators.', sections: ['7'] },
      sections,
      () => undefined,
      3,
    );
    expect(page).toContain('title: "Expressions"');
    expect(page).toContain('  order: 3');
    expect(page).toContain('Intro to seven.');
    expect(page).toContain('## `match` expressions and statements');
    expect(page).toContain('let status = match (store.Find(id))');
    expect(page).toContain('From the specification: [§7.4]');
  });

  it('fails on a section the spec does not have', () => {
    expect(() =>
      buildPage({ slug: 'x', title: 'X', description: 'X.', sections: ['42.1'] }, sections, () => undefined),
    ).toThrow(/no spec section 42.1/);
  });
});
