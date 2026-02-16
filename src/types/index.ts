// ─── Difficulty ───────────────────────────────────────────────

/** Difficulty tiers that govern dividend/divisor digit counts. */
export type DifficultyTier = 1 | 2 | 3 | 4 | 5;

export interface DifficultyConfig {
  tier: DifficultyTier;
  /** Human-readable label, e.g. "2-digit ÷ 1-digit" */
  label: string;
  dividendDigits: { min: number; max: number };
  divisorDigits: { min: number; max: number };
}

// ─── Division Problem ────────────────────────────────────────

/** A generated long-division problem. */
export interface DivisionProblem {
  id: string;
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  difficulty: DifficultyConfig;
}

// ─── Step-by-step Engine ─────────────────────────────────────

/** The four repeating phases of long division. */
export type DivisionStepKind = "divide" | "multiply" | "subtract" | "bring-down";

/** Represents one step the player must complete. */
export interface DivisionStep {
  kind: DivisionStepKind;
  /** The correct numeric answer for this step. */
  expected: number;
  /** A short description of what the player should do, e.g. "Divide 15 by 3". */
  prompt: string;
}

/** The result of validating a player's input for a step. */
export interface StepValidationResult {
  correct: boolean;
  /** Hint shown on incorrect answer. */
  hint?: string;
}

// ─── Unlocked Dinosaur ───────────────────────────────────────

/** A dinosaur the player has earned. */
export interface UnlockedDinosaur {
  /** Dinosaur name from the 100-dino list. */
  name: string;
  /** Path to the generated image in the public directory. */
  imagePath: string;
  /** ISO-8601 date string when the dinosaur was earned. */
  dateEarned: string;
}

// ─── Session History ─────────────────────────────────────────

/** Record of a single play session. */
export interface SessionRecord {
  /** ISO-8601 timestamp when the session started. */
  startedAt: string;
  /** ISO-8601 timestamp when the session ended (undefined if still active). */
  endedAt?: string;
  /** Number of problems solved during this session. */
  problemsSolved: number;
  /** Number of problems attempted (including unsolved) during this session. */
  problemsAttempted: number;
  /** Difficulty tier at session start. */
  startDifficulty: DifficultyTier;
  /** Difficulty tier at session end. */
  endDifficulty: DifficultyTier;
}

// ─── Player Save Schema ──────────────────────────────────────

/** The JSON structure persisted per player in `<player>-save.json`. */
export interface PlayerSave {
  /** Schema version for forward-compatibility. */
  version: 1;
  /** Player's chosen name. */
  playerName: string;
  /** Lifetime total of problems solved across all sessions. */
  totalProblemsSolved: number;
  /** Current difficulty tier. */
  currentDifficulty: DifficultyTier;
  /** Dinosaurs earned by the player. */
  unlockedDinosaurs: UnlockedDinosaur[];
  /** History of all play sessions. */
  sessionHistory: SessionRecord[];
}

// ─── Factory / Defaults ──────────────────────────────────────

/** Create a fresh PlayerSave for a new player. */
export function createNewPlayerSave(playerName: string): PlayerSave {
  return {
    version: 1,
    playerName,
    totalProblemsSolved: 0,
    currentDifficulty: 1,
    unlockedDinosaurs: [],
    sessionHistory: [],
  };
}
