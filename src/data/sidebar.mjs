// The docs sidebar. astro.config.mjs passes it to Starlight, and the share cards
// (src/pages/og/[...slug].png.ts) read each section's label from it.
export const SIDEBAR = [
  { label: 'Introduction', link: '/docs/' },
  { slug: 'docs/install' },
  { slug: 'docs/first-program' },
  { label: 'Tour', collapsed: true, items: [{ autogenerate: { directory: 'docs/tour' } }] },
  { label: 'Language', collapsed: true, items: [{ autogenerate: { directory: 'docs/language' } }] },
  { label: 'Memory and errors', items: [{ autogenerate: { directory: 'docs/memory' } }] },
  { label: 'Concurrency', collapsed: true, items: [{ autogenerate: { directory: 'docs/concurrency' } }] },
  { label: 'Macro guide', collapsed: true, items: [{ autogenerate: { directory: 'docs/macros' } }] },
  { label: 'Toolchain', collapsed: true, items: [{ autogenerate: { directory: 'docs/toolchain' } }] },
  {
    label: 'Reference',
    collapsed: true,
    items: [
      'docs/reference/standard-library',
      'docs/reference/http-and-json',
      { label: 'Error codes', link: '/docs/errors/' },
      'docs/reference/grammar',
      'docs/reference/specification',
    ],
  },
  {
    label: 'For tools and agents',
    items: [{ label: 'llms.txt', link: '/llms.txt', attrs: { target: '_blank' } }],
  },
];

// docs/tour/unions -> "tour"; /docs/errors/ -> "errors".
const folderOf = (path) => path.match(/^\/?docs\/([^/]+)/)?.[1];

/**
 * Maps each docs folder (`tour`, `errors`) to its sidebar label: the group's label for the pages it lists
 * or generates, or a link's own label when it points at a folder (Error codes).
 * @returns {Record<string, string>}
 */
export function sectionLabels(sidebar = SIDEBAR) {
  /** @type {Record<string, string>} */
  const labels = {};
  for (const group of sidebar) {
    for (const item of group.items ?? []) {
      const folder = folderOf(typeof item === 'string' ? item : (item.autogenerate?.directory ?? item.link ?? ''));
      if (!folder) continue;
      if (typeof item === 'object' && item.link) labels[folder] = item.label;
      else labels[folder] ??= group.label;
    }
  }
  return labels;
}
