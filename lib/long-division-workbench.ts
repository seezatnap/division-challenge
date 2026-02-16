import {
  DIVISION_DIFFICULTIES,
  type DivisionDifficultyId,
  type DivisionProblem,
} from "./domain";
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

export interface LongDivisionWorkbenchRewardTrigger {
  rewardIndex: number;
  lifetimeSolvedCount: number;
}

export interface LongDivisionWorkbenchState {
  difficulty: DivisionDifficultyId;
  solvedCount: number;
  lifetimeSolvedCount: number;
  problem: DivisionProblem;
  stepState: LongDivisionStepState;
  attempts: readonly LongDivisionWorkbenchAttempt[];
  pendingAdvance: boolean;
  pendingRewardTrigger: LongDivisionWorkbenchRewardTrigger | null;
  feedback: LongDivisionWorkbenchFeedback;
}

export interface CreateLongDivisionWorkbenchStateOptions {
  difficulty: DivisionDifficultyId;
  solvedCount?: number;
  lifetimeSolvedCount?: number;
  random?: () => number;
  createdAt?: Date | string;
}

export interface CreateLongDivisionWorkbenchStateFromProblemOptions {
  solvedCount?: number;
  lifetimeSolvedCount?: number;
}

export interface AdvanceLongDivisionWorkbenchProblemOptions {
  random?: () => number;
  createdAt?: Date | string;
}

export interface LongDivisionWorkbenchSubmissionResult {
  state: LongDivisionWorkbenchState;
  validation: LongDivisionStepValidationResult;
  rewardTrigger: LongDivisionWorkbenchRewardTrigger | null;
}

export const LONG_DIVISION_REWARD_INTERVAL = 5;
export const LONG_DIVISION_DIFFICULTY_ADVANCE_INTERVAL = 5;

const STEP_LABELS: Record<LongDivisionStepId, string> = {
  divide: "Divide",
  multiply: "Multiply",
  subtract: "Subtract",
  "bring-down": "Bring Down",
};

const STEP_SUCCESS_MESSAGES = [
  "Roarsome step!",
  "Dino-mite move!",
  "Jurassic genius!",
  "That lands like a T. rex stomp!",
] as const;

const STEP_ERROR_MESSAGES = [
  "Uh oh, the raptor nudged that answer.",
  "A sneaky compy stole a digit there.",
  "Close, but that fossil does not fit.",
  "Paddock alert: tighten that math move.",
] as const;

function selectFeedbackMessageVariant(
  messages: readonly string[],
  indexSeed: number,
): string {
  if (messages.length === 0) {
    return "";
  }

  const normalizedIndex = Number.isInteger(indexSeed) && indexSeed >= 0
    ? indexSeed % messages.length
    : 0;

  return messages[normalizedIndex] ?? messages[0];
}

function normalizeSolvedCount(solvedCount: number | undefined): number {
  if (typeof solvedCount !== "number") {
    return 0;
  }

  if (!Number.isInteger(solvedCount) || solvedCount < 0) {
    return 0;
  }

  return solvedCount;
}

function getDifficultyTierIndex(difficulty: DivisionDifficultyId): number {
  const tierIndex = DIVISION_DIFFICULTIES.findIndex(
    (candidate) => candidate.id === difficulty,
  );

  if (tierIndex < 0) {
    throw new Error(`Unknown division difficulty "${difficulty}".`);
  }

  return tierIndex;
}

function getDifficultyByTierIndex(tierIndex: number): DivisionDifficultyId {
  if (!Number.isInteger(tierIndex)) {
    throw new Error("Difficulty tier index must be an integer.");
  }

  if (tierIndex < 0 || tierIndex >= DIVISION_DIFFICULTIES.length) {
    throw new Error(
      `Difficulty tier index must be between 0 and ${DIVISION_DIFFICULTIES.length - 1}.`,
    );
  }

  return DIVISION_DIFFICULTIES[tierIndex].id;
}

function buildRewardTrigger(
  lifetimeSolvedCount: number,
): LongDivisionWorkbenchRewardTrigger | null {
  if (
    lifetimeSolvedCount === 0 ||
    lifetimeSolvedCount % LONG_DIVISION_REWARD_INTERVAL !== 0
  ) {
    return null;
  }

  return {
    rewardIndex: (lifetimeSolvedCount / LONG_DIVISION_REWARD_INTERVAL) - 1,
    lifetimeSolvedCount,
  };
}

export function getProgressionDifficulty(
  lifetimeSolvedCount: number,
): DivisionDifficultyId {
  const normalizedLifetimeSolvedCount = normalizeSolvedCount(lifetimeSolvedCount);
  const progressionTierIndex = Math.min(
    Math.floor(
      normalizedLifetimeSolvedCount / LONG_DIVISION_DIFFICULTY_ADVANCE_INTERVAL,
    ),
    DIVISION_DIFFICULTIES.length - 1,
  );

  return getDifficultyByTierIndex(progressionTierIndex);
}

export function resolveLongDivisionWorkbenchDifficulty(
  initialDifficulty: DivisionDifficultyId,
  lifetimeSolvedCount: number,
): DivisionDifficultyId {
  const initialTierIndex = getDifficultyTierIndex(initialDifficulty);
  const progressionTierIndex = getDifficultyTierIndex(
    getProgressionDifficulty(lifetimeSolvedCount),
  );
  const resolvedTierIndex = Math.max(initialTierIndex, progressionTierIndex);

  return getDifficultyByTierIndex(resolvedTierIndex);
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
  successCount: number,
): LongDivisionWorkbenchFeedback {
  const intro = selectFeedbackMessageVariant(
    STEP_SUCCESS_MESSAGES,
    successCount,
  );

  if (nextStep === null) {
    return {
      tone: "success",
      message: `${intro} Keep following the quotient trail.`,
    };
  }

  return {
    tone: "success",
    message: `${intro} ${buildLongDivisionStepPrompt(nextStep)}`,
  };
}

function buildStepErrorFeedback(
  step: LongDivisionStepId,
  hint: string | null,
  attemptCount: number,
): LongDivisionWorkbenchFeedback {
  const intro = selectFeedbackMessageVariant(STEP_ERROR_MESSAGES, attemptCount);

  return {
    tone: "error",
    message: `${intro} ${hint ?? `Try ${getLongDivisionStepLabel(step)} again.`}`,
  };
}

function buildCompletionFeedback(
  problem: DivisionProblem,
  options: {
    difficultyIncreased: boolean;
    rewardTriggered: boolean;
  },
): LongDivisionWorkbenchFeedback {
  const remainderText = problem.remainder > 0
    ? ` remainder ${problem.remainder}`
    : "";
  const levelUpMessage = options.difficultyIncreased
    ? " You leveled up to a tougher division tier."
    : "";
  const rewardMessage = options.rewardTriggered
    ? " Dino reward milestone reached."
    : "";

  return {
    tone: "complete",
    message:
      `Roarsome! ${problem.dividend} ÷ ${problem.divisor} = ${problem.quotient}${remainderText}. Next problem loading...${levelUpMessage}${rewardMessage}`,
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
  options: CreateLongDivisionWorkbenchStateFromProblemOptions = {},
): LongDivisionWorkbenchState {
  const stepState = createLongDivisionStepState(problem);
  const solvedCount = normalizeSolvedCount(options.solvedCount);
  const lifetimeSolvedCount = Math.max(
    solvedCount,
    normalizeSolvedCount(options.lifetimeSolvedCount ?? solvedCount),
  );
  const difficulty = resolveLongDivisionWorkbenchDifficulty(
    problem.difficulty,
    lifetimeSolvedCount,
  );

  return {
    difficulty,
    solvedCount,
    lifetimeSolvedCount,
    problem,
    stepState,
    attempts: [],
    pendingAdvance: false,
    pendingRewardTrigger: null,
    feedback: buildInitialFeedback(stepState),
  };
}

export function createLongDivisionWorkbenchState(
  options: CreateLongDivisionWorkbenchStateOptions,
): LongDivisionWorkbenchState {
  const solvedCount = normalizeSolvedCount(options.solvedCount);
  const lifetimeSolvedCount = Math.max(
    solvedCount,
    normalizeSolvedCount(options.lifetimeSolvedCount ?? solvedCount),
  );
  const difficulty = resolveLongDivisionWorkbenchDifficulty(
    options.difficulty,
    lifetimeSolvedCount,
  );
  const problem = generateDivisionProblem({
    difficulty,
    random: options.random,
    createdAt: options.createdAt,
  });

  return createLongDivisionWorkbenchStateFromProblem(problem, {
    solvedCount,
    lifetimeSolvedCount,
  });
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
        pendingRewardTrigger: null,
        feedback: {
          tone: state.pendingAdvance ? "complete" : "error",
          message: state.pendingAdvance
            ? "This problem is already complete. A fresh challenge is loading."
            : `${selectFeedbackMessageVariant(STEP_ERROR_MESSAGES, state.attempts.length)} ${validation.hint ?? "This problem is already complete."}`,
        },
      },
      validation,
      rewardTrigger: null,
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
        pendingRewardTrigger: null,
        feedback: buildStepErrorFeedback(
          validation.step,
          validation.hint,
          nextAttempts.length - 1,
        ),
      },
      validation,
      rewardTrigger: null,
    };
  }

  if (validation.isComplete) {
    const solvedCount = state.solvedCount + 1;
    const lifetimeSolvedCount = state.lifetimeSolvedCount + 1;
    const difficulty = resolveLongDivisionWorkbenchDifficulty(
      state.difficulty,
      lifetimeSolvedCount,
    );
    const rewardTrigger = buildRewardTrigger(lifetimeSolvedCount);

    return {
      state: {
        ...state,
        difficulty,
        solvedCount,
        lifetimeSolvedCount,
        stepState: validation.state,
        attempts: nextAttempts,
        pendingAdvance: true,
        pendingRewardTrigger: rewardTrigger,
        feedback: buildCompletionFeedback(state.problem, {
          difficultyIncreased: difficulty !== state.difficulty,
          rewardTriggered: rewardTrigger !== null,
        }),
      },
      validation,
      rewardTrigger,
    };
  }

  return {
    state: {
      ...state,
      stepState: validation.state,
      attempts: nextAttempts,
      pendingAdvance: false,
      pendingRewardTrigger: null,
      feedback: buildStepSuccessFeedback(
        getCurrentLongDivisionStep(validation.state),
        nextAttempts.length - 1,
      ),
    },
    validation,
    rewardTrigger: null,
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

  return createLongDivisionWorkbenchStateFromProblem(nextProblem, {
    solvedCount: state.solvedCount,
    lifetimeSolvedCount: state.lifetimeSolvedCount,
  });
}
