import type { LongMultiplicationStepKind } from "@/features/contracts";

import type { DinoFeedbackMessage } from "./dino-feedback-messaging";
import type { MultiplicationActiveStepFocus } from "./multiplication-render-model";

const PLACE_NAME_BY_SHIFT: readonly string[] = [
  "ones",
  "tens",
  "hundreds",
  "thousands",
  "ten-thousands",
];

export const DEFAULT_MULTIPLICATION_FEEDBACK_MESSAGE: DinoFeedbackMessage = {
  id: "dino-feedback:multiplication-ready",
  tone: "encouragement",
  outcome: "ready",
  messageKey: "dino.feedback.multiplication-ready",
  statusLabel: "Dino Coach Ready",
  text: "Tap the glowing cell and start your multiplication expedition.",
  note: "Work right to left, ones place first. Correct digits lock instantly.",
};

function resolvePlaceName(shiftZeroCount: number): string {
  return PLACE_NAME_BY_SHIFT[shiftZeroCount] ?? `10^${shiftZeroCount}`;
}

function resolveStatusLabel(stepKind: LongMultiplicationStepKind | "none"): string {
  switch (stepKind) {
    case "partial-product":
      return "Build The Partial Product";
    case "product-sum":
      return "Add The Partial Products";
    default:
      return "Console Sequence Complete";
  }
}

function resolveText(context: MultiplicationActiveStepFocus): string {
  switch (context.stepKind) {
    case "partial-product": {
      const digitText = context.multiplierDigitText ?? "the next multiplier digit";
      const placeName = resolvePlaceName(context.shiftZeroCount);
      return context.partialRowCount > 1
        ? `Multiply ${context.multiplicandText} by ${digitText} (the ${placeName} digit of ${context.multiplierText}).`
        : `Multiply ${context.multiplicandText} by ${digitText}.`;
    }
    case "product-sum":
      return "Add the partial product rows to find the final product.";
    default:
      return "Trail computation complete. Run log marked VERIFIED.";
  }
}

function resolveNote(context: MultiplicationActiveStepFocus): string {
  switch (context.stepKind) {
    case "partial-product":
      return context.shiftZeroCount > 0
        ? `The ${context.shiftZeroCount === 1 ? "place-holder zero is" : "place-holder zeros are"} already set. Type the row right to left, carrying as you go.`
        : "Type the row right to left, starting from the ones place.";
    case "product-sum":
      return "Add column by column from the right, carrying into the next place.";
    default:
      return "Queue the next problem to keep your session streak online.";
  }
}

export function resolveMultiplicationStepCoachMessage(
  context: MultiplicationActiveStepFocus,
): DinoFeedbackMessage {
  if (typeof context !== "object" || context === null) {
    throw new TypeError("context must be an object.");
  }

  const isProblemComplete = context.stepKind === "none";

  return {
    id: `dino-coach:multiplication-step:${context.stepId ?? "complete"}`,
    tone: isProblemComplete ? "celebration" : "encouragement",
    outcome: isProblemComplete ? "complete" : "ready",
    messageKey: `dino.coach.current-step.${context.stepKind}`,
    statusLabel: resolveStatusLabel(context.stepKind),
    text: resolveText(context),
    note: resolveNote(context),
  };
}
