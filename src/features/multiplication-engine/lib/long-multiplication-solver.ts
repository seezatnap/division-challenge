import type {
  LongMultiplicationStep,
  LongMultiplicationStepKind,
  MultiplicationProblem,
} from "@/features/contracts";

export interface LongMultiplicationPartialProduct {
  /** Digit of the multiplier driving this row, reading right-to-left. */
  readonly multiplierDigit: number;
  /** Power-of-ten position of the multiplier digit (0 = ones, 1 = tens, ...). */
  readonly position: number;
  /** Raw row value before the place-value shift, e.g. 234 x 5 = 1170. */
  readonly value: number;
}

export interface LongMultiplicationSolution {
  readonly problemId: MultiplicationProblem["id"];
  readonly multiplicand: number;
  readonly multiplier: number;
  /** Product of the factor digit strings, ignoring any decimal points. */
  readonly product: number;
  readonly multiplicandDecimalPlaces: number;
  readonly multiplierDecimalPlaces: number;
  /** Decimal places in the product: the two factor counts added together. */
  readonly productDecimalPlaces: number;
  readonly partialProducts: readonly LongMultiplicationPartialProduct[];
  readonly steps: readonly LongMultiplicationStep[];
}

export interface MultiplicationDecimalPlaces {
  readonly multiplicandDecimalPlaces: number;
  readonly multiplierDecimalPlaces: number;
  readonly productDecimalPlaces: number;
}

const DECIMAL_BASE = 10;

function normalizeDecimalPlaces(value: number | undefined, argumentName: string): number {
  if (typeof value === "undefined") {
    return 0;
  }

  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${argumentName} must be a non-negative integer.`);
  }

  return value;
}

/**
 * Resolves the decimal-place counts for a problem. Whole-number problems
 * (the default) report zero everywhere and produce no decimal-point step.
 */
export function getMultiplicationDecimalPlaces(
  problem: Pick<MultiplicationProblem, "multiplicandDecimalPlaces" | "multiplierDecimalPlaces">,
): MultiplicationDecimalPlaces {
  const multiplicandDecimalPlaces = normalizeDecimalPlaces(
    problem.multiplicandDecimalPlaces,
    "problem.multiplicandDecimalPlaces",
  );
  const multiplierDecimalPlaces = normalizeDecimalPlaces(
    problem.multiplierDecimalPlaces,
    "problem.multiplierDecimalPlaces",
  );

  return {
    multiplicandDecimalPlaces,
    multiplierDecimalPlaces,
    productDecimalPlaces: multiplicandDecimalPlaces + multiplierDecimalPlaces,
  };
}

/**
 * Inserts a decimal point into a digit string, e.g. ("884", 2) -> "8.84".
 * A count equal to the digit length puts the point in front and adds the
 * conventional leading zero ("0.884"); zero returns the digits unchanged. The
 * digits themselves are never padded.
 */
export function formatDigitsWithDecimalPoint(digits: string, decimalPlaces: number): string {
  if (!/^\d+$/.test(digits)) {
    throw new Error("digits must be a non-empty string of numeric characters.");
  }

  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError("decimalPlaces must be a non-negative integer.");
  }

  if (decimalPlaces === 0) {
    return digits;
  }

  if (decimalPlaces > digits.length) {
    throw new RangeError(
      `decimalPlaces (${decimalPlaces}) must not exceed the digit count (${digits.length}).`,
    );
  }

  const splitIndex = digits.length - decimalPlaces;
  const integerPart = splitIndex === 0 ? "0" : digits.slice(0, splitIndex);
  return `${integerPart}.${digits.slice(splitIndex)}`;
}

function assertNonEmptyString(value: string, argumentName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${argumentName} must be a non-empty string.`);
  }
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

function createStepId(
  problemId: string,
  sequenceIndex: number,
  kind: LongMultiplicationStepKind,
): string {
  return `${problemId}:step:${sequenceIndex}:${kind}`;
}

function createStep(
  problemId: string,
  sequenceIndex: number,
  kind: LongMultiplicationStepKind,
  expectedValue: number,
): LongMultiplicationStep {
  const stepId = createStepId(problemId, sequenceIndex, kind);

  return {
    id: stepId,
    problemId,
    kind,
    sequenceIndex,
    expectedValue: String(expectedValue),
    inputTargetId: `${stepId}:target`,
  };
}

function toMultiplierDigitsRightToLeft(multiplier: number): number[] {
  return Array.from(String(multiplier), (character) => {
    const digit = Number.parseInt(character, 10);

    if (Number.isNaN(digit)) {
      throw new Error("multiplier must contain only numeric digits.");
    }

    return digit;
  }).reverse();
}

export function solveLongMultiplication(
  problem: MultiplicationProblem,
): LongMultiplicationSolution {
  assertNonEmptyString(problem.id, "problem.id");
  assertPositiveInteger(problem.multiplicand, "problem.multiplicand");
  assertPositiveInteger(problem.multiplier, "problem.multiplier");

  const decimalPlaces = getMultiplicationDecimalPlaces(problem);
  const multiplicandDigitCount = String(problem.multiplicand).length;
  const multiplierDigitCount = String(problem.multiplier).length;

  if (decimalPlaces.multiplicandDecimalPlaces > multiplicandDigitCount) {
    throw new RangeError(
      "problem.multiplicandDecimalPlaces must not exceed the multiplicand digit count.",
    );
  }

  if (decimalPlaces.multiplierDecimalPlaces > multiplierDigitCount) {
    throw new RangeError(
      "problem.multiplierDecimalPlaces must not exceed the multiplier digit count.",
    );
  }

  const multiplierDigits = toMultiplierDigitsRightToLeft(problem.multiplier);
  const partialProducts: LongMultiplicationPartialProduct[] = [];
  const steps: LongMultiplicationStep[] = [];
  let sequenceIndex = 0;

  for (let position = 0; position < multiplierDigits.length; position += 1) {
    const multiplierDigit = multiplierDigits[position];
    const value = problem.multiplicand * multiplierDigit;

    partialProducts.push({
      multiplierDigit,
      position,
      value,
    });
    steps.push(createStep(problem.id, sequenceIndex, "partial-product", value));
    sequenceIndex += 1;
  }

  const product = problem.multiplicand * problem.multiplier;

  if (multiplierDigits.length > 1) {
    steps.push(createStep(problem.id, sequenceIndex, "product-sum", product));
    sequenceIndex += 1;
  }

  if (decimalPlaces.productDecimalPlaces > 0) {
    // The point must land beside a digit that is really in the product, so a
    // problem such as .1 x .1 (= .01, needing a padding zero) is rejected.
    if (decimalPlaces.productDecimalPlaces > String(product).length) {
      throw new RangeError(
        "The combined decimal places must not exceed the product digit count.",
      );
    }

    // The player answers this step by choosing how many product digits sit to
    // the right of the decimal point.
    steps.push(
      createStep(problem.id, sequenceIndex, "decimal-point", decimalPlaces.productDecimalPlaces),
    );
  }

  return {
    problemId: problem.id,
    multiplicand: problem.multiplicand,
    multiplier: problem.multiplier,
    product,
    ...decimalPlaces,
    partialProducts,
    steps,
  };
}

export function getShiftedPartialProductText(
  partialProduct: LongMultiplicationPartialProduct,
): string {
  return String(partialProduct.value * DECIMAL_BASE ** partialProduct.position);
}
