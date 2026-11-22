// Share cards: every page gets its own, rendered at build time by src/pages/og/[...slug].png.ts.
// Kept apart from og.ts so the pages that link a card don't load the renderer.

export const SITE_NAME = 'Mora';
export const REPOSITORY = 'https://github.com/wolfware-labs/mora-lang';

export const ogImage = (id?: string) => `/og/${id || 'index'}.png`;
export const ogImageAlt = (title: string) => `${SITE_NAME} share card: ${title}`;
