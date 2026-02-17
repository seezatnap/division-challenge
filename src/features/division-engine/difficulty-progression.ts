import { DifficultyLevel } from "@/types";
import type { PlayerProgress } from "@/types";

// ---------------------------------------------------------------------------
// Difficulty-tier thresholds (cumulative lifetime problems solved)
// ---------------------------------------------------------------------------

/**
 * Thresholds define the minimum cumulative problems solved to unlock each tier.
 * Listed in ascending order of difficulty.
 *
 *   0–9   solved → Easy    (2-digit ÷ 1-digit)
 *  10–24  solved → Medium  (3-digit ÷ 1-digit)
 *  25–49  solved → Hard    (3-digit ÷ 2-digit)
 *  50+    solved → Expert  (4–5 digit ÷ 2–3 digit)
 */
export interface DifficultyThreshold {
  /** Minimum cumulative problems solved to reach this tier. */
  minSolved: number;
  /** The difficulty level at this tier. */
  level: DifficultyLevel;
}

export const DIFFICULTY_THRESHOLDS: readonly DifficultyThreshold[] = [
  { minSolved: 0, level: DifficultyLevel.Easy },
  { minSolved: 10, level: DifficultyLevel.Medium },
  { minSolved: 25, level: DifficultyLevel.Hard },
  { minSolved: 50, level: DifficultyLevel.Expert },
] as const;

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Determine the difficulty level from a cumulative lifetime solved count.
 *
 * Walks the threshold table in reverse and returns the highest tier whose
 * `minSolved` requirement is met.
 */
export function getDifficultyForSolvedCount(
  totalProblemsSolved: number,
): DifficultyLevel {
  // Walk thresholds from highest to lowest; return first match.
  for (let i = DIFFICULTY_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalProblemsSolved >= DIFFICULTY_THRESHOLDS[i].minSolved) {
      return DIFFICULTY_THRESHOLDS[i].level;
    }
  }
  // Fallback (should never happen since first threshold starts at 0).
  return DifficultyLevel.Easy;
}

/**
 * Determine the current difficulty level from full player progress.
 *
 * This is the primary entry point for game-loop integration: pass the
 * in-memory PlayerProgress and get back the tier for the next problem.
 */
export function getCurrentDifficulty(progress: PlayerProgress): DifficultyLevel {
  return getDifficultyForSolvedCount(progress.lifetime.totalProblemsSolved);
}

// ---------------------------------------------------------------------------
// Convenience queries
// ---------------------------------------------------------------------------

/**
 * Return the number of problems remaining until the next difficulty tier
 * is unlocked, or `null` if the player is already at the highest tier.
 */
export function problemsUntilNextTier(
  totalProblemsSolved: number,
): number | null {
  const currentLevel = getDifficultyForSolvedCount(totalProblemsSolved);
  const currentIndex = DIFFICULTY_THRESHOLDS.findIndex(
    (t) => t.level === currentLevel,
  );

  if (currentIndex >= DIFFICULTY_THRESHOLDS.length - 1) {
    // Already at the highest tier.
    return null;
  }

  const nextThreshold = DIFFICULTY_THRESHOLDS[currentIndex + 1];
  return nextThreshold.minSolved - totalProblemsSolved;
}

/**
 * Return the next difficulty level, or `null` if the player is already
 * at the highest tier.
 */
export function getNextDifficultyLevel(
  totalProblemsSolved: number,
): DifficultyLevel | null {
  const currentLevel = getDifficultyForSolvedCount(totalProblemsSolved);
  const currentIndex = DIFFICULTY_THRESHOLDS.findIndex(
    (t) => t.level === currentLevel,
  );

  if (currentIndex >= DIFFICULTY_THRESHOLDS.length - 1) {
    return null;
  }

  return DIFFICULTY_THRESHOLDS[currentIndex + 1].level;
}

/**
 * Return all difficulty levels in progression order.
 */
export function getAllDifficultyLevels(): DifficultyLevel[] {
  return DIFFICULTY_THRESHOLDS.map((t) => t.level);
}
