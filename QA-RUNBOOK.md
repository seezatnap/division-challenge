# Dino Division — Developer QA Runbook

Quick-reference checklist for verifying the app before release.

---

## 1. Environment Setup

```bash
# Clone and install
npm ci

# Create .env.local from the example
cp .env.local.example .env.local
# Add your Gemini API key:
#   GEMINI_API_KEY=your-key-here
```

**Required env vars:**

| Variable         | Purpose                        | Where     |
|------------------|--------------------------------|-----------|
| `GEMINI_API_KEY` | Google Generative AI API key   | `.env.local` |

The app will fail to generate dinosaur images without a valid key. All other features (gameplay, save/load, gallery display of previously earned dinos) work without it.

---

## 2. Automated Tests

```bash
# Run all tests (unit + integration)
npm test

# Watch mode during development
npm run test:watch

# Run only the integration smoke test
npx vitest run src/__tests__/integration-smoke.test.ts
```

**What the tests cover:**

| Area                          | Test file(s)                                    |
|-------------------------------|------------------------------------------------|
| Problem generation (all tiers)| `lib/__tests__/generate-problem.test.ts`       |
| Step engine validation        | `lib/__tests__/step-engine.test.ts`            |
| Progression & reward triggers | `lib/__tests__/progression.test.ts`            |
| Dinosaur list integrity (100) | `data/__tests__/dinosaurs.test.ts`             |
| Save-file schema validation   | `lib/__tests__/validate-save.test.ts`          |
| Save/load (File System API)   | `lib/__tests__/save-file.test.ts`              |
| Reward orchestrator (Gemini)  | `lib/__tests__/reward-orchestrator.test.ts`    |
| Persistence orchestration     | `lib/__tests__/persistence.test.ts`            |
| Page reward wiring            | `app/__tests__/page-reward-wiring.test.ts`     |
| API route (generate-dino)     | `app/api/generate-dino/__tests__/route.test.ts`|
| Gallery component             | `components/__tests__/DinoGallery.test.ts`     |
| Game start screen             | `components/__tests__/GameStartScreen.test.ts` |
| Division workspace            | `components/__tests__/DivisionWorkspace.test.ts`|
| **Integration smoke test**    | `__tests__/integration-smoke.test.ts`          |

---

## 3. Lint & Type Check

```bash
# ESLint
npm run lint

# TypeScript type check (no emit)
npx tsc --noEmit
```

---

## 4. Build Verification

```bash
npm run build
```

A clean build confirms no import errors, missing modules, or type issues that only surface at build time.

---

## 5. Browser Support

### Required for save/load

The game uses the **File System Access API** (`showSaveFilePicker` / `showOpenFilePicker`) for save files. This API is supported in:

| Browser          | Save/Load | Notes                           |
|------------------|-----------|---------------------------------|
| Chrome 86+       | Yes       | Full support                    |
| Edge 86+         | Yes       | Full support (Chromium-based)   |
| Opera 72+        | Yes       | Full support                    |
| Firefox          | No        | Not supported                   |
| Safari           | No        | Not supported                   |
| Mobile browsers  | No        | Generally not supported          |

**Fallback behavior:** On unsupported browsers, the app displays a message: _"Your browser does not support the File System Access API. Please use a recent version of Chrome, Edge, or Opera to save and load game files."_ Gameplay works fine without save/load — progress is kept in memory for the session.

### Manual browser check

1. Open the app in Chrome/Edge
2. Start a new game, enter a player name
3. Verify the save dialog appears after solving the first problem
4. Close and reopen — verify "Load existing save" loads the file correctly

---

## 6. Manual QA Checklist

### Gameplay flow

- [ ] Enter player name and start new game
- [ ] First problem is tier 1 (2-digit ÷ 1-digit)
- [ ] Each step shows correct prompt (divide/multiply/subtract/bring-down)
- [ ] Correct answers advance to next step with success feedback
- [ ] Wrong answers show a hint without advancing
- [ ] Completing a problem loads the next one
- [ ] After 5 solves, difficulty increases to tier 2

### Reward system

- [ ] After 5th solve, a dinosaur reward is triggered
- [ ] Reward shows dinosaur name and generated image
- [ ] Dinosaur appears in the Dino Gallery
- [ ] Gallery shows "1 / 100 unlocked"
- [ ] After 10th solve, a second dinosaur is earned
- [ ] If Gemini API is unavailable, an error message appears but game continues

### Save/load

- [ ] Save dialog appears (Chrome/Edge)
- [ ] File is named `<player>-save.json`
- [ ] Loading a save restores: player name, solved count, difficulty, unlocked dinos
- [ ] Loading an invalid/corrupted file shows an error message

### Theming

- [ ] Earthy/jungle color palette throughout
- [ ] Dino motifs visible in headers and UI elements
- [ ] Fun encouragement messages on correct answers
- [ ] Playful error messages on incorrect answers

---

## 7. Key Constants

| Constant            | Value | Meaning                                    |
|---------------------|-------|--------------------------------------------|
| `REWARD_INTERVAL`   | 5     | Dinosaur reward every N problems solved    |
| `PROBLEMS_PER_TIER` | 5     | Problems before advancing difficulty tier  |
| `MAX_TIER`          | 5     | Maximum difficulty level                   |
| `DINOSAUR_COUNT`    | 100   | Total dinosaurs in the reward pool         |

---

## 8. Troubleshooting

| Issue                              | Fix                                                  |
|------------------------------------|------------------------------------------------------|
| `GEMINI_API_KEY` not set           | Add key to `.env.local`                               |
| Build fails with type errors       | Run `npx tsc --noEmit` to see specific errors         |
| Tests fail on import               | Run `npm ci` to ensure dependencies are installed     |
| Save doesn't work                  | Use Chrome or Edge; check browser console for errors  |
| Dino image generation fails        | Check API key validity; check Gemini API quotas       |
| "Dinosaur list" assertion error    | The `DINOSAURS` array was modified — must have exactly 100 unique entries |
