import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { hasSections } from './lib/toc';
import { ogImage, ogImageAlt } from './lib/share';

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;

  // A table of contents with nothing but "Overview" takes a whole column for one link.
  if (route.toc && !hasSections(route.toc)) route.toc = undefined;

  // Each docs page links its own share card. Starlight already sets the title and description tags.
  const image = new URL(ogImage(route.entry.id), context.site).href;
  const alt = ogImageAlt(route.entry.data.title);
  route.head.push(
    { tag: 'meta', attrs: { property: 'og:image', content: image } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', attrs: { property: 'og:image:alt', content: alt } },
    { tag: 'meta', attrs: { name: 'twitter:image', content: image } },
    { tag: 'meta', attrs: { name: 'twitter:image:alt', content: alt } },
  );
});
