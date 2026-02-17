import type { PlayerProgress } from "./progress";
import type { UnlockedReward } from "./rewards";
import type { SessionRecord } from "./save-file";

// ---------------------------------------------------------------------------
// In-Memory Game Session
// ---------------------------------------------------------------------------

/** The current phase of the game-start flow. */
export type GameStartPhase =
  | "name-entry"
  | "load-or-new"
  | "ready";

/**
 * In-memory game session created after the player enters their name
 * and either starts a new game or loads an existing save.
 */
export interface GameSession {
  /** Player display name. */
  playerName: string;
  /** Whether this session was restored from a save file. */
  loadedFromSave: boolean;
  /** Combined session + lifetime progress. */
  progress: PlayerProgress;
  /** Dinosaur rewards unlocked so far. */
  unlockedRewards: UnlockedReward[];
  /** Session history entries carried forward from a loaded save file. */
  priorSessionHistory: SessionRecord[];
}
