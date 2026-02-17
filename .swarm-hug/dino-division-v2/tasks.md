# Tasks

## Foundation & Architecture

- [A] (#1) Initialize the Next.js App Router + TypeScript + Tailwind baseline and set up feature folders for division engine, workspace UI, rewards, gallery, and persistence to support v2 architecture [5 pts]
- [ ] (#2) Define shared TypeScript models/state contracts for problems, long-division steps, active input targets, player progress (session + lifetime), unlocked rewards, and save-file schema [5 pts] (blocked by #1)
- [ ] (#3) Create a constants/data module with the full static list of 100 dinosaurs (including the JP/JW/Chaos Theory priority set) and selection utilities for deterministic unlock order [5 pts] (blocked by #1)
- [ ] (#4) Implement environment/config wiring for `GEMINI_API_KEY` and a reusable Jurassic Park cinematic prompt builder for `gemini-2.0-flash-exp` requests [5 pts] (blocked by #1)

## Division Logic & Game State

- [ ] (#5) Build a problem generator that scales from 2-digit ÷ 1-digit up to 4–5 digit ÷ 2–3 digit and supports both remainder and non-remainder cases [5 pts] (blocked by #2)
- [ ] (#6) Implement difficulty progression rules driven by cumulative solved counts (lifetime-aware) and expose current difficulty level to problem generation [5 pts] (blocked by #2)
- [ ] (#7) Implement a pure long-division solver that emits the exact ordered workflow (quotient digit, multiply, subtract, bring-down) with expected values for each step [5 pts] (blocked by #2, #5)
- [ ] (#8) Build step-validation/retry logic so correct answers advance immediately, incorrect answers keep focus on the same step, and hint hooks are returned for dino-themed feedback [5 pts] (blocked by #7)
- [ ] (#9) Implement game-loop state orchestration for starting/completing problems, updating session/lifetime counters, and chaining to the next problem without form-submit flows [5 pts] (blocked by #5, #6, #8)

## Visual Workspace UI

- [ ] (#10) Build the bus-stop long-division renderer with divisor left of bracket, dividend inside, quotient above, and dynamic work rows below (paper-like notation, not forms) [5 pts] (blocked by #2, #7)
- [ ] (#11) Implement inline entry elements embedded in the workspace (styled to blend into notation) and remove any standalone form field/dropdown interaction model [5 pts] (blocked by #10)
- [ ] (#12) Implement a single-active-cell glow manager (amber/gold pulse) that ensures exactly one target is highlighted at any time according to solver order [5 pts] (blocked by #7, #11)
- [ ] (#13) Wire real-time typing so values appear as typed, lock in with micro-animation on correct entry, and auto-advance glow to the next target [5 pts] (blocked by #8, #12)
- [ ] (#14) Implement the bring-down animation that visibly slides the next dividend digit into the working number and synchronizes state transitions [5 pts] (blocked by #10, #12)
- [ ] (#15) Implement dino-themed feedback messaging for success/failure states (e.g., encouragement + playful retry hints) tied to validation outcomes [5 pts] (blocked by #13)

## Reward Pipeline (Gemini + Prefetch)

- [ ] (#16) Build server-side Gemini image generation endpoints/services using `@google/generative-ai` and `gemini-2.0-flash-exp`, including robust response parsing and error handling [5 pts] (blocked by #4)
- [ ] (#17) Implement filesystem image caching/existence checks so dinosaur art generation is skipped when the asset already exists (no duplicate generation) [5 pts] (blocked by #16)
- [ ] (#18) Implement reward milestone logic (every 5 solved) with deterministic dinosaur assignment and safeguards for milestone ordering/retry issues observed in v1 [5 pts] (blocked by #3, #9, #17)
- [ ] (#19) Implement near-milestone prefetch triggers (problem 3/4 of each set of 5) that check cache first and start background generation only when needed [5 pts] (blocked by #17, #18)
- [ ] (#20) Implement earned-reward loading UX with egg-hatching animation, status polling for in-flight generation, and automatic reveal once image is ready [5 pts] (blocked by #18, #19)

## Gallery & Player Flow

- [ ] (#21) Build the Dino Gallery view/section showing unlocked dinosaur image, name, and date earned, with empty-state messaging for new players and live refresh after unlocks [5 pts] (blocked by #3, #20)
- [ ] (#22) Build the game-start flow that prompts for player name and offers “load existing save” vs “start new,” then initializes the in-memory game session [5 pts] (blocked by #2)

## Save/Load Persistence

- [ ] (#23) Implement File System Access API save/load flows with permission prompts, player-named JSON files (e.g., `rex-save.json`), and full required payload fields [5 pts] (blocked by #2, #22)
- [ ] (#24) Implement graceful fallback for environments without File System Access API (JSON export/import flow) while preserving identical schema and validation [5 pts] (blocked by #23)
- [ ] (#25) Add persistence concurrency controls (queued/atomic writes + merge strategy) to prevent save races during rapid solves and reward unlock events [5 pts] (blocked by #20, #23)

## Theming & Motion

- [ ] (#26) Apply Jurassic-themed visual design system (earth/jungle palette, themed typography, motif overlays) across game, gallery, and save/load UI with responsive mobile/desktop layouts [5 pts] (blocked by #1)
- [ ] (#27) Polish motion system (glow cadence, row transitions, lock-in pulses, hatch/reveal states) so the workspace feels dynamic/live rather than form-based [5 pts] (blocked by #13, #14, #20, #26)

## Testing & Release Readiness

- [ ] (#28) Add unit tests for problem generation tiers, remainder handling, progression rules, solver step sequencing, and validation/retry behavior [5 pts] (blocked by #5, #6, #7, #8)
- [ ] (#29) Add UI integration tests for in-place typing, single-glow enforcement, correct/incorrect step transitions, and bring-down animation state progression [5 pts] (blocked by #13, #14, #15)
- [ ] (#30) Add reward pipeline tests for milestone triggering, deterministic dinosaur selection, prefetch behavior, dedupe checks, and in-flight polling/reveal [5 pts] (blocked by #18, #19, #20)
- [ ] (#31) Add persistence tests covering FS API permissions, save/load schema integrity, fallback import/export, and save-race protection logic [5 pts] (blocked by #23, #24, #25)
- [ ] (#32) Run end-to-end smoke tests for full player journey (new game, solve loop, reward unlock, gallery refresh, save/load restore) and capture regressions against v1 known issues [5 pts] (blocked by #21, #27, #30, #31)
- [ ] (#33) Write developer runbook/README updates for setup, `GEMINI_API_KEY`, file storage behavior, fallback behavior, and test execution workflow [5 pts] (blocked by #32)
