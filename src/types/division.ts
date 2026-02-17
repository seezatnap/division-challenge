// ---------------------------------------------------------------------------
// Division Problem & Difficulty
// ---------------------------------------------------------------------------

/** Difficulty tiers driven by cumulative solved counts. */
export enum DifficultyLevel {
  /** 2-digit ÷ 1-digit */
  Easy = "easy",
  /** 3-digit ÷ 1-digit */
  Medium = "medium",
  /** 3-digit ÷ 2-digit */
  Hard = "hard",
  /** 4–5 digit ÷ 2–3 digit */
  Expert = "expert",
}

/** A generated division problem. */
export interface DivisionProblem {
  /** The number being divided (inside the bracket). */
  dividend: number;
  /** The number dividing (left of the bracket). */
  divisor: number;
  /** Integer quotient. */
  quotient: number;
  /** Remainder (0 when the division is exact). */
  remainder: number;
  /** Difficulty level that produced this problem. */
  difficulty: DifficultyLevel;
}

// ---------------------------------------------------------------------------
// Long-Division Steps (ordered workflow emitted by the solver)
// ---------------------------------------------------------------------------

/** Discriminant for each phase of the long-division algorithm. */
export enum StepKind {
  /** Player types the next quotient digit above the bracket. */
  QuotientDigit = "quotient_digit",
  /** Player types the product of divisor × quotient digit just entered. */
  Multiply = "multiply",
  /** Player types the difference (working number − product). */
  Subtract = "subtract",
  /** The next dividend digit slides down to form the new working number. */
  BringDown = "bring_down",
}

/** Base fields shared by every step. */
interface StepBase {
  /** Zero-based index of this step in the full workflow. */
  index: number;
  /**
   * Zero-based position within the dividend that this step corresponds to
   * (i.e., which digit column we are currently processing).
   */
  digitPosition: number;
}

/** Player enters the next quotient digit. */
export interface QuotientDigitStep extends StepBase {
  kind: StepKind.QuotientDigit;
  /** The correct quotient digit the player should type. */
  expectedValue: number;
}

/** Player enters the product (divisor × quotient digit). */
export interface MultiplyStep extends StepBase {
  kind: StepKind.Multiply;
  /** The full expected product string (may be multi-digit). */
  expectedValue: number;
}

/** Player enters the subtraction result. */
export interface SubtractStep extends StepBase {
  kind: StepKind.Subtract;
  /** The correct difference. */
  expectedValue: number;
}

/** A dividend digit is brought down to extend the working number. */
export interface BringDownStep extends StepBase {
  kind: StepKind.BringDown;
  /** The digit being brought down. */
  digitBroughtDown: number;
  /** The new working number after the bring-down. */
  newWorkingNumber: number;
}

/** Union of all possible long-division steps. */
export type DivisionStep =
  | QuotientDigitStep
  | MultiplyStep
  | SubtractStep
  | BringDownStep;

/** Complete ordered solution workflow for a problem. */
export interface DivisionSolution {
  problem: DivisionProblem;
  /** Steps in the exact order the player must complete them. */
  steps: DivisionStep[];
}
