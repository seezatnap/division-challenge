# Tasks

## Foundation & Architecture

- [x] (#1) Initialize the Next.js App Router + TypeScript + Tailwind baseline and set up feature folders for division engine, workspace UI, rewards, gallery, and persistence to support v2 architecture [5 pts] (A)
- [x] (#2) Define shared TypeScript models/state contracts for problems, long-division steps, active input targets, player progress (session + lifetime), unlocked rewards, and save-file schema [5 pts] (blocked by #1) (A)
- [x] (#3) Create a constants/data module with the full static list of 100 dinosaurs (including the JP/JW/Chaos Theory priority set) and selection utilities for deterministic unlock order [5 pts] (blocked by #1) (A)
- [x] (#4) Implement environment/config wiring for `GEMINI_API_KEY` and a reusable Jurassic Park cinematic prompt builder for `gemini-2.0-flash-exp` requests [5 pts] (blocked by #1) (B)

## Division Logic & Game State

- [x] (#5) Build a problem generator that scales from 2-digit ÷ 1-digit up to 4–5 digit ÷ 2–3 digit and supports both remainder and non-remainder cases [5 pts] (blocked by #2) (A)
- [x] (#6) Implement difficulty progression rules driven by cumulative solved counts (lifetime-aware) and expose current difficulty level to problem generation [5 pts] (blocked by #2) (A)
- [x] (#7) Implement a pure long-division solver that emits the exact ordered workflow (quotient digit, multiply, subtract, bring-down) with expected values for each step [5 pts] (blocked by #2, #5) (A)
- [x] (#8) Build step-validation/retry logic so correct answers advance immediately, incorrect answers keep focus on the same step, and hint hooks are returned for dino-themed feedback [5 pts] (blocked by #7) (A)
- [x] (#9) Implement game-loop state orchestration for starting/completing problems, updating session/lifetime counters, and chaining to the next problem without form-submit flows [5 pts] (blocked by #5, #6, #8) (A)

## Visual Workspace UI

- [x] (#10) Build the bus-stop long-division renderer with divisor left of bracket, dividend inside, quotient above, and dynamic work rows below (paper-like notation, not forms) [5 pts] (blocked by #2, #7) (A)
- [x] (#11) Implement inline entry elements embedded in the workspace (styled to blend into notation) and remove any standalone form field/dropdown interaction model [5 pts] (blocked by #10) (B)
- [x] (#12) Implement a single-active-cell glow manager (amber/gold pulse) that ensures exactly one target is highlighted at any time according to solver order [5 pts] (blocked by #7, #11) (A)
- [x] (#13) Wire real-time typing so values appear as typed, lock in with micro-animation on correct entry, and auto-advance glow to the next target [5 pts] (blocked by #8, #12) (A)
- [x] (#14) Implement the bring-down animation that visibly slides the next dividend digit into the working number and synchronizes state transitions [5 pts] (blocked by #10, #12) (A)
- [x] (#15) Implement dino-themed feedback messaging for success/failure states (e.g., encouragement + playful retry hints) tied to validation outcomes [5 pts] (blocked by #13) (A)

## Reward Pipeline (Gemini + Prefetch)

- [x] (#16) Build server-side Gemini image generation endpoints/services using `@google/generative-ai` and `gemini-2.0-flash-exp`, including robust response parsing and error handling [5 pts] (blocked by #4) (B)
- [x] (#17) Implement filesystem image caching/existence checks so dinosaur art generation is skipped when the asset already exists (no duplicate generation) [5 pts] (blocked by #16) (B)
- [x] (#18) Implement reward milestone logic (every 5 solved) with deterministic dinosaur assignment and safeguards for milestone ordering/retry issues observed in v1 [5 pts] (blocked by #3, #9, #17) (A)
- [x] (#19) Implement near-milestone prefetch triggers (problem 3/4 of each set of 5) that check cache first and start background generation only when needed [5 pts] (blocked by #17, #18) (B)
- [x] (#20) Implement earned-reward loading UX with egg-hatching animation, status polling for in-flight generation, and automatic reveal once image is ready [5 pts] (blocked by #18, #19) (A)

## Gallery & Player Flow

- [x] (#21) Build the Dino Gallery view/section showing unlocked dinosaur image, name, and date earned, with empty-state messaging for new players and live refresh after unlocks [5 pts] (blocked by #3, #20) (C)
- [x] (#22) Build the game-start flow that prompts for player name and offers “load existing save” vs “start new,” then initializes the in-memory game session [5 pts] (blocked by #2) (B)

## Save/Load Persistence

- [x] (#23) Implement File System Access API save/load flows with permission prompts, player-named JSON files (e.g., `rex-save.json`), and full required payload fields [5 pts] (blocked by #2, #22) (B)
- [x] (#24) Implement graceful fallback for environments without File System Access API (JSON export/import flow) while preserving identical schema and validation [5 pts] (blocked by #23) (B)
- [x] (#25) Add persistence concurrency controls (queued/atomic writes + merge strategy) to prevent save races during rapid solves and reward unlock events [5 pts] (blocked by #20, #23) (C)

## Theming & Motion

- [x] (#26) Apply Jurassic-themed visual design system (earth/jungle palette, themed typography, motif overlays) across game, gallery, and save/load UI with responsive mobile/desktop layouts [5 pts] (blocked by #1) (B)
- [x] (#27) Polish motion system (glow cadence, row transitions, lock-in pulses, hatch/reveal states) so the workspace feels dynamic/live rather than form-based [5 pts] (blocked by #13, #14, #20, #26) (A)

## Testing & Release Readiness

- [x] (#28) Add unit tests for problem generation tiers, remainder handling, progression rules, solver step sequencing, and validation/retry behavior [5 pts] (blocked by #5, #6, #7, #8) (A)
- [x] (#29) Add UI integration tests for in-place typing, single-glow enforcement, correct/incorrect step transitions, and bring-down animation state progression [5 pts] (blocked by #13, #14, #15) (A)
- [x] (#30) Add reward pipeline tests for milestone triggering, deterministic dinosaur selection, prefetch behavior, dedupe checks, and in-flight polling/reveal [5 pts] (blocked by #18, #19, #20) (B)
- [x] (#31) Add persistence tests covering FS API permissions, save/load schema integrity, fallback import/export, and save-race protection logic [5 pts] (blocked by #23, #24, #25) (A)
- [x] (#32) Run end-to-end smoke tests for full player journey (new game, solve loop, reward unlock, gallery refresh, save/load restore) and capture regressions against v1 known issues [5 pts] (blocked by #21, #27, #30, #31) (A)
- [A] (#33) Write developer runbook/README updates for setup, `GEMINI_API_KEY`, file storage behavior, fallback behavior, and test execution workflow [5 pts] (blocked by #32)

## Follow-up tasks (from sprint review)
- [x] (#34) Migrate the rewards image generation integration off deprecated `@google/generative-ai` to the supported Google Gen AI SDK, and update parsing/error handling for the new client response shape. (blocked by #16) (C)
- [x] (#35) Add API route tests for `POST /api/rewards/generate-image` covering invalid JSON input, known service-error mapping, and success response shape. (blocked by #16) (C)

## Follow-up tasks (from sprint review)
- [x] (#36) Prevent concurrent duplicate Gemini generations for the same dinosaur by adding per-dinosaur in-flight deduping in `resolveGeminiRewardImageWithFilesystemCache`, and add a parallel-request regression test that asserts the generator runs only once. (B)

## Follow-up tasks (from sprint review)
- [x] (#37) Update `resolveRewardMilestones` to discard any pre-existing rewards beyond `highestEarnedRewardNumber` (based on `totalProblemsSolved`) and add regression tests for states where solved count is lower than the unlocked reward prefix. (B)

## Follow-up tasks (from sprint review)
- [x] (#38) Wrap the fire-and-forget `triggerNearMilestoneRewardPrefetch` call in `startNextProblemFromState` with rejection handling so prefetch failures cannot surface as unhandled promise rejections. (B)
- [x] (#39) Update `triggerNearMilestoneRewardPrefetch` to map `"already-cached"` results from `prefetchGeminiRewardImageWithFilesystemCache` to `"skipped-already-cached"` (instead of `"prefetch-already-in-flight"`), and add a regression test for that race path. (B)

## Follow-up tasks (from sprint review)
- [x] (#40) Replace the hardcoded `https://dino-division.local` URL in `fetchEarnedRewardImageStatus` with same-origin handling for relative endpoints, and add a regression test that verifies the default `/api/rewards/image-status` request stays on the current origin. (B)
- [x] (#41) Make `EarnedRewardRevealPanel` reset its internal reveal state when `dinosaurName`, `initialStatus`, or `initialImagePath` changes so new rewards don’t reuse stale phase/image data, and add a prop-change regression test. (B)

## Follow-up tasks (from sprint review)
- [x] (#42) Fix persistence merge behavior so `saveSessionToFileSystem` does not overwrite a new active session’s `progress.session` with older higher-solved stats when session IDs differ, and add a regression test for save-after-load (new session) payload correctness. (blocked by #25) (A)

## Follow-up tasks (from sprint review)
- [A] (#43) Make `tests/player-journey-smoke.test.mjs` deterministic by replacing the fixed 20-turn `setImmediate` wait with explicit synchronization on near-milestone prefetch completion before asserting `prefetchStatuses` (the smoke test intermittently fails with `prefetchStatuses` still empty). (blocked by #32)
