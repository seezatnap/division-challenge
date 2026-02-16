import { describe, it, expect } from "vitest";
import type { GameStartResult } from "../GameStartScreen";
import { initFromSave, initNewGame } from "@/lib/game-state";
import { createNewPlayerSave } from "@/types";
import type { PlayerSave } from "@/types";

/**
 * These tests verify the game-start flow logic:
 * - The GameStartResult interface drives how runtime state is initialized
 * - "new" mode + playerName → initNewGame
 * - "loaded" mode + playerSave → initFromSave
 *
 * Component rendering tests require a DOM environment (@testing-library/react + jsdom),
 * which are not yet configured in this project. The pure logic is tested here.
 */

describe("GameStartResult → GameState initialization", () => {
  it("new game: initializes fresh state with player name", () => {
    const result: GameStartResult = {
      mode: "new",
      playerName: "Rex",
    };

    // Simulate what page.tsx does on receiving this result
    const gameState = initNewGame(result.playerName!);

    expect(gameState.phase).toBe("playing");
    expect(gameState.playerSave.playerName).toBe("Rex");
    expect(gameState.playerSave.totalProblemsSolved).toBe(0);
    expect(gameState.playerSave.currentDifficulty).toBe(1);
    expect(gameState.sessionProblemsSolved).toBe(0);
  });

  it("loaded game: initializes state from existing save", () => {
    const save: PlayerSave = {
      version: 1,
      playerName: "Alan Grant",
      totalProblemsSolved: 42,
      currentDifficulty: 3,
      unlockedDinosaurs: [
        {
          name: "Velociraptor",
          imagePath: "/dinos/velociraptor.png",
          dateEarned: "2026-01-20T08:00:00.000Z",
        },
      ],
      sessionHistory: [
        {
          startedAt: "2026-01-20T07:00:00.000Z",
          endedAt: "2026-01-20T08:00:00.000Z",
          problemsSolved: 15,
          problemsAttempted: 18,
          startDifficulty: 1,
          endDifficulty: 3,
        },
      ],
    };

    const result: GameStartResult = {
      mode: "loaded",
      playerSave: save,
    };

    // Simulate what page.tsx does on receiving this result
    const gameState = initFromSave(result.playerSave!);

    expect(gameState.phase).toBe("playing");
    expect(gameState.playerSave.playerName).toBe("Alan Grant");
    expect(gameState.playerSave.totalProblemsSolved).toBe(42);
    expect(gameState.playerSave.currentDifficulty).toBe(3);
    expect(gameState.playerSave.unlockedDinosaurs).toHaveLength(1);
    expect(gameState.sessionStartDifficulty).toBe(3);
    expect(gameState.sessionProblemsSolved).toBe(0);
  });

  it("GameStartResult mode is 'new' or 'loaded'", () => {
    const newResult: GameStartResult = { mode: "new", playerName: "Rex" };
    const loadResult: GameStartResult = {
      mode: "loaded",
      playerSave: createNewPlayerSave("Rex"),
    };

    expect(newResult.mode).toBe("new");
    expect(loadResult.mode).toBe("loaded");
  });

  it("new game preserves exact player name including spaces and special characters", () => {
    const result: GameStartResult = {
      mode: "new",
      playerName: "Dr. Ian Malcolm",
    };

    const gameState = initNewGame(result.playerName!);
    expect(gameState.playerSave.playerName).toBe("Dr. Ian Malcolm");
  });

  it("loaded game with zero progress still enters playing phase", () => {
    const freshSave = createNewPlayerSave("Ellie");
    const result: GameStartResult = {
      mode: "loaded",
      playerSave: freshSave,
    };

    const gameState = initFromSave(result.playerSave!);
    expect(gameState.phase).toBe("playing");
    expect(gameState.playerSave.totalProblemsSolved).toBe(0);
  });
});
