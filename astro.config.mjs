import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { readFileSync } from 'node:fs';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const moraGrammar = json('./src/lib/mora.tmLanguage.json');
const moraTheme = json('./src/lib/mora-theme.json');

export default defineConfig({
  site: 'https://mora-lang.dev',
  outDir: process.env.MORA_OUT_DIR || 'dist',
  integrations: [
    react(),
    starlight({
      title: 'Mora',
      description: 'Documentation for Mora, a programming language with clear syntax that compiles to one native executable.',
      favicon: '/brand/mora-mark.png',
      // The landing page and the roadmap live outside Starlight, so their anchors can't be validated.
      plugins: [starlightLinksValidator({ exclude: ['/', '/#*', '/roadmap/', '/roadmap/#*', '/llms.txt'] })],
      routeMiddleware: './src/route-middleware.ts',
      components: {
        SiteTitle: './src/components/docs/SiteTitle.astro',
      },
      // Code blocks stay dark in both site themes, as on the landing page.
      expressiveCode: {
        themes: [moraTheme],
        useStarlightDarkModeSwitch: false,
        shiki: { langs: [moraGrammar] },
        styleOverrides: { borderRadius: '12px', borderColor: '#33232D' },
      },
      customCss: ['./src/styles/docs.css'],
      editLink: { baseUrl: 'https://github.com/wolfware-labs/mora-docs/edit/main/' },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/wolfware-labs/mora-lang' }],
      sidebar: [
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
      ],
    }),
  ],
});
