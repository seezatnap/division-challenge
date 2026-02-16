# Tasks

## Platform & Data Foundations

- [x] (#1) Set up and validate the Next.js App Router + TypeScript + Tailwind baseline, configure `.env.local` usage for `GEMINI_API_KEY`, and define shared domain types for division problems, player save schema, unlocked dinosaurs, and session history [5 pts] (A)
- [x] (#2) Create a constants/data module with the full static list of 100 dinosaurs (including major Jurassic Park/Jurassic World/Chaos Theory dinosaurs), plus utility methods for selection and guard checks for exact count and uniqueness [5 pts] (blocked by #1) (A)

## Division Gameplay

- [x] (#3) Implement long-division problem generation with difficulty tiers from `2-digit ÷ 1-digit` up to `4–5 digit ÷ 2–3 digit`, including remainder handling and difficulty metadata per generated problem [5 pts] (blocked by #1) (B)
- [x] (#4) Build the step-state engine for long division (`divide -> multiply -> subtract -> bring down`) that validates each step input, returns correctness state, provides hint text for mistakes, and detects problem completion [5 pts] (blocked by #3) (A)
- [x] (#5) Implement the interactive “work on paper” UI for step-by-step solving, wiring user inputs to the step engine with immediate feedback and smooth transition to the next problem [5 pts] (blocked by #4) (A)
- [x] (#6) Add progression logic to track solved counts for current session and lifetime totals, increase difficulty with player progress, and emit a reward trigger every 5 solved problems [5 pts] (blocked by #5) (A)

## Dino Rewards Pipeline

- [x] (#7) Implement a server-side Gemini image generation service/route using `@google/generative-ai` with model `gemini-2.0-flash-exp`, reading `GEMINI_API_KEY` from `.env.local`, and generating Jurassic Park cinematic-style prompts based on dinosaur name [5 pts] (blocked by #1) (A)
- [x] (#8) Create server filesystem persistence for generated images by saving files into the public directory with stable unique naming and returning the public image path for UI rendering [5 pts] (blocked by #7) (B)
- [x] (#9) Build reward orchestration that consumes every-5-solved triggers, chooses a dinosaur from the 100-item pool, calls Gemini generation, stores image path, and appends unlocked metadata (`name`, `image path`, `date earned`) to player state [5 pts] (blocked by #2, #6, #8) (A)

## Save Files & Player Lifecycle

- [x] (#10) Implement File System Access API save/load support with explicit user permission prompts, `<player>-save.json` naming, JSON read/write, schema validation, and unsupported-browser fallback messaging [5 pts] (blocked by #1) (C)
- [x] (#11) Build game-start flow to prompt for player name and present “Load existing save” vs “Start new game,” then initialize runtime state accordingly [5 pts] (blocked by #10) (A)
- [x] (#12) Integrate persistence with gameplay so progress, current difficulty, unlocked dinosaurs, and session history are saved/loaded consistently across sessions [5 pts] (blocked by #6, #9, #10, #11) (A)

## Gallery & Theming

- [ ] (#13) Implement the Dino Gallery page/section to display all unlocked dinosaurs with image, dinosaur name, and earned date, including empty-state and live refresh after new unlocks [5 pts] (blocked by #12)
- [ ] (#14) Apply full dinosaur/Jurassic theming across the app (earthy/jungle palette, themed typography/headers, subtle dino motifs) and integrate playful success/error messages into gameplay feedback [5 pts] (blocked by #5, #13)

## Testing & Release Readiness

- [ ] (#15) Add automated tests for problem generation, step validation, progression/reward thresholds, dinosaur list integrity, save-file schema handling, plus an integration smoke test for solve->reward->gallery flow with mocked Gemini; include a concise developer QA/runbook for env and browser support checks [5 pts] (blocked by #12, #13, #14)

## Follow-up tasks (from sprint review)
- [x] (#16) Update `isDivisionProblem` in `lib/domain.ts` to reject mathematically inconsistent problems (`dividend !== divisor * quotient + remainder`) and add a regression test in `tests/domain.test.ts`. (B)

## Follow-up tasks (from sprint review)
- [x] (#17) Harden `persistGeminiGeneratedImage` to strictly reject malformed base64 payloads (not just empty decodes) and add a regression test in `tests/gemini-image-storage.test.ts` for invalid-but-decodable input. (A)

## Follow-up tasks (from sprint review)
- [B] (#18) Make reward unlock application order-safe by queuing/serializing milestone processing in `app/player-save-panel.tsx` so later in-flight rewards cannot be applied before earlier ones and cause skipped unlocks.
- [B] (#19) Add retry handling for failed reward generation milestones (instead of permanently dropping them after one failed attempt), with regression tests for failed and out-of-order reward responses.
