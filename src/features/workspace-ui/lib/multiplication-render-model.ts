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

/** Where a decimal point sits inside a digit track. */
export interface MultiplicationDecimalPointPosition {
  /** 0-based index of the digit immediately to the right of the point. */
  digitIndex: number;
  /** 1-based grid column of that digit; the point renders on its left edge. */
  column: number;
  /**
   * 1-based grid column of the leading "0" when the point precedes the first
   * digit (0.7 rather than .7); null when a real digit sits left of the point.
   */
  leadingZeroColumn: number | null;
}

/** One clickable candidate position for the product's decimal point. */
export interface MultiplicationDecimalPointSlot extends MultiplicationDecimalPointPosition {
  /** Product digits that would sit right of the point if this slot is chosen. */
  decimalPlaces: number;
}

export interface MultiplicationDecimalPointModel {
  stepId: string;
  targetId: string | null;
  /** Work row (product-sum, or the sole partial product) that holds the point. */
  rowStepId: string;
  expectedDecimalPlaces: number;
  productDigitCount: number;
  isActive: boolean;
  isFilled: boolean;
  /**
   * Candidate slots, one before the first product digit and one between every
   * pair of digits, ordered left to right (largest decimalPlaces first).
   */
  slots: readonly MultiplicationDecimalPointSlot[];
  /** Locked-in position once the step is filled; null while still pending. */
  placedPosition: MultiplicationDecimalPointPosition | null;
}

export interface MultiplicationActiveStepFocus {
  stepId: LongMultiplicationStep["id"] | null;
  stepKind: LongMultiplicationStepKind | "none";
  /** Multiplicand digits with no decimal point, e.g. "884". */
  multiplicandText: string;
  /** Multiplier digits with no decimal point, e.g. "86". */
  multiplierText: string;
  /** Multiplicand as the player sees it, e.g. "8.84" (same as multiplicandText for whole numbers). */
  multiplicandDisplayText: string;
  /** Multiplier as the player sees it, e.g. "8.6". */
  multiplierDisplayText: string;
  multiplicandDecimalPlaces: number;
  multiplierDecimalPlaces: number;
  /** Decimal places the finished product needs; 0 for whole-number problems. */
  productDecimalPlaces: number;
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
  multiplicandDecimalPlaces?: number;
  multiplierDecimalPlaces?: number;
  steps: readonly LongMultiplicationStep[];
  revealedStepCount?: number;
}

export interface MultiplicationRenderModel {
  multiplicandText: string;
  multiplierText: string;
  productText: string;
  multiplicandDisplayText: string;
  multiplierDisplayText: string;
  /** Product with its decimal point inserted, e.g. "76.024". */
  productDisplayText: string;
  multiplicandDecimalPlaces: number;
  multiplierDecimalPlaces: number;
  productDecimalPlaces: number;
  /** Static decimal point shown in the multiplicand row; null for whole numbers. */
  multiplicandDecimalPoint: MultiplicationDecimalPointPosition | null;
  /** Static decimal point shown in the multiplier row; null for whole numbers. */
  multiplierDecimalPoint: MultiplicationDecimalPointPosition | null;
  columnCount: number;
  activeStepId: string | null;
  activeTargetId: string | null;
  activeStepFocus: MultiplicationActiveStepFocus;
  workRows: readonly MultiplicationWorkRow[];
  hasSumRow: boolean;
  /** Decimal-point placement step; null when the problem has no decimals. */
  decimalPoint: MultiplicationDecimalPointModel | null;
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

function normalizeDecimalPlaces(
  value: number | undefined,
  digitCount: number,
  argumentName: string,
): number {
  if (typeof value === "undefined") {
    return 0;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${argumentName} must be a non-negative integer.`);
  }

  if (value > digitCount) {
    throw new RangeError(`${argumentName} must not exceed the digit count.`);
  }

  return value;
}

/**
 * Inserts a decimal point into a digit string for display, e.g. ("884", 2)
 * gives "8.84" and ("884", 3) gives ".884". Mirrors the engine's
 * `formatDigitsWithDecimalPoint`; kept local so this module stays free of
 * runtime imports.
 */
function insertDecimalPoint(digits: string, decimalPlaces: number): string {
  if (decimalPlaces <= 0) {
    return digits;
  }

  const splitIndex = digits.length - decimalPlaces;
  const integerPart = splitIndex === 0 ? "0" : digits.slice(0, splitIndex);
  return `${integerPart}.${digits.slice(splitIndex)}`;
}

/** True when the point precedes every digit, so a leading zero is shown (0.7). */
function needsLeadingZero(digitCount: number, decimalPlaces: number): boolean {
  return decimalPlaces > 0 && decimalPlaces === digitCount;
}

/**
 * Position of a decimal point inside a right-aligned digit track. The point is
 * anchored to the digit on its right, so a count equal to the digit length
 * anchors to the first digit (the point sits before it).
 */
export function resolveDecimalPointPosition(
  digitCount: number,
  decimalPlaces: number,
  startColumn: number,
): MultiplicationDecimalPointPosition | null {
  if (decimalPlaces <= 0) {
    return null;
  }

  const digitIndex = digitCount - decimalPlaces;
  const column = startColumn + digitIndex;
  return {
    digitIndex,
    column,
    leadingZeroColumn: needsLeadingZero(digitCount, decimalPlaces) ? column - 1 : null,
  };
}

/**
 * Every place the player may tap for the product's decimal point: before the
 * first digit and between each neighbouring pair, left to right.
 */
export function buildDecimalPointSlots(
  productDigitCount: number,
  startColumn: number,
): MultiplicationDecimalPointSlot[] {
  const slots: MultiplicationDecimalPointSlot[] = [];

  for (let decimalPlaces = productDigitCount; decimalPlaces >= 1; decimalPlaces -= 1) {
    const position = resolveDecimalPointPosition(productDigitCount, decimalPlaces, startColumn);
    if (position) {
      slots.push({ ...position, decimalPlaces });
    }
  }

  return slots;
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

interface ActiveStepFocusFactorContext {
  multiplicandText: string;
  multiplierText: string;
  multiplicandDisplayText: string;
  multiplierDisplayText: string;
  multiplicandDecimalPlaces: number;
  multiplierDecimalPlaces: number;
  productDecimalPlaces: number;
}

function createEmptyActiveStepFocus(
  factorContext: ActiveStepFocusFactorContext,
  partialRowCount: number,
): MultiplicationActiveStepFocus {
  return {
    stepId: null,
    stepKind: "none",
    ...factorContext,
    multiplierDigitText: null,
    shiftZeroCount: 0,
    partialRowCount,
    carryDigits: [],
  };
}

function computeActiveStepCarryDigits(
  activeStep: LongMultiplicationStep,
  multiplicandText: string,
  activeMultiplierDigitText: string | null,
  partialSteps: readonly LongMultiplicationStep[],
  productDigitCount: number,
): readonly number[] {
  switch (activeStep.kind) {
    case "partial-product":
      return computeMultiplicationCarryDigits(multiplicandText, activeMultiplierDigitText);
    case "product-sum":
      return computeSumCarryDigits(
        partialSteps.map((step, partialIndex) => step.expectedValue + "0".repeat(partialIndex)),
        productDigitCount,
      );
    default:
      return [];
  }
}

export function buildMultiplicationRenderModel({
  multiplicand,
  multiplier,
  multiplicandDecimalPlaces: rawMultiplicandDecimalPlaces,
  multiplierDecimalPlaces: rawMultiplierDecimalPlaces,
  steps,
  revealedStepCount,
}: BuildMultiplicationRenderModelInput): MultiplicationRenderModel {
  assertPositiveInteger(multiplicand, "multiplicand");
  assertPositiveInteger(multiplier, "multiplier");

  const multiplicandText = String(multiplicand);
  const multiplierText = String(multiplier);
  const productText = String(multiplicand * multiplier);
  const multiplicandDecimalPlaces = normalizeDecimalPlaces(
    rawMultiplicandDecimalPlaces,
    multiplicandText.length,
    "multiplicandDecimalPlaces",
  );
  const multiplierDecimalPlaces = normalizeDecimalPlaces(
    rawMultiplierDecimalPlaces,
    multiplierText.length,
    "multiplierDecimalPlaces",
  );
  const productDecimalPlaces = multiplicandDecimalPlaces + multiplierDecimalPlaces;

  if (productDecimalPlaces > productText.length) {
    throw new RangeError("The combined decimal places must not exceed the product digit count.");
  }

  const multiplicandDisplayText = insertDecimalPoint(multiplicandText, multiplicandDecimalPlaces);
  const multiplierDisplayText = insertDecimalPoint(multiplierText, multiplierDecimalPlaces);
  const productDisplayText = insertDecimalPoint(productText, productDecimalPlaces);
  const factorContext: ActiveStepFocusFactorContext = {
    multiplicandText,
    multiplierText,
    multiplicandDisplayText,
    multiplierDisplayText,
    multiplicandDecimalPlaces,
    multiplierDecimalPlaces,
    productDecimalPlaces,
  };
  const multiplierDigitsRightToLeft = Array.from(multiplierText).reverse();
  const partialSteps = steps.filter((step) => step.kind === "partial-product");
  const decimalPointStep = steps.find((step) => step.kind === "decimal-point") ?? null;
  const productRowStep =
    steps.findLast((step) => step.kind !== "decimal-point") ?? null;
  // Values whose point precedes every digit render a leading zero, which
  // needs a column of its own to the left of the first digit.
  const leadingZeroWidth = (digitCount: number, decimalPlaces: number): number =>
    needsLeadingZero(digitCount, decimalPlaces) ? 1 : 0;
  const columnCount = Math.max(
    productText.length + leadingZeroWidth(productText.length, productDecimalPlaces),
    multiplicandText.length + leadingZeroWidth(multiplicandText.length, multiplicandDecimalPlaces),
    multiplierText.length + leadingZeroWidth(multiplierText.length, multiplierDecimalPlaces),
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
    if (step.kind === "decimal-point") {
      // The decimal point is placed inside the product row rather than in a
      // row of its own; see `decimalPoint` below.
      continue;
    }

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
        ...factorContext,
        multiplierDigitText: activeMultiplierDigitText,
        shiftZeroCount:
          activeStep.kind === "partial-product"
            ? Math.max(
                partialSteps.findIndex((step) => step.id === activeStep.id),
                0,
              )
            : 0,
        partialRowCount: partialSteps.length,
        carryDigits: computeActiveStepCarryDigits(
          activeStep,
          multiplicandText,
          activeMultiplierDigitText,
          partialSteps,
          productText.length,
        ),
      }
    : createEmptyActiveStepFocus(factorContext, partialSteps.length);

  const productRowStartColumn = columnCount - productText.length + 1;
  let decimalPoint: MultiplicationDecimalPointModel | null = null;

  if (decimalPointStep && productRowStep) {
    const decimalStepIndex = steps.indexOf(decimalPointStep);
    const isDecimalStepFilled = decimalStepIndex < boundedRevealedStepCount;
    const expectedDecimalPlaces = Number.parseInt(decimalPointStep.expectedValue, 10);

    decimalPoint = {
      stepId: decimalPointStep.id,
      targetId: decimalPointStep.inputTargetId,
      rowStepId: productRowStep.id,
      expectedDecimalPlaces,
      productDigitCount: productText.length,
      isActive: decimalStepIndex === boundedRevealedStepCount,
      isFilled: isDecimalStepFilled,
      slots: buildDecimalPointSlots(productText.length, productRowStartColumn),
      placedPosition: isDecimalStepFilled
        ? resolveDecimalPointPosition(
            productText.length,
            expectedDecimalPlaces,
            productRowStartColumn,
          )
        : null,
    };
  }

  return {
    multiplicandText,
    multiplierText,
    productText,
    multiplicandDisplayText,
    multiplierDisplayText,
    productDisplayText,
    multiplicandDecimalPlaces,
    multiplierDecimalPlaces,
    productDecimalPlaces,
    multiplicandDecimalPoint: resolveDecimalPointPosition(
      multiplicandText.length,
      multiplicandDecimalPlaces,
      columnCount - multiplicandText.length + 1,
    ),
    multiplierDecimalPoint: resolveDecimalPointPosition(
      multiplierText.length,
      multiplierDecimalPlaces,
      columnCount - multiplierText.length + 1,
    ),
    columnCount,
    activeStepId: activeStep?.id ?? null,
    activeTargetId: activeStep?.inputTargetId ?? null,
    activeStepFocus,
    workRows,
    hasSumRow,
    decimalPoint,
  };
}
