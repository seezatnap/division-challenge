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

## Game modes

- **Division** and **Multiplication** drive the long-form workspace.
- **Fractions** (replaces the old "Mixed Ops") gives a fraction over 100, 1000 or 10000 and reduces it
  one divisor at a time: choose which of 2/3/5/7/9/11 divides both halves, fill in the two divisions
  (the **?** button opens a long-division scratch pad that fills the answer in for you), repeat until
  nothing divides both, then answer "None of the above". A fraction carries at most one factor of 5
  and up to four 2s, so most rounds are halving. Easy is 2 rounds, medium 3–4, hard 4–5.
  See `docs/developer-runbook.md` §3b.

## Dinosaur facts

- Every fact shown in the Research Center card (scientific name, pronunciation, diet, name meaning, size, weight, period, location, taxon) comes from the hand-checked table in `src/features/rewards/lib/dinosaur-facts.ts` — one entry per roster animal. Nothing factual is generated.
- Non-dinosaurs (pterosaurs, marine reptiles, Dimetrodon) and the two film hybrids are labelled as such instead of being filed under Dinosauria.
- The language model only writes the descriptive blurb, and receives the curated facts as ground truth it must not contradict; any factual field it returns is discarded. Dossier prose is stored in the `reward_dossiers` table.
- To fix or add an animal, edit `dinosaur-facts.ts` and run `node --test tests/rewards-dinosaur-facts.test.mjs`. See `docs/developer-runbook.md` §3.

## Storage behavior (summary)

- Server-side state (a record of every reward image ever generated, generation status, player profiles) lives in one libsql database: Turso when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set, otherwise a local SQLite file at `<repo-root>/.sqlite/division-challenge.sqlite3` (`SQLITE_DB_FILE` overrides the name).
- Reward image binaries are uploaded to Cloudflare R2 (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; optional `R2_PUBLIC_BASE_URL` to serve them straight from R2). Without R2 configured they are kept under `.reward-images/` for local development.
- `npm run db:migrate:rewards` moves images/profiles from the old `public/rewards/` + local sqlite layout into R2/Turso; see `docs/developer-runbook.md` §4.
- Player profiles (for example, amber balance/progress) are persisted to the shared database via `/api/player-profiles`, so the same player name can load across browsers.
- Logging in requires a password (`/api/auth/login`; new operators register via `/api/auth/register`). Passwords are stored as scrypt hashes; profiles that predate passwords start with the password `password`, changeable via the "Change password" link in the dashboard header (`/api/auth/change-password`).
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
