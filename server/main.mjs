// Starts the site: `pnpm build`, then `node server/main.mjs`. PORT defaults to 8080 and
// MORA_OUT_DIR to dist, as in the build.
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from './app.mjs';

const out = new URL(`../${process.env.MORA_OUT_DIR || 'dist'}/`, import.meta.url);
const { handler } = await import(pathToFileURL(fileURLToPath(new URL('server/entry.mjs', out))).href);
const port = Number(process.env.PORT || 8080);

const app = createApp({
  clientDir: fileURLToPath(new URL('client/', out)),
  ssr: handler,
  // The pages with `export const prerender = false`.
  ssrPaths: ['/', '/roadmap/'],
});
const server = createServer(app);
server.listen(port, () => console.log(`site: listening on ${port}`));

// Kubernetes sends SIGTERM on a rollout: finish the requests in flight, then exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
