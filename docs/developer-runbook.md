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
`.reward-images/`) so nothing external is needed for development; see §3.

## 2. OpenAI configuration (`OPENAI_API_KEY`)

All reward generation uses OpenAI only (no Google APIs):

- `OPENAI_API_KEY` (required) — config source: `process.env` via `src/features/rewards/lib/openai.ts`
- `OPENAI_TEXT_MODEL` (default `gpt-5.6-luna`) — writes the field dossier and, right before
  each render, an exact-appearance brief of the dinosaur (or a designed description of a
  hypothetical hybrid) so the image model draws the correct animal
- `OPENAI_IMAGE_MODEL` (default `gpt-image-2`), `OPENAI_IMAGE_SIZE` (default `1536x1024`),
  `OPENAI_IMAGE_QUALITY` (default `medium`)
- `OPENAI_BASE_URL` (default `https://api.openai.com/v1`)

Generation pipeline per reward asset: dossier (cached under `public/artifacts/dossiers`) →
visual description (Luna) → image (gpt-image-2) → upload to R2 + database record. If the
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

## 3. Storage: Turso database + Cloudflare R2 images

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
target database, and rewrites their stored `/rewards/...` image paths to the new URLs. It is
idempotent (identical bytes are skipped by sha256; profile writes never clobber newer snapshots).

```bash
# 1. put TURSO_* and R2_* in .env.local
npm run db:migrate:rewards -- --dry-run          # plan only
npm run db:migrate:rewards                        # live run
npm run db:reward-cache:list                      # verify
rm -rf public/rewards                             # legacy files would shadow /rewards/<slug>.<ext>
```

Options: `--rewards-dir`, `--source-db`, `--skip-images`, `--skip-profiles`, `--player <name>`
(repeatable), `--force`, `--allow-local-target` (migrate into a local file/dir target).

## 4. Player save file behavior (File System Access API)

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

## 5. Fallback behavior (no File System Access API)

When File System Access API is not available, the app uses JSON import/export fallback:

- Export path:
  - Uses browser `Blob` + object URL + anchor download
  - Filename remains player-based (`<player-slug>-save.json`)
- Import path:
  - Uses file input selection and parses JSON payload
- Validation:
  - Fallback import uses the same `parseDinoDivisionSaveFile` schema validation as filesystem load

If neither File System Access API nor JSON fallback primitives are available, save/load actions surface an error.

## 6. Test execution workflow

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
```

Notes:

- Test runner: Node built-in test runner (`node --test`)
- Tests transpile TypeScript modules on the fly for isolated module-level validation

## 7. Reward cache CLI helpers

These use the same modules as the app (via `scripts/lib/load-typescript-module.mjs`) and read
`.env.local`, so they talk to whatever database/storage the app is configured for.

```bash
npm run db:reward-cache:path                       # database + object storage locations
npm run db:reward-cache:list                       # current state per reward
npm run db:reward-cache:get -- "Tyrannosaurus Rex" # current record + full image history
npm run db:reward-cache:delete -- "Tyrannosaurus Rex"
npm run db:migrate:rewards -- --dry-run            # legacy → R2/Turso migration (see §3)
```
