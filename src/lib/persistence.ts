/**
 * Persistence integration module.
 *
 * Orchestrates saving player progress after each problem solve, including
 * building up-to-date session history, processing dinosaur rewards, and
 * writing the save file via the File System Access API.
 */

import type { PlayerSave, SessionRecord } from "@/types";
import type { GameState } from "./game-state";
import { saveGame, isFileSystemAccessSupported } from "./save-file";
import { processReward } from "./reward-orchestrator";
import type { RewardResult } from "./reward-orchestrator";

// ─── Types ──────────────────────────────────────────────────

export interface PersistenceResult {
  /** The updated game state (with reward-updated save if applicable). */
  updatedState: GameState;
  /** The reward result, if a reward was processed. */
  rewardResult?: RewardResult;
  /** Whether the save succeeded. */
  saved: boolean;
  /** Error message if save failed (non-fatal — game continues). */
  saveError?: string;
}

// ─── Session snapshot ───────────────────────────────────────

/**
 * Build a SessionRecord snapshot from the current game state.
 * The `endedAt` timestamp defaults to now.
 */
export function buildSessionRecord(
  state: GameState,
  now?: string,
): SessionRecord {
  return {
    startedAt: state.sessionStartedAt,
    endedAt: now ?? new Date().toISOString(),
    problemsSolved: state.sessionProblemsSolved,
    problemsAttempted: state.sessionProblemsAttempted,
    startDifficulty: state.sessionStartDifficulty,
    endDifficulty: state.playerSave.currentDifficulty,
  };
}

/**
 * Produce an updated PlayerSave with the current session appended to or
 * replacing the last entry in sessionHistory.
 *
 * On the first save of a session a new SessionRecord is appended. On
 * subsequent saves the last entry (which is the active session) is replaced
 * with an updated snapshot so the history doesn't balloon with duplicates.
 */
export function updateSaveWithSession(
  playerSave: PlayerSave,
  session: SessionRecord,
  isFirstSave: boolean,
): PlayerSave {
  if (isFirstSave) {
    return {
      ...playerSave,
      sessionHistory: [...playerSave.sessionHistory, session],
    };
  }

  // Replace the last session record (the active one)
  const history = [...playerSave.sessionHistory];
  history[history.length - 1] = session;
  return { ...playerSave, sessionHistory: history };
}

// ─── Persistence orchestrator ───────────────────────────────

/**
 * Persist the current game state after a problem solve.
 *
 * Steps:
 * 1. If `shouldReward` is true, process the reward (Gemini generation) and
 *    merge the updated save (with new unlocked dinosaur) into state.
 * 2. Build a session record snapshot and merge it into the save's history.
 * 3. Write the save file via the File System Access API.
 *
 * Save failures are non-fatal — the game continues in memory. The caller
 * receives a `saveError` string it can display to the user.
 *
 * @param state - The game state after `recordSolve` has been applied.
 * @param shouldReward - Whether a dinosaur reward should be processed.
 * @param isFirstSaveOfSession - True if this is the first persist call for
 *   the current session (appends a new SessionRecord rather than updating).
 * @param deps - Injectable dependencies for testability.
 */
export async function persistAfterSolve(
  state: GameState,
  shouldReward: boolean,
  isFirstSaveOfSession: boolean,
  deps: {
    saveFn?: typeof saveGame;
    rewardFn?: typeof processReward;
    now?: string;
    supportedFn?: typeof isFileSystemAccessSupported;
  } = {},
): Promise<PersistenceResult> {
  const {
    saveFn = saveGame,
    rewardFn = processReward,
    now,
    supportedFn = isFileSystemAccessSupported,
  } = deps;

  let currentSave = state.playerSave;
  let rewardResult: RewardResult | undefined;

  // 1. Process reward if triggered
  if (shouldReward) {
    rewardResult = await rewardFn(currentSave);
    if (rewardResult.status === "success") {
      currentSave = rewardResult.updatedSave;
    }
  }

  // 2. Build session snapshot and merge into save
  const workingState: GameState = { ...state, playerSave: currentSave };
  const session = buildSessionRecord(workingState, now);
  currentSave = updateSaveWithSession(currentSave, session, isFirstSaveOfSession);

  // 3. Build the final updated state
  const updatedState: GameState = { ...state, playerSave: currentSave };

  // 4. Write save file (non-fatal on failure)
  let saved = false;
  let saveError: string | undefined;

  if (supportedFn()) {
    const result = await saveFn(currentSave);
    if (result.ok) {
      saved = true;
    } else {
      saveError = result.error;
    }
  }

  return { updatedState, rewardResult, saved, saveError };
}
