# Dino Division v2 Developer Runbook

## 1. Local setup

Prerequisites:

- Node.js 20.x (verified in this repo with `v20.19.4`)
- npm 9+

Install and start:

```bash
npm ci
cp .env.example .env.local   # then set OPENAI_API_KEY
npm run dev
```

App URL: `http://localhost:3000`

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
visual description (Luna) → image (gpt-image-2) → filesystem/sqlite cache. If the description
call fails the render proceeds from the dossier alone; if the image call fails a local SVG
fallback is stored instead. Note that OpenAI gates the GPT Image models behind API
Organization Verification in the developer console.

If `OPENAI_API_KEY` is missing or blank, the image route stores the local fallback image and the
dossier falls back to the deterministic catalog entry.

Reward generation endpoint:

- `POST /api/rewards/generate-image`
- JSON body: `{ "dinosaurName": "Velociraptor" }`

Reward image status endpoint:

- `GET /api/rewards/image-status?dinosaurName=Velociraptor`
- Returns `ready`, `generating`, or `missing`

Reward cache database endpoints:

- `GET /api/rewards/cache` (list all sqlite-backed cache records)
- `GET /api/rewards/cache?dinosaurName=Velociraptor` (single record)
- `DELETE /api/rewards/cache?dinosaurName=Velociraptor` (delete cache record + files)

Player profile endpoint:

- `GET /api/player-profiles?playerName=Gus` (load profile)
- `PUT /api/player-profiles` with JSON body `{ "playerName": "Gus", "snapshot": { ... }, "updatedAtMs": 123 }`

## 3. Reward image storage behavior (sqlite + filesystem)

Server-side reward cache metadata/status is sqlite-backed:

- SQLite directory: `<repo-root>/.sqlite/`
- Default database file: `division-challenge.sqlite3`
- Full default path: `<repo-root>/.sqlite/division-challenge.sqlite3`
- Optional override: `SQLITE_DB_FILE=<dbfile>` (still stored under `<repo-root>/.sqlite/`)

Image binaries remain filesystem-backed:

- Output directory: `public/rewards/`
- File naming: slugified dinosaur name (for example, `tyrannosaurus-rex.png`)
- Metadata sidecar: `<image-file>.metadata.json`
- Duplicate prevention:
  - Checks for existing disk image before generating
  - Tracks in-flight generation by cache key to avoid duplicate concurrent generation

The status route reads disk cache + in-flight state and mirrors status into sqlite.

Player profiles are sqlite-backed in the same database file (`player_profiles` table) and are shared across browsers for the same app/server instance.

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

```bash
npm run db:reward-cache:path
npm run db:reward-cache:list
npm run db:reward-cache:get -- "Tyrannosaurus Rex"
npm run db:reward-cache:delete -- "Tyrannosaurus Rex"
```
