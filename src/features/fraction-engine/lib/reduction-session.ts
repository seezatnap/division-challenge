/**
 * The state machine behind a fraction-reducing problem.
 *
 * The player works down a stack of rows, all of which stay on screen so the
 * whole reduction reads as shown work:
 *
 *   350/1000   [ 2  3  5  7  9  11  none ]      ← choosing
 *   = 70/200   divide the numerator and denominator by 5
 *   = 14/40    divide the numerator and denominator by 5
 *   = 7/20     [ 2  3  5  7  9  11  none ]      ← choosing; "none" finishes
 *
 * Kept pure and UI-free so the rules are testable on their own.
 */

import {
  applyFractionDivisor,
  assertFractionValue,
  getFractionDivisionTargets,
  isFractionFullyReduced,
  isFractionReductionChoiceCorrect,
  NO_COMMON_DIVISOR_CHOICE,
  type FractionDivisorChoice,
  type FractionReductionChoice,
  type FractionValue,
} from "./fraction-reduction";
import type { FractionReductionProblem } from "./problem-generator";

export type FractionReductionPart = "numerator" | "denominator";

export type FractionReductionStatus = "choosing-divisor" | "dividing" | "solved";

export interface FractionReductionRow {
  /** The fraction this row starts from. */
  readonly fraction: FractionValue;
  /** Set once the player picks a divisor that actually works. */
  readonly divisor: FractionDivisorChoice | null;
  /** Answers entered so far for this row's two divisions. */
  readonly numeratorEntry: number | null;
  readonly denominatorEntry: number | null;
}

export interface FractionReductionSessionState {
  readonly problem: FractionReductionProblem;
  readonly rows: readonly FractionReductionRow[];
  readonly status: FractionReductionStatus;
  /** Wrong answers so far, for scoring and for nudging the player. */
  readonly incorrectAttempts: number;
}

export type FractionReductionOutcome =
  | "divisor-accepted"
  | "divisor-rejected"
  | "entry-accepted"
  | "entry-rejected"
  | "row-complete"
  | "problem-solved"
  | "ignored";

export interface FractionReductionResult {
  readonly state: FractionReductionSessionState;
  readonly outcome: FractionReductionOutcome;
}

function createRow(fraction: FractionValue): FractionReductionRow {
  assertFractionValue(fraction);

  return {
    fraction,
    divisor: null,
    numeratorEntry: null,
    denominatorEntry: null,
  };
}

export function createFractionReductionSession(
  problem: FractionReductionProblem,
): FractionReductionSessionState {
  return {
    problem,
    rows: [createRow(problem.fraction)],
    status: "choosing-divisor",
    incorrectAttempts: 0,
  };
}

export function getActiveFractionRow(
  state: FractionReductionSessionState,
): FractionReductionRow {
  const activeRow = state.rows[state.rows.length - 1];
  if (!activeRow) {
    throw new Error("A fraction reduction session always has at least one row.");
  }

  return activeRow;
}

/** The fraction currently being worked on (the bottom row). */
export function getCurrentFraction(state: FractionReductionSessionState): FractionValue {
  return getActiveFractionRow(state).fraction;
}

function replaceActiveRow(
  state: FractionReductionSessionState,
  nextRow: FractionReductionRow,
): readonly FractionReductionRow[] {
  return [...state.rows.slice(0, -1), nextRow];
}

/**
 * Handles a click in the divisor box. "none of the above" finishes the problem
 * when the fraction really is fully reduced, and is wrong otherwise — the same
 * red-shake feedback as picking a divisor that does not divide both halves.
 */
export function applyFractionDivisorChoice(
  state: FractionReductionSessionState,
  choice: FractionReductionChoice,
): FractionReductionResult {
  if (state.status !== "choosing-divisor") {
    return { state, outcome: "ignored" };
  }

  const activeRow = getActiveFractionRow(state);

  if (!isFractionReductionChoiceCorrect(activeRow.fraction, choice)) {
    return {
      state: { ...state, incorrectAttempts: state.incorrectAttempts + 1 },
      outcome: "divisor-rejected",
    };
  }

  if (choice === NO_COMMON_DIVISOR_CHOICE) {
    return {
      state: { ...state, status: "solved" },
      outcome: "problem-solved",
    };
  }

  return {
    state: {
      ...state,
      rows: replaceActiveRow(state, { ...activeRow, divisor: choice }),
      status: "dividing",
    },
    outcome: "divisor-accepted",
  };
}

/**
 * Handles an answer typed into (or returned from the helper modal for) one half
 * of the division. When both halves are right, the reduced fraction is pushed
 * on as a new row and the divisor question starts again.
 */
export function applyFractionReductionEntry(
  state: FractionReductionSessionState,
  part: FractionReductionPart,
  value: number,
): FractionReductionResult {
  if (state.status !== "dividing") {
    return { state, outcome: "ignored" };
  }

  const activeRow = getActiveFractionRow(state);
  if (activeRow.divisor === null) {
    return { state, outcome: "ignored" };
  }

  const targets = getFractionDivisionTargets(activeRow.fraction, activeRow.divisor);
  const expectedValue = part === "numerator" ? targets.numerator : targets.denominator;

  if (!Number.isInteger(value) || value !== expectedValue) {
    return {
      state: { ...state, incorrectAttempts: state.incorrectAttempts + 1 },
      outcome: "entry-rejected",
    };
  }

  const updatedRow: FractionReductionRow = {
    ...activeRow,
    numeratorEntry: part === "numerator" ? value : activeRow.numeratorEntry,
    denominatorEntry: part === "denominator" ? value : activeRow.denominatorEntry,
  };

  const isRowComplete =
    updatedRow.numeratorEntry !== null && updatedRow.denominatorEntry !== null;

  if (!isRowComplete) {
    return {
      state: { ...state, rows: replaceActiveRow(state, updatedRow) },
      outcome: "entry-accepted",
    };
  }

  const reducedFraction = applyFractionDivisor(activeRow.fraction, activeRow.divisor);

  return {
    state: {
      ...state,
      rows: [...replaceActiveRow(state, updatedRow), createRow(reducedFraction)],
      status: "choosing-divisor",
    },
    outcome: "row-complete",
  };
}

/** True once the player has confirmed the fraction cannot be reduced further. */
export function isFractionReductionSolved(state: FractionReductionSessionState): boolean {
  return state.status === "solved";
}

/**
 * Rounds finished so far, and how many the problem needs in total. Drives the
 * progress readout and lets the UI show how much work is left.
 */
export function getFractionReductionProgress(state: FractionReductionSessionState): {
  completedRounds: number;
  totalRounds: number;
  isFinalFractionReached: boolean;
} {
  const completedRounds = state.rows.filter(
    (row) => row.numeratorEntry !== null && row.denominatorEntry !== null,
  ).length;

  return {
    completedRounds,
    totalRounds: state.problem.reductionRounds,
    isFinalFractionReached: isFractionFullyReduced(getCurrentFraction(state)),
  };
}
