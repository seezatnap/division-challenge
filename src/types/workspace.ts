import type { StepKind } from "./division";

// ---------------------------------------------------------------------------
// Active Input Target — drives the glow system
// ---------------------------------------------------------------------------

/** Represents the single glowing position in the workspace. */
export interface ActiveInputTarget {
  /** Which step kind the player is currently on. */
  kind: StepKind;
  /** Zero-based index of the current step in the solution workflow. */
  stepIndex: number;
  /**
   * Zero-based digit-column position within the workspace grid
   * (used by the renderer to position the glow).
   */
  digitPosition: number;
  /**
   * Row within the workspace grid where the input appears.
   * - Quotient row = 0
   * - Work rows increase downward.
   */
  row: number;
  /** Column within the workspace grid. */
  col: number;
}

/** Result of validating a player's input against the expected value. */
export interface InputValidationResult {
  /** Whether the entered value was correct. */
  correct: boolean;
  /** The value the player entered. */
  enteredValue: number;
  /** The value that was expected. */
  expectedValue: number;
  /** The next target to glow (null when the problem is complete). */
  nextTarget: ActiveInputTarget | null;
}
