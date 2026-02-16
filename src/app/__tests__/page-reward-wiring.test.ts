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

/**
 * Tests verifying that the .catch() handler on the persistAfterSolve promise
 * in page.tsx's handleProblemComplete properly surfaces unexpected errors via
 * setSaveError. Since page.tsx is a React component, these tests exercise the
 * catch-handler logic directly without a DOM environment.
 */
describe("persistAfterSolve .catch() handler (unhandled rejection prevention)", () => {
  it("rejects with an Error when saveFn throws unexpectedly", async () => {
    const state = initNewGame("Rex");
    const { updatedState } = recordSolve(state);

    // saveFn throws — this simulates an unexpected failure that would cause
    // an unhandled promise rejection without a .catch() handler.
    const error = await persistAfterSolve(updatedState, false, true, {
      saveFn: vi.fn().mockRejectedValue(new Error("Disk full")),
      rewardFn: vi.fn().mockResolvedValue({ status: "pool_exhausted" }),
      now: "2026-02-16T12:00:00.000Z",
      supportedFn: () => true,
    }).catch((err: unknown) => err);

    // Verify the catch handler receives an Error with the right message
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Disk full");
  });

  it("rejects with an Error when rewardFn throws unexpectedly", async () => {
    let state = initNewGame("Rex");
    for (let i = 0; i < REWARD_INTERVAL - 1; i++) {
      state = recordSolve(state).updatedState;
    }
    const { updatedState, shouldReward } = recordSolve(state);
    expect(shouldReward).toBe(true);

    // rewardFn throws (not a graceful error result — an actual exception)
    const error = await persistAfterSolve(updatedState, shouldReward, false, {
      saveFn: vi.fn().mockResolvedValue({ ok: true }),
      rewardFn: vi.fn().mockRejectedValue(new Error("Network timeout")),
      now: "2026-02-16T12:00:00.000Z",
      supportedFn: () => true,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Network timeout");
  });

  it("extracts error message from Error instances (page.tsx catch logic)", () => {
    // This mirrors the exact logic in page.tsx's .catch() handler:
    //   const message = err instanceof Error ? err.message : "Unknown persistence error";
    const extractMessage = (err: unknown): string =>
      err instanceof Error ? err.message : "Unknown persistence error";

    expect(extractMessage(new Error("Disk full"))).toBe("Disk full");
    expect(extractMessage(new TypeError("Failed to fetch"))).toBe("Failed to fetch");
    expect(extractMessage("string error")).toBe("Unknown persistence error");
    expect(extractMessage(null)).toBe("Unknown persistence error");
    expect(extractMessage(undefined)).toBe("Unknown persistence error");
    expect(extractMessage(42)).toBe("Unknown persistence error");
  });
});
