import type {
  DivisionSolution,
  DivisionStep,
} from "@/types";
import { StepKind } from "@/types";

// ---------------------------------------------------------------------------
// Hint hook types — returned for dino-themed feedback
// ---------------------------------------------------------------------------

/** Context provided to hint hooks so UI can render dino-themed feedback. */
export interface StepHintContext {
  /** The step kind the player is working on. */
  stepKind: StepKind;
  /** The value the player entered. */
  enteredValue: number;
  /** The value that was expected. */
  expectedValue: number;
  /** Zero-based count of consecutive incorrect attempts on this step. */
  attemptNumber: number;
  /** A hint message appropriate for the step kind and attempt count. */
  hintMessage: string;
}

/** Result of validating a player's answer for a single step. */
export interface StepValidationResult {
  /** Whether the entered value was correct. */
  correct: boolean;
  /** The value the player entered. */
  enteredValue: number;
  /** The value that was expected. */
  expectedValue: number;
  /** The step that was validated. */
  step: DivisionStep;
  /**
   * Index of the next step to work on.
   * - On correct: advances to the next step index (or null if problem is complete).
   * - On incorrect: stays on the same step index.
   */
  nextStepIndex: number | null;
  /** Whether the problem is now complete (all steps answered correctly). */
  isComplete: boolean;
  /**
   * Hint context for incorrect answers. Null when the answer is correct.
   * UI consumers use this to render dino-themed feedback.
   */
  hint: StepHintContext | null;
}

// ---------------------------------------------------------------------------
// Hint message generation
// ---------------------------------------------------------------------------

const QUOTIENT_HINTS = [
  "The T-Rex says: how many times does the divisor fit?",
  "Think like a raptor — divide carefully!",
  "A Triceratops would try dividing again...",
];

const MULTIPLY_HINTS = [
  "The T-Rex says: try multiplying again!",
  "Even a Velociraptor double-checks its multiplication!",
  "Multiply the divisor by the quotient digit you just found.",
];

const SUBTRACT_HINTS = [
  "Uh oh, the raptor got that one... try subtracting again!",
  "A Brachiosaurus takes it slow — subtract carefully!",
  "Check your subtraction, paleontologist!",
];

function getHintMessage(stepKind: StepKind, attemptNumber: number): string {
  let hints: string[];
  switch (stepKind) {
    case StepKind.QuotientDigit:
      hints = QUOTIENT_HINTS;
      break;
    case StepKind.Multiply:
      hints = MULTIPLY_HINTS;
      break;
    case StepKind.Subtract:
      hints = SUBTRACT_HINTS;
      break;
    case StepKind.BringDown:
      // BringDown steps are typically automatic, but if validated:
      hints = ["Watch the digit slide down — which one comes next?"];
      break;
  }
  // Cycle through hints based on attempt number
  return hints[attemptNumber % hints.length];
}

// ---------------------------------------------------------------------------
// Step Validator
// ---------------------------------------------------------------------------

/**
 * Validate a player's answer for a specific step in the solution workflow.
 *
 * - Correct answers advance to the next step (or mark problem complete).
 * - Incorrect answers keep the focus on the same step and return hint context.
 */
export function validateStep(
  solution: DivisionSolution,
  stepIndex: number,
  enteredValue: number,
  attemptNumber: number = 0,
): StepValidationResult {
  if (stepIndex < 0 || stepIndex >= solution.steps.length) {
    throw new RangeError(
      `stepIndex ${stepIndex} is out of bounds (0..${solution.steps.length - 1})`,
    );
  }

  const step = solution.steps[stepIndex];

  // BringDown steps don't have an expectedValue on the base type —
  // they use newWorkingNumber. For validation purposes, if a BringDown
  // step is being validated, we check against the digitBroughtDown.
  const expectedValue =
    step.kind === StepKind.BringDown ? step.digitBroughtDown : step.expectedValue;

  const correct = enteredValue === expectedValue;

  const isLastStep = stepIndex === solution.steps.length - 1;
  let nextStepIndex: number | null;

  if (correct) {
    nextStepIndex = isLastStep ? null : stepIndex + 1;
  } else {
    // Incorrect: stay on the same step
    nextStepIndex = stepIndex;
  }

  const isComplete = correct && isLastStep;

  const hint: StepHintContext | null = correct
    ? null
    : {
        stepKind: step.kind,
        enteredValue,
        expectedValue,
        attemptNumber,
        hintMessage: getHintMessage(step.kind, attemptNumber),
      };

  return {
    correct,
    enteredValue,
    expectedValue,
    step,
    nextStepIndex,
    isComplete,
    hint,
  };
}

// ---------------------------------------------------------------------------
// Stateful Step Validator (tracks attempt counts per step)
// ---------------------------------------------------------------------------

/** Tracks validation state across an entire problem-solving session. */
export interface StepValidatorState {
  /** The solution being worked through. */
  solution: DivisionSolution;
  /** Current step index the player is on. */
  currentStepIndex: number;
  /** Number of consecutive incorrect attempts on the current step. */
  currentAttempts: number;
  /** Whether the problem is complete. */
  isComplete: boolean;
  /** Total number of incorrect attempts across all steps. */
  totalIncorrectAttempts: number;
}

/**
 * Create a stateful step validator that tracks progress through a solution.
 *
 * Returns an object with methods to:
 * - `submit(value)`: validate an answer for the current step
 * - `getState()`: inspect current validator state
 * - `reset()`: restart from the beginning
 */
export function createStepValidator(solution: DivisionSolution) {
  let currentStepIndex = 0;
  let currentAttempts = 0;
  let isComplete = false;
  let totalIncorrectAttempts = 0;

  function getState(): StepValidatorState {
    return {
      solution,
      currentStepIndex,
      currentAttempts,
      isComplete,
      totalIncorrectAttempts,
    };
  }

  function submit(enteredValue: number): StepValidationResult {
    if (isComplete) {
      throw new Error("Problem is already complete. Call reset() to start over.");
    }

    const result = validateStep(
      solution,
      currentStepIndex,
      enteredValue,
      currentAttempts,
    );

    if (result.correct) {
      currentAttempts = 0;
      if (result.nextStepIndex !== null) {
        currentStepIndex = result.nextStepIndex;
      }
      if (result.isComplete) {
        isComplete = true;
      }
    } else {
      currentAttempts++;
      totalIncorrectAttempts++;
    }

    return result;
  }

  function reset(): void {
    currentStepIndex = 0;
    currentAttempts = 0;
    isComplete = false;
    totalIncorrectAttempts = 0;
  }

  /**
   * Get the current step that needs to be answered.
   * Returns null if the problem is complete.
   */
  function getCurrentStep(): DivisionStep | null {
    if (isComplete) return null;
    return solution.steps[currentStepIndex];
  }

  return { submit, getState, reset, getCurrentStep };
}

/** The return type of createStepValidator. */
export type StepValidator = ReturnType<typeof createStepValidator>;
