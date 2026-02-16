import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildSessionRecord,
  updateSaveWithSession,
  persistAfterSolve,
} from "../persistence";
import { initNewGame } from "../game-state";
import { recordSolve } from "../progression";
import type { GameState } from "../game-state";
import type { PlayerSave, SessionRecord } from "@/types";
import type { RewardResult } from "../reward-orchestrator";

// ─── Helpers ────────────────────────────────────────────────

const NOW = "2026-02-16T12:00:00.000Z";
const STARTED_AT = "2026-02-16T11:00:00.000Z";

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    ...initNewGame("Rex", STARTED_AT),
    ...overrides,
  };
}

function makeSaveWithHistory(sessions: SessionRecord[]): PlayerSave {
  return {
    version: 1,
    playerName: "Rex",
    totalProblemsSolved: 5,
    currentDifficulty: 2,
    unlockedDinosaurs: [],
    sessionHistory: sessions,
  };
}

function makeMockHandle(): FileSystemFileHandle {
  return {
    kind: "file",
    name: "rex-save.json",
    getFile: vi.fn(),
    createWritable: vi.fn(),
  } as unknown as FileSystemFileHandle;
}

// ─── buildSessionRecord ─────────────────────────────────────

describe("buildSessionRecord", () => {
  it("captures sessionStartedAt as startedAt", () => {
    const state = makeState();
    const record = buildSessionRecord(state, NOW);
    expect(record.startedAt).toBe(STARTED_AT);
  });

  it("uses provided now as endedAt", () => {
    const state = makeState();
    const record = buildSessionRecord(state, NOW);
    expect(record.endedAt).toBe(NOW);
  });

  it("defaults endedAt to current time when now is not provided", () => {
    const state = makeState();
    const before = new Date().toISOString();
    const record = buildSessionRecord(state);
    const after = new Date().toISOString();
    expect(record.endedAt! >= before).toBe(true);
    expect(record.endedAt! <= after).toBe(true);
  });

  it("captures session counters", () => {
    const state = makeState({
      sessionProblemsSolved: 7,
      sessionProblemsAttempted: 9,
    });
    const record = buildSessionRecord(state, NOW);
    expect(record.problemsSolved).toBe(7);
    expect(record.problemsAttempted).toBe(9);
  });

  it("captures start and end difficulty", () => {
    const state = makeState({
      sessionStartDifficulty: 1,
      playerSave: {
        ...initNewGame("Rex").playerSave,
        currentDifficulty: 3,
      },
    });
    const record = buildSessionRecord(state, NOW);
    expect(record.startDifficulty).toBe(1);
    expect(record.endDifficulty).toBe(3);
  });
});

// ─── updateSaveWithSession ──────────────────────────────────

describe("updateSaveWithSession", () => {
  const session: SessionRecord = {
    startedAt: STARTED_AT,
    endedAt: NOW,
    problemsSolved: 3,
    problemsAttempted: 3,
    startDifficulty: 1,
    endDifficulty: 1,
  };

  it("appends a new session record on first save", () => {
    const save = makeSaveWithHistory([]);
    const updated = updateSaveWithSession(save, session, true);
    expect(updated.sessionHistory).toHaveLength(1);
    expect(updated.sessionHistory[0]).toBe(session);
  });

  it("does not mutate the original save on first save", () => {
    const save = makeSaveWithHistory([]);
    updateSaveWithSession(save, session, true);
    expect(save.sessionHistory).toHaveLength(0);
  });

  it("replaces the last session record on subsequent saves", () => {
    const oldSession: SessionRecord = {
      startedAt: STARTED_AT,
      endedAt: "2026-02-16T11:30:00.000Z",
      problemsSolved: 1,
      problemsAttempted: 1,
      startDifficulty: 1,
      endDifficulty: 1,
    };
    const save = makeSaveWithHistory([oldSession]);
    const updated = updateSaveWithSession(save, session, false);
    expect(updated.sessionHistory).toHaveLength(1);
    expect(updated.sessionHistory[0]).toBe(session);
    expect(updated.sessionHistory[0].problemsSolved).toBe(3);
  });

  it("preserves earlier sessions when replacing the last", () => {
    const previousSession: SessionRecord = {
      startedAt: "2026-02-15T10:00:00.000Z",
      endedAt: "2026-02-15T11:00:00.000Z",
      problemsSolved: 5,
      problemsAttempted: 5,
      startDifficulty: 1,
      endDifficulty: 2,
    };
    const activeSession: SessionRecord = {
      startedAt: STARTED_AT,
      endedAt: "2026-02-16T11:30:00.000Z",
      problemsSolved: 1,
      problemsAttempted: 1,
      startDifficulty: 2,
      endDifficulty: 2,
    };
    const save = makeSaveWithHistory([previousSession, activeSession]);
    const updated = updateSaveWithSession(save, session, false);
    expect(updated.sessionHistory).toHaveLength(2);
    expect(updated.sessionHistory[0]).toBe(previousSession);
    expect(updated.sessionHistory[1]).toBe(session);
  });

  it("does not mutate the original save on subsequent saves", () => {
    const oldSession: SessionRecord = {
      startedAt: STARTED_AT,
      endedAt: "2026-02-16T11:30:00.000Z",
      problemsSolved: 1,
      problemsAttempted: 1,
      startDifficulty: 1,
      endDifficulty: 1,
    };
    const save = makeSaveWithHistory([oldSession]);
    updateSaveWithSession(save, session, false);
    expect(save.sessionHistory[0]).toBe(oldSession);
  });
});

// ─── persistAfterSolve ──────────────────────────────────────

describe("persistAfterSolve", () => {
  const mockSaveFn = vi.fn();
  const mockRewardFn = vi.fn();
  const mockSupportedFn = vi.fn();

  beforeEach(() => {
    mockSaveFn.mockReset();
    mockRewardFn.mockReset();
    mockSupportedFn.mockReset();
  });

  function deps(overrides: {
    saveFn?: typeof mockSaveFn;
    rewardFn?: typeof mockRewardFn;
    supportedFn?: typeof mockSupportedFn;
    now?: string;
    cachedFileHandle?: FileSystemFileHandle;
  } = {}) {
    return {
      saveFn: overrides.saveFn ?? mockSaveFn,
      rewardFn: overrides.rewardFn ?? mockRewardFn,
      now: overrides.now ?? NOW,
      supportedFn: overrides.supportedFn ?? mockSupportedFn,
      cachedFileHandle: overrides.cachedFileHandle,
    };
  }

  it("saves progress without reward when shouldReward is false", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(mockRewardFn).not.toHaveBeenCalled();
    expect(mockSaveFn).toHaveBeenCalledTimes(1);
    expect(result.saved).toBe(true);
    expect(result.rewardResult).toBeUndefined();
  });

  it("processes reward when shouldReward is true", async () => {
    const rewardResult: RewardResult = {
      status: "success",
      unlocked: {
        name: "Velociraptor",
        imagePath: "/dinos/velociraptor.png",
        dateEarned: NOW,
      },
      updatedSave: {
        ...makeState().playerSave,
        unlockedDinosaurs: [
          {
            name: "Velociraptor",
            imagePath: "/dinos/velociraptor.png",
            dateEarned: NOW,
          },
        ],
      },
    };
    mockRewardFn.mockResolvedValue(rewardResult);
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 5, sessionProblemsAttempted: 5 });
    const result = await persistAfterSolve(state, true, true, deps());

    expect(mockRewardFn).toHaveBeenCalledWith(state.playerSave);
    expect(result.rewardResult).toBe(rewardResult);
    // The saved data should include the new dino
    expect(result.updatedState.playerSave.unlockedDinosaurs).toHaveLength(1);
    expect(result.updatedState.playerSave.unlockedDinosaurs[0].name).toBe("Velociraptor");
  });

  it("continues with save even when reward fails", async () => {
    const rewardError: RewardResult = { status: "error", message: "API down" };
    mockRewardFn.mockResolvedValue(rewardError);
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 5, sessionProblemsAttempted: 5 });
    const result = await persistAfterSolve(state, true, true, deps());

    expect(result.rewardResult).toBe(rewardError);
    expect(result.saved).toBe(true);
    // Save should still have been called (without dino update)
    expect(mockSaveFn).toHaveBeenCalledTimes(1);
  });

  it("continues with save when reward pool is exhausted", async () => {
    const rewardExhausted: RewardResult = { status: "pool_exhausted" };
    mockRewardFn.mockResolvedValue(rewardExhausted);
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState();
    const result = await persistAfterSolve(state, true, true, deps());

    expect(result.rewardResult?.status).toBe("pool_exhausted");
    expect(result.saved).toBe(true);
  });

  it("appends a session record on first save of session", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.updatedState.playerSave.sessionHistory).toHaveLength(1);
    expect(result.updatedState.playerSave.sessionHistory[0].startedAt).toBe(STARTED_AT);
    expect(result.updatedState.playerSave.sessionHistory[0].endedAt).toBe(NOW);
    expect(result.updatedState.playerSave.sessionHistory[0].problemsSolved).toBe(1);
  });

  it("replaces the last session record on subsequent saves", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    // Simulate a state that already has one session in history (from first save)
    const stateWithSession = makeState({
      sessionProblemsSolved: 3,
      sessionProblemsAttempted: 3,
      playerSave: makeSaveWithHistory([
        {
          startedAt: STARTED_AT,
          endedAt: "2026-02-16T11:30:00.000Z",
          problemsSolved: 1,
          problemsAttempted: 1,
          startDifficulty: 1,
          endDifficulty: 1,
        },
      ]),
    });

    const result = await persistAfterSolve(
      stateWithSession,
      false,
      false,
      deps(),
    );

    // Should still have exactly 1 session (replaced, not appended)
    expect(result.updatedState.playerSave.sessionHistory).toHaveLength(1);
    expect(result.updatedState.playerSave.sessionHistory[0].problemsSolved).toBe(3);
  });

  it("reports save error without throwing", async () => {
    mockSaveFn.mockResolvedValue({ ok: false, error: "Disk full" });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.saved).toBe(false);
    expect(result.saveError).toBe("Disk full");
    // State should still be updated (game continues in-memory)
    expect(result.updatedState.playerSave.sessionHistory).toHaveLength(1);
  });

  it("skips save when File System Access API is not supported", async () => {
    mockSupportedFn.mockReturnValue(false);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.saved).toBe(false);
    expect(result.saveError).toBeUndefined();
    expect(mockSaveFn).not.toHaveBeenCalled();
    // Session history still gets built in-memory
    expect(result.updatedState.playerSave.sessionHistory).toHaveLength(1);
  });

  it("preserves player save fields through the full flow", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({
      sessionProblemsSolved: 2,
      sessionProblemsAttempted: 2,
      playerSave: {
        version: 1,
        playerName: "Alan Grant",
        totalProblemsSolved: 12,
        currentDifficulty: 3,
        unlockedDinosaurs: [
          {
            name: "T-Rex",
            imagePath: "/dinos/t-rex.png",
            dateEarned: "2026-02-15T10:00:00.000Z",
          },
        ],
        sessionHistory: [],
      },
    });

    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.updatedState.playerSave.playerName).toBe("Alan Grant");
    expect(result.updatedState.playerSave.totalProblemsSolved).toBe(12);
    expect(result.updatedState.playerSave.currentDifficulty).toBe(3);
    expect(result.updatedState.playerSave.unlockedDinosaurs).toHaveLength(1);
    expect(result.updatedState.playerSave.version).toBe(1);
  });

  it("writes the correct save data (with session history) to saveFn", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    await persistAfterSolve(state, false, true, deps());

    const savedData = mockSaveFn.mock.calls[0][0] as PlayerSave;
    expect(savedData.sessionHistory).toHaveLength(1);
    expect(savedData.sessionHistory[0].problemsSolved).toBe(1);
    expect(savedData.playerName).toBe("Rex");
  });

  it("integrates with recordSolve correctly", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    // Simulate a full solve → persist cycle
    const initial = initNewGame("Rex", STARTED_AT);
    const { updatedState, shouldReward } = recordSolve(initial);

    expect(shouldReward).toBe(false); // only 1 solve

    const result = await persistAfterSolve(
      updatedState,
      shouldReward,
      true,
      deps(),
    );

    expect(result.updatedState.playerSave.totalProblemsSolved).toBe(1);
    expect(result.updatedState.playerSave.sessionHistory).toHaveLength(1);
    expect(result.updatedState.playerSave.sessionHistory[0].problemsSolved).toBe(1);
    expect(result.saved).toBe(true);
  });

  it("integrates with recordSolve and reward at 5 solves", async () => {
    const rewardResult: RewardResult = {
      status: "success",
      unlocked: {
        name: "Triceratops",
        imagePath: "/dinos/triceratops.png",
        dateEarned: NOW,
      },
      updatedSave: {
        version: 1,
        playerName: "Rex",
        totalProblemsSolved: 5,
        currentDifficulty: 2,
        unlockedDinosaurs: [
          {
            name: "Triceratops",
            imagePath: "/dinos/triceratops.png",
            dateEarned: NOW,
          },
        ],
        sessionHistory: [],
      },
    };
    mockRewardFn.mockResolvedValue(rewardResult);
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    // Simulate 5 solves
    let state = initNewGame("Rex", STARTED_AT);
    let shouldReward = false;
    for (let i = 0; i < 5; i++) {
      const result = recordSolve(state);
      state = result.updatedState;
      shouldReward = result.shouldReward;
    }

    expect(shouldReward).toBe(true);

    const result = await persistAfterSolve(
      state,
      shouldReward,
      true,
      deps(),
    );

    expect(result.rewardResult?.status).toBe("success");
    expect(result.updatedState.playerSave.unlockedDinosaurs).toHaveLength(1);
    expect(result.updatedState.playerSave.sessionHistory).toHaveLength(1);
    expect(result.updatedState.playerSave.sessionHistory[0].problemsSolved).toBe(5);
    expect(result.saved).toBe(true);
  });

  // ─── Cached FileSystemFileHandle tests ───────────────────

  it("passes cachedFileHandle to saveFn", async () => {
    const handle = makeMockHandle();
    mockSaveFn.mockResolvedValue({ ok: true, handle });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    await persistAfterSolve(state, false, true, deps({ cachedFileHandle: handle }));

    // saveFn should receive the cached handle as its second argument
    expect(mockSaveFn.mock.calls[0][1]).toBe(handle);
  });

  it("returns fileHandle from successful save", async () => {
    const handle = makeMockHandle();
    mockSaveFn.mockResolvedValue({ ok: true, handle });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.fileHandle).toBe(handle);
  });

  it("does not return fileHandle when save fails", async () => {
    mockSaveFn.mockResolvedValue({ ok: false, error: "Disk full" });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.fileHandle).toBeUndefined();
  });

  it("does not return fileHandle when API is unsupported", async () => {
    mockSupportedFn.mockReturnValue(false);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    const result = await persistAfterSolve(state, false, true, deps());

    expect(result.fileHandle).toBeUndefined();
  });

  it("passes undefined to saveFn when no cached handle is provided", async () => {
    mockSaveFn.mockResolvedValue({ ok: true, handle: makeMockHandle() });
    mockSupportedFn.mockReturnValue(true);

    const state = makeState({ sessionProblemsSolved: 1, sessionProblemsAttempted: 1 });
    await persistAfterSolve(state, false, true, deps());

    // saveFn's second argument should be undefined (no cached handle)
    expect(mockSaveFn.mock.calls[0][1]).toBeUndefined();
  });
});
