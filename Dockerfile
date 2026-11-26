# The site is built outside the image (`pnpm build`, in CI); the image runs it with Node.
# Everything but the landing and the roadmap is a prerendered file under dist/client.
FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS deps

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# The build bundles Astro and React into dist/server, so the only run-time dependency is the
# static file server that server/app.mjs imports; everything else is a devDependency.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate && \
    pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

LABEL org.opencontainers.image.source="https://github.com/wolfware-labs/mora-docs"

ENV NODE_ENV=production PORT=8080
# The server runs node alone; npm, npx and corepack are only attack surface here.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY server server
COPY dist dist

USER node
EXPOSE 8080
CMD ["node", "server/main.mjs"]
