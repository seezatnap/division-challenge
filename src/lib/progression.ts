import type { DifficultyTier } from "@/types";
import type { GameState } from "./game-state";

// ─── Constants ──────────────────────────────────────────────

/** Number of problems to solve at a tier before advancing to the next. */
export const PROBLEMS_PER_TIER = 5;

/** Every N lifetime problems solved triggers a dinosaur reward. */
export const REWARD_INTERVAL = 5;

/** Maximum difficulty tier. */
const MAX_TIER: DifficultyTier = 5;

// ─── Result of recording a solve ────────────────────────────

export interface ProgressionResult {
  /** The updated game state after recording the solve. */
  updatedState: GameState;
  /** Whether the difficulty tier increased. */
  didLevelUp: boolean;
  /** Whether a dinosaur reward should be triggered. */
  shouldReward: boolean;
}

// ─── Core progression logic ─────────────────────────────────

/**
 * Compute the difficulty tier that a player should be at based on their
 * total lifetime problems solved. Tiers advance every PROBLEMS_PER_TIER
 * solves, capped at the maximum tier.
 */
export function computeTierForSolvedCount(totalSolved: number): DifficultyTier {
  // tier 1 for 0–4 solved, tier 2 for 5–9 solved, etc.
  const rawTier = Math.floor(totalSolved / PROBLEMS_PER_TIER) + 1;
  return Math.min(rawTier, MAX_TIER) as DifficultyTier;
}

/**
 * Determine whether a reward should be emitted for a given total-solved
 * count. Rewards fire when the total is a positive multiple of REWARD_INTERVAL.
 */
export function shouldEmitReward(totalSolved: number): boolean {
  return totalSolved > 0 && totalSolved % REWARD_INTERVAL === 0;
}

/**
 * Record a completed problem solve and return the updated state along with
 * progression signals (level-up and reward trigger).
 *
 * This is the single entry-point the UI should call when a problem is
 * finished. It handles:
 *   - incrementing session and lifetime solved/attempted counts
 *   - computing the new difficulty tier
 *   - detecting reward milestones
 */
export function recordSolve(state: GameState): ProgressionResult {
  const newSessionSolved = state.sessionProblemsSolved + 1;
  const newSessionAttempted = state.sessionProblemsAttempted + 1;
  const newTotalSolved = state.playerSave.totalProblemsSolved + 1;

  const previousTier = state.playerSave.currentDifficulty;
  const newTier = computeTierForSolvedCount(newTotalSolved);
  const didLevelUp = newTier > previousTier;

  const updatedState: GameState = {
    ...state,
    sessionProblemsSolved: newSessionSolved,
    sessionProblemsAttempted: newSessionAttempted,
    playerSave: {
      ...state.playerSave,
      totalProblemsSolved: newTotalSolved,
      currentDifficulty: newTier,
    },
  };

  return {
    updatedState,
    didLevelUp,
    shouldReward: shouldEmitReward(newTotalSolved),
  };
}
