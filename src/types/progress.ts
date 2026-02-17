import type { DifficultyLevel } from "./division";

// ---------------------------------------------------------------------------
// Player Progress — session & lifetime
// ---------------------------------------------------------------------------

/** Stats for a single play session. */
export interface SessionProgress {
  /** Problems solved in this session. */
  problemsSolved: number;
  /** Problems attempted (includes unsolved / in-progress). */
  problemsAttempted: number;
  /** Total incorrect inputs across all problems this session. */
  incorrectInputs: number;
  /** ISO-8601 timestamp when the session started. */
  startedAt: string;
}

/** Lifetime (persisted) progress for a player. */
export interface LifetimeProgress {
  /** Total problems solved across all sessions. */
  totalProblemsSolved: number;
  /** Total problems attempted across all sessions. */
  totalProblemsAttempted: number;
  /** Current difficulty level (derived from totalProblemsSolved). */
  currentDifficulty: DifficultyLevel;
  /** Number of complete play sessions recorded. */
  sessionsPlayed: number;
}

/** Combined in-memory player progress (session + lifetime). */
export interface PlayerProgress {
  session: SessionProgress;
  lifetime: LifetimeProgress;
}
