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
  readonly product: number;
  readonly partialProducts: readonly LongMultiplicationPartialProduct[];
  readonly steps: readonly LongMultiplicationStep[];
}

const DECIMAL_BASE = 10;

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
  }

  return {
    problemId: problem.id,
    multiplicand: problem.multiplicand,
    multiplier: problem.multiplier,
    product,
    partialProducts,
    steps,
  };
}

export function getShiftedPartialProductText(
  partialProduct: LongMultiplicationPartialProduct,
): string {
  return String(partialProduct.value * DECIMAL_BASE ** partialProduct.position);
}
