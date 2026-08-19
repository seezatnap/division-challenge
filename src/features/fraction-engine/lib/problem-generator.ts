/**
 * Generates fraction-reducing problems.
 *
 * The denominator is always a power of ten (100, 1000 or 10000), so the only
 * divisors that can ever be shared with the numerator are 2 and 5. The
 * numerator is built as `2^twos * 5^fives * cofactor`, where the cofactor is
 * coprime to 10 — which fixes the amount of work exactly: the fraction takes
 * `twos + fives` single-divisor rounds to reduce, and then stops.
 *
 * The mix is deliberately lopsided: at most one 5 and up to four 2s, so most
 * rounds are halving and dividing by 5 stays a one-off.
 */

import {
  countRemainingReductionRounds,
  type FractionValue,
} from "./fraction-reduction";

export const FRACTION_DENOMINATOR_EXPONENTS = [2, 3, 4] as const;

/** Keeps the numerator readable: at most two digits of non-reducible factor. */
const MAX_COFACTOR = 99;

/** A fraction carries at most one factor of 5 and no more than four 2s. */
const MAX_FIVES = 1;
const MAX_TWOS = 4;

export interface FractionDifficultyTier {
  readonly level: number;
  readonly minReductionRounds: number;
  readonly maxReductionRounds: number;
}

/**
 * Mirrors the difficulty choices the player sees: easy is two rounds of
 * reducing, medium three or four, hard four or five.
 */
export const FRACTION_DIFFICULTY_TIERS: readonly FractionDifficultyTier[] = [
  { level: 1, minReductionRounds: 2, maxReductionRounds: 2 },
  { level: 2, minReductionRounds: 2, maxReductionRounds: 2 },
  { level: 3, minReductionRounds: 3, maxReductionRounds: 4 },
  { level: 4, minReductionRounds: 3, maxReductionRounds: 4 },
  { level: 5, minReductionRounds: 4, maxReductionRounds: 5 },
];

export interface FractionReductionProblem {
  readonly id: string;
  readonly difficultyLevel: number;
  readonly fraction: FractionValue;
  /** Number of single-divisor rounds needed to fully reduce the fraction. */
  readonly reductionRounds: number;
}

export interface FractionProblemGenerationOptions {
  readonly difficultyLevel: number;
  readonly random?: () => number;
}

export interface LifetimeAwareFractionProblemGenerationOptions
  extends Omit<FractionProblemGenerationOptions, "difficultyLevel"> {
  readonly difficultyLevel: number;
}

interface FractionShape {
  readonly denominatorExponent: number;
  readonly twos: number;
  readonly fives: number;
  readonly maxCofactor: number;
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

function randomInteger(min: number, max: number, random: () => number): number {
  if (max < min) {
    throw new RangeError("max must be greater than or equal to min.");
  }

  if (max === min) {
    return min;
  }

  return min + Math.floor(random() * (max - min + 1));
}

function pickRandomEntry<TEntry>(entries: readonly TEntry[], random: () => number): TEntry {
  if (entries.length === 0) {
    throw new RangeError("Cannot pick from an empty list.");
  }

  return entries[Math.min(entries.length - 1, Math.floor(random() * entries.length))];
}

export function getFractionDifficultyTier(difficultyLevel: number): FractionDifficultyTier {
  assertPositiveInteger(difficultyLevel, "difficultyLevel");

  const maxTierIndex = FRACTION_DIFFICULTY_TIERS.length - 1;
  return FRACTION_DIFFICULTY_TIERS[Math.min(difficultyLevel - 1, maxTierIndex)];
}

/**
 * Every (denominator, twos, fives) combination that yields exactly
 * `reductionRounds` rounds while keeping the fraction proper.
 */
export function getFractionShapesForRounds(reductionRounds: number): readonly FractionShape[] {
  assertPositiveInteger(reductionRounds, "reductionRounds");

  const shapes: FractionShape[] = [];

  for (const denominatorExponent of FRACTION_DENOMINATOR_EXPONENTS) {
    const denominator = 10 ** denominatorExponent;
    const maxTwos = Math.min(denominatorExponent, MAX_TWOS, reductionRounds);

    for (let twos = 0; twos <= maxTwos; twos += 1) {
      const fives = reductionRounds - twos;
      if (fives > Math.min(denominatorExponent, MAX_FIVES)) {
        continue;
      }

      const sharedFactor = 2 ** twos * 5 ** fives;
      // A proper fraction keeps the reduced result meaningful (and guarantees
      // the final denominator never collapses to 1).
      const maxCofactor = Math.min(MAX_COFACTOR, Math.ceil(denominator / sharedFactor) - 1);
      if (maxCofactor < 1) {
        continue;
      }

      shapes.push({ denominatorExponent, twos, fives, maxCofactor });
    }
  }

  return shapes;
}

function isCoprimeToTen(value: number): boolean {
  return value % 2 !== 0 && value % 5 !== 0;
}

function getCofactorCandidates(maxCofactor: number): readonly number[] {
  const candidates: number[] = [];
  for (let candidate = 1; candidate <= maxCofactor; candidate += 1) {
    if (isCoprimeToTen(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function createProblemId(fraction: FractionValue, random: () => number): string {
  const suffix = Math.floor(random() * 1_000_000)
    .toString(36)
    .padStart(4, "0");
  return `fraction-${fraction.numerator}-${fraction.denominator}-${suffix}`;
}

export function generateFractionReductionProblem(
  options: FractionProblemGenerationOptions,
): FractionReductionProblem {
  const { difficultyLevel, random = Math.random } = options;
  const tier = getFractionDifficultyTier(difficultyLevel);

  const requestedRounds = randomInteger(
    tier.minReductionRounds,
    tier.maxReductionRounds,
    random,
  );

  // Five rounds only fit under 10000 (2^4 * 5); fall back a round at a time
  // rather than failing when a tier asks for more than a denominator can carry.
  let shapes: readonly FractionShape[] = [];
  let reductionRounds = requestedRounds;
  while (reductionRounds >= 1) {
    shapes = getFractionShapesForRounds(reductionRounds);
    if (shapes.length > 0) {
      break;
    }

    reductionRounds -= 1;
  }

  if (shapes.length === 0) {
    throw new Error(`No fraction shape exists for difficulty level ${difficultyLevel}.`);
  }

  const shape = pickRandomEntry(shapes, random);
  const cofactor = pickRandomEntry(getCofactorCandidates(shape.maxCofactor), random);
  const fraction: FractionValue = {
    numerator: 2 ** shape.twos * 5 ** shape.fives * cofactor,
    denominator: 10 ** shape.denominatorExponent,
  };

  const actualRounds = countRemainingReductionRounds(fraction);
  if (actualRounds !== reductionRounds) {
    throw new Error(
      `Generated ${fraction.numerator}/${fraction.denominator} needs ${actualRounds} rounds, expected ${reductionRounds}.`,
    );
  }

  return {
    id: createProblemId(fraction, random),
    difficultyLevel,
    fraction,
    reductionRounds,
  };
}

export function generateFractionReductionProblemForSolvedCount(
  options: LifetimeAwareFractionProblemGenerationOptions,
): FractionReductionProblem {
  return generateFractionReductionProblem(options);
}
