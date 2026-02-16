# Tasks

## Platform & Data Foundations

- [x] (#1) Set up and validate the Next.js App Router + TypeScript + Tailwind baseline, configure `.env.local` usage for `GEMINI_API_KEY`, and define shared domain types for division problems, player save schema, unlocked dinosaurs, and session history [5 pts] (A)
- [x] (#2) Create a constants/data module with the full static list of 100 dinosaurs (including major Jurassic Park/Jurassic World/Chaos Theory dinosaurs), plus utility methods for selection and guard checks for exact count and uniqueness [5 pts] (blocked by #1) (A)

## Division Gameplay

- [x] (#3) Implement long-division problem generation with difficulty tiers from `2-digit ÷ 1-digit` up to `4–5 digit ÷ 2–3 digit`, including remainder handling and difficulty metadata per generated problem [5 pts] (blocked by #1) (B)
- [ ] (#4) Build the step-state engine for long division (`divide -> multiply -> subtract -> bring down`) that validates each step input, returns correctness state, provides hint text for mistakes, and detects problem completion [5 pts] (blocked by #3)
- [ ] (#5) Implement the interactive “work on paper” UI for step-by-step solving, wiring user inputs to the step engine with immediate feedback and smooth transition to the next problem [5 pts] (blocked by #4)
- [ ] (#6) Add progression logic to track solved counts for current session and lifetime totals, increase difficulty with player progress, and emit a reward trigger every 5 solved problems [5 pts] (blocked by #5)

## Dino Rewards Pipeline

- [x] (#7) Implement a server-side Gemini image generation service/route using `@google/generative-ai` with model `gemini-2.0-flash-exp`, reading `GEMINI_API_KEY` from `.env.local`, and generating Jurassic Park cinematic-style prompts based on dinosaur name [5 pts] (blocked by #1) (C)
- [ ] (#8) Create server filesystem persistence for generated images by saving files into the public directory with stable unique naming and returning the public image path for UI rendering [5 pts] (blocked by #7)
- [ ] (#9) Build reward orchestration that consumes every-5-solved triggers, chooses a dinosaur from the 100-item pool, calls Gemini generation, stores image path, and appends unlocked metadata (`name`, `image path`, `date earned`) to player state [5 pts] (blocked by #2, #6, #8)

## Save Files & Player Lifecycle

- [x] (#10) Implement File System Access API save/load support with explicit user permission prompts, `<player>-save.json` naming, JSON read/write, schema validation, and unsupported-browser fallback messaging [5 pts] (blocked by #1) (B)
- [ ] (#11) Build game-start flow to prompt for player name and present “Load existing save” vs “Start new game,” then initialize runtime state accordingly [5 pts] (blocked by #10)
- [ ] (#12) Integrate persistence with gameplay so progress, current difficulty, unlocked dinosaurs, and session history are saved/loaded consistently across sessions [5 pts] (blocked by #6, #9, #10, #11)

## Gallery & Theming

- [ ] (#13) Implement the Dino Gallery page/section to display all unlocked dinosaurs with image, dinosaur name, and earned date, including empty-state and live refresh after new unlocks [5 pts] (blocked by #12)
- [ ] (#14) Apply full dinosaur/Jurassic theming across the app (earthy/jungle palette, themed typography/headers, subtle dino motifs) and integrate playful success/error messages into gameplay feedback [5 pts] (blocked by #5, #13)

## Testing & Release Readiness

- [ ] (#15) Add automated tests for problem generation, step validation, progression/reward thresholds, dinosaur list integrity, save-file schema handling, plus an integration smoke test for solve->reward->gallery flow with mocked Gemini; include a concise developer QA/runbook for env and browser support checks [5 pts] (blocked by #12, #13, #14)

## Follow-up tasks (from sprint review)
- [x] (#16) Remove unused create-next-app boilerplate assets from `public/` (file.svg, globe.svg, next.svg, vercel.svg, window.svg) and replace default favicon.ico with a dino-themed one (blocked by #1) (A)
