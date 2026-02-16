import type { PlayerSave, DifficultyTier } from "@/types";
import { createNewPlayerSave } from "@/types";

// ─── Game Phase ─────────────────────────────────────────────

/** Describes where the player is in the overall game lifecycle. */
export type GamePhase = "start" | "playing";

// ─── Runtime Game State ─────────────────────────────────────

/** The in-memory state for an active game session. */
export interface GameState {
  phase: GamePhase;
  /** The persisted player data (loaded or freshly created). */
  playerSave: PlayerSave;
  /** Problems solved in the current session (not yet persisted). */
  sessionProblemsSolved: number;
  /** Problems attempted in the current session. */
  sessionProblemsAttempted: number;
  /** Difficulty at the start of this session. */
  sessionStartDifficulty: DifficultyTier;
}

/** Create a GameState from an existing save (loaded from file). */
export function initFromSave(save: PlayerSave): GameState {
  return {
    phase: "playing",
    playerSave: save,
    sessionProblemsSolved: 0,
    sessionProblemsAttempted: 0,
    sessionStartDifficulty: save.currentDifficulty,
  };
}

/** Create a GameState for a brand-new player. */
export function initNewGame(playerName: string): GameState {
  const save = createNewPlayerSave(playerName);
  return {
    phase: "playing",
    playerSave: save,
    sessionProblemsSolved: 0,
    sessionProblemsAttempted: 0,
    sessionStartDifficulty: save.currentDifficulty,
  };
}
