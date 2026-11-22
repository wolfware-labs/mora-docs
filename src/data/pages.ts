// The landing and roadmap pages' own share cards, from each page's existing copy.
import type { Card } from '../lib/og';
import { INTRO } from './pitch';

export const ROADMAP_DESCRIPTION =
  'Where Mora is headed: the milestones of each release line, with live progress from GitHub.';

export const PAGE_CARDS = {
  // The landing hero's heading and intro.
  index: { title: 'Clear syntax.', accent: 'Maximum speed.', description: INTRO },
  roadmap: { title: 'Roadmap', description: ROADMAP_DESCRIPTION },
} satisfies Record<string, Card>;

export type PageCard = keyof typeof PAGE_CARDS;

/** The card's heading as one line, for its alt text. */
export const cardHeading = (card: Card) => (card.accent ? `${card.title} ${card.accent}` : card.title);
