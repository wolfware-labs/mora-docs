import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// An index of the docs for language models (llmstxt.org). `mora docs --llm` will replace it.
export const GET: APIRoute = async ({ site }) => {
  const pages = (await getCollection('docs')).sort((a, b) => a.id.localeCompare(b.id));
  const url = (id: string) => new URL(id === 'docs' ? '/docs/' : `/${id}/`, site).href;
  const lines = pages.map((p) => `- [${p.data.title}](${url(p.id)})${p.data.description ? `: ${p.data.description}` : ''}`);
  const body = `# Mora\n\n> Mora is a general-purpose language with clean, readable syntax that compiles to one native executable. Dependency injection is built in: \`services\` blocks declare the wiring, and the compiler checks it at build time. \`contract\` sections keep each member's rules beside the type. Libraries are \`.wasm\` files you import. Desktop and server targets come first, embedded boards after.\n\nThe documentation is generated from the language specification: https://github.com/wolfware-labs/mora-lang/blob/main/docs/design/mora.md\n\n## Docs\n\n${lines.join('\n')}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
