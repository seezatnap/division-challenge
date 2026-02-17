import type {
  DivisionProblem,
  DivisionSolution,
  DivisionStep,
} from "@/types";
import { StepKind } from "@/types";

/**
 * Solve a long-division problem and emit the exact ordered workflow of steps
 * that a student would follow using the classic "bus stop" method.
 *
 * The algorithm considers enough leading digits of the dividend so that the
 * initial working number is >= the divisor. After that, each iteration produces:
 *   1. QuotientDigit – floor(workingNumber / divisor)
 *   2. Multiply      – divisor * quotient digit
 *   3. Subtract      – workingNumber - product
 *   4. BringDown     – append next dividend digit (if any remain)
 *
 * The solver handles:
 *   - Multi-digit divisors (initial working number spans multiple digits)
 *   - Quotient digits of 0 (when working number < divisor after a bring-down)
 *   - Problems with and without remainders
 */
export function solveDivisionProblem(
  problem: DivisionProblem,
): DivisionSolution {
  const { dividend, divisor } = problem;
  const digits = String(dividend).split("").map(Number);
  const steps: DivisionStep[] = [];
  let stepIndex = 0;

  // Build the initial working number by consuming enough leading digits
  // so that workingNumber >= divisor. For a 1-digit divisor this is usually
  // the first digit; for a 2-digit divisor we may need the first two, etc.
  let workingNumber = 0;
  let pos = 0;

  while (pos < digits.length && workingNumber < divisor) {
    workingNumber = workingNumber * 10 + digits[pos];
    pos++;
  }

  // `pos` now points to the digit AFTER the initial working number.
  // `digitPosition` tracks which dividend digit column we're processing.
  // The first quotient digit corresponds to position `pos - 1`.
  let digitPosition = pos - 1;

  // Process the initial working number and every subsequent bring-down.
  for (;;) {
    // 1. Quotient digit
    const qDigit = Math.floor(workingNumber / divisor);
    steps.push({
      kind: StepKind.QuotientDigit,
      index: stepIndex++,
      digitPosition,
      expectedValue: qDigit,
    });

    // 2. Multiply
    const product = divisor * qDigit;
    steps.push({
      kind: StepKind.Multiply,
      index: stepIndex++,
      digitPosition,
      expectedValue: product,
    });

    // 3. Subtract
    const difference = workingNumber - product;
    steps.push({
      kind: StepKind.Subtract,
      index: stepIndex++,
      digitPosition,
      expectedValue: difference,
    });

    // 4. Bring down (if there are remaining digits)
    if (pos < digits.length) {
      const broughtDown = digits[pos];
      const newWorking = difference * 10 + broughtDown;
      steps.push({
        kind: StepKind.BringDown,
        index: stepIndex++,
        digitPosition: pos,
        digitBroughtDown: broughtDown,
        newWorkingNumber: newWorking,
      });

      workingNumber = newWorking;
      digitPosition = pos;
      pos++;
    } else {
      break;
    }
  }

  return { problem, steps };
}
