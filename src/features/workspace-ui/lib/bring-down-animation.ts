import type { LongDivisionStep } from "@/features/contracts";

export interface BringDownAnimationSource {
  stepId: LongDivisionStep["id"];
  sourceDividendDigitIndex: number;
  digit: string;
}

export type BringDownAnimationSourceByStepId = Record<
  LongDivisionStep["id"],
  BringDownAnimationSource
>;

export interface BuildBringDownAnimationSourceByStepIdInput {
  divisor: number;
  dividend: number;
  steps: readonly LongDivisionStep[];
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

function toDividendDigits(dividend: number): string[] {
  return Array.from(String(dividend));
}

function resolveFallbackBringDownDigit(step: LongDivisionStep): string {
  return step.expectedValue.at(-1) ?? "0";
}

export function resolveInitialWorkingDividendDigitCount(
  dividend: number,
  divisor: number,
): number {
  assertNonNegativeInteger(dividend, "dividend");
  assertPositiveInteger(divisor, "divisor");

  const digits = toDividendDigits(dividend).map((digitCharacter) => Number.parseInt(digitCharacter, 10));
  let digitIndex = 0;
  let workingNumber = digits[digitIndex];

  while (workingNumber < divisor && digitIndex < digits.length - 1) {
    digitIndex += 1;
    workingNumber = workingNumber * 10 + digits[digitIndex];
  }

  return digitIndex + 1;
}

export function buildBringDownAnimationSourceByStepId({
  divisor,
  dividend,
  steps,
}: BuildBringDownAnimationSourceByStepIdInput): BringDownAnimationSourceByStepId {
  assertNonNegativeInteger(dividend, "dividend");
  assertPositiveInteger(divisor, "divisor");

  const dividendDigits = toDividendDigits(dividend);
  const bringDownAnimationSourceByStepId: BringDownAnimationSourceByStepId = {};
  let sourceDigitIndex = resolveInitialWorkingDividendDigitCount(dividend, divisor);

  for (const step of steps) {
    if (step.kind !== "bring-down") {
      continue;
    }

    const fallbackDigit = resolveFallbackBringDownDigit(step);
    const sourceDigit = dividendDigits[sourceDigitIndex] ?? fallbackDigit;

    bringDownAnimationSourceByStepId[step.id] = {
      stepId: step.id,
      sourceDividendDigitIndex:
        sourceDigitIndex < dividendDigits.length
          ? sourceDigitIndex
          : Math.max(dividendDigits.length - 1, 0),
      digit: sourceDigit,
    };

    sourceDigitIndex += 1;
  }

  return bringDownAnimationSourceByStepId;
}
