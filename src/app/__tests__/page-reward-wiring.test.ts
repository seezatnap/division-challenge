import { describe, it, expect, vi, beforeEach } from "vitest";
import { initNewGame } from "@/lib/game-state";
import { recordSolve, REWARD_INTERVAL } from "@/lib/progression";
import { persistAfterSolve } from "@/lib/persistence";
import type { GameState } from "@/lib/game-state";
import type { RewardResult } from "@/lib/reward-orchestrator";
import type { UnlockedDinosaur } from "@/types";

/**
 * Tests verifying that the page-level reward wiring correctly surfaces
 * unlocked dinosaur metadata (name, image, date) from processReward
 * through persistAfterSolve, mirroring the data flow in page.tsx's
 * handleProblemComplete callback.
 *
 * These tests validate the full solve → reward → persist pipeline that
 * page.tsx orchestrates, without requiring a DOM environment.
 */

// ─── Helpers ────────────────────────────────────────────────

const NOW = "2026-02-16T12:00:00.000Z";

const MOCK_UNLOCKED_DINO: UnlockedDinosaur = {
  name: "Velociraptor",
  imagePath: "/dinos/velociraptor-abc12345.png",
  dateEarned: NOW,
};

function makeSuccessReward(
  save: GameState["playerSave"],
  dino: UnlockedDinosaur = MOCK_UNLOCKED_DINO,
): RewardResult {
  return {
    status: "success",
    unlocked: dino,
    updatedSave: {
      ...save,
      unlockedDinosaurs: [...save.unlockedDinosaurs, dino],
    },
  };
}

/**
 * Simulate the solve loop from page.tsx's handleProblemComplete:
 *   1. Call recordSolve (updates counts, detects reward trigger)
 *   2. Call persistAfterSolve (processes reward, persists)
 *   3. Extract reward data for UI (mimics what page.tsx does with state)
 */
async function simulateHandleProblemComplete(
  state: GameState,
  isFirstSave: boolean,
  rewardFn: (...args: unknown[]) => Promise<RewardResult>,
) {
  const { updatedState, didLevelUp, shouldReward } = recordSolve(state);

  const result = await persistAfterSolve(updatedState, shouldReward, isFirstSave, {
    saveFn: vi.fn().mockResolvedValue({ ok: true }),
    rewardFn: rewardFn as typeof import("@/lib/reward-orchestrator").processReward,
    now: NOW,
    supportedFn: () => true,
  });

  // Mirror page.tsx logic for extracting reward data
  let rewardDino: UnlockedDinosaur | null = null;
  let rewardError: string | null = null;

  if (result.rewardResult?.status === "success") {
    rewardDino = result.rewardResult.unlocked;
    rewardError = null;
  } else if (result.rewardResult?.status === "error") {
    rewardError = result.rewardResult.message;
  }

  return {
    updatedState: result.updatedState,
    shouldReward,
    didLevelUp,
    rewardDino,
    rewardError,
    rewardResult: result.rewardResult,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("Page reward wiring (handleProblemComplete flow)", () => {
  const mockRewardFn = vi.fn();

  beforeEach(() => {
    mockRewardFn.mockReset();
  });

  it("does not trigger reward before the 5th solve", async () => {
    let state = initNewGame("Rex");

    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      const result = await simulateHandleProblemComplete(state, i === 0, mockRewardFn);
      expect(result.shouldReward).toBe(false);
      expect(result.rewardDino).toBeNull();
      expect(result.rewardError).toBeNull();
      state = result.updatedState;
    }

    expect(mockRewardFn).not.toHaveBeenCalled();
  });

  it("triggers reward on the 5th solve and surfaces dino metadata", async () => {
    let state = initNewGame("Rex");

    // Solve 4 problems first (no reward)
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      const { updatedState } = recordSolve(state);
      state = updatedState;
    }

    // 5th solve triggers reward
    mockRewardFn.mockImplementation((save) => Promise.resolve(makeSuccessReward(save)));

    const result = await simulateHandleProblemComplete(state, false, mockRewardFn);

    expect(result.shouldReward).toBe(true);
    expect(mockRewardFn).toHaveBeenCalledTimes(1);
    expect(result.rewardDino).not.toBeNull();
    expect(result.rewardDino!.name).toBe("Velociraptor");
    expect(result.rewardDino!.imagePath).toBe("/dinos/velociraptor-abc12345.png");
    expect(result.rewardDino!.dateEarned).toBe(NOW);
  });

  it("appends unlocked dino to player save on successful reward", async () => {
    let state = initNewGame("Rex");

    // Solve 4 problems
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    mockRewardFn.mockImplementation((save) => Promise.resolve(makeSuccessReward(save)));

    const result = await simulateHandleProblemComplete(state, false, mockRewardFn);

    // The updated save should contain the unlocked dinosaur
    expect(result.updatedState.playerSave.unlockedDinosaurs).toHaveLength(1);
    expect(result.updatedState.playerSave.unlockedDinosaurs[0].name).toBe("Velociraptor");
    expect(result.updatedState.playerSave.unlockedDinosaurs[0].imagePath).toBe(
      "/dinos/velociraptor-abc12345.png",
    );
  });

  it("surfaces reward error message when Gemini generation fails", async () => {
    let state = initNewGame("Rex");

    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    mockRewardFn.mockResolvedValue({
      status: "error",
      message: "Gemini API rate limit exceeded",
    });

    const result = await simulateHandleProblemComplete(state, false, mockRewardFn);

    expect(result.shouldReward).toBe(true);
    expect(result.rewardDino).toBeNull();
    expect(result.rewardError).toBe("Gemini API rate limit exceeded");
    // Save should still not contain a new dino
    expect(result.updatedState.playerSave.unlockedDinosaurs).toHaveLength(0);
  });

  it("handles pool_exhausted without error or dino", async () => {
    let state = initNewGame("Rex");

    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    mockRewardFn.mockResolvedValue({ status: "pool_exhausted" });

    const result = await simulateHandleProblemComplete(state, false, mockRewardFn);

    expect(result.shouldReward).toBe(true);
    expect(result.rewardDino).toBeNull();
    expect(result.rewardError).toBeNull();
    expect(result.rewardResult?.status).toBe("pool_exhausted");
  });

  it("triggers reward again at 10th solve (second reward)", async () => {
    let state = initNewGame("Rex");

    // Solve 9 problems (past 5th trigger)
    for (let i = 0; i < REWARD_INTERVAL * 2 - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    const secondDino: UnlockedDinosaur = {
      name: "Triceratops",
      imagePath: "/dinos/triceratops-xyz99999.png",
      dateEarned: NOW,
    };
    mockRewardFn.mockImplementation((save) => Promise.resolve(makeSuccessReward(save, secondDino)));

    const result = await simulateHandleProblemComplete(state, false, mockRewardFn);

    expect(result.shouldReward).toBe(true);
    expect(result.rewardDino!.name).toBe("Triceratops");
    expect(result.rewardDino!.imagePath).toBe("/dinos/triceratops-xyz99999.png");
  });

  it("preserves player identity through the full reward flow", async () => {
    let state = initNewGame("Dr. Alan Grant");

    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    mockRewardFn.mockImplementation((save) => Promise.resolve(makeSuccessReward(save)));

    const result = await simulateHandleProblemComplete(state, false, mockRewardFn);

    expect(result.updatedState.playerSave.playerName).toBe("Dr. Alan Grant");
    expect(result.updatedState.playerSave.totalProblemsSolved).toBe(REWARD_INTERVAL);
  });

  it("clears reward error when subsequent reward succeeds", async () => {
    let state = initNewGame("Rex");

    // Solve to 5th problem, reward fails
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    mockRewardFn.mockResolvedValue({
      status: "error",
      message: "Network error",
    });

    const failResult = await simulateHandleProblemComplete(state, false, mockRewardFn);
    expect(failResult.rewardError).toBe("Network error");
    expect(failResult.rewardDino).toBeNull();

    // Continue solving to 10th problem, reward succeeds
    state = failResult.updatedState;
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }

    mockRewardFn.mockImplementation((save) => Promise.resolve(makeSuccessReward(save)));

    const successResult = await simulateHandleProblemComplete(state, false, mockRewardFn);
    expect(successResult.rewardDino).not.toBeNull();
    // page.tsx sets rewardError to null on success
    expect(successResult.rewardError).toBeNull();
  });
});
