import type { LongMultiplicationStep, LongMultiplicationStepKind } from "@/features/contracts";

export interface MultiplicationWorkRow {
  stepId: string;
  targetId: string | null;
  kind: LongMultiplicationStepKind;
  expectedDigitCount: number;
  /** 1-based grid column of the leftmost digit cell. */
  startColumn: number;
  /** Trailing place-value zeros rendered as auto-filled cells. */
  shiftZeroCount: number;
  value: string;
  isFilled: boolean;
  isActive: boolean;
  displayPrefix: "+" | "";
  multiplierDigitText: string | null;
}

export interface MultiplicationActiveStepFocus {
  stepId: LongMultiplicationStep["id"] | null;
  stepKind: LongMultiplicationStepKind | "none";
  multiplicandText: string;
  multiplierText: string;
  multiplierDigitText: string | null;
  shiftZeroCount: number;
  partialRowCount: number;
  /**
   * Carry digit flowing into each column (indexed right-to-left) while working
   * the active step. For a partial-product step these are multiplication
   * carries over the multiplicand columns; for the product-sum step these are
   * addition carries over the product columns. Index 0 is always 0; empty when
   * no step is active.
   */
  carryDigits: readonly number[];
}

export interface BuildMultiplicationRenderModelInput {
  multiplicand: number;
  multiplier: number;
  steps: readonly LongMultiplicationStep[];
  revealedStepCount?: number;
}

export interface MultiplicationRenderModel {
  multiplicandText: string;
  multiplierText: string;
  productText: string;
  columnCount: number;
  activeStepId: string | null;
  activeTargetId: string | null;
  activeStepFocus: MultiplicationActiveStepFocus;
  workRows: readonly MultiplicationWorkRow[];
  hasSumRow: boolean;
}

function clampRevealedStepCount(totalStepCount: number, revealedStepCount?: number): number {
  if (typeof revealedStepCount === "undefined") {
    return totalStepCount;
  }

  if (!Number.isFinite(revealedStepCount)) {
    return 0;
  }

  const normalizedStepCount = Math.trunc(revealedStepCount);
  return Math.min(Math.max(normalizedStepCount, 0), totalStepCount);
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

/**
 * Carries generated while multiplying a multi-digit value by a single digit,
 * indexed by multiplicand position from the right (index 0 is always 0). Also
 * used by the division workspace for its multiply-result rows.
 */
export function computeMultiplicationCarryDigits(
  multiplicandText: string,
  multiplierDigitText: string | null,
): readonly number[] {
  if (!multiplierDigitText) {
    return [];
  }

  const multiplierDigit = Number(multiplierDigitText);
  const multiplicandDigitsRightToLeft = Array.from(multiplicandText).reverse().map(Number);
  const carryDigits: number[] = [];
  let carry = 0;

  for (const multiplicandDigit of multiplicandDigitsRightToLeft) {
    carryDigits.push(carry);
    carry = Math.trunc((multiplicandDigit * multiplierDigit + carry) / 10);
  }

  return carryDigits;
}

function computeSumCarryDigits(
  shiftedAddendTexts: readonly string[],
  columnCount: number,
): readonly number[] {
  const carryDigits: number[] = [];
  let carry = 0;

  for (let column = 0; column < columnCount; column += 1) {
    carryDigits.push(carry);
    let columnTotal = carry;
    for (const addendText of shiftedAddendTexts) {
      columnTotal += Number(addendText[addendText.length - 1 - column] ?? "0");
    }
    carry = Math.trunc(columnTotal / 10);
  }

  return carryDigits;
}

function createEmptyActiveStepFocus(
  multiplicandText: string,
  multiplierText: string,
  partialRowCount: number,
): MultiplicationActiveStepFocus {
  return {
    stepId: null,
    stepKind: "none",
    multiplicandText,
    multiplierText,
    multiplierDigitText: null,
    shiftZeroCount: 0,
    partialRowCount,
    carryDigits: [],
  };
}

export function buildMultiplicationRenderModel({
  multiplicand,
  multiplier,
  steps,
  revealedStepCount,
}: BuildMultiplicationRenderModelInput): MultiplicationRenderModel {
  assertPositiveInteger(multiplicand, "multiplicand");
  assertPositiveInteger(multiplier, "multiplier");

  const multiplicandText = String(multiplicand);
  const multiplierText = String(multiplier);
  const productText = String(multiplicand * multiplier);
  const multiplierDigitsRightToLeft = Array.from(multiplierText).reverse();
  const partialSteps = steps.filter((step) => step.kind === "partial-product");
  const columnCount = Math.max(
    productText.length,
    multiplicandText.length,
    multiplierText.length,
    ...partialSteps.map((step, partialIndex) => step.expectedValue.length + partialIndex),
    1,
  );
  const boundedRevealedStepCount = clampRevealedStepCount(steps.length, revealedStepCount);
  const activeStep = steps[boundedRevealedStepCount] ?? null;
  const hasSumRow = steps.some((step) => step.kind === "product-sum");

  const workRows: MultiplicationWorkRow[] = [];
  let partialRowIndex = 0;

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const isFilled = stepIndex < boundedRevealedStepCount;
    const isActive = stepIndex === boundedRevealedStepCount;
    const shiftZeroCount = step.kind === "partial-product" ? partialRowIndex : 0;
    const multiplierDigitText =
      step.kind === "partial-product"
        ? multiplierDigitsRightToLeft[partialRowIndex] ?? null
        : null;

    if (step.kind === "partial-product") {
      partialRowIndex += 1;
    }

    if (!isFilled && !isActive) {
      continue;
    }

    const expectedDigitCount = Math.max(step.expectedValue.length, 1);

    workRows.push({
      stepId: step.id,
      targetId: step.inputTargetId,
      kind: step.kind,
      expectedDigitCount,
      startColumn: columnCount - shiftZeroCount - expectedDigitCount + 1,
      shiftZeroCount,
      value: isFilled ? step.expectedValue : "",
      isFilled,
      isActive,
      displayPrefix:
        step.kind === "partial-product" && hasSumRow && shiftZeroCount === multiplierText.length - 1
          ? "+"
          : "",
      multiplierDigitText,
    });
  }

  const activeMultiplierDigitText =
    activeStep?.kind === "partial-product"
      ? multiplierDigitsRightToLeft[
          partialSteps.findIndex((step) => step.id === activeStep.id)
        ] ?? null
      : null;

  const activeStepFocus: MultiplicationActiveStepFocus = activeStep
    ? {
        stepId: activeStep.id,
        stepKind: activeStep.kind,
        multiplicandText,
        multiplierText,
        multiplierDigitText: activeMultiplierDigitText,
        shiftZeroCount:
          activeStep.kind === "partial-product"
            ? Math.max(
                partialSteps.findIndex((step) => step.id === activeStep.id),
                0,
              )
            : 0,
        partialRowCount: partialSteps.length,
        carryDigits:
          activeStep.kind === "partial-product"
            ? computeMultiplicationCarryDigits(multiplicandText, activeMultiplierDigitText)
            : computeSumCarryDigits(
                partialSteps.map(
                  (step, partialIndex) => step.expectedValue + "0".repeat(partialIndex),
                ),
                productText.length,
              ),
      }
    : createEmptyActiveStepFocus(multiplicandText, multiplierText, partialSteps.length);

  return {
    multiplicandText,
    multiplierText,
    productText,
    columnCount,
    activeStepId: activeStep?.id ?? null,
    activeTargetId: activeStep?.inputTargetId ?? null,
    activeStepFocus,
    workRows,
    hasSumRow,
  };
}
