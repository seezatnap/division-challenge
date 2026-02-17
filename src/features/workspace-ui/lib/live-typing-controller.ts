import type { LongDivisionStep } from "@/features/contracts";
import type {
  LongDivisionStepValidationRequest,
  LongDivisionStepValidationResult,
} from "@/features/division-engine/lib/step-validation";

const NON_DIGIT_PATTERN = /\D+/g;

export type WorkspaceDraftEntryValues = Record<string, string>;

export interface LiveWorkspaceTypingState {
  revealedStepCount: number;
  draftEntryValues: WorkspaceDraftEntryValues;
}

export interface CreateLiveWorkspaceTypingStateInput {
  stepCount: number;
  revealedStepCount?: number;
}

export interface ResolveInlineWorkspaceEntryValueInput {
  stepId: LongDivisionStep["id"];
  lockedValue: string;
  isFilled: boolean;
  draftEntryValues: WorkspaceDraftEntryValues;
}

export type LiveWorkspaceStepValidator = (
  request: LongDivisionStepValidationRequest,
) => LongDivisionStepValidationResult;

export interface ApplyLiveWorkspaceEntryInputRequest {
  steps: readonly LongDivisionStep[];
  state: LiveWorkspaceTypingState;
  stepId: LongDivisionStep["id"];
  rawValue: string;
  validateStep: LiveWorkspaceStepValidator;
}

export interface LiveWorkspaceEntryInputTransition {
  state: LiveWorkspaceTypingState;
  sanitizedValue: string;
  validation: LongDivisionStepValidationResult | null;
  lockedStepId: LongDivisionStep["id"] | null;
  didAdvance: boolean;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer.`);
  }
}

function clampRevealedStepCount(stepCount: number, revealedStepCount?: number): number {
  if (!Number.isFinite(revealedStepCount)) {
    return 0;
  }

  if (typeof revealedStepCount === "undefined") {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(revealedStepCount), 0), stepCount);
}

function resolveStepIndexById(steps: readonly LongDivisionStep[], stepId: string): number {
  const stepIndex = steps.findIndex((step) => step.id === stepId);

  if (stepIndex < 0) {
    throw new Error(`stepId "${stepId}" must reference one of the provided steps.`);
  }

  return stepIndex;
}

export function sanitizeInlineWorkspaceEntryValue(rawValue: string): string {
  if (typeof rawValue !== "string") {
    throw new TypeError("rawValue must be a string.");
  }

  return rawValue.replace(NON_DIGIT_PATTERN, "");
}

export function createLiveWorkspaceTypingState({
  stepCount,
  revealedStepCount,
}: CreateLiveWorkspaceTypingStateInput): LiveWorkspaceTypingState {
  assertNonNegativeInteger(stepCount, "stepCount");

  return {
    revealedStepCount: clampRevealedStepCount(stepCount, revealedStepCount),
    draftEntryValues: {},
  };
}

export function resolveInlineWorkspaceEntryValue({
  stepId,
  lockedValue,
  isFilled,
  draftEntryValues,
}: ResolveInlineWorkspaceEntryValueInput): string {
  if (isFilled) {
    return lockedValue;
  }

  return draftEntryValues[stepId] ?? "";
}

export function applyLiveWorkspaceEntryInput({
  steps,
  state,
  stepId,
  rawValue,
  validateStep,
}: ApplyLiveWorkspaceEntryInputRequest): LiveWorkspaceEntryInputTransition {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("steps must include at least one long-division step.");
  }

  if (typeof validateStep !== "function") {
    throw new TypeError("validateStep must be a function.");
  }

  const activeStepIndex = clampRevealedStepCount(steps.length, state.revealedStepCount);
  const stepIndex = resolveStepIndexById(steps, stepId);
  const sanitizedValue = sanitizeInlineWorkspaceEntryValue(rawValue);
  const nextDraftEntryValues = { ...state.draftEntryValues };

  if (sanitizedValue.length > 0) {
    nextDraftEntryValues[stepId] = sanitizedValue;
  } else {
    delete nextDraftEntryValues[stepId];
  }

  if (activeStepIndex >= steps.length || stepIndex !== activeStepIndex) {
    return {
      state: {
        revealedStepCount: activeStepIndex,
        draftEntryValues: nextDraftEntryValues,
      },
      sanitizedValue,
      validation: null,
      lockedStepId: null,
      didAdvance: false,
    };
  }

  if (sanitizedValue.length === 0) {
    return {
      state: {
        revealedStepCount: activeStepIndex,
        draftEntryValues: nextDraftEntryValues,
      },
      sanitizedValue,
      validation: null,
      lockedStepId: null,
      didAdvance: false,
    };
  }

  const validation = validateStep({
    steps,
    currentStepIndex: activeStepIndex,
    submittedValue: sanitizedValue,
  });

  if (!validation.didAdvance) {
    return {
      state: {
        revealedStepCount: activeStepIndex,
        draftEntryValues: nextDraftEntryValues,
      },
      sanitizedValue,
      validation,
      lockedStepId: null,
      didAdvance: false,
    };
  }

  delete nextDraftEntryValues[stepId];

  const nextRevealedStepCount =
    validation.focusStepIndex === null
      ? steps.length
      : clampRevealedStepCount(steps.length, validation.focusStepIndex);

  return {
    state: {
      revealedStepCount: nextRevealedStepCount,
      draftEntryValues: nextDraftEntryValues,
    },
    sanitizedValue,
    validation,
    lockedStepId: stepId,
    didAdvance: true,
  };
}
