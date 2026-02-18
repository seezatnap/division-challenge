# Dino Division v2 Developer Runbook

## 1. Local setup

Prerequisites:

- Node.js 20.x (verified in this repo with `v20.19.4`)
- npm 9+

Install and start:

```bash
npm ci
cat <<'EOF' > .env.local
GEMINI_API_KEY=your_api_key_here
EOF
npm run dev
```

App URL: `http://localhost:3000`

## 2. Gemini configuration (`GEMINI_API_KEY`)

- Environment variable name: `GEMINI_API_KEY`
- Config source: `process.env` via `src/features/rewards/lib/gemini.ts`
- Model constant: `gemini-2.0-flash-exp`

If `GEMINI_API_KEY` is missing or blank, reward generation fails. The API route responds with a configuration error when Gemini requests are attempted.

Reward generation endpoint:

- `POST /api/rewards/generate-image`
- JSON body: `{ "dinosaurName": "Velociraptor" }`

Reward image status endpoint:

- `GET /api/rewards/image-status?dinosaurName=Velociraptor`
- Returns `ready`, `generating`, or `missing`

## 3. Reward image file storage behavior

Server-side reward image caching is filesystem-backed:

- Output directory: `public/rewards/`
- File naming: slugified dinosaur name (for example, `tyrannosaurus-rex.png`)
- Metadata sidecar: `<image-file>.metadata.json`
- Duplicate prevention:
  - Checks for existing disk image before generating
  - Tracks in-flight generation by cache key to avoid duplicate concurrent generation

The status route reads both disk cache and in-flight generation state.

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

Targeted commands for setup/Gemini/persistence flow changes:

```bash
node --test tests/rewards-gemini-config.test.mjs
node --test tests/persistence-file-system-save-load.test.mjs
node --test tests/player-journey-smoke.test.mjs
```

Notes:

- Test runner: Node built-in test runner (`node --test`)
- Tests transpile TypeScript modules on the fly for isolated module-level validation
