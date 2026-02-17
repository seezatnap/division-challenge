import { DifficultyLevel } from "@/types";
import type { GameSession, SaveFile } from "@/types";

/**
 * Create a fresh game session for a new player.
 */
export function createNewSession(playerName: string): GameSession {
  return {
    playerName,
    loadedFromSave: false,
    progress: {
      session: {
        problemsSolved: 0,
        problemsAttempted: 0,
        incorrectInputs: 0,
        startedAt: new Date().toISOString(),
      },
      lifetime: {
        totalProblemsSolved: 0,
        totalProblemsAttempted: 0,
        currentDifficulty: DifficultyLevel.Easy,
        sessionsPlayed: 0,
      },
    },
    unlockedRewards: [],
    priorSessionHistory: [],
  };
}

/**
 * Restore a game session from a parsed save file.
 * Starts a new session timer but carries over all lifetime stats
 * and prior session history.
 */
export function restoreSessionFromSave(saveFile: SaveFile): GameSession {
  return {
    playerName: saveFile.playerName,
    loadedFromSave: true,
    progress: {
      session: {
        problemsSolved: 0,
        problemsAttempted: 0,
        incorrectInputs: 0,
        startedAt: new Date().toISOString(),
      },
      lifetime: {
        totalProblemsSolved: saveFile.totalProblemsSolved,
        totalProblemsAttempted: saveFile.totalProblemsAttempted,
        currentDifficulty: saveFile.currentDifficulty,
        sessionsPlayed: saveFile.sessionsPlayed,
      },
    },
    unlockedRewards: [...saveFile.unlockedRewards],
    priorSessionHistory: [...saveFile.sessionHistory],
  };
}

/**
 * Validate that a player name is acceptable.
 * Returns an error message string if invalid, or null if valid.
 */
export function validatePlayerName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Please enter a name.";
  }
  if (trimmed.length < 2) {
    return "Name must be at least 2 characters.";
  }
  if (trimmed.length > 30) {
    return "Name must be 30 characters or fewer.";
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
    return "Name can only contain letters, numbers, spaces, hyphens, and underscores.";
  }
  return null;
}

/**
 * Derive the expected save filename from a player name.
 * Matches the spec: e.g. `rex-save.json`
 */
export function saveFileNameFromPlayer(playerName: string): string {
  return `${playerName.trim().toLowerCase().replace(/\s+/g, "-")}-save.json`;
}
