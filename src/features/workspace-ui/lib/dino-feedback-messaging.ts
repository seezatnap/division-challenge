import type {
  DinoStepFeedbackTone,
  LongDivisionStepValidationOutcome,
  LongDivisionStepValidationResult,
} from "@/features/division-engine/lib/step-validation";
import type { LongDivisionStepKind } from "@/features/contracts";

export type DinoFeedbackDisplayOutcome = LongDivisionStepValidationOutcome | "ready";

export interface DinoFeedbackMessage {
  readonly id: string;
  readonly tone: DinoStepFeedbackTone;
  readonly outcome: DinoFeedbackDisplayOutcome;
  readonly messageKey: string;
  readonly statusLabel: string;
  readonly text: string;
  readonly note: string;
}

interface DinoFeedbackTemplate {
  readonly statusLabel: string;
  readonly text: string;
  readonly note: string;
}

export interface DinoCoachStepGuidanceContext {
  readonly stepId: string | null;
  readonly stepKind: LongDivisionStepKind | "none";
  readonly divisorText: string;
  readonly workingValueText: string | null;
  readonly quotientDigitText: string | null;
  readonly multiplyValueText: string | null;
  readonly subtractionValueText: string | null;
  readonly bringDownDigitText: string | null;
}

const FEEDBACK_TEMPLATE_BY_MESSAGE_KEY: Record<string, DinoFeedbackTemplate> = {
  "dino.feedback.correct.quotient-digit": {
    statusLabel: "Roarsome Progress",
    text: "Roarsome! That quotient digit locked in perfectly.",
    note: "Track the amber glow to the next cell and keep the chain moving.",
  },
  "dino.feedback.correct.multiply-result": {
    statusLabel: "Claws-On Multiplication",
    text: "Nice strike! Your multiplication row is dino-accurate.",
    note: "Next move: subtract carefully and keep the workspace aligned.",
  },
  "dino.feedback.correct.subtraction-result": {
    statusLabel: "Clever Raptor Math",
    text: "Clever girl... that subtraction line is clean.",
    note: "Stay with the glow and prep for the next algorithm step.",
  },
  "dino.feedback.correct.bring-down": {
    statusLabel: "Smooth Bring-Down",
    text: "Great timing. The next digit slid down right on cue.",
    note: "Now solve the fresh working number above the active glow.",
  },
  "dino.feedback.retry.quotient-digit": {
    statusLabel: "Retry The Quotient",
    text: "Uh oh, the raptor got that one. Recheck how many times the divisor fits.",
    note: "Use the current working number and try the quotient digit again.",
  },
  "dino.feedback.retry.multiply-result": {
    statusLabel: "Retry Multiplication",
    text: "The T-Rex says: try multiplying again!",
    note: "Multiply the divisor by your current quotient digit before moving on.",
  },
  "dino.feedback.retry.subtraction-result": {
    statusLabel: "Retry Subtraction",
    text: "Tiny fossil slip. Re-run the subtraction step.",
    note: "Subtract the multiply row from the working number, then re-enter it.",
  },
  "dino.feedback.retry.bring-down": {
    statusLabel: "Retry Bring-Down",
    text: "Not yet, explorer. Bring down the next dividend digit.",
    note: "Drop the next digit beside the remainder to build the next working value.",
  },
  "dino.feedback.complete.problem": {
    statusLabel: "Console Sequence Complete",
    text: "Trail computation complete. Run log marked VERIFIED.",
    note: "Queue the next division task to keep your session streak online.",
  },
};

const FEEDBACK_FALLBACK_TEMPLATE_BY_TONE: Record<DinoStepFeedbackTone, DinoFeedbackTemplate> = {
  encouragement: {
    statusLabel: "Steady Progress",
    text: "Nice move. Your step is locked in.",
    note: "Follow the glowing cell to continue the long-division sequence.",
  },
  retry: {
    statusLabel: "Try Again",
    text: "Close one. The dinosaurs want one more attempt on this step.",
    note: "Keep focus on the same cell and retry with updated math.",
  },
  celebration: {
    statusLabel: "Victory Roar",
    text: "Roar-some finish. You completed the problem.",
    note: "Start another challenge to unlock more dinosaurs.",
  },
};

export const DEFAULT_DINO_FEEDBACK_MESSAGE: DinoFeedbackMessage = {
  id: "dino-feedback:ready",
  tone: "encouragement",
  outcome: "ready",
  messageKey: "dino.feedback.ready",
  statusLabel: "Dino Coach Ready",
  text: "Tap the glowing cell and start your division expedition.",
  note: "Correct entries lock instantly. Retry hints appear when a step needs another pass.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getFeedbackTemplate(
  messageKey: string,
  tone: DinoStepFeedbackTone,
): DinoFeedbackTemplate {
  return FEEDBACK_TEMPLATE_BY_MESSAGE_KEY[messageKey] ?? FEEDBACK_FALLBACK_TEMPLATE_BY_TONE[tone];
}

function resolveCurrentStepStatusLabel(stepKind: LongDivisionStepKind | "none"): string {
  switch (stepKind) {
    case "quotient-digit":
      return "Choose Quotient Digit";
    case "multiply-result":
      return "Multiply The Divisor";
    case "subtraction-result":
      return "Subtract The Rows";
    case "bring-down":
      return "Bring Down The Digit";
    default:
      return "Console Sequence Complete";
  }
}

function resolveCurrentStepText(context: DinoCoachStepGuidanceContext): string {
  const workingValueText = context.workingValueText ?? "the current working number";
  const divisorText = context.divisorText;

  switch (context.stepKind) {
    case "quotient-digit":
      return `How many times does ${divisorText} go into ${workingValueText}?`;
    case "multiply-result":
      return `Multiply ${divisorText} by ${context.quotientDigitText ?? "your quotient digit"}.`;
    case "subtraction-result":
      return `Subtract ${context.multiplyValueText ?? "the multiply row"} from ${workingValueText}.`;
    case "bring-down":
      return `Bring down ${context.bringDownDigitText ?? "the next digit"} to make ${workingValueText}.`;
    default:
      return FEEDBACK_TEMPLATE_BY_MESSAGE_KEY["dino.feedback.complete.problem"].text;
  }
}

function resolveCurrentStepNote(context: DinoCoachStepGuidanceContext): string {
  const workingValueText = context.workingValueText ?? "the active working value";

  switch (context.stepKind) {
    case "quotient-digit":
      return `Enter one quotient digit above ${workingValueText}.`;
    case "multiply-result":
      return "Write the product on the multiply row before subtracting.";
    case "subtraction-result":
      return "Type the remainder in the subtraction row to continue.";
    case "bring-down":
      return "Type the new working number in the bring-down row.";
    default:
      return FEEDBACK_TEMPLATE_BY_MESSAGE_KEY["dino.feedback.complete.problem"].note;
  }
}

export function resolveCurrentStepCoachMessage(
  context: DinoCoachStepGuidanceContext,
): DinoFeedbackMessage {
  if (!isRecord(context)) {
    throw new TypeError("context must be an object.");
  }

  const stepKind = context.stepKind as LongDivisionStepKind | "none";
  const isProblemComplete = stepKind === "none";

  return {
    id: `dino-coach:step:${context.stepId ?? "complete"}`,
    tone: isProblemComplete ? "celebration" : "encouragement",
    outcome: isProblemComplete ? "complete" : "ready",
    messageKey: `dino.coach.current-step.${stepKind}`,
    statusLabel: resolveCurrentStepStatusLabel(stepKind),
    text: resolveCurrentStepText(context),
    note: resolveCurrentStepNote(context),
  };
}

export function resolveDinoFeedbackMessage(
  validation: LongDivisionStepValidationResult,
): DinoFeedbackMessage {
  if (!isRecord(validation) || !isRecord(validation.hintHook)) {
    throw new TypeError("validation must include a hintHook.");
  }

  const hintHook = validation.hintHook;
  const messageKey = String(hintHook.messageKey);
  const tone = hintHook.tone as DinoStepFeedbackTone;
  const outcome = validation.outcome as LongDivisionStepValidationOutcome;
  const template = getFeedbackTemplate(messageKey, tone);

  return {
    id: `${String(hintHook.id)}:${String(validation.currentStepId)}:${outcome}`,
    tone,
    outcome,
    messageKey,
    statusLabel: template.statusLabel,
    text: template.text,
    note: template.note,
  };
}
