# Dino Division v2

Next.js App Router + TypeScript + Tailwind foundation for the dino-themed long-division game.

## Developer runbook

Detailed setup, environment, storage, fallback, and test workflow docs live in
`docs/developer-runbook.md`.

## Run locally

```bash
npm ci
cat <<'EOF' > .env.local
GEMINI_API_KEY=your_api_key_here
EOF
npm run dev
```

`GEMINI_API_KEY` is required for Gemini reward image generation.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Targeted checks for this feature set:

```bash
node --test tests/rewards-gemini-config.test.mjs
node --test tests/persistence-file-system-save-load.test.mjs
node --test tests/player-journey-smoke.test.mjs
```

## Storage behavior (summary)

- Server-side reward cache metadata/status is stored in sqlite at `<repo-root>/.sqlite/<dbfile>` (default: `.sqlite/division-challenge.sqlite3`).
- Set `SQLITE_DB_FILE` to override the sqlite filename under `.sqlite/`.
- Reward image cache writes generated files to `public/rewards/` with deterministic slug names and metadata sidecars.
- Player profiles (for example, amber balance/progress) are persisted to shared sqlite via `/api/player-profiles`, so the same player name can load across browsers on the same app instance.
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
