import type { DifficultyLevel } from "./division";
import type { UnlockedReward } from "./rewards";

// ---------------------------------------------------------------------------
// Save-File Schema
// ---------------------------------------------------------------------------

/**
 * Current schema version. Increment when the shape changes so that
 * migration logic can detect older files.
 */
export const SAVE_FILE_VERSION = 1 as const;

/** Summary of a single play session stored in the save file. */
export interface SessionRecord {
  /** ISO-8601 timestamp when the session started. */
  startedAt: string;
  /** ISO-8601 timestamp when the session ended (undefined if still active). */
  endedAt: string | null;
  /** Problems solved during this session. */
  problemsSolved: number;
  /** Problems attempted during this session. */
  problemsAttempted: number;
}

/**
 * Top-level shape of a player's JSON save file (e.g. `rex-save.json`).
 *
 * Matches the spec requirements:
 *   player name, total problems solved, current difficulty level,
 *   unlocked dinosaurs (name + image path + date earned), session history.
 */
export interface SaveFile {
  /** Schema version for forward-compatible migrations. */
  version: typeof SAVE_FILE_VERSION;
  /** Player display name (also used to derive the filename). */
  playerName: string;
  /** Total problems solved across all sessions. */
  totalProblemsSolved: number;
  /** Total problems attempted across all sessions. */
  totalProblemsAttempted: number;
  /** Current difficulty level. */
  currentDifficulty: DifficultyLevel;
  /** Number of sessions completed. */
  sessionsPlayed: number;
  /** Ordered list of unlocked dinosaur rewards. */
  unlockedRewards: UnlockedReward[];
  /** Chronological history of play sessions. */
  sessionHistory: SessionRecord[];
  /** ISO-8601 timestamp of last save. */
  lastSavedAt: string;
}
