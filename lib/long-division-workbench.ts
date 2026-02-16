import type { DivisionDifficultyId, DivisionProblem } from "./domain";
import { generateDivisionProblem } from "./division-problem-generator";
import {
  createLongDivisionStepState,
  getCurrentLongDivisionStep,
  type LongDivisionCurrentStep,
  type LongDivisionStepId,
  type LongDivisionStepState,
  type LongDivisionStepValidationResult,
  validateLongDivisionStepInput,
} from "./long-division-step-engine";

export type LongDivisionWorkbenchFeedbackTone =
  | "idle"
  | "success"
  | "error"
  | "complete";

export interface LongDivisionWorkbenchFeedback {
  tone: LongDivisionWorkbenchFeedbackTone;
  message: string;
}

export interface LongDivisionWorkbenchAttempt {
  step: LongDivisionStepId;
  cycleIndex: number;
  inputValue: number | null;
  expectedValue: number;
  isCorrect: boolean;
  hint: string | null;
}

export interface LongDivisionWorkbenchState {
  difficulty: DivisionDifficultyId;
  solvedCount: number;
  problem: DivisionProblem;
  stepState: LongDivisionStepState;
  attempts: readonly LongDivisionWorkbenchAttempt[];
  pendingAdvance: boolean;
  feedback: LongDivisionWorkbenchFeedback;
}

export interface CreateLongDivisionWorkbenchStateOptions {
  difficulty: DivisionDifficultyId;
  solvedCount?: number;
  random?: () => number;
  createdAt?: Date | string;
}

export interface AdvanceLongDivisionWorkbenchProblemOptions {
  random?: () => number;
  createdAt?: Date | string;
}

export interface LongDivisionWorkbenchSubmissionResult {
  state: LongDivisionWorkbenchState;
  validation: LongDivisionStepValidationResult;
}

const STEP_LABELS: Record<LongDivisionStepId, string> = {
  divide: "Divide",
  multiply: "Multiply",
  subtract: "Subtract",
  "bring-down": "Bring Down",
};

function normalizeSolvedCount(solvedCount: number | undefined): number {
  if (typeof solvedCount !== "number") {
    return 0;
  }

  if (!Number.isInteger(solvedCount) || solvedCount < 0) {
    return 0;
  }

  return solvedCount;
}

function buildInitialFeedback(
  stepState: LongDivisionStepState,
): LongDivisionWorkbenchFeedback {
  const currentStep = getCurrentLongDivisionStep(stepState);

  if (currentStep === null) {
    return {
      tone: "complete",
      message: "This problem is already complete. Load another challenge.",
    };
  }

  return {
    tone: "idle",
    message: buildLongDivisionStepPrompt(currentStep),
  };
}

function buildStepSuccessFeedback(
  nextStep: LongDivisionCurrentStep | null,
): LongDivisionWorkbenchFeedback {
  if (nextStep === null) {
    return {
      tone: "success",
      message: "Great step. Keep going.",
    };
  }

  return {
    tone: "success",
    message: `Nice work. ${buildLongDivisionStepPrompt(nextStep)}`,
  };
}

function buildCompletionFeedback(problem: DivisionProblem): LongDivisionWorkbenchFeedback {
  const remainderText = problem.remainder > 0
    ? ` remainder ${problem.remainder}`
    : "";

  return {
    tone: "complete",
    message:
      `Roarsome! ${problem.dividend} ÷ ${problem.divisor} = ${problem.quotient}${remainderText}. Next problem loading...`,
  };
}

export function getLongDivisionStepLabel(step: LongDivisionStepId): string {
  return STEP_LABELS[step];
}

export function buildLongDivisionStepPrompt(step: LongDivisionCurrentStep): string {
  if (step.step === "divide") {
    return `Divide ${step.partialDividend} by ${step.divisor}. Enter the next quotient digit.`;
  }

  if (step.step === "multiply") {
    return `Multiply ${step.divisor} by the quotient digit you chose for ${step.partialDividend}.`;
  }

  if (step.step === "subtract") {
    return `Subtract your product from ${step.partialDividend}.`;
  }

  if (step.broughtDownDigit === null) {
    return "No digit remains to bring down.";
  }

  return `Bring down ${step.broughtDownDigit} next to ${step.difference}, then enter the new partial dividend.`;
}

export function createLongDivisionWorkbenchStateFromProblem(
  problem: DivisionProblem,
  solvedCount: number = 0,
): LongDivisionWorkbenchState {
  const stepState = createLongDivisionStepState(problem);

  return {
    difficulty: problem.difficulty,
    solvedCount: normalizeSolvedCount(solvedCount),
    problem,
    stepState,
    attempts: [],
    pendingAdvance: false,
    feedback: buildInitialFeedback(stepState),
  };
}

export function createLongDivisionWorkbenchState(
  options: CreateLongDivisionWorkbenchStateOptions,
): LongDivisionWorkbenchState {
  const problem = generateDivisionProblem({
    difficulty: options.difficulty,
    random: options.random,
    createdAt: options.createdAt,
  });

  return createLongDivisionWorkbenchStateFromProblem(problem, options.solvedCount);
}

export function submitLongDivisionWorkbenchStepInput(
  state: LongDivisionWorkbenchState,
  input: number | string,
): LongDivisionWorkbenchSubmissionResult {
  const currentStep = getCurrentLongDivisionStep(state.stepState);
  const validation = validateLongDivisionStepInput(state.stepState, input);

  if (validation.step === null || validation.expectedValue === null) {
    return {
      state: {
        ...state,
        feedback: {
          tone: state.pendingAdvance ? "complete" : "error",
          message: validation.hint ?? "This problem is already complete.",
        },
      },
      validation,
    };
  }

  const attempt: LongDivisionWorkbenchAttempt = {
    step: validation.step,
    cycleIndex: currentStep?.cycleIndex ?? 0,
    inputValue: validation.inputValue,
    expectedValue: validation.expectedValue,
    isCorrect: validation.isCorrect,
    hint: validation.hint,
  };
  const nextAttempts = [...state.attempts, attempt];

  if (!validation.isCorrect) {
    return {
      state: {
        ...state,
        attempts: nextAttempts,
        pendingAdvance: false,
        feedback: {
          tone: "error",
          message: validation.hint ?? `Try ${getLongDivisionStepLabel(validation.step)} again.`,
        },
      },
      validation,
    };
  }

  if (validation.isComplete) {
    return {
      state: {
        ...state,
        solvedCount: state.solvedCount + 1,
        stepState: validation.state,
        attempts: nextAttempts,
        pendingAdvance: true,
        feedback: buildCompletionFeedback(state.problem),
      },
      validation,
    };
  }

  return {
    state: {
      ...state,
      stepState: validation.state,
      attempts: nextAttempts,
      pendingAdvance: false,
      feedback: buildStepSuccessFeedback(
        getCurrentLongDivisionStep(validation.state),
      ),
    },
    validation,
  };
}

export function advanceLongDivisionWorkbenchProblem(
  state: LongDivisionWorkbenchState,
  options: AdvanceLongDivisionWorkbenchProblemOptions = {},
): LongDivisionWorkbenchState {
  const nextProblem = generateDivisionProblem({
    difficulty: state.difficulty,
    random: options.random,
    createdAt: options.createdAt,
  });

  return createLongDivisionWorkbenchStateFromProblem(nextProblem, state.solvedCount);
}
