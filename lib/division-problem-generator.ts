import {
  DIVISION_DIFFICULTIES,
  type DivisionDifficultyDefinition,
  type DivisionDifficultyId,
  type DivisionProblem,
} from "./domain";

export const DIVISION_REMAINDER_MODES = [
  "allow",
  "require",
  "forbid",
] as const;

export type DivisionRemainderMode = (typeof DIVISION_REMAINDER_MODES)[number];

export interface DivisionProblemDifficultyMetadata {
  id: DivisionDifficultyId;
  label: string;
  tier: number;
  tierCount: number;
  dividendDigits: readonly [min: number, max: number];
  divisorDigits: readonly [min: number, max: number];
  generatedDividendDigits: number;
  generatedDivisorDigits: number;
  remainderMode: DivisionRemainderMode;
  hasRemainder: boolean;
}

export interface GeneratedDivisionProblem extends DivisionProblem {
  hasRemainder: boolean;
  difficultyMetadata: DivisionProblemDifficultyMetadata;
}

export interface GenerateDivisionProblemOptions {
  difficulty?: DivisionDifficultyId;
  tier?: number;
  remainderMode?: DivisionRemainderMode;
  random?: () => number;
  createdAt?: Date | string;
}

const MAX_GENERATION_ATTEMPTS = 2_000;
const ID_FALLBACK_MULTIPLIER = 1_000_000_000;

function getMinForDigits(digits: number): number {
  return digits === 1 ? 1 : 10 ** (digits - 1);
}

function getMaxForDigits(digits: number): number {
  return (10 ** digits) - 1;
}

function countDigits(value: number): number {
  return Math.abs(value).toString().length;
}

function randomIntInclusive(
  random: () => number,
  min: number,
  max: number,
): number {
  const raw = random();

  if (!Number.isFinite(raw) || raw < 0 || raw >= 1) {
    throw new Error("Random source must return a finite value in [0, 1).");
  }

  return Math.floor(raw * ((max - min) + 1)) + min;
}

function createProblemId(random: () => number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `problem-${Date.now()}-${Math.floor(random() * ID_FALLBACK_MULTIPLIER)}`;
}

function toIsoDate(createdAt?: Date | string): string {
  if (createdAt instanceof Date) {
    return createdAt.toISOString();
  }

  if (typeof createdAt === "string") {
    const parsed = new Date(createdAt);

    if (Number.isNaN(parsed.getTime())) {
      throw new Error("createdAt must be a valid ISO date string.");
    }

    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function resolveDifficultyDefinition(
  difficulty: DivisionDifficultyId | undefined,
  tier: number | undefined,
): DivisionDifficultyDefinition {
  if (difficulty !== undefined && tier !== undefined) {
    throw new Error("Provide either difficulty or tier, but not both.");
  }

  if (difficulty !== undefined) {
    const match = DIVISION_DIFFICULTIES.find(
      (candidate) => candidate.id === difficulty,
    );

    if (!match) {
      throw new Error(`Unknown division difficulty "${difficulty}".`);
    }

    return match;
  }

  if (tier !== undefined) {
    if (
      !Number.isInteger(tier) ||
      tier < 1 ||
      tier > DIVISION_DIFFICULTIES.length
    ) {
      throw new Error(
        `Tier must be an integer between 1 and ${DIVISION_DIFFICULTIES.length}.`,
      );
    }

    return DIVISION_DIFFICULTIES[tier - 1];
  }

  return DIVISION_DIFFICULTIES[0];
}

export function isDivisionRemainderMode(
  value: unknown,
): value is DivisionRemainderMode {
  return typeof value === "string" &&
    DIVISION_REMAINDER_MODES.includes(value as DivisionRemainderMode);
}

export function getDivisionDifficultyByTier(
  tier: number,
): DivisionDifficultyDefinition {
  return resolveDifficultyDefinition(undefined, tier);
}

export function getDivisionDifficultyDefinition(
  difficulty: DivisionDifficultyId,
): DivisionDifficultyDefinition {
  return resolveDifficultyDefinition(difficulty, undefined);
}

export function generateDivisionProblem(
  options: GenerateDivisionProblemOptions = {},
): GeneratedDivisionProblem {
  const random = options.random ?? Math.random;
  const remainderMode = options.remainderMode ?? "allow";
  const difficulty = resolveDifficultyDefinition(options.difficulty, options.tier);

  if (!isDivisionRemainderMode(remainderMode)) {
    throw new Error(`Unsupported remainder mode "${remainderMode}".`);
  }

  const targetDividendDigits = randomIntInclusive(
    random,
    difficulty.dividendDigits[0],
    difficulty.dividendDigits[1],
  );
  const targetDivisorDigits = randomIntInclusive(
    random,
    difficulty.divisorDigits[0],
    difficulty.divisorDigits[1],
  );

  const minDividend = getMinForDigits(targetDividendDigits);
  const maxDividend = getMaxForDigits(targetDividendDigits);
  const minDivisorFromDigits = getMinForDigits(targetDivisorDigits);
  const maxDivisor = getMaxForDigits(targetDivisorDigits);
  const minDivisor = remainderMode === "require"
    ? Math.max(2, minDivisorFromDigits)
    : minDivisorFromDigits;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const divisor = randomIntInclusive(random, minDivisor, maxDivisor);
    const maxRemainder = divisor - 1;

    let remainder = 0;

    if (remainderMode === "require") {
      remainder = randomIntInclusive(random, 1, maxRemainder);
    } else if (remainderMode === "allow") {
      remainder = randomIntInclusive(random, 0, maxRemainder);
    }

    const minQuotient = Math.ceil((minDividend - remainder) / divisor);
    const maxQuotient = Math.floor((maxDividend - remainder) / divisor);
    const lowerQuotientBound = Math.max(1, minQuotient);

    if (lowerQuotientBound > maxQuotient) {
      continue;
    }

    const quotient = randomIntInclusive(
      random,
      lowerQuotientBound,
      maxQuotient,
    );
    const dividend = (divisor * quotient) + remainder;

    if (countDigits(dividend) !== targetDividendDigits) {
      continue;
    }

    const tierIndex = DIVISION_DIFFICULTIES.findIndex(
      (candidate) => candidate.id === difficulty.id,
    );
    const hasRemainder = remainder > 0;

    if (tierIndex < 0) {
      throw new Error(`Difficulty "${difficulty.id}" is not part of the tier list.`);
    }

    return {
      id: createProblemId(random),
      dividend,
      divisor,
      quotient,
      remainder,
      difficulty: difficulty.id,
      createdAt: toIsoDate(options.createdAt),
      hasRemainder,
      difficultyMetadata: {
        id: difficulty.id,
        label: difficulty.label,
        tier: tierIndex + 1,
        tierCount: DIVISION_DIFFICULTIES.length,
        dividendDigits: difficulty.dividendDigits,
        divisorDigits: difficulty.divisorDigits,
        generatedDividendDigits: targetDividendDigits,
        generatedDivisorDigits: targetDivisorDigits,
        remainderMode,
        hasRemainder,
      },
    };
  }

  throw new Error(
    `Unable to generate a valid division problem for difficulty "${difficulty.id}".`,
  );
}
