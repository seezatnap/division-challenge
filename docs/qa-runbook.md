# Dino Division QA Runbook

## 1) Environment checks

1. Install deps: `npm ci`
2. Create local env file: `cp .env.example .env.local`
3. Verify Gemini key is set:
   - `grep -E '^GEMINI_API_KEY=' .env.local`
   - Value must be non-empty for live Gemini image generation.
4. Run the validation gate:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`

Note: integration smoke coverage for `solve -> reward -> gallery` runs in
`npm run test` and uses mocked Gemini generation.

## 2) Browser support checks (File System Access API)

1. Start app: `npm run dev`
2. In Chrome or Edge (latest stable):
   - Start a game and solve problems.
   - Click `Save Progress` and verify permission prompt appears.
   - Reload, use `Load Existing Save`, and verify save data restores.
3. In Firefox or Safari:
   - Confirm save/load controls show unsupported-browser messaging.
   - Confirm the game still runs without crashing when save APIs are unavailable.
