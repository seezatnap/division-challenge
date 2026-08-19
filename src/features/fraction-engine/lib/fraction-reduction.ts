/**
 * Fraction-reducing rules.
 *
 * A problem starts as `numerator / 10^n` where the numerator deliberately
 * carries a known number of 2s and 5s. The player reduces it one prime at a
 * time: each round they are asked which of a fixed list of candidate divisors
 * divides *both* halves, then they work out the two divisions. When nothing in
 * the list divides both any more, "none of the above" is the correct answer and
 * the problem is finished.
 *
 * Everything here is pure so the rules can be tested without a UI.
 */

/**
 * The choices offered every round. Deliberately not "the primes": 9 is on the
 * list because spotting that 9 divides a number is the same skill, and the list
 * has to contain wrong answers for the question to mean anything.
 */
export const FRACTION_DIVISOR_CHOICES = [2, 3, 5, 7, 9, 11] as const;

export type FractionDivisorChoice = (typeof FRACTION_DIVISOR_CHOICES)[number];

/** The "none of the above" answer, which ends the problem when it is correct. */
export const NO_COMMON_DIVISOR_CHOICE = "none" as const;

export type FractionReductionChoice =
  | FractionDivisorChoice
  | typeof NO_COMMON_DIVISOR_CHOICE;

export interface FractionValue {
  readonly numerator: number;
  readonly denominator: number;
}

export interface FractionDivisionTargets {
  readonly numerator: number;
  readonly denominator: number;
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

export function assertFractionValue(fraction: FractionValue): void {
  assertPositiveInteger(fraction.numerator, "fraction.numerator");
  assertPositiveInteger(fraction.denominator, "fraction.denominator");
}

export function greatestCommonDivisor(first: number, second: number): number {
  let left = Math.abs(Math.trunc(first));
  let right = Math.abs(Math.trunc(second));

  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left;
}

export function isFractionDivisorChoice(value: unknown): value is FractionDivisorChoice {
  return FRACTION_DIVISOR_CHOICES.includes(value as FractionDivisorChoice);
}

/** The subset of the offered choices that divides both halves of the fraction. */
export function getValidFractionDivisors(
  fraction: FractionValue,
): readonly FractionDivisorChoice[] {
  assertFractionValue(fraction);

  return FRACTION_DIVISOR_CHOICES.filter(
    (candidate) =>
      fraction.numerator % candidate === 0 && fraction.denominator % candidate === 0,
  );
}

/**
 * True when nothing on the list divides both halves — i.e. when "none of the
 * above" is the right answer. This is the list's definition of "done", which is
 * what the player is actually being asked, rather than gcd === 1.
 */
export function isFractionFullyReduced(fraction: FractionValue): boolean {
  return getValidFractionDivisors(fraction).length === 0;
}

export function isFractionReductionChoiceCorrect(
  fraction: FractionValue,
  choice: FractionReductionChoice,
): boolean {
  if (choice === NO_COMMON_DIVISOR_CHOICE) {
    return isFractionFullyReduced(fraction);
  }

  if (!isFractionDivisorChoice(choice)) {
    return false;
  }

  return getValidFractionDivisors(fraction).includes(choice);
}

/** The two answers the player has to work out after choosing a divisor. */
export function getFractionDivisionTargets(
  fraction: FractionValue,
  divisor: FractionDivisorChoice,
): FractionDivisionTargets {
  assertFractionValue(fraction);

  if (!isFractionReductionChoiceCorrect(fraction, divisor)) {
    throw new RangeError(
      `${divisor} does not divide both ${fraction.numerator} and ${fraction.denominator}.`,
    );
  }

  return {
    numerator: fraction.numerator / divisor,
    denominator: fraction.denominator / divisor,
  };
}

export function applyFractionDivisor(
  fraction: FractionValue,
  divisor: FractionDivisorChoice,
): FractionValue {
  return getFractionDivisionTargets(fraction, divisor);
}

/**
 * How many single-divisor rounds are still needed. Used for progress display
 * and to check a generated problem has the intended amount of work in it.
 */
export function countRemainingReductionRounds(fraction: FractionValue): number {
  assertFractionValue(fraction);

  let currentFraction = fraction;
  let rounds = 0;

  // Each round removes at least one prime factor from the gcd, so this
  // terminates; the bound is a guard against a future rule change.
  while (rounds < 64) {
    const [nextDivisor] = getValidFractionDivisors(currentFraction);
    if (nextDivisor === undefined) {
      return rounds;
    }

    currentFraction = applyFractionDivisor(currentFraction, nextDivisor);
    rounds += 1;
  }

  throw new Error("Fraction reduction did not terminate.");
}

export function formatFraction(fraction: FractionValue): string {
  return `${fraction.numerator}/${fraction.denominator}`;
}

export function areFractionsEqual(first: FractionValue, second: FractionValue): boolean {
  return (
    first.numerator === second.numerator && first.denominator === second.denominator
  );
}
