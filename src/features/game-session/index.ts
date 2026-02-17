/**
 * Game Session
 *
 * Responsible for:
 * - Creating new game sessions
 * - Restoring sessions from save files
 * - Player name validation
 * - Save filename derivation
 */

export {
  createNewSession,
  restoreSessionFromSave,
  validatePlayerName,
  saveFileNameFromPlayer,
} from "./session-init";

export { type GameSession, type GameStartPhase } from "@/types";

export { GameStartFlow } from "./GameStartFlow";
export type { GameStartFlowProps } from "./GameStartFlow";
