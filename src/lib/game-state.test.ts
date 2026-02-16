import { describe, it, expect } from "vitest";
import { initFromSave, initNewGame } from "./game-state";
import { createNewPlayerSave } from "@/types";
import type { PlayerSave } from "@/types";

// ─── initNewGame ────────────────────────────────────────────

describe("initNewGame", () => {
  it("creates a GameState in playing phase", () => {
    const state = initNewGame("Rex");
    expect(state.phase).toBe("playing");
  });

  it("creates a PlayerSave with the given name", () => {
    const state = initNewGame("Dr. Malcolm");
    expect(state.playerSave.playerName).toBe("Dr. Malcolm");
  });

  it("starts with zero session problems solved", () => {
    const state = initNewGame("Rex");
    expect(state.sessionProblemsSolved).toBe(0);
  });

  it("starts with zero session problems attempted", () => {
    const state = initNewGame("Rex");
    expect(state.sessionProblemsAttempted).toBe(0);
  });

  it("sets sessionStartDifficulty to tier 1 for a new player", () => {
    const state = initNewGame("Rex");
    expect(state.sessionStartDifficulty).toBe(1);
  });

  it("initializes a fresh PlayerSave (version 1, difficulty 1, empty arrays)", () => {
    const state = initNewGame("Rex");
    expect(state.playerSave.version).toBe(1);
    expect(state.playerSave.currentDifficulty).toBe(1);
    expect(state.playerSave.totalProblemsSolved).toBe(0);
    expect(state.playerSave.unlockedDinosaurs).toEqual([]);
    expect(state.playerSave.sessionHistory).toEqual([]);
  });
});

// ─── initFromSave ───────────────────────────────────────────

describe("initFromSave", () => {
  const existingSave: PlayerSave = {
    version: 1,
    playerName: "Alan Grant",
    totalProblemsSolved: 42,
    currentDifficulty: 3,
    unlockedDinosaurs: [
      {
        name: "Tyrannosaurus Rex",
        imagePath: "/dinos/t-rex.png",
        dateEarned: "2026-01-15T10:30:00.000Z",
      },
    ],
    sessionHistory: [
      {
        startedAt: "2026-01-15T10:00:00.000Z",
        endedAt: "2026-01-15T10:45:00.000Z",
        problemsSolved: 10,
        problemsAttempted: 12,
        startDifficulty: 1,
        endDifficulty: 2,
      },
    ],
  };

  it("creates a GameState in playing phase", () => {
    const state = initFromSave(existingSave);
    expect(state.phase).toBe("playing");
  });

  it("preserves the loaded player save data", () => {
    const state = initFromSave(existingSave);
    expect(state.playerSave).toBe(existingSave);
  });

  it("retains playerName from save", () => {
    const state = initFromSave(existingSave);
    expect(state.playerSave.playerName).toBe("Alan Grant");
  });

  it("retains totalProblemsSolved from save", () => {
    const state = initFromSave(existingSave);
    expect(state.playerSave.totalProblemsSolved).toBe(42);
  });

  it("retains currentDifficulty from save", () => {
    const state = initFromSave(existingSave);
    expect(state.playerSave.currentDifficulty).toBe(3);
  });

  it("retains unlockedDinosaurs from save", () => {
    const state = initFromSave(existingSave);
    expect(state.playerSave.unlockedDinosaurs).toHaveLength(1);
    expect(state.playerSave.unlockedDinosaurs[0].name).toBe(
      "Tyrannosaurus Rex"
    );
  });

  it("retains sessionHistory from save", () => {
    const state = initFromSave(existingSave);
    expect(state.playerSave.sessionHistory).toHaveLength(1);
  });

  it("starts with zero session problems solved", () => {
    const state = initFromSave(existingSave);
    expect(state.sessionProblemsSolved).toBe(0);
  });

  it("starts with zero session problems attempted", () => {
    const state = initFromSave(existingSave);
    expect(state.sessionProblemsAttempted).toBe(0);
  });

  it("sets sessionStartDifficulty to the save's currentDifficulty", () => {
    const state = initFromSave(existingSave);
    expect(state.sessionStartDifficulty).toBe(3);
  });

  it("works with a minimal fresh save", () => {
    const freshSave = createNewPlayerSave("Ellie");
    const state = initFromSave(freshSave);
    expect(state.phase).toBe("playing");
    expect(state.playerSave.playerName).toBe("Ellie");
    expect(state.sessionStartDifficulty).toBe(1);
  });
});
