import type {
  DivisionProblem,
  DivisionStep,
  DivisionStepKind,
  StepValidationResult,
} from "@/types";

// ─── Step Generation ────────────────────────────────────────

/**
 * Pre-compute the full sequence of long-division steps for a given problem.
 *
 * The algorithm mirrors how you'd work a problem on paper:
 *   1. Collect the minimal leading portion of the dividend that is ≥ divisor.
 *   2. Divide → Multiply → Subtract → (Bring down if digits remain).
 *   3. Repeat until every digit has been processed.
 *
 * The final step is always a "subtract" (yielding the remainder).
 */
export function computeSteps(problem: DivisionProblem): DivisionStep[] {
  const { dividend, divisor } = problem;
  const digits = String(dividend).split("").map(Number);
  const steps: DivisionStep[] = [];

  let currentValue = 0;
  let digitIndex = 0;

  // Build initial "working number" from leading digits until ≥ divisor.
  // The first batch of digits brought together isn't a "bring-down" step —
  // it's the initial setup. We do, however, record bring-down steps for
  // every digit after the very first one that gets incorporated into the
  // initial working number, matching the pencil-and-paper convention where
  // you "bring down" digits one at a time even in the leading group when
  // the first digit alone is smaller than the divisor.
  currentValue = digits[digitIndex];
  digitIndex += 1;

  // Bring down leading digits until we have enough to divide.
  while (currentValue < divisor && digitIndex < digits.length) {
    const d = digits[digitIndex];
    steps.push({
      kind: "bring-down",
      expected: d,
      prompt: `Bring down the ${d} to get ${currentValue * 10 + d}`,
    });
    currentValue = currentValue * 10 + d;
    digitIndex += 1;
  }

  // Main loop: divide → multiply → subtract → bring-down
  while (true) {
    const quotientDigit = Math.floor(currentValue / divisor);
    const product = quotientDigit * divisor;
    const difference = currentValue - product;

    // Divide
    steps.push({
      kind: "divide",
      expected: quotientDigit,
      prompt: `Divide ${currentValue} by ${divisor}`,
    });

    // Multiply
    steps.push({
      kind: "multiply",
      expected: product,
      prompt: `Multiply ${quotientDigit} × ${divisor}`,
    });

    // Subtract
    steps.push({
      kind: "subtract",
      expected: difference,
      prompt: `Subtract ${product} from ${currentValue}`,
    });

    // If there are more digits to bring down, continue the cycle.
    if (digitIndex < digits.length) {
      const d = digits[digitIndex];
      const newValue = difference * 10 + d;
      steps.push({
        kind: "bring-down",
        expected: d,
        prompt: `Bring down the ${d} to get ${newValue}`,
      });
      currentValue = newValue;
      digitIndex += 1;
    } else {
      // No more digits — problem is complete.
      break;
    }
  }

  return steps;
}

// ─── Hint Generation ────────────────────────────────────────

function hintForStep(step: DivisionStep, userAnswer: number): string {
  switch (step.kind) {
    case "divide":
      return `Not quite. ${step.prompt} — how many times does it fit? The answer is ${step.expected}.`;
    case "multiply":
      return `Check your multiplication. ${step.prompt} = ${step.expected}, but you entered ${userAnswer}.`;
    case "subtract":
      return `Check your subtraction. ${step.prompt} = ${step.expected}, but you entered ${userAnswer}.`;
    case "bring-down":
      return `Look at the next digit in the dividend. ${step.prompt}.`;
  }
}

// ─── Engine State ───────────────────────────────────────────

export interface StepEngineState {
  /** The problem being solved. */
  problem: DivisionProblem;
  /** All pre-computed steps for this problem. */
  steps: DivisionStep[];
  /** Index of the step the player must answer next (0-based). */
  currentStepIndex: number;
  /** True once every step has been answered correctly. */
  completed: boolean;
}

/**
 * Create a fresh engine state for a problem.
 */
export function createStepEngine(problem: DivisionProblem): StepEngineState {
  return {
    problem,
    steps: computeSteps(problem),
    currentStepIndex: 0,
    completed: false,
  };
}

/**
 * Return the current step the player should answer, or `null` if the
 * problem is already completed.
 */
export function getCurrentStep(
  state: StepEngineState,
): DivisionStep | null {
  if (state.completed) return null;
  return state.steps[state.currentStepIndex] ?? null;
}

/**
 * Validate the player's answer for the current step.
 *
 * - If correct, advances to the next step (or marks the problem completed).
 * - If incorrect, returns a hint; the step index stays the same.
 *
 * Returns `null` if the problem is already completed.
 */
export function submitAnswer(
  state: StepEngineState,
  userAnswer: number,
): StepValidationResult | null {
  if (state.completed) return null;

  const step = state.steps[state.currentStepIndex];
  if (!step) return null;

  if (userAnswer === step.expected) {
    state.currentStepIndex += 1;
    if (state.currentStepIndex >= state.steps.length) {
      state.completed = true;
    }
    return { correct: true };
  }

  return {
    correct: false,
    hint: hintForStep(step, userAnswer),
  };
}

/**
 * Return a read-only summary of the current engine progress.
 */
export function getProgress(state: StepEngineState): {
  totalSteps: number;
  completedSteps: number;
  currentStepKind: DivisionStepKind | null;
  isComplete: boolean;
} {
  return {
    totalSteps: state.steps.length,
    completedSteps: state.currentStepIndex,
    currentStepKind: state.completed
      ? null
      : (state.steps[state.currentStepIndex]?.kind ?? null),
    isComplete: state.completed,
  };
}
