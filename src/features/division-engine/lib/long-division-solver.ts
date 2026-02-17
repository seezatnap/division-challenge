import type { DivisionProblem, LongDivisionStep, LongDivisionStepKind } from "@/features/contracts";

export interface LongDivisionSolution {
  readonly problemId: DivisionProblem["id"];
  readonly dividend: number;
  readonly divisor: number;
  readonly quotient: number;
  readonly remainder: number;
  readonly steps: readonly LongDivisionStep[];
}

const DECIMAL_BASE = 10;

function assertNonEmptyString(value: string, argumentName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${argumentName} must be a non-empty string.`);
  }
}

function assertNonNegativeInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${argumentName} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

function createStepId(problemId: string, sequenceIndex: number, kind: LongDivisionStepKind): string {
  return `${problemId}:step:${sequenceIndex}:${kind}`;
}

function createInputTargetId(stepId: string): string {
  return `${stepId}:target`;
}

function createStep(
  problemId: string,
  sequenceIndex: number,
  kind: LongDivisionStepKind,
  expectedValue: number,
): LongDivisionStep {
  const stepId = createStepId(problemId, sequenceIndex, kind);

  return {
    id: stepId,
    problemId,
    kind,
    sequenceIndex,
    expectedValue: String(expectedValue),
    inputTargetId: createInputTargetId(stepId),
  };
}

function toDigitArray(value: number): number[] {
  return Array.from(String(value), (character) => {
    const digit = Number.parseInt(character, 10);

    if (Number.isNaN(digit)) {
      throw new Error("value must contain only numeric digits.");
    }

    return digit;
  });
}

export function solveLongDivision(problem: DivisionProblem): LongDivisionSolution {
  assertNonEmptyString(problem.id, "problem.id");
  assertNonNegativeInteger(problem.dividend, "problem.dividend");
  assertPositiveInteger(problem.divisor, "problem.divisor");

  const digits = toDigitArray(problem.dividend);
  const steps: LongDivisionStep[] = [];
  const quotientDigits: number[] = [];
  let sequenceIndex = 0;

  let digitIndex = 0;
  let workingNumber = digits[digitIndex];

  while (workingNumber < problem.divisor && digitIndex < digits.length - 1) {
    digitIndex += 1;
    workingNumber = workingNumber * DECIMAL_BASE + digits[digitIndex];
  }

  let remainder = 0;

  while (digitIndex < digits.length) {
    const quotientDigit = Math.floor(workingNumber / problem.divisor);
    const multiplyResult = quotientDigit * problem.divisor;
    const subtractionResult = workingNumber - multiplyResult;
    remainder = subtractionResult;
    quotientDigits.push(quotientDigit);

    steps.push(createStep(problem.id, sequenceIndex, "quotient-digit", quotientDigit));
    sequenceIndex += 1;

    steps.push(createStep(problem.id, sequenceIndex, "multiply-result", multiplyResult));
    sequenceIndex += 1;

    steps.push(createStep(problem.id, sequenceIndex, "subtraction-result", subtractionResult));
    sequenceIndex += 1;

    if (digitIndex >= digits.length - 1) {
      break;
    }

    const nextDigit = digits[digitIndex + 1];
    workingNumber = subtractionResult * DECIMAL_BASE + nextDigit;
    digitIndex += 1;

    steps.push(createStep(problem.id, sequenceIndex, "bring-down", workingNumber));
    sequenceIndex += 1;
  }

  const quotient = Number.parseInt(quotientDigits.join(""), 10);

  return {
    problemId: problem.id,
    dividend: problem.dividend,
    divisor: problem.divisor,
    quotient,
    remainder,
    steps,
  };
}
