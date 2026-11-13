# mora-docs

The website for the [Mora programming language](https://github.com/wolfware-labs/mora-lang): the landing page, the roadmap and the documentation at [moralang.org](https://moralang.org). Built with Astro and Starlight.

## Where the content comes from

- **Docs pages** are generated from the language repository on every `dev` and `build` by `scripts/sync-spec.mjs`: the spec sections listed in `scripts/lib/doc-pages.mjs`, one page per file in `docs/errors/`, and the grammar `crates/mora-syntax/mora.ungram`. The generated files in `src/content/docs/docs/` are not committed. To change what a page says, change the spec.
- **The roadmap** reads milestones and issues from the GitHub API at build time. When GitHub cannot be reached, it falls back to `src/data/roadmap.snapshot.json`. The release lines and the milestone descriptions are in `src/data/releases.ts`.
- **The landing page** is `src/pages/index.astro`.

## Develop

```sh
pnpm install
MORA_LANG_DIR=../lang pnpm dev
```

`MORA_LANG_DIR` points at a local checkout of `mora-lang`. Without it, the sync script clones `main` into `node_modules/.cache/mora-lang`.

| Command | Does |
|---|---|
| `pnpm dev` | Syncs the docs and starts the dev server |
| `pnpm build` | Syncs the docs and builds the site into `dist/` |
| `pnpm typecheck` | Type-checks the site |
| `pnpm test` | Unit tests |
| `pnpm test:e2e` | Builds the site with the roadmap snapshot and runs the Playwright tests |
| `pnpm snapshot` | Refreshes `src/data/roadmap.snapshot.json` from GitHub (set `GITHUB_TOKEN`) |

The signup form appears only when `PUBLIC_MAILERLITE_ACTION` is set to a MailerLite form endpoint.

## Deploy

Every push to `main` runs semantic-release, which tags a version from the commit messages, then builds the site into an nginx image, smoke-tests it and pushes it to `docker.io/wolfware/mora-site`. mora-lang sends a `roadmap-changed` dispatch when a milestone changes, or an issue that is in a milestone or labelled `explore` changes, which rebuilds the image so the roadmap follows GitHub within minutes; a nightly run rebuilds it too, in case a dispatch is missed.

## License

Apache 2.0 or MIT, at your option.
