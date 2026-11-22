import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// The build runs from the project root; import.meta.url points into the bundle, not at src/.
const read = (path: string) => readFileSync(join(process.cwd(), path));
const font = (pkg: string, file: string) => read(`node_modules/@fontsource/${pkg}/files/${file}`);

// satori reads woff and ttf but not woff2, so these come from the woff builds fontsource ships.
const fonts = [
  { name: 'Unbounded', data: font('unbounded', 'unbounded-latin-500-normal.woff'), weight: 500 },
  { name: 'Unbounded', data: font('unbounded', 'unbounded-latin-600-normal.woff'), weight: 600 },
  { name: 'Figtree', data: font('figtree', 'figtree-latin-400-normal.woff'), weight: 400 },
  { name: 'JetBrains Mono', data: font('jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff'), weight: 500 },
  { name: 'JetBrains Mono', data: font('jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff'), weight: 700 },
] as const;

// The logo file as it ships, 1280x521.
const logo = `data:image/svg+xml;base64,${read('public/brand/mora-logo.svg').toString('base64')}`;
const LOGO_RATIO = 521 / 1280;

// Same palette as src/styles/site.css and the landing header.
const c = {
  bg: '#140B10',
  text: '#F6EFE9',
  mute: '#D9CCD3',
  dim: '#9A8892',
  accent: '#F39C3D',
  edge: '#2E1F28',
  ribbon: 'linear-gradient(90deg, #4A0E3B, #C0392B 40%, #F39C3D 75%, #FFD27A)',
};

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

const img = (width: number, style: Record<string, unknown> = {}) => {
  const height = Math.round(width * LOGO_RATIO);
  return h('img', { width, height, ...style }, undefined, { src: logo, width, height });
};

/** `accent` is shown after `title` in the brand orange, as the landing hero does. */
export type Card = { title: string; accent?: string; eyebrow?: string; description?: string };

// Unbounded is wide: the size steps down with the title's length so two lines always hold it.
const titleSize = (length: number) => (length > 40 ? 50 : length > 28 ? 58 : length > 18 ? 66 : 76);

// Error codes (MR0147) are set in the mono font, where 0 cannot be read as O.
const isCode = (title: string) => /^MR\d+$/.test(title);

export async function renderCard({ title, accent, eyebrow, description }: Card): Promise<Buffer> {
  const size = titleSize(title.length + (accent ? accent.length + 1 : 0));
  const heading = accent
    ? [h('span', {}, `${title} `), h('span', { color: c.accent }, accent)]
    : title;

  const tree = h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      width: OG_WIDTH,
      height: OG_HEIGHT,
      backgroundColor: c.bg,
      backgroundImage: 'radial-gradient(circle at 88% 18%, rgba(243,156,61,0.16) 0%, rgba(192,57,43,0.06) 32%, rgba(20,11,16,0) 60%)',
      fontFamily: 'Figtree',
      color: c.text,
    },
    [
      h('div', { width: OG_WIDTH, height: 6, backgroundImage: c.ribbon }),
      img(330, { position: 'absolute', right: 72, top: 70 }),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, padding: '58px 72px 52px' },
        [
          h('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
            img(60),
            h('div', { fontFamily: 'Unbounded', fontWeight: 600, fontSize: 26, letterSpacing: '0.28em' }, 'MORA'),
          ]),
          h('div', { display: 'flex', flexDirection: 'column', gap: 22 }, [
            eyebrow
              ? h('div', { display: 'flex', fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 22, letterSpacing: 2, color: c.accent, textTransform: 'uppercase' }, eyebrow)
              : null,
            h(
              'div',
              isCode(title)
                ? { display: 'block', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: size, lineHeight: 1.08 }
                : { display: 'block', fontFamily: 'Unbounded', fontWeight: 500, fontSize: size, lineHeight: 1.08, letterSpacing: '-0.02em', lineClamp: 2 },
              heading,
            ),
            description
              ? h('div', { display: 'block', maxWidth: 980, fontSize: 28, lineHeight: 1.4, color: c.mute, lineClamp: 2 }, description)
              : null,
          ].filter(Boolean)),
          h('div', { display: 'flex', alignItems: 'center', gap: 16, fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 22, color: c.dim }, [
            h('div', { width: 48, height: 3, backgroundColor: c.accent }),
            'moralang.org',
          ]),
        ],
      ),
    ],
  );

  const svg = await satori(tree as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts: fonts as never });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}
