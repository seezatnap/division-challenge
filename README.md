# Dino Division v2

Next.js App Router + TypeScript + Tailwind foundation for the dino-themed long-division game.

## Developer runbook

Detailed setup, environment, storage, fallback, and test workflow docs live in
`docs/developer-runbook.md`.

## Run locally

```bash
npm ci
cp .env.example .env.local   # then set OPENAI_API_KEY
npm run dev
```

`OPENAI_API_KEY` is required for reward generation (dossiers, exact-appearance
briefs, and images all come from OpenAI). Optional overrides:
`OPENAI_TEXT_MODEL` (default `gpt-5.6-luna`), `OPENAI_IMAGE_MODEL` (default
`gpt-image-2`), `OPENAI_IMAGE_SIZE` (default `1536x1024`),
`OPENAI_IMAGE_QUALITY` (default `medium`), `OPENAI_BASE_URL`.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Targeted checks for this feature set:

```bash
node --test tests/rewards-openai-config.test.mjs
node --test tests/persistence-file-system-save-load.test.mjs
node --test tests/player-journey-smoke.test.mjs
```

## Storage behavior (summary)

- Server-side state (a record of every reward image ever generated, generation status, player profiles) lives in one libsql database: Turso when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set, otherwise a local SQLite file at `<repo-root>/.sqlite/division-challenge.sqlite3` (`SQLITE_DB_FILE` overrides the name).
- Reward image binaries are uploaded to Cloudflare R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; optional `R2_PUBLIC_BASE_URL` to serve them straight from R2). Without R2 configured they are kept under `.reward-images/` for local development.
- `npm run db:migrate:rewards` moves images/profiles from the old `public/rewards/` + local sqlite layout into R2/Turso; see `docs/developer-runbook.md` §3.
- Player profiles (for example, amber balance/progress) are persisted to the shared database via `/api/player-profiles`, so the same player name can load across browsers.
- Browser `localStorage` is still written as a backup/migration source.
- Save/load prefers File System Access API when available and uses player-named JSON files (for example, `rex-save.json`).
- If File System Access API is unavailable, save/load falls back to JSON export/import with the same schema validation rules.

## Reward Cache CLI

```bash
npm run db:reward-cache:path
npm run db:reward-cache:list
npm run db:reward-cache:get -- "Tyrannosaurus Rex"
npm run db:reward-cache:delete -- "Tyrannosaurus Rex"
```

## Feature Architecture Baseline

The v2 foundation includes these feature domains under `src/features/`:

- `division-engine`
- `multiplication-engine`
- `workspace-ui`
- `rewards`
- `gallery`
- `persistence`

## Game Modes & Difficulty

The mission config bar (above the workspace) lets the player choose:

- **Sequencer Mode**: Division, Multiplication, or Mixed Ops (alternates randomly per problem).
- **Difficulty**: Easy (+1 amber per solve), Medium (+2), or Hard (+4). Unlocking a dinosaur
  costs 10 amber; creating a hybrid costs 4 amber.

Multiplication problems use the standard partial-product stack: one row per multiplier digit
(typed right-to-left, ones place first, with place-holder zeros auto-filled), then a final
sum row for multi-digit multipliers.

Each feature has a typed entrypoint (`index.ts`) and subfolders to support incremental implementation in later tasks.
