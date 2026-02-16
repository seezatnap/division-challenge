/**
 * Integration smoke test: solve → reward → gallery → persist
 *
 * Exercises the complete gameplay loop end-to-end:
 *   1. Start a new game
 *   2. Generate a problem and solve it step-by-step via the step engine
 *   3. Record each solve via the progression system
 *   4. After 5 solves, verify reward triggers with mocked Gemini
 *   5. Verify the unlocked dinosaur appears in gallery-ready data
 *   6. Verify the save file is valid against the schema
 *   7. Verify session history records difficulty transitions
 *   8. Continue solving to trigger a second reward at 10 solves
 */

import { describe, it, expect, vi } from "vitest";
import { initNewGame } from "@/lib/game-state";
import type { GameState } from "@/lib/game-state";
import { generateProblem } from "@/lib/generate-problem";
import {
  createStepEngine,
  submitAnswer,
  getProgress,
} from "@/lib/step-engine";
import {
  recordSolve,
  REWARD_INTERVAL,
} from "@/lib/progression";
import { persistAfterSolve } from "@/lib/persistence";
import { processReward } from "@/lib/reward-orchestrator";
import { validatePlayerSave } from "@/lib/validate-save";
import { DINOSAURS, DINOSAUR_COUNT } from "@/data/dinosaurs";
import { formatEarnedDate } from "@/components/DinoGallery";
import type { DifficultyTier, UnlockedDinosaur } from "@/types";

// ─── Constants ─────────────────────────────────────────────

const NOW = "2026-02-16T12:00:00.000Z";
const SESSION_START = "2026-02-16T11:00:00.000Z";

// ─── Mocked Gemini fetch ───────────────────────────────────

/** Simulates a successful POST /api/generate-dino response. */
function makeMockFetch(imagePath: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        imagePath,
        base64Data: "AAAA",
        mimeType: "image/png",
      }),
  });
}

// ─── Helpers ───────────────────────────────────────────────

/**
 * Solve a problem completely via the step engine by submitting the correct
 * answer for every step. Returns the completed engine state.
 */
function solveCompletely(problem: ReturnType<typeof generateProblem>) {
  const engine = createStepEngine(problem);

  while (!getProgress(engine).isComplete) {
    const step = engine.steps[engine.currentStepIndex];
    const result = submitAnswer(engine, step.expected);
    expect(result).not.toBeNull();
    expect(result!.correct).toBe(true);
  }

  expect(engine.completed).toBe(true);
  return engine;
}

// ─── Integration Tests ─────────────────────────────────────

describe("Integration smoke test: solve → reward → gallery → persist", () => {
  it("complete flow: new game, solve 5 problems, reward triggers, dino unlocked, save valid", async () => {
    // ── 1. Start a new game ──
    let state: GameState = initNewGame("Dr. Grant", SESSION_START);
    expect(state.playerSave.totalProblemsSolved).toBe(0);
    expect(state.playerSave.currentDifficulty).toBe(1);
    expect(state.playerSave.unlockedDinosaurs).toHaveLength(0);

    let isFirstSave = true;

    // ── 2. Solve problems 1–4 (no reward yet) ──
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      const problem = generateProblem(state.playerSave.currentDifficulty);
      solveCompletely(problem);

      const { updatedState, shouldReward } = recordSolve(state);
      expect(shouldReward).toBe(false);

      // Persist without reward
      const persistResult = await persistAfterSolve(
        updatedState,
        shouldReward,
        isFirstSave,
        {
          saveFn: vi.fn().mockResolvedValue({ ok: true }),
          now: NOW,
          supportedFn: () => true,
        },
      );

      expect(persistResult.rewardResult).toBeUndefined();
      state = persistResult.updatedState;
      isFirstSave = false;
    }

    expect(state.playerSave.totalProblemsSolved).toBe(REWARD_INTERVAL - 1);

    // ── 3. Solve 5th problem — reward should trigger ──
    const fifthProblem = generateProblem(state.playerSave.currentDifficulty);
    solveCompletely(fifthProblem);

    const { updatedState: stateAfter5, shouldReward, didLevelUp } =
      recordSolve(state);
    expect(shouldReward).toBe(true);
    expect(stateAfter5.playerSave.totalProblemsSolved).toBe(REWARD_INTERVAL);

    // Since PROBLEMS_PER_TIER === REWARD_INTERVAL === 5, first reward + level-up coincide
    expect(didLevelUp).toBe(true);
    expect(stateAfter5.playerSave.currentDifficulty).toBe(2);

    // ── 4. Process reward with mocked Gemini ──
    const mockFetch = makeMockFetch("/dinos/velociraptor-abc12345.png");
    const rewardResult = await processReward(stateAfter5.playerSave, mockFetch);

    expect(rewardResult.status).toBe("success");
    if (rewardResult.status !== "success") throw new Error("Expected success");

    // Verify Gemini API was called correctly
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/generate-dino");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body.dinoName).toBeDefined();
    expect(typeof body.dinoName).toBe("string");
    // The chosen dino must be from the canonical list
    expect(DINOSAURS).toContain(body.dinoName);

    // ── 5. Verify unlocked dino metadata ──
    const unlocked = rewardResult.unlocked;
    expect(unlocked.name).toBeDefined();
    expect(unlocked.imagePath).toBe("/dinos/velociraptor-abc12345.png");
    expect(unlocked.dateEarned).toBeDefined();

    // Verify the updated save has the dino
    expect(rewardResult.updatedSave.unlockedDinosaurs).toHaveLength(1);
    expect(rewardResult.updatedSave.unlockedDinosaurs[0]).toBe(unlocked);

    // ── 6. Persist with reward via persistAfterSolve ──
    const mockRewardFn = vi.fn().mockResolvedValue(rewardResult);
    const persistResult = await persistAfterSolve(
      stateAfter5,
      true,
      isFirstSave,
      {
        saveFn: vi.fn().mockResolvedValue({ ok: true }),
        rewardFn: mockRewardFn,
        now: NOW,
        supportedFn: () => true,
      },
    );

    state = persistResult.updatedState;

    // ── 7. Validate save file schema ──
    const validation = validatePlayerSave(state.playerSave);
    expect(validation.valid).toBe(true);

    // ── 8. Verify gallery-ready data ──
    const dinos = state.playerSave.unlockedDinosaurs;
    expect(dinos).toHaveLength(1);
    expect(dinos[0].name).toBeDefined();
    expect(dinos[0].imagePath).toMatch(/^\/dinos\//);
    expect(formatEarnedDate(dinos[0].dateEarned)).toBeDefined();
    // Date should format to a human-readable string, not return the raw ISO string
    expect(formatEarnedDate(dinos[0].dateEarned)).not.toBe("");

    // ── 9. Verify session history ──
    const history = state.playerSave.sessionHistory;
    expect(history).toHaveLength(1);
    expect(history[0].problemsSolved).toBe(REWARD_INTERVAL);
    expect(history[0].startDifficulty).toBe(1);
    expect(history[0].endDifficulty).toBe(2); // leveled up from tier 1→2

    // ── 10. Verify player identity preserved ──
    expect(state.playerSave.playerName).toBe("Dr. Grant");
    expect(state.playerSave.version).toBe(1);
  });

  it("second reward triggers at 10 solves with accumulated dinosaurs", async () => {
    let state: GameState = initNewGame("Rex", SESSION_START);
    let isFirstSave = true;

    const firstDino: UnlockedDinosaur = {
      name: "Tyrannosaurus Rex",
      imagePath: "/dinos/tyrannosaurus-rex-abc.png",
      dateEarned: NOW,
    };
    const secondDino: UnlockedDinosaur = {
      name: "Velociraptor",
      imagePath: "/dinos/velociraptor-def.png",
      dateEarned: NOW,
    };

    // Solve 10 problems, collecting rewards at 5 and 10
    for (let i = 1; i <= REWARD_INTERVAL * 2; i++) {
      const problem = generateProblem(state.playerSave.currentDifficulty);
      solveCompletely(problem);

      const { updatedState, shouldReward } = recordSolve(state);

      const currentDino = i === REWARD_INTERVAL ? firstDino : secondDino;
      const mockRewardFn = vi.fn().mockImplementation((save) => {
        return Promise.resolve({
          status: "success",
          unlocked: currentDino,
          updatedSave: {
            ...save,
            unlockedDinosaurs: [...save.unlockedDinosaurs, currentDino],
          },
        });
      });

      const persistResult = await persistAfterSolve(
        updatedState,
        shouldReward,
        isFirstSave,
        {
          saveFn: vi.fn().mockResolvedValue({ ok: true }),
          rewardFn: mockRewardFn,
          now: NOW,
          supportedFn: () => true,
        },
      );

      if (i === REWARD_INTERVAL) {
        expect(shouldReward).toBe(true);
        expect(persistResult.rewardResult?.status).toBe("success");
      }

      if (i === REWARD_INTERVAL * 2) {
        expect(shouldReward).toBe(true);
        expect(persistResult.rewardResult?.status).toBe("success");
      }

      state = persistResult.updatedState;
      isFirstSave = false;
    }

    // After 10 solves: 2 dinosaurs unlocked
    expect(state.playerSave.unlockedDinosaurs).toHaveLength(2);
    expect(state.playerSave.totalProblemsSolved).toBe(REWARD_INTERVAL * 2);

    // Validate the complete save
    const validation = validatePlayerSave(state.playerSave);
    expect(validation.valid).toBe(true);
  });

  it("step engine correctly solves generated problems across all tiers", () => {
    // Verify that generated problems at every tier can be fully solved
    // and yield the correct quotient/remainder
    const tiers: DifficultyTier[] = [1, 2, 3, 4, 5];

    for (const tier of tiers) {
      const problem = generateProblem(tier);
      const engine = createStepEngine(problem);

      // Walk through every step with the correct answer
      let stepsCompleted = 0;
      while (!getProgress(engine).isComplete) {
        const step = engine.steps[engine.currentStepIndex];
        const result = submitAnswer(engine, step.expected);
        expect(result!.correct).toBe(true);
        stepsCompleted++;
      }

      expect(stepsCompleted).toBeGreaterThan(0);
      expect(engine.completed).toBe(true);

      // Verify mathematical correctness
      expect(problem.quotient).toBe(Math.floor(problem.dividend / problem.divisor));
      expect(problem.remainder).toBe(problem.dividend % problem.divisor);
    }
  });

  it("reward flow handles Gemini error gracefully without breaking progression", async () => {
    let state: GameState = initNewGame("Rex", SESSION_START);

    // Solve to trigger reward
    for (let i = 0; i < REWARD_INTERVAL; i++) {
      const { updatedState } = recordSolve(state);
      state = updatedState;
    }

    // Mock Gemini failure
    const mockRewardFn = vi.fn().mockResolvedValue({
      status: "error",
      message: "Gemini API rate limit exceeded",
    });

    const persistResult = await persistAfterSolve(state, true, true, {
      saveFn: vi.fn().mockResolvedValue({ ok: true }),
      rewardFn: mockRewardFn,
      now: NOW,
      supportedFn: () => true,
    });

    // Reward failed but game continues
    expect(persistResult.rewardResult?.status).toBe("error");
    expect(persistResult.updatedState.playerSave.unlockedDinosaurs).toHaveLength(0);
    expect(persistResult.saved).toBe(true);

    // Save is still valid
    const validation = validatePlayerSave(persistResult.updatedState.playerSave);
    expect(validation.valid).toBe(true);

    // Player can continue solving
    state = persistResult.updatedState;
    const { updatedState: stateAfter6 } = recordSolve(state);
    expect(stateAfter6.playerSave.totalProblemsSolved).toBe(REWARD_INTERVAL + 1);
  });

  it("save file schema roundtrip: persisted state validates correctly", async () => {
    let state: GameState = initNewGame("Ian Malcolm", SESSION_START);

    // Solve 5 problems
    for (let i = 0; i < REWARD_INTERVAL; i++) {
      state = recordSolve(state).updatedState;
    }

    // Persist with a reward
    const mockRewardFn = vi.fn().mockImplementation((save) =>
      Promise.resolve({
        status: "success",
        unlocked: {
          name: "Triceratops",
          imagePath: "/dinos/triceratops-xyz.png",
          dateEarned: NOW,
        },
        updatedSave: {
          ...save,
          unlockedDinosaurs: [
            ...save.unlockedDinosaurs,
            {
              name: "Triceratops",
              imagePath: "/dinos/triceratops-xyz.png",
              dateEarned: NOW,
            },
          ],
        },
      }),
    );

    const persistResult = await persistAfterSolve(state, true, true, {
      saveFn: vi.fn().mockResolvedValue({ ok: true }),
      rewardFn: mockRewardFn,
      now: NOW,
      supportedFn: () => true,
    });

    const save = persistResult.updatedState.playerSave;

    // Simulate JSON roundtrip (as if written to file and read back)
    const json = JSON.stringify(save);
    const parsed = JSON.parse(json);
    const validation = validatePlayerSave(parsed);

    expect(validation.valid).toBe(true);
    if (!validation.valid) throw new Error(validation.errors.join(", "));

    // Verify all fields survived the roundtrip
    expect(validation.data.playerName).toBe("Ian Malcolm");
    expect(validation.data.totalProblemsSolved).toBe(REWARD_INTERVAL);
    expect(validation.data.currentDifficulty).toBe(2);
    expect(validation.data.unlockedDinosaurs).toHaveLength(1);
    expect(validation.data.unlockedDinosaurs[0].name).toBe("Triceratops");
    expect(validation.data.unlockedDinosaurs[0].imagePath).toBe("/dinos/triceratops-xyz.png");
    expect(validation.data.sessionHistory).toHaveLength(1);
  });

  it("processReward with mocked fetch selects from canonical dino list and produces valid metadata", async () => {
    const save = initNewGame("Rex").playerSave;

    const mockFetch = makeMockFetch("/dinos/test-dino-hash.png");
    const result = await processReward(save, mockFetch);

    expect(result.status).toBe("success");
    if (result.status !== "success") throw new Error("Expected success");

    // Dino must be from the canonical 100-item list
    expect(DINOSAURS).toContain(result.unlocked.name);
    expect(result.unlocked.imagePath).toBe("/dinos/test-dino-hash.png");
    expect(result.unlocked.dateEarned).toBeDefined();

    // Updated save must be schema-valid
    const validation = validatePlayerSave(result.updatedSave);
    expect(validation.valid).toBe(true);
  });

  it("dinosaur list integrity: 100 unique entries, all non-empty strings", () => {
    expect(DINOSAURS).toHaveLength(DINOSAUR_COUNT);
    expect(DINOSAUR_COUNT).toBe(100);

    const names = new Set(DINOSAURS);
    expect(names.size).toBe(100); // no duplicates

    for (const name of DINOSAURS) {
      expect(typeof name).toBe("string");
      expect(name.trim().length).toBeGreaterThan(0);
    }

    // Key franchise headliners present
    const headliners = [
      "Tyrannosaurus Rex",
      "Velociraptor",
      "Triceratops",
      "Brachiosaurus",
      "Indominus Rex",
      "Indoraptor",
      "Giganotosaurus",
    ];
    for (const h of headliners) {
      expect(DINOSAURS).toContain(h);
    }
  });

  it("progression thresholds: tier advances every 5 solves, reward every 5", () => {
    let state: GameState = initNewGame("Rex");
    const rewards: number[] = [];
    const levelUps: Array<{ at: number; from: DifficultyTier; to: DifficultyTier }> = [];

    for (let i = 1; i <= 25; i++) {
      const prevTier = state.playerSave.currentDifficulty;
      const { updatedState, shouldReward, didLevelUp } = recordSolve(state);

      if (shouldReward) rewards.push(i);
      if (didLevelUp) {
        levelUps.push({ at: i, from: prevTier, to: updatedState.playerSave.currentDifficulty });
      }

      state = updatedState;
    }

    // Rewards fire at every multiple of REWARD_INTERVAL
    expect(rewards).toEqual([5, 10, 15, 20, 25]);

    // Level-ups happen at tier boundaries
    expect(levelUps).toEqual([
      { at: 5, from: 1, to: 2 },
      { at: 10, from: 2, to: 3 },
      { at: 15, from: 3, to: 4 },
      { at: 20, from: 4, to: 5 },
      // No level-up at 25 because MAX_TIER is 5
    ]);

    expect(state.playerSave.currentDifficulty).toBe(5);
    expect(state.playerSave.totalProblemsSolved).toBe(25);
  });

  it("File System Access API unsupported: game persists in-memory only", async () => {
    let state: GameState = initNewGame("Rex", SESSION_START);

    // Solve 5 problems
    for (let i = 0; i < REWARD_INTERVAL; i++) {
      state = recordSolve(state).updatedState;
    }

    const mockSaveFn = vi.fn();
    const persistResult = await persistAfterSolve(state, false, true, {
      saveFn: mockSaveFn,
      now: NOW,
      supportedFn: () => false, // Browser doesn't support FS API
    });

    // Save was not attempted
    expect(mockSaveFn).not.toHaveBeenCalled();
    expect(persistResult.saved).toBe(false);
    expect(persistResult.saveError).toBeUndefined();

    // But in-memory state is fully updated
    expect(persistResult.updatedState.playerSave.sessionHistory).toHaveLength(1);
    expect(persistResult.updatedState.playerSave.totalProblemsSolved).toBe(REWARD_INTERVAL);

    // State is still schema-valid
    const validation = validatePlayerSave(persistResult.updatedState.playerSave);
    expect(validation.valid).toBe(true);
  });
});
