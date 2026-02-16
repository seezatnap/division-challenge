import type { DifficultyTier, DivisionProblem } from "@/types";
import { getDifficultyConfig } from "./difficulty";

let problemCounter = 0;

/**
 * Generate a random integer with a specific number of digits.
 * For `digits = 3`, returns a number in [100, 999].
 */
function randomWithDigits(digits: number): number {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random integer within a digit range (inclusive on both bounds).
 * For minDigits=2, maxDigits=3, returns a number in [10, 999].
 */
function randomInDigitRange(minDigits: number, maxDigits: number): number {
  const digits =
    minDigits + Math.floor(Math.random() * (maxDigits - minDigits + 1));
  return randomWithDigits(digits);
}

/**
 * Generate a unique problem ID.
 */
function generateId(): string {
  problemCounter += 1;
  return `prob-${Date.now()}-${problemCounter}`;
}

/**
 * Generate a long-division problem for a given difficulty tier.
 *
 * The generated problem guarantees:
 * - dividend and divisor respect the digit-count ranges for the tier
 * - divisor is never 0
 * - dividend >= divisor (so quotient >= 1)
 * - quotient and remainder are mathematically correct
 * - difficulty metadata is attached
 */
export function generateProblem(tier: DifficultyTier): DivisionProblem {
  const config = getDifficultyConfig(tier);

  let dividend: number;
  let divisor: number;

  // Keep generating until dividend >= divisor (guarantees quotient >= 1)
  do {
    dividend = randomInDigitRange(
      config.dividendDigits.min,
      config.dividendDigits.max,
    );
    divisor = randomInDigitRange(
      config.divisorDigits.min,
      config.divisorDigits.max,
    );
  } while (divisor === 0 || dividend < divisor);

  const quotient = Math.floor(dividend / divisor);
  const remainder = dividend % divisor;

  return {
    id: generateId(),
    dividend,
    divisor,
    quotient,
    remainder,
    difficulty: config,
  };
}

/**
 * Generate a batch of problems for a given difficulty tier.
 */
export function generateProblems(
  tier: DifficultyTier,
  count: number,
): DivisionProblem[] {
  return Array.from({ length: count }, () => generateProblem(tier));
}
