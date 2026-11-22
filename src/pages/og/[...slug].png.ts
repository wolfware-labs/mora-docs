import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard, type Card } from '../../lib/og';
import { INTRO, plain } from '../../data/pitch';
import { sectionLabels } from '../../data/sidebar.mjs';

// Section labels come from the sidebar, so a card shows what the navigation shows.
const SECTIONS = sectionLabels();

// docs/tour/unions -> "Docs · Tour"; a page at the top of the docs is just "Docs".
const eyebrow = (id: string) => {
  const section = SECTIONS[id.split('/')[1]];
  return section && id.split('/').length > 2 ? `Docs · ${section}` : 'Docs';
};

export const getStaticPaths = (async () => {
  const docs = await getCollection('docs');
  // The landing hero's heading and intro.
  const landing: Card = { title: 'Clear syntax.', accent: 'Maximum speed.', description: INTRO };
  return [
    { params: { slug: 'index' }, props: landing },
    ...docs.map((entry) => ({
      params: { slug: entry.id },
      props: {
        eyebrow: eyebrow(entry.id),
        title: entry.data.title,
        description: entry.data.description && plain(entry.data.description),
      } satisfies Card,
    })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await renderCard(props as Card)), { headers: { 'Content-Type': 'image/png' } });
