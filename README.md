# ScopeDelta

ScopeDelta is an AI-assisted scope-change and change-order product for small
software agencies and freelancers. This repository currently contains the
single web application and the durable product and architecture documentation.

## Prerequisites

- Node.js 24 LTS. Run `nvm use` when using nvm.
- pnpm 10.28.2, managed through Corepack.

## Local setup

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The local application URL
defaults to that address when `APP_URL` is empty.

For production deployments, set `APP_URL` to the canonical absolute URL, such
as `https://app.example.com`. Keep secrets in the deployment environment or an
untracked `.env.local` file. Variables are server-only unless their names begin
with `NEXT_PUBLIC_`; use that prefix only for values intentionally exposed to
the browser.

## Commands

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Start the local development server.       |
| `pnpm format`       | Format supported repository files.        |
| `pnpm format:check` | Verify formatting without changing files. |
| `pnpm lint`         | Run ESLint.                               |
| `pnpm typecheck`    | Run strict TypeScript checks.             |
| `pnpm test`         | Run the test suite once.                  |
| `pnpm test:watch`   | Run tests in watch mode.                  |
| `pnpm build`        | Create a production build.                |
| `pnpm start`        | Serve an existing production build.       |

## Repository conventions

- `src/app/` contains application routes, layouts, styles, and route-level UI.
- Tests are colocated with the code they exercise as `*.test.ts` or
  `*.test.tsx`.
- `src/test/` contains shared test setup.
- `docs/` contains product rules and durable technical decisions.
- Future database migrations belong in `db/migrations/` after a database and
  migration tool are selected by an approved issue.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the selected foundation and
its tradeoffs.

## Troubleshooting

- If pnpm reports the wrong version, rerun
  `corepack prepare pnpm@10.28.2 --activate`.
- If generated Next.js types are stale, remove `.next` and rerun `pnpm build`.
- If port 3000 is occupied, start development with `pnpm dev --port 3001` and
  update `APP_URL` accordingly.
