/**
 * Layout Engine for the Bus-Stop Long-Division Renderer
 *
 * Converts a DivisionSolution into a grid of positioned cells for rendering
 * the classic "bus stop" long-division notation.
 *
 * Grid coordinate system:
 * - Columns map to digit positions in the dividend (0 = leftmost dividend digit)
 * - Rows grow downward: quotient (0), dividend (1), then work rows (2+)
 * - The divisor is rendered separately, to the left of the bracket.
 */

import type {
  DivisionSolution,
  DivisionStep,
  QuotientDigitStep,
  MultiplyStep,
  SubtractStep,
  BringDownStep,
} from "@/types";
import { StepKind } from "@/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single positioned item in the long-division grid. */
export interface GridCell {
  /** The text content to display (a digit or part of a number). */
  value: string;
  /** Column index (0 = leftmost dividend digit column). */
  col: number;
  /** Row index in the grid. */
  row: number;
  /** Visual role of this cell for styling. */
  role: CellRole;
  /** Index of the originating step (if any). */
  stepIndex?: number;
}

export type CellRole =
  | "quotient"
  | "dividend"
  | "divisor"
  | "multiply"
  | "subtract"
  | "bring-down"
  | "remainder-label"
  | "separator";

/** A horizontal line (separator) between work rows. */
export interface SeparatorLine {
  /** Row just below which the separator is drawn. */
  afterRow: number;
  /** Start column (inclusive). */
  colStart: number;
  /** End column (inclusive). */
  colEnd: number;
}

/** Complete layout for the renderer. */
export interface WorkspaceLayout {
  /** All cells to render. */
  cells: GridCell[];
  /** Horizontal separator lines. */
  separators: SeparatorLine[];
  /** Number of columns (digit positions) in the grid. */
  totalCols: number;
  /** Number of rows in the grid. */
  totalRows: number;
  /** The divisor string, rendered to the left of the bracket. */
  divisorText: string;
  /** Whether the problem has a non-zero remainder. */
  hasRemainder: boolean;
}

// ---------------------------------------------------------------------------
// Layout computation
// ---------------------------------------------------------------------------

/**
 * Compute the workspace layout from a solved division problem.
 *
 * The layout is driven by the steps array from the solver. Steps that have
 * been completed (i.e. index < completedUpTo) get their values placed as
 * cells; future steps are omitted so the renderer can show incremental
 * progress.
 *
 * @param solution The complete DivisionSolution from the solver.
 * @param completedUpTo Steps with index < completedUpTo are shown.
 *   Pass `solution.steps.length` to show the full worked solution.
 *   Pass `0` to show only the initial problem (divisor, dividend, bracket).
 */
export function computeLayout(
  solution: DivisionSolution,
  completedUpTo: number = solution.steps.length,
): WorkspaceLayout {
  const { problem, steps } = solution;
  const dividendDigits = String(problem.dividend).split("");
  const totalCols = dividendDigits.length;
  const cells: GridCell[] = [];
  const separators: SeparatorLine[] = [];

  // ── Row 0: Quotient ──────────────────────────────────────────────────
  const quotientRow = 0;

  // ── Row 1: Dividend ──────────────────────────────────────────────────
  const dividendRow = 1;
  for (let i = 0; i < dividendDigits.length; i++) {
    cells.push({
      value: dividendDigits[i],
      col: i,
      row: dividendRow,
      role: "dividend",
    });
  }

  // ── Work rows (rows 2+) ──────────────────────────────────────────────
  // Walk through completed steps, assigning rows.
  // Each "round" of Q-M-S(-BD) produces:
  //   - Multiply result → a work row
  //   - Separator line
  //   - Subtract result → a work row (may share with next bring-down)
  let currentWorkRow = 2;

  // Group steps into rounds: Q, M, S, optional BD
  const rounds = groupStepsIntoRounds(steps);

  for (const round of rounds) {
    const qStep = round.quotient;
    const mStep = round.multiply;
    const sStep = round.subtract;
    const bdStep = round.bringDown;

    // Only show steps that are completed
    if (qStep.index < completedUpTo) {
      cells.push({
        value: String(qStep.expectedValue),
        col: qStep.digitPosition,
        row: quotientRow,
        role: "quotient",
        stepIndex: qStep.index,
      });
    }

    if (mStep.index < completedUpTo) {
      // Place multiply digits right-aligned to the current digit position
      const mStr = String(mStep.expectedValue);
      const rightCol = mStep.digitPosition;
      for (let i = 0; i < mStr.length; i++) {
        const col = rightCol - (mStr.length - 1 - i);
        if (col >= 0) {
          cells.push({
            value: mStr[i],
            col,
            row: currentWorkRow,
            role: "multiply",
            stepIndex: mStep.index,
          });
        }
      }
      currentWorkRow++;
    }

    // Separator after multiply row
    if (mStep.index < completedUpTo) {
      const mStr = String(mStep.expectedValue);
      const rightCol = mStep.digitPosition;
      const leftCol = Math.max(0, rightCol - mStr.length + 1);
      // Extend separator to cover whichever is wider: multiply or subtract
      const sStr = sStep.index < completedUpTo ? String(sStep.expectedValue) : "";
      const sLeftCol = sStr ? Math.max(0, sStep.digitPosition - sStr.length + 1) : leftCol;
      const sepLeft = Math.min(leftCol, sLeftCol);
      const sepRight = Math.max(rightCol, sStep.digitPosition);
      separators.push({
        afterRow: currentWorkRow - 1,
        colStart: sepLeft,
        colEnd: sepRight,
      });
    }

    if (sStep.index < completedUpTo) {
      // Place subtract result right-aligned to the digit position
      const sStr = String(sStep.expectedValue);
      const rightCol = sStep.digitPosition;

      // If there's a bring-down, show the subtract+bring-down combined
      if (bdStep && bdStep.index < completedUpTo) {
        // Show the combined number: subtract result digits + brought-down digit
        const combinedStr = String(bdStep.newWorkingNumber);
        const combinedRightCol = bdStep.digitPosition;
        for (let i = 0; i < combinedStr.length; i++) {
          const col = combinedRightCol - (combinedStr.length - 1 - i);
          if (col >= 0) {
            // Mark the last digit as bring-down, rest as subtract
            const isBroughtDown = i === combinedStr.length - 1;
            cells.push({
              value: combinedStr[i],
              col,
              row: currentWorkRow,
              role: isBroughtDown ? "bring-down" : "subtract",
              stepIndex: isBroughtDown ? bdStep.index : sStep.index,
            });
          }
        }
      } else {
        // Final subtract (no bring-down follows) — show just the difference
        for (let i = 0; i < sStr.length; i++) {
          const col = rightCol - (sStr.length - 1 - i);
          if (col >= 0) {
            cells.push({
              value: sStr[i],
              col,
              row: currentWorkRow,
              role: "subtract",
              stepIndex: sStep.index,
            });
          }
        }

        // If this is the final remainder and it's non-zero, add "R" label
        if (
          problem.remainder > 0 &&
          !bdStep &&
          sStep.index === steps[steps.length - 1].index
        ) {
          cells.push({
            value: `R${problem.remainder}`,
            col: rightCol + 1,
            row: currentWorkRow,
            role: "remainder-label",
            stepIndex: sStep.index,
          });
        }
      }

      currentWorkRow++;
    } else if (bdStep && bdStep.index < completedUpTo) {
      // Edge case: bring-down shown but subtract not yet completed
      // shouldn't happen per solver ordering but handle gracefully
      currentWorkRow++;
    }
  }

  return {
    cells,
    separators,
    totalCols,
    totalRows: currentWorkRow,
    divisorText: String(problem.divisor),
    hasRemainder: problem.remainder > 0,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface StepRound {
  quotient: QuotientDigitStep;
  multiply: MultiplyStep;
  subtract: SubtractStep;
  bringDown?: BringDownStep;
}

/** Group the flat steps array into per-digit rounds of Q-M-S(-BD). */
function groupStepsIntoRounds(steps: DivisionStep[]): StepRound[] {
  const rounds: StepRound[] = [];
  let i = 0;
  while (i < steps.length) {
    const q = steps[i] as QuotientDigitStep;
    const m = steps[i + 1] as MultiplyStep;
    const s = steps[i + 2] as SubtractStep;
    const bd =
      i + 3 < steps.length && steps[i + 3].kind === StepKind.BringDown
        ? (steps[i + 3] as BringDownStep)
        : undefined;
    rounds.push({ quotient: q, multiply: m, subtract: s, bringDown: bd });
    i += bd ? 4 : 3;
  }
  return rounds;
}
