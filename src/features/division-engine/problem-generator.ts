import { DifficultyLevel, DivisionProblem } from "@/types";

// ---------------------------------------------------------------------------
// Difficulty-tier range definitions
// ---------------------------------------------------------------------------

interface DifficultyRange {
  /** Inclusive min/max for the dividend digit count. */
  dividendDigits: [min: number, max: number];
  /** Inclusive min/max for the divisor digit count. */
  divisorDigits: [min: number, max: number];
}

const DIFFICULTY_RANGES: Record<DifficultyLevel, DifficultyRange> = {
  [DifficultyLevel.Easy]: {
    dividendDigits: [2, 2], // 10–99
    divisorDigits: [1, 1], // 2–9
  },
  [DifficultyLevel.Medium]: {
    dividendDigits: [3, 3], // 100–999
    divisorDigits: [1, 1], // 2–9
  },
  [DifficultyLevel.Hard]: {
    dividendDigits: [3, 3], // 100–999
    divisorDigits: [2, 2], // 10–99
  },
  [DifficultyLevel.Expert]: {
    dividendDigits: [4, 5], // 1000–99999
    divisorDigits: [2, 3], // 10–999
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return a random integer in [min, max] (inclusive). */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Return the smallest N-digit number (e.g. 3 → 100). */
function minWithDigits(digits: number): number {
  if (digits <= 1) return 2; // divisor must be ≥ 2
  return Math.pow(10, digits - 1);
}

/** Return the largest N-digit number (e.g. 3 → 999). */
function maxWithDigits(digits: number): number {
  return Math.pow(10, digits) - 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateProblemOptions {
  /** Difficulty tier to generate for. */
  difficulty: DifficultyLevel;
  /**
   * When true the generated problem will have remainder === 0.
   * When false the remainder will be > 0.
   * When omitted (undefined) it is chosen at random (~50/50).
   */
  allowRemainder?: boolean;
}

/**
 * Generate a single long-division problem for the given difficulty tier.
 *
 * The generator guarantees:
 * - The divisor is at least 2 (no divide-by-1 or divide-by-0).
 * - The dividend is strictly greater than the divisor (quotient ≥ 1).
 * - The dividend and divisor have the correct number of digits for the tier.
 * - The remainder constraint is honoured when specified.
 */
export function generateProblem(
  options: GenerateProblemOptions,
): DivisionProblem {
  const { difficulty } = options;
  const range = DIFFICULTY_RANGES[difficulty];

  const wantRemainder =
    options.allowRemainder === undefined
      ? Math.random() < 0.5
      : options.allowRemainder;

  if (wantRemainder) {
    return generateWithRemainder(difficulty, range);
  }
  return generateExact(difficulty, range);
}

// ---------------------------------------------------------------------------
// Exact-division path (remainder === 0)
// ---------------------------------------------------------------------------

function generateExact(
  difficulty: DifficultyLevel,
  range: DifficultyRange,
): DivisionProblem {
  // Pick a random divisor within the allowed digit range.
  const divisorDigits = randomInt(...range.divisorDigits);
  const divisorMin = minWithDigits(divisorDigits);
  const divisorMax = maxWithDigits(divisorDigits);
  const divisor = randomInt(divisorMin, divisorMax);

  // Determine the quotient range so dividend = divisor * quotient
  // stays within the allowed dividend digit range.
  const dividendMin = minWithDigits(range.dividendDigits[0]);
  const dividendMax = maxWithDigits(range.dividendDigits[1]);

  const quotientMin = Math.max(1, Math.ceil(dividendMin / divisor));
  const quotientMax = Math.floor(dividendMax / divisor);

  // If the range is invalid (unlikely, but defensive), retry with a new divisor.
  if (quotientMin > quotientMax) {
    return generateExact(difficulty, range);
  }

  const quotient = randomInt(quotientMin, quotientMax);
  const dividend = divisor * quotient;

  return { dividend, divisor, quotient, remainder: 0, difficulty };
}

// ---------------------------------------------------------------------------
// Remainder path (remainder > 0)
// ---------------------------------------------------------------------------

function generateWithRemainder(
  difficulty: DifficultyLevel,
  range: DifficultyRange,
): DivisionProblem {
  // Pick divisor.
  const divisorDigits = randomInt(...range.divisorDigits);
  const divisorMin = minWithDigits(divisorDigits);
  const divisorMax = maxWithDigits(divisorDigits);
  const divisor = randomInt(divisorMin, divisorMax);

  // Pick a random dividend within allowed digit range.
  const dividendMin = minWithDigits(range.dividendDigits[0]);
  const dividendMax = maxWithDigits(range.dividendDigits[1]);
  const dividend = randomInt(dividendMin, dividendMax);

  const quotient = Math.floor(dividend / divisor);
  const remainder = dividend % divisor;

  // Must have remainder > 0, quotient >= 1, and dividend > divisor.
  if (remainder === 0 || quotient < 1 || dividend <= divisor) {
    return generateWithRemainder(difficulty, range);
  }

  return { dividend, divisor, quotient, remainder, difficulty };
}
