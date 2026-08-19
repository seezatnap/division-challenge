# Dino Division v2 Developer Runbook

## 1. Local setup

Prerequisites:

- Node.js 20.x (verified in this repo with `v20.19.4`)
- npm 9+

Install and start:

```bash
npm ci
cp .env.example .env.local   # then set OPENAI_API_KEY (+ TURSO_* / R2_* for real storage)
npm run dev
```

App URL: `http://localhost:3000`

Without `TURSO_*` / `R2_*` the app runs fully locally (SQLite file under `.sqlite/`, images under
`.reward-images/`) so nothing external is needed for development; see §4.

## 2. OpenAI configuration (`OPENAI_API_KEY`)

All reward generation uses OpenAI only (no Google APIs):

- `OPENAI_API_KEY` (required) — config source: `process.env` via `src/features/rewards/lib/openai.ts`
- `OPENAI_TEXT_MODEL` (default `gpt-5.6-luna`) — writes the field dossier and, right before
  each render, an exact-appearance brief of the dinosaur (or a designed description of a
  hypothetical hybrid) so the image model draws the correct animal
- `OPENAI_IMAGE_MODEL` (default `gpt-image-2`), `OPENAI_IMAGE_SIZE` (default `1536x1024`),
  `OPENAI_IMAGE_QUALITY` (default `medium`)
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`)

Generation pipeline per reward asset: dossier (curated facts + model prose, stored in the
database) → visual description (Luna) → image (gpt-image-2) → upload to R2 + database record. If the
description call fails the render proceeds from the dossier alone; if the image call fails a
local SVG fallback is stored instead (recorded with `source: "fallback-svg"`). Note that OpenAI gates the GPT Image models behind API
Organization Verification in the developer console.

If `OPENAI_API_KEY` is missing or blank, the image route stores the local fallback image and the
dossier falls back to the deterministic catalog entry.

Reward generation endpoint:

- `POST /api/rewards/generate-image`
- JSON body: `{ "dinosaurName": "Velociraptor" }`

Reward image status endpoint:

- `GET /api/rewards/image-status?dinosaurName=Velociraptor`
- Returns `ready`, `generating`, or `missing`

Reward dossier endpoint:

- `GET /api/rewards/dossier?assetName=Brachiosaurus` — curated facts plus any stored model prose.
  Read-only: browsing the gallery never triggers a model call (see §3).

Reward image record endpoints:

- `GET /api/rewards/cache` (current state of every reward: live image + generation status)
- `GET /api/rewards/cache?dinosaurName=Velociraptor` (single record + full history of every
  image ever created for it)
- `DELETE /api/rewards/cache?dinosaurName=Velociraptor` (delete every stored object + row for it)
- `GET /rewards/<slug>.<ext>` streams the current image for a reward from object storage (used
  when no public R2 URL is configured, and for image paths saved before the R2 move)

Player profile endpoint:

- `GET /api/player-profiles?playerName=Gus` (load profile)
- `PUT /api/player-profiles` with JSON body `{ "playerName": "Gus", "snapshot": { ... }, "updatedAtMs": 123 }`

## 3. Where dinosaur facts come from

Everything factual the game displays — the Research Center info card, dossier measurements, the
description fallback — comes from one hand-checked table: `src/features/rewards/lib/dinosaur-facts.ts`,
which holds a `DinosaurFactSheet` for all 100 roster entries (scientific name, pronunciation, name
meaning, diet, length/height/weight, period + age range, location, taxon, group, three traits and a
two-sentence description).

Rules this pipeline enforces:

- **Nothing factual is generated.** An earlier build filled the info card by hashing the animal's
  name and sampling pools of plausible-sounding values, which is why Brachiosaurus once displayed as
  a Late Triassic carnivorous dromaeosaur called "roofed lizard". Those pools are gone, and
  `tests/rewards-dinosaur-facts.test.mjs` fails if they come back.
- **A name with no fact sheet gets no facts.** `buildPrimaryDinosaurDossier` returns zero dimensions
  and a null info card rather than inventing values.
- **Non-dinosaurs are labelled.** `group` distinguishes `dinosaur`, `pterosaur`, `marine-reptile`,
  `synapsid`, `crocodylomorph` and `film-creation`; the taxon line carries the clarification
  ("flying reptile, not a dinosaur"), and the two Jurassic World hybrids show a film credit instead
  of a geologic age.
- **The model writes prose only.** `openai-dossier-service.ts` sends the fact sheet as a VERIFIED
  FACTS block and its JSON schema accepts only `description` and `attributes`. Anything factual in a
  response is discarded by `withCuratedFacts`, which also re-derives facts when reading stored rows —
  so old or hallucinated content cannot reach a player.
- **Hybrids are framed as imaginary**, with dimensions averaged from their two real parents.

To correct or add an animal, edit `dinosaur-facts.ts` only; the info card, dossier, prompt block and
image prompt all follow from it. Diet may be `"unknown"` where fossils genuinely do not show it.

Dossier prose lives in the `reward_dossiers` table (slug, subject name, kind, description,
attributes, source, model, prompt, timestamps) — deliberately *without* measurements, so a stored row
cannot carry a fact. Rows written by `openai`/`gemini` are reused; a `curated` row means generation
failed and the fact-sheet text is being shown instead.

## 3b. Game modes

Three sequencer modes share one session loop in `src/app/page.tsx`: **Division**, **Multiplication**
and **Fractions** (which replaced the old "Mixed Ops" random-picker).

Fraction reducing (`src/features/fraction-engine`) hands the player a fraction over a power of ten
and has them reduce it one divisor at a time:

- `problem-generator.ts` builds the numerator as `2^a * 5^b * cofactor`, where the cofactor is
  coprime to 10 and the fraction stays proper. That fixes the workload exactly: `a + b` rounds of
  reducing, then the fraction stops. The mix is deliberately lopsided — at most one 5 (`MAX_FIVES`)
  and up to four 2s (`MAX_TWOS`) — so most rounds are halving. Difficulty maps to rounds: easy 2,
  medium 3–4, hard 4–5 (`FRACTION_DIFFICULTY_TIERS`).
- `fraction-reduction.ts` holds the rules: the offered choices are 2, 3, 5, 7, 9, 11, and a choice is
  correct only when it divides *both* halves. Because the denominator is a power of ten, only 2 and 5
  ever can — the rest are deliberate distractors. "None of the above" is correct exactly when nothing
  on the list divides both, and choosing it ends the problem.
- `reduction-session.ts` is the state machine: pick a divisor → fill in the two divisions → the
  reduced fraction is appended as a new row and the question repeats. Every row stays on screen so
  the whole reduction reads as shown work.
- `FractionReductionPanel` (in workspace-ui) renders it, reusing the workspace's inline-entry cells,
  amber glow and red error shake. The **?** button beside each blank opens a scratch pad containing a
  real `LiveDivisionWorkspacePanel` for that exact division; solving it there drops the answer into
  the blank. Focus follows the active blank (numerator, then denominator).

Fraction problems are not step-driven, so the panel reports completion through `onProblemSolved`
instead of workspace step validation; scoring, streaks and amber are unchanged.

## 4. Storage: Turso database + Cloudflare R2 images

All server-side state lives in one libsql database (`src/features/persistence/lib/database.ts`):

- **Turso** when `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) is set — this is the production setup.
- **Local SQLite file** otherwise: `<repo-root>/.sqlite/division-challenge.sqlite3`
  (`SQLITE_DB_FILE` overrides the file name; `TURSO_DATABASE_URL=file:/abs/path` also works).
- The schema is created/migrated automatically on first connection (`schema_migrations` table).

Tables:

| table | purpose |
| --- | --- |
| `reward_images` | one row for **every** image ever created/uploaded: id, slug, dinosaur name, prompt, model, mime type, extension, R2 object key, byte size, sha256, source (`openai` / `fallback-svg` / `filesystem-migration`), created time |
| `reward_image_states` | one row per reward slug: generation status (`ready` / `generating` / `missing`) and which `reward_images` row is the current image |
| `reward_dossiers` | model-written dossier prose per reward (facts are never stored here — see §3) |
| `player_profiles` | shared player profiles (unchanged schema) |

Reward image binaries live in object storage (`src/features/persistence/lib/object-storage.ts`):

- **Cloudflare R2** when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  are set (S3-compatible API via `@aws-sdk/client-s3`). Object keys are
  `<R2_KEY_PREFIX>/<slug>/<createdAtMs>-<id>.<ext>` — every generation gets a fresh, immutable key,
  so history is preserved and CDN caches never go stale.
- **Local directory fallback** (`.reward-images/`, override with `REWARD_IMAGE_STORAGE_DIRECTORY`)
  when the R2 variables are absent — development only; a warning is logged once.

Image URLs handed to the browser (`imagePath` in API responses / player profiles):

- `R2_PUBLIC_BASE_URL` set → `https://<public-host>/<object-key>` (direct from R2; `next.config.ts`
  adds the host to `images.remotePatterns` at build time, so set it for the build too).
- otherwise → `/rewards/<slug>.<ext>?v=<createdAtMs>`, streamed by `src/app/rewards/[filename]/route.ts`.

Duplicate prevention: the database state is checked before generating and in-flight generation is
tracked per slug in memory (a persisted `generating` flag older than 5 minutes is treated as
abandoned so a crashed instance cannot wedge a reward).

### Migrating from the old layout (`public/rewards/` + local `.sqlite/`)

`scripts/migrate-rewards-to-r2-and-turso.mjs` uploads every legacy image, records it (keeping the
original file time as `created_at_ms`, `source: "filesystem-migration"`, prompt/model from the
`.metadata.json` sidecar or the legacy `reward_image_cache` row), copies player profiles into the
target database, rewrites their stored `/rewards/...` image paths to the new URLs, and imports
dossier prose from `public/artifacts/dossiers/**.json` into `reward_dossiers` (hybrid rows are
re-keyed to the canonical "Hybrid A + B" name, and only model-written prose is imported — the old
template text is dropped in favour of the curated description). It is idempotent (identical bytes are
skipped by sha256; profile writes never clobber newer snapshots; stored dossiers are left alone).

```bash
# 1. put TURSO_* and R2_* in .env.local
npm run db:migrate:rewards -- --dry-run          # plan only
npm run db:migrate:rewards                        # live run
npm run db:reward-cache:list                      # verify
rm -rf public/rewards                             # legacy files would shadow /rewards/<slug>.<ext>
```

Options: `--rewards-dir`, `--source-db`, `--dossiers-dir`, `--skip-images`, `--skip-profiles`,
`--skip-dossiers`, `--player <name>` (repeatable), `--force`, `--allow-local-target` (migrate into a
local file/dir target).

## 5. Player save file behavior (File System Access API)

Save/load logic is implemented in `src/features/persistence/lib/file-system-save-load.ts`.

Core behavior:

- Save uses `showSaveFilePicker` (suggested filename `<player-slug>-save.json`)
- Load uses `showOpenFilePicker`
- Explicit permissions are requested:
  - `readwrite` for save
  - `read` for load
- Save payload schema version: `1`
- Save payload includes:
  - `playerName`, `totalProblemsSolved`, `currentDifficultyLevel`
  - `progress` (session + lifetime)
  - `unlockedDinosaurs`
  - `sessionHistory`
  - `updatedAt`

Write-safety behavior:

- Writes are queued per file handle to prevent concurrent write races
- Writes use atomic `createWritable({ keepExistingData: false })` flow
- Failed writes attempt `abort()` and preserve previous file contents
- If an existing save for the same player exists, incoming snapshots are merged to retain latest progress/rewards

## 6. Fallback behavior (no File System Access API)

When File System Access API is not available, the app uses JSON import/export fallback:

- Export path:
  - Uses browser `Blob` + object URL + anchor download
  - Filename remains player-based (`<player-slug>-save.json`)
- Import path:
  - Uses file input selection and parses JSON payload
- Validation:
  - Fallback import uses the same `parseDinoDivisionSaveFile` schema validation as filesystem load

If neither File System Access API nor JSON fallback primitives are available, save/load actions surface an error.

## 7. Test execution workflow

Run the full validation gate before merging:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Targeted commands for setup/OpenAI/persistence flow changes:

```bash
node --test tests/rewards-openai-config.test.mjs tests/rewards-image-runtime.test.mjs
node --test tests/persistence-file-system-save-load.test.mjs
node --test tests/player-journey-smoke.test.mjs

# Fact pipeline (curated data, dossier store, dossier endpoint)
node --test tests/rewards-dinosaur-facts.test.mjs tests/rewards-dossier-store.test.mjs \
  tests/rewards-dossier-route.test.mjs
```

Notes:

- Test runner: Node built-in test runner (`node --test`)
- Tests transpile TypeScript modules on the fly for isolated module-level validation

## 8. Reward cache CLI helpers

These use the same modules as the app (via `scripts/lib/load-typescript-module.mjs`) and read
`.env.local`, so they talk to whatever database/storage the app is configured for.

```bash
npm run db:reward-cache:path                       # database + object storage locations
npm run db:reward-cache:list                       # current state per reward
npm run db:reward-cache:get -- "Tyrannosaurus Rex" # current record + full image history
npm run db:reward-cache:delete -- "Tyrannosaurus Rex"
npm run db:migrate:rewards -- --dry-run            # legacy → R2/Turso migration (see §4)
```
