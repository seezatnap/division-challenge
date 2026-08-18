import type { MultiplicationProblem } from "@/features/contracts";

export interface MultiplicationDifficultyTier {
  readonly level: number;
  readonly minMultiplicandDigits: number;
  readonly maxMultiplicandDigits: number;
  readonly minMultiplierDigits: number;
  readonly maxMultiplierDigits: number;
  /**
   * Decimal places allowed in the multiplicand. Omitted means whole numbers
   * only. A value equal to the digit count puts the point before the first
   * digit (e.g. .884).
   */
  readonly minMultiplicandDecimalPlaces?: number;
  readonly maxMultiplicandDecimalPlaces?: number;
  /** Decimal places allowed in the multiplier; omitted means whole numbers only. */
  readonly minMultiplierDecimalPlaces?: number;
  readonly maxMultiplierDecimalPlaces?: number;
}

export interface MultiplicationProblemGenerationOptions {
  readonly difficultyLevel: number;
  readonly random?: () => number;
  readonly maxAttempts?: number;
}

export interface MultiplicationDifficultyProgressionRule {
  readonly level: MultiplicationDifficultyTier["level"];
  readonly minimumSolvedCount: number;
}

export interface LifetimeAwareMultiplicationProblemGenerationOptions
  extends Omit<MultiplicationProblemGenerationOptions, "difficultyLevel"> {
  readonly totalProblemsSolved: number;
}

const MAX_GENERATION_ATTEMPTS = 300;
const DECIMAL_BASE = 10;
const RANDOM_ID_MAX = 1_000_000_000;
const RANDOM_ID_PAD_SIZE = 6;

export const MULTIPLICATION_DIFFICULTY_TIERS = [
  {
    level: 1,
    minMultiplicandDigits: 1,
    maxMultiplicandDigits: 1,
    minMultiplierDigits: 1,
    maxMultiplierDigits: 1,
  },
  {
    level: 2,
    minMultiplicandDigits: 2,
    maxMultiplicandDigits: 2,
    minMultiplierDigits: 1,
    maxMultiplierDigits: 1,
  },
  {
    level: 3,
    minMultiplicandDigits: 3,
    maxMultiplicandDigits: 3,
    minMultiplierDigits: 1,
    maxMultiplierDigits: 1,
  },
  {
    level: 4,
    minMultiplicandDigits: 2,
    maxMultiplicandDigits: 2,
    minMultiplierDigits: 2,
    maxMultiplierDigits: 2,
  },
  {
    // HARD: decimal multiplication. Both factors always carry a decimal point.
    level: 5,
    minMultiplicandDigits: 3,
    maxMultiplicandDigits: 3,
    minMultiplierDigits: 2,
    maxMultiplierDigits: 2,
    minMultiplicandDecimalPlaces: 1,
    maxMultiplicandDecimalPlaces: 3,
    minMultiplierDecimalPlaces: 1,
    maxMultiplierDecimalPlaces: 2,
  },
] as const satisfies readonly MultiplicationDifficultyTier[];

export const MULTIPLICATION_DIFFICULTY_PROGRESSION_RULES = [
  { level: 1, minimumSolvedCount: 0 },
  { level: 2, minimumSolvedCount: 5 },
  { level: 3, minimumSolvedCount: 12 },
  { level: 4, minimumSolvedCount: 20 },
  { level: 5, minimumSolvedCount: 35 },
] as const satisfies readonly MultiplicationDifficultyProgressionRule[];

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

function pullRandomUnitInterval(random: () => number): number {
  const value = random();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError("random must return a finite number in the range [0, 1).");
  }

  return value;
}

function randomInteger(min: number, max: number, random: () => number): number {
  if (max < min) {
    throw new RangeError("max must be greater than or equal to min.");
  }

  if (max === min) {
    return min;
  }

  const span = max - min + 1;
  return min + Math.floor(pullRandomUnitInterval(random) * span);
}

function randomNonZeroDigit(random: () => number): number {
  return randomInteger(2, 9, random);
}

function randomDecimalPlaces(
  digits: number,
  minDecimalPlaces: number | undefined,
  maxDecimalPlaces: number | undefined,
  random: () => number,
): number {
  // Never ask for more decimal places than the factor has digits.
  const min = Math.min(digits, Math.max(0, minDecimalPlaces ?? 0));
  const max = Math.min(digits, Math.max(min, maxDecimalPlaces ?? 0));

  return randomInteger(min, max, random);
}

/**
 * A decimal product is only valid when its decimal point lands beside a digit
 * that actually appears in the product. `.1 x .1 = .01` would need a padding
 * zero, so it is rejected; `.2 x .5 = .10` is fine because the point sits
 * right before the leading `1`.
 */
export function isDecimalPointPlaceable(
  productDigitCount: number,
  totalDecimalPlaces: number,
): boolean {
  return totalDecimalPlaces >= 0 && totalDecimalPlaces <= productDigitCount;
}

function randomFactorWithDigits(digits: number, random: () => number): number {
  if (digits === 1) {
    return randomNonZeroDigit(random);
  }

  // Every digit is kept non-zero so each partial-product row stays meaningful
  // for the player instead of collapsing into an all-zero row.
  let factor = 0;
  for (let digitIndex = 0; digitIndex < digits; digitIndex += 1) {
    factor = factor * DECIMAL_BASE + randomInteger(digitIndex === 0 ? 2 : 1, 9, random);
  }

  return factor;
}

export function getMultiplicationDifficultyTier(
  difficultyLevel: number,
): MultiplicationDifficultyTier {
  assertPositiveInteger(difficultyLevel, "difficultyLevel");

  const maxTierIndex = MULTIPLICATION_DIFFICULTY_TIERS.length - 1;
  const clampedIndex = Math.min(difficultyLevel - 1, maxTierIndex);

  return MULTIPLICATION_DIFFICULTY_TIERS[clampedIndex];
}

export function getMultiplicationDifficultyLevelForSolvedCount(
  totalProblemsSolved: number,
): number {
  assertNonNegativeInteger(totalProblemsSolved, "totalProblemsSolved");

  let resolvedLevel: number = MULTIPLICATION_DIFFICULTY_PROGRESSION_RULES[0].level;

  for (const rule of MULTIPLICATION_DIFFICULTY_PROGRESSION_RULES) {
    if (totalProblemsSolved < rule.minimumSolvedCount) {
      break;
    }

    resolvedLevel = rule.level;
  }

  return getMultiplicationDifficultyTier(resolvedLevel).level;
}

function createProblemId(difficultyLevel: number, random: () => number): string {
  const randomPart = Math.floor(pullRandomUnitInterval(random) * RANDOM_ID_MAX)
    .toString(36)
    .padStart(RANDOM_ID_PAD_SIZE, "0");

  return `multiplication-${difficultyLevel}-${randomPart}`;
}

export function generateMultiplicationProblem(
  options: MultiplicationProblemGenerationOptions,
): MultiplicationProblem {
  const { difficultyLevel, random = Math.random, maxAttempts = MAX_GENERATION_ATTEMPTS } = options;

  assertPositiveInteger(maxAttempts, "maxAttempts");

  const difficultyTier = getMultiplicationDifficultyTier(difficultyLevel);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const multiplicandDigits = randomInteger(
      difficultyTier.minMultiplicandDigits,
      difficultyTier.maxMultiplicandDigits,
      random,
    );
    const multiplierDigits = randomInteger(
      difficultyTier.minMultiplierDigits,
      difficultyTier.maxMultiplierDigits,
      random,
    );

    const multiplicand = randomFactorWithDigits(multiplicandDigits, random);
    const multiplier = randomFactorWithDigits(multiplierDigits, random);
    const multiplicandDecimalPlaces = randomDecimalPlaces(
      multiplicandDigits,
      difficultyTier.minMultiplicandDecimalPlaces,
      difficultyTier.maxMultiplicandDecimalPlaces,
      random,
    );
    const multiplierDecimalPlaces = randomDecimalPlaces(
      multiplierDigits,
      difficultyTier.minMultiplierDecimalPlaces,
      difficultyTier.maxMultiplierDecimalPlaces,
      random,
    );
    const product = multiplicand * multiplier;

    if (!Number.isSafeInteger(product)) {
      continue;
    }

    if (
      !isDecimalPointPlaceable(
        String(product).length,
        multiplicandDecimalPlaces + multiplierDecimalPlaces,
      )
    ) {
      continue;
    }

    return {
      id: createProblemId(difficultyTier.level, random),
      multiplicand,
      multiplier,
      multiplicandDecimalPlaces,
      multiplierDecimalPlaces,
      difficultyLevel: difficultyTier.level,
    };
  }

  throw new Error(
    `Unable to generate a multiplication problem for difficulty level ${difficultyTier.level} after ${maxAttempts} attempts.`,
  );
}

export function generateMultiplicationProblemForSolvedCount(
  options: LifetimeAwareMultiplicationProblemGenerationOptions,
): MultiplicationProblem {
  const { totalProblemsSolved, ...generationOptions } = options;
  const difficultyLevel = getMultiplicationDifficultyLevelForSolvedCount(totalProblemsSolved);

  return generateMultiplicationProblem({
    ...generationOptions,
    difficultyLevel,
  });
}
