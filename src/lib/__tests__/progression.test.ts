import { describe, it, expect } from "vitest";
import {
  computeTierForSolvedCount,
  shouldEmitReward,
  recordSolve,
  PROBLEMS_PER_TIER,
  REWARD_INTERVAL,
} from "../progression";
import { initNewGame } from "../game-state";

// ─── computeTierForSolvedCount ──────────────────────────────

describe("computeTierForSolvedCount", () => {
  it("returns tier 1 for 0 problems solved", () => {
    expect(computeTierForSolvedCount(0)).toBe(1);
  });

  it("returns tier 1 for 1–4 problems solved", () => {
    for (let i = 1; i < PROBLEMS_PER_TIER; i++) {
      expect(computeTierForSolvedCount(i)).toBe(1);
    }
  });

  it("returns tier 2 for exactly PROBLEMS_PER_TIER solved", () => {
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER)).toBe(2);
  });

  it("returns tier 3 for 2 × PROBLEMS_PER_TIER solved", () => {
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER * 2)).toBe(3);
  });

  it("returns tier 4 for 3 × PROBLEMS_PER_TIER solved", () => {
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER * 3)).toBe(4);
  });

  it("returns tier 5 for 4 × PROBLEMS_PER_TIER solved", () => {
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER * 4)).toBe(5);
  });

  it("caps at tier 5 for very high solve counts", () => {
    expect(computeTierForSolvedCount(100)).toBe(5);
    expect(computeTierForSolvedCount(1000)).toBe(5);
  });

  it("returns correct tier for boundary values (PROBLEMS_PER_TIER - 1)", () => {
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER - 1)).toBe(1);
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER * 2 - 1)).toBe(2);
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER * 3 - 1)).toBe(3);
    expect(computeTierForSolvedCount(PROBLEMS_PER_TIER * 4 - 1)).toBe(4);
  });
});

// ─── shouldEmitReward ───────────────────────────────────────

describe("shouldEmitReward", () => {
  it("returns false for 0 problems solved", () => {
    expect(shouldEmitReward(0)).toBe(false);
  });

  it("returns false for 1 problem solved", () => {
    expect(shouldEmitReward(1)).toBe(false);
  });

  it("returns true for exactly REWARD_INTERVAL solved", () => {
    expect(shouldEmitReward(REWARD_INTERVAL)).toBe(true);
  });

  it("returns true for multiples of REWARD_INTERVAL", () => {
    expect(shouldEmitReward(REWARD_INTERVAL * 2)).toBe(true);
    expect(shouldEmitReward(REWARD_INTERVAL * 3)).toBe(true);
    expect(shouldEmitReward(REWARD_INTERVAL * 10)).toBe(true);
  });

  it("returns false for non-multiples of REWARD_INTERVAL", () => {
    expect(shouldEmitReward(REWARD_INTERVAL + 1)).toBe(false);
    expect(shouldEmitReward(REWARD_INTERVAL - 1)).toBe(false);
    expect(shouldEmitReward(REWARD_INTERVAL * 2 + 3)).toBe(false);
  });
});

// ─── recordSolve ────────────────────────────────────────────

describe("recordSolve", () => {
  it("increments sessionProblemsSolved by 1", () => {
    const state = initNewGame("Rex");
    const { updatedState } = recordSolve(state);
    expect(updatedState.sessionProblemsSolved).toBe(1);
  });

  it("increments sessionProblemsAttempted by 1", () => {
    const state = initNewGame("Rex");
    const { updatedState } = recordSolve(state);
    expect(updatedState.sessionProblemsAttempted).toBe(1);
  });

  it("increments totalProblemsSolved by 1", () => {
    const state = initNewGame("Rex");
    const { updatedState } = recordSolve(state);
    expect(updatedState.playerSave.totalProblemsSolved).toBe(1);
  });

  it("does not mutate the original state", () => {
    const state = initNewGame("Rex");
    recordSolve(state);
    expect(state.sessionProblemsSolved).toBe(0);
    expect(state.playerSave.totalProblemsSolved).toBe(0);
  });

  it("preserves other state fields", () => {
    const state = initNewGame("Rex");
    const { updatedState } = recordSolve(state);
    expect(updatedState.phase).toBe("playing");
    expect(updatedState.playerSave.playerName).toBe("Rex");
    expect(updatedState.sessionStartDifficulty).toBe(1);
  });

  it("accumulates across multiple calls", () => {
    let state = initNewGame("Rex");
    for (let i = 0; i < 4; i++) {
      const { updatedState } = recordSolve(state);
      state = updatedState;
    }
    expect(state.sessionProblemsSolved).toBe(4);
    expect(state.playerSave.totalProblemsSolved).toBe(4);
  });

  // ── Difficulty progression ──────────────────────────────

  it("does not level up before PROBLEMS_PER_TIER solves", () => {
    let state = initNewGame("Rex");
    for (let i = 0; i < PROBLEMS_PER_TIER - 1; i++) {
      const result = recordSolve(state);
      expect(result.didLevelUp).toBe(false);
      state = result.updatedState;
    }
    expect(state.playerSave.currentDifficulty).toBe(1);
  });

  it("levels up to tier 2 on the PROBLEMS_PER_TIER-th solve", () => {
    let state = initNewGame("Rex");
    let lastResult;
    for (let i = 0; i < PROBLEMS_PER_TIER; i++) {
      lastResult = recordSolve(state);
      state = lastResult.updatedState;
    }
    expect(lastResult!.didLevelUp).toBe(true);
    expect(state.playerSave.currentDifficulty).toBe(2);
  });

  it("levels up through all tiers correctly", () => {
    let state = initNewGame("Rex");
    for (let tier = 1; tier <= 4; tier++) {
      for (let i = 0; i < PROBLEMS_PER_TIER; i++) {
        const { updatedState } = recordSolve(state);
        state = updatedState;
      }
      expect(state.playerSave.currentDifficulty).toBe(
        Math.min(tier + 1, 5) as 1 | 2 | 3 | 4 | 5,
      );
    }
  });

  it("stays at tier 5 after maxing out", () => {
    let state = initNewGame("Rex");
    // Solve enough to reach tier 5
    for (let i = 0; i < PROBLEMS_PER_TIER * 4; i++) {
      const { updatedState } = recordSolve(state);
      state = updatedState;
    }
    expect(state.playerSave.currentDifficulty).toBe(5);

    // Solve more — should stay at tier 5
    const result = recordSolve(state);
    expect(result.didLevelUp).toBe(false);
    expect(result.updatedState.playerSave.currentDifficulty).toBe(5);
  });

  // ── Reward trigger ──────────────────────────────────────

  it("does not trigger reward before REWARD_INTERVAL solves", () => {
    let state = initNewGame("Rex");
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      const result = recordSolve(state);
      expect(result.shouldReward).toBe(false);
      state = result.updatedState;
    }
  });

  it("triggers reward on the REWARD_INTERVAL-th solve", () => {
    let state = initNewGame("Rex");
    let lastResult;
    for (let i = 0; i < REWARD_INTERVAL; i++) {
      lastResult = recordSolve(state);
      state = lastResult.updatedState;
    }
    expect(lastResult!.shouldReward).toBe(true);
  });

  it("triggers reward at every REWARD_INTERVAL multiple", () => {
    let state = initNewGame("Rex");
    const rewardAt: number[] = [];
    for (let i = 1; i <= REWARD_INTERVAL * 3; i++) {
      const result = recordSolve(state);
      if (result.shouldReward) {
        rewardAt.push(i);
      }
      state = result.updatedState;
    }
    expect(rewardAt).toEqual([
      REWARD_INTERVAL,
      REWARD_INTERVAL * 2,
      REWARD_INTERVAL * 3,
    ]);
  });

  it("triggers reward when continuing from an existing save", () => {
    // Player has 4 solved — next solve should be #5 → reward
    const state = initNewGame("Rex");
    const current = {
      ...state,
      playerSave: {
        ...state.playerSave,
        totalProblemsSolved: REWARD_INTERVAL - 1,
      },
    };
    const result = recordSolve(current);
    expect(result.shouldReward).toBe(true);
    expect(result.updatedState.playerSave.totalProblemsSolved).toBe(
      REWARD_INTERVAL,
    );
  });

  // ── Combined level-up + reward scenario ─────────────────

  it("can trigger both level-up and reward on the same solve", () => {
    // Both happen at PROBLEMS_PER_TIER boundaries which equals REWARD_INTERVAL
    let state = initNewGame("Rex");
    for (let i = 0; i < PROBLEMS_PER_TIER - 1; i++) {
      const { updatedState } = recordSolve(state);
      state = updatedState;
    }
    const result = recordSolve(state);
    // PROBLEMS_PER_TIER === REWARD_INTERVAL === 5, so both fire
    expect(result.didLevelUp).toBe(true);
    expect(result.shouldReward).toBe(true);
  });
});
