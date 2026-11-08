import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { INTRO, POINTS } from '../data/pitch';

// An index of the docs for language models (llmstxt.org). `mora docs --llm` will replace it.
export const GET: APIRoute = async ({ site }) => {
  const pages = (await getCollection('docs')).sort((a, b) => a.id.localeCompare(b.id));
  const url = (id: string) => new URL(id === 'docs' ? '/docs/' : `/${id}/`, site).href;
  const lines = pages.map((p) => `- [${p.data.title}](${url(p.id)})${p.data.description ? `: ${p.data.description}` : ''}`);
  const body = `# Mora\n\n> ${INTRO}\n\n${POINTS.map((p) => `- ${p.title}: ${p.detail}`).join('\n')}\n\nThe documentation is generated from the language specification: https://github.com/wolfware-labs/mora-lang/blob/main/docs/design/mora.md\n\n## Docs\n\n${lines.join('\n')}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
