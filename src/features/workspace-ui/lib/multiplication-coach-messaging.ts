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

const DIGIT_FROM_RIGHT_LABEL_BY_SHIFT: readonly string[] = [
  "right-most",
  "second-from-right",
  "third-from-right",
  "fourth-from-right",
  "fifth-from-right",
];

function resolvePlaceName(shiftZeroCount: number): string {
  return PLACE_NAME_BY_SHIFT[shiftZeroCount] ?? `10^${shiftZeroCount}`;
}

function resolveDigitFromRightLabel(shiftZeroCount: number): string {
  return DIGIT_FROM_RIGHT_LABEL_BY_SHIFT[shiftZeroCount] ?? `${shiftZeroCount + 1}th-from-right`;
}

function hasDecimalPoint(context: MultiplicationActiveStepFocus): boolean {
  return context.productDecimalPlaces > 0;
}

function resolveStatusLabel(stepKind: LongMultiplicationStepKind | "none"): string {
  switch (stepKind) {
    case "partial-product":
      return "Build The Partial Product";
    case "product-sum":
      return "Add The Partial Products";
    case "decimal-point":
      return "Place The Decimal Point";
    default:
      return "Console Sequence Complete";
  }
}

function resolveText(context: MultiplicationActiveStepFocus): string {
  switch (context.stepKind) {
    case "partial-product": {
      const digitText = context.multiplierDigitText ?? "the next multiplier digit";

      if (hasDecimalPoint(context)) {
        // Decimal work is done on the bare digits; the point is placed last.
        const digitLabel = resolveDigitFromRightLabel(context.shiftZeroCount);
        return context.partialRowCount > 1
          ? `Multiply ${context.multiplicandText} by ${digitText} (the ${digitLabel} digit of ${context.multiplierDisplayText}). Ignore the decimal points for now.`
          : `Multiply ${context.multiplicandText} by ${digitText}. Ignore the decimal points for now.`;
      }

      const placeName = resolvePlaceName(context.shiftZeroCount);
      return context.partialRowCount > 1
        ? `Multiply ${context.multiplicandText} by ${digitText} (the ${placeName} digit of ${context.multiplierText}).`
        : `Multiply ${context.multiplicandText} by ${digitText}.`;
    }
    case "product-sum":
      return hasDecimalPoint(context)
        ? "Add the partial product rows. You will place the decimal point once the sum is locked in."
        : "Add the partial product rows to find the final product.";
    case "decimal-point":
      return `Count the decimal places in ${context.multiplicandDisplayText} and ${context.multiplierDisplayText}, then tap the glowing dot where the decimal point belongs in the product.`;
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
    case "decimal-point":
      return "The product has as many decimal places as both factors combined. Count them off from the right.";
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
