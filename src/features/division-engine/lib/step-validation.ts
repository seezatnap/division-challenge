import type { LongDivisionStep, LongDivisionStepKind } from "@/features/contracts";

export type LongDivisionStepValidationOutcome = "correct" | "incorrect" | "complete";
export type DinoStepFeedbackTone = "encouragement" | "retry" | "celebration";

export interface DinoStepFeedbackHintHook {
  readonly id: string;
  readonly stepKind: LongDivisionStepKind;
  readonly tone: DinoStepFeedbackTone;
  readonly messageKey: string;
}

export interface LongDivisionStepValidationRequest {
  readonly steps: readonly LongDivisionStep[];
  readonly currentStepIndex: number;
  readonly submittedValue: string;
}

export interface LongDivisionStepValidationResult {
  readonly outcome: LongDivisionStepValidationOutcome;
  readonly didAdvance: boolean;
  readonly isProblemComplete: boolean;
  readonly currentStepIndex: number;
  readonly currentStepId: LongDivisionStep["id"];
  readonly focusStepIndex: number | null;
  readonly focusStepId: LongDivisionStep["id"] | null;
  readonly expectedValue: string;
  readonly normalizedSubmittedValue: string | null;
  readonly hintHook: DinoStepFeedbackHintHook;
}

const INTEGER_PATTERN = /^\d+$/;

const STEP_CORRECT_HINT_KEYS = {
  "quotient-digit": "dino.feedback.correct.quotient-digit",
  "multiply-result": "dino.feedback.correct.multiply-result",
  "subtraction-result": "dino.feedback.correct.subtraction-result",
  "bring-down": "dino.feedback.correct.bring-down",
} as const satisfies Record<LongDivisionStepKind, string>;

const STEP_RETRY_HINT_KEYS = {
  "quotient-digit": "dino.feedback.retry.quotient-digit",
  "multiply-result": "dino.feedback.retry.multiply-result",
  "subtraction-result": "dino.feedback.retry.subtraction-result",
  "bring-down": "dino.feedback.retry.bring-down",
} as const satisfies Record<LongDivisionStepKind, string>;

function assertStepList(steps: readonly LongDivisionStep[]): void {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("steps must include at least one long-division step.");
  }
}

function assertStepIndex(currentStepIndex: number, stepCount: number): void {
  if (!Number.isInteger(currentStepIndex) || currentStepIndex < 0 || currentStepIndex >= stepCount) {
    throw new RangeError("currentStepIndex must reference an existing step.");
  }
}

function normalizeIntegerAnswer(rawValue: string): string | null {
  const trimmedValue = rawValue.trim();

  if (!INTEGER_PATTERN.test(trimmedValue)) {
    return null;
  }

  return trimmedValue.replace(/^0+(?=\d)/, "");
}

function createCorrectHintHook(stepKind: LongDivisionStepKind): DinoStepFeedbackHintHook {
  return {
    id: `dino-feedback:correct:${stepKind}`,
    stepKind,
    tone: "encouragement",
    messageKey: STEP_CORRECT_HINT_KEYS[stepKind],
  };
}

function createRetryHintHook(stepKind: LongDivisionStepKind): DinoStepFeedbackHintHook {
  return {
    id: `dino-feedback:retry:${stepKind}`,
    stepKind,
    tone: "retry",
    messageKey: STEP_RETRY_HINT_KEYS[stepKind],
  };
}

function createCompletionHintHook(stepKind: LongDivisionStepKind): DinoStepFeedbackHintHook {
  return {
    id: "dino-feedback:complete:problem",
    stepKind,
    tone: "celebration",
    messageKey: "dino.feedback.complete.problem",
  };
}

export function validateLongDivisionStepAnswer(
  request: LongDivisionStepValidationRequest,
): LongDivisionStepValidationResult {
  const { steps, currentStepIndex, submittedValue } = request;
  assertStepList(steps);
  assertStepIndex(currentStepIndex, steps.length);

  if (typeof submittedValue !== "string") {
    throw new TypeError("submittedValue must be a string.");
  }

  const activeStep = steps[currentStepIndex];
  const expectedNormalizedValue = normalizeIntegerAnswer(activeStep.expectedValue);

  if (!expectedNormalizedValue) {
    throw new Error(
      `steps[${currentStepIndex}].expectedValue must be a non-empty integer string.`,
    );
  }

  const normalizedSubmittedValue = normalizeIntegerAnswer(submittedValue);
  const isCorrect =
    normalizedSubmittedValue !== null && normalizedSubmittedValue === expectedNormalizedValue;

  if (!isCorrect) {
    return {
      outcome: "incorrect",
      didAdvance: false,
      isProblemComplete: false,
      currentStepIndex,
      currentStepId: activeStep.id,
      focusStepIndex: currentStepIndex,
      focusStepId: activeStep.id,
      expectedValue: activeStep.expectedValue,
      normalizedSubmittedValue,
      hintHook: createRetryHintHook(activeStep.kind),
    };
  }

  if (currentStepIndex === steps.length - 1) {
    return {
      outcome: "complete",
      didAdvance: true,
      isProblemComplete: true,
      currentStepIndex,
      currentStepId: activeStep.id,
      focusStepIndex: null,
      focusStepId: null,
      expectedValue: activeStep.expectedValue,
      normalizedSubmittedValue,
      hintHook: createCompletionHintHook(activeStep.kind),
    };
  }

  const nextStepIndex = currentStepIndex + 1;
  const nextStep = steps[nextStepIndex];

  return {
    outcome: "correct",
    didAdvance: true,
    isProblemComplete: false,
    currentStepIndex,
    currentStepId: activeStep.id,
    focusStepIndex: nextStepIndex,
    focusStepId: nextStep.id,
    expectedValue: activeStep.expectedValue,
    normalizedSubmittedValue,
    hintHook: createCorrectHintHook(activeStep.kind),
  };
}
