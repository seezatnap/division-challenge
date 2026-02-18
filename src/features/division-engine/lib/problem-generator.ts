import type { DivisionProblem } from "@/features/contracts";

export type DivisionProblemRemainderMode = "allow" | "require" | "forbid";

export interface DivisionDifficultyTier {
  readonly level: number;
  readonly minDividendDigits: number;
  readonly maxDividendDigits: number;
  readonly minDivisorDigits: number;
  readonly maxDivisorDigits: number;
}

export interface DivisionProblemGenerationOptions {
  readonly difficultyLevel: number;
  readonly remainderMode?: DivisionProblemRemainderMode;
  readonly random?: () => number;
  readonly maxAttempts?: number;
}

export interface DivisionDifficultyProgressionRule {
  readonly level: DivisionDifficultyTier["level"];
  readonly minimumSolvedCount: number;
}

export interface LifetimeAwareDivisionProblemGenerationOptions
  extends Omit<DivisionProblemGenerationOptions, "difficultyLevel"> {
  readonly totalProblemsSolved: number;
}

interface DivisionCandidate {
  readonly dividend: number;
  readonly hasRemainder: boolean;
}

const MAX_GENERATION_ATTEMPTS = 300;
const DECIMAL_BASE = 10;
const RANDOM_ID_MAX = 1_000_000_000;
const RANDOM_ID_PAD_SIZE = 6;
const DEFAULT_REMAINDER_MODE: DivisionProblemRemainderMode = "allow";

export const DIVISION_DIFFICULTY_TIERS = [
  {
    level: 1,
    minDividendDigits: 2,
    maxDividendDigits: 2,
    minDivisorDigits: 1,
    maxDivisorDigits: 1,
  },
  {
    level: 2,
    minDividendDigits: 2,
    maxDividendDigits: 3,
    minDivisorDigits: 1,
    maxDivisorDigits: 1,
  },
  {
    level: 3,
    minDividendDigits: 3,
    maxDividendDigits: 4,
    minDivisorDigits: 1,
    maxDivisorDigits: 2,
  },
  {
    level: 4,
    minDividendDigits: 4,
    maxDividendDigits: 4,
    minDivisorDigits: 2,
    maxDivisorDigits: 2,
  },
  {
    level: 5,
    minDividendDigits: 4,
    maxDividendDigits: 5,
    minDivisorDigits: 2,
    maxDivisorDigits: 3,
  },
] as const satisfies readonly DivisionDifficultyTier[];

export const DIVISION_DIFFICULTY_PROGRESSION_RULES = [
  { level: 1, minimumSolvedCount: 0 },
  { level: 2, minimumSolvedCount: 5 },
  { level: 3, minimumSolvedCount: 12 },
  { level: 4, minimumSolvedCount: 20 },
  { level: 5, minimumSolvedCount: 35 },
] as const satisfies readonly DivisionDifficultyProgressionRule[];

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

function assertRemainderMode(mode: string): asserts mode is DivisionProblemRemainderMode {
  if (mode !== "allow" && mode !== "require" && mode !== "forbid") {
    throw new RangeError('remainderMode must be one of "allow", "require", or "forbid".');
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

function minValueForDigits(digits: number, isDivisor: boolean): number {
  if (digits === 1) {
    return isDivisor ? 2 : 0;
  }

  return DECIMAL_BASE ** (digits - 1);
}

function maxValueForDigits(digits: number): number {
  return DECIMAL_BASE ** digits - 1;
}

export function getDigitCount(value: number): number {
  const absoluteValue = Math.abs(value);

  if (absoluteValue < 1) {
    return 1;
  }

  return Math.floor(Math.log10(absoluteValue)) + 1;
}

export function getDivisionDifficultyTier(difficultyLevel: number): DivisionDifficultyTier {
  assertPositiveInteger(difficultyLevel, "difficultyLevel");

  const maxTierIndex = DIVISION_DIFFICULTY_TIERS.length - 1;
  const clampedIndex = Math.min(difficultyLevel - 1, maxTierIndex);

  return DIVISION_DIFFICULTY_TIERS[clampedIndex];
}

export function getDifficultyLevelForSolvedCount(totalProblemsSolved: number): number {
  assertNonNegativeInteger(totalProblemsSolved, "totalProblemsSolved");

  let resolvedLevel: number = DIVISION_DIFFICULTY_PROGRESSION_RULES[0].level;

  for (const rule of DIVISION_DIFFICULTY_PROGRESSION_RULES) {
    if (totalProblemsSolved < rule.minimumSolvedCount) {
      break;
    }

    resolvedLevel = rule.level;
  }

  return getDivisionDifficultyTier(resolvedLevel).level;
}

export function getDivisionDifficultyTierForSolvedCount(
  totalProblemsSolved: number,
): DivisionDifficultyTier {
  return getDivisionDifficultyTier(getDifficultyLevelForSolvedCount(totalProblemsSolved));
}

function chooseRemainderMode(
  requestedRemainderMode: DivisionProblemRemainderMode,
  random: () => number,
): boolean {
  if (requestedRemainderMode === "require") {
    return true;
  }

  if (requestedRemainderMode === "forbid") {
    return false;
  }

  return pullRandomUnitInterval(random) >= 0.5;
}

function createDividendCandidate(
  divisor: number,
  dividendDigits: number,
  requireRemainder: boolean,
  random: () => number,
): DivisionCandidate | null {
  const minDividend = minValueForDigits(dividendDigits, false);
  const maxDividend = maxValueForDigits(dividendDigits);

  if (requireRemainder) {
    const minQuotient = Math.max(1, Math.ceil((minDividend - (divisor - 1)) / divisor));
    const maxQuotient = Math.floor((maxDividend - 1) / divisor);

    if (minQuotient > maxQuotient) {
      return null;
    }

    for (let quotientAttempt = 0; quotientAttempt < 12; quotientAttempt += 1) {
      const quotient = randomInteger(minQuotient, maxQuotient, random);
      const baseDividend = divisor * quotient;
      const minRemainder = Math.max(1, minDividend - baseDividend);
      const maxRemainder = Math.min(divisor - 1, maxDividend - baseDividend);

      if (minRemainder > maxRemainder) {
        continue;
      }

      const remainder = randomInteger(minRemainder, maxRemainder, random);
      const dividend = baseDividend + remainder;

      if (getDigitCount(dividend) === dividendDigits) {
        return {
          dividend,
          hasRemainder: true,
        };
      }
    }

    return null;
  }

  const minQuotient = Math.max(1, Math.ceil(minDividend / divisor));
  const maxQuotient = Math.floor(maxDividend / divisor);

  if (minQuotient > maxQuotient) {
    return null;
  }

  const quotient = randomInteger(minQuotient, maxQuotient, random);
  const dividend = divisor * quotient;

  if (getDigitCount(dividend) !== dividendDigits) {
    return null;
  }

  return {
    dividend,
    hasRemainder: false,
  };
}

function createProblemId(difficultyLevel: number, random: () => number): string {
  const randomPart = Math.floor(pullRandomUnitInterval(random) * RANDOM_ID_MAX)
    .toString(36)
    .padStart(RANDOM_ID_PAD_SIZE, "0");

  return `division-${difficultyLevel}-${randomPart}`;
}

export function generateDivisionProblem(
  options: DivisionProblemGenerationOptions,
): DivisionProblem {
  const {
    difficultyLevel,
    random = Math.random,
    maxAttempts = MAX_GENERATION_ATTEMPTS,
    remainderMode = DEFAULT_REMAINDER_MODE,
  } = options;

  assertPositiveInteger(maxAttempts, "maxAttempts");
  assertRemainderMode(remainderMode);

  const difficultyTier = getDivisionDifficultyTier(difficultyLevel);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const dividendDigits = randomInteger(
      difficultyTier.minDividendDigits,
      difficultyTier.maxDividendDigits,
      random,
    );
    const divisorDigits = randomInteger(
      difficultyTier.minDivisorDigits,
      difficultyTier.maxDivisorDigits,
      random,
    );

    const divisor = randomInteger(
      minValueForDigits(divisorDigits, true),
      maxValueForDigits(divisorDigits),
      random,
    );

    const requireRemainder = chooseRemainderMode(remainderMode, random);
    const candidate =
      createDividendCandidate(divisor, dividendDigits, requireRemainder, random) ??
      (remainderMode === "allow"
        ? createDividendCandidate(divisor, dividendDigits, !requireRemainder, random)
        : null);

    if (!candidate) {
      continue;
    }

    return {
      id: createProblemId(difficultyTier.level, random),
      dividend: candidate.dividend,
      divisor,
      allowRemainder: candidate.hasRemainder,
      difficultyLevel: difficultyTier.level,
    };
  }

  throw new Error(
    `Unable to generate a division problem for difficulty level ${difficultyTier.level} after ${maxAttempts} attempts.`,
  );
}

export function generateDivisionProblemForSolvedCount(
  options: LifetimeAwareDivisionProblemGenerationOptions,
): DivisionProblem {
  const { totalProblemsSolved, ...generationOptions } = options;
  const difficultyLevel = getDifficultyLevelForSolvedCount(totalProblemsSolved);

  return generateDivisionProblem({
    ...generationOptions,
    difficultyLevel,
  });
}
