import { DifficultyLevel } from "@/types";
import { generateProblem } from "@/features/division-engine/problem-generator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count the number of decimal digits in a positive integer. */
function digitCount(n: number): number {
  return n.toString().length;
}

/** Generate many problems to test statistical/structural properties. */
function generateMany(
  difficulty: DifficultyLevel,
  count: number,
  allowRemainder?: boolean,
) {
  return Array.from({ length: count }, () =>
    generateProblem({ difficulty, allowRemainder }),
  );
}

// ---------------------------------------------------------------------------
// Common invariants (apply to ALL difficulty levels)
// ---------------------------------------------------------------------------

describe("generateProblem – universal invariants", () => {
  const ALL_LEVELS = Object.values(DifficultyLevel);

  it.each(ALL_LEVELS)(
    "%s: dividend = divisor * quotient + remainder",
    (level) => {
      const problems = generateMany(level, 50);
      for (const p of problems) {
        expect(p.dividend).toBe(p.divisor * p.quotient + p.remainder);
      }
    },
  );

  it.each(ALL_LEVELS)("%s: divisor >= 2", (level) => {
    const problems = generateMany(level, 50);
    for (const p of problems) {
      expect(p.divisor).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(ALL_LEVELS)("%s: quotient >= 1 (dividend > divisor)", (level) => {
    const problems = generateMany(level, 50);
    for (const p of problems) {
      expect(p.quotient).toBeGreaterThanOrEqual(1);
      expect(p.dividend).toBeGreaterThan(p.divisor);
    }
  });

  it.each(ALL_LEVELS)("%s: remainder >= 0 and remainder < divisor", (level) => {
    const problems = generateMany(level, 50);
    for (const p of problems) {
      expect(p.remainder).toBeGreaterThanOrEqual(0);
      expect(p.remainder).toBeLessThan(p.divisor);
    }
  });

  it.each(ALL_LEVELS)("%s: difficulty field matches requested level", (level) => {
    const problems = generateMany(level, 20);
    for (const p of problems) {
      expect(p.difficulty).toBe(level);
    }
  });
});

// ---------------------------------------------------------------------------
// Digit-range constraints per difficulty tier
// ---------------------------------------------------------------------------

describe("generateProblem – Easy (2-digit ÷ 1-digit)", () => {
  const problems = generateMany(DifficultyLevel.Easy, 100);

  it("dividend is 2 digits (10–99)", () => {
    for (const p of problems) {
      expect(digitCount(p.dividend)).toBe(2);
    }
  });

  it("divisor is 1 digit (2–9)", () => {
    for (const p of problems) {
      expect(digitCount(p.divisor)).toBe(1);
      expect(p.divisor).toBeGreaterThanOrEqual(2);
      expect(p.divisor).toBeLessThanOrEqual(9);
    }
  });
});

describe("generateProblem – Medium (3-digit ÷ 1-digit)", () => {
  const problems = generateMany(DifficultyLevel.Medium, 100);

  it("dividend is 3 digits (100–999)", () => {
    for (const p of problems) {
      expect(digitCount(p.dividend)).toBe(3);
    }
  });

  it("divisor is 1 digit (2–9)", () => {
    for (const p of problems) {
      expect(digitCount(p.divisor)).toBe(1);
      expect(p.divisor).toBeGreaterThanOrEqual(2);
      expect(p.divisor).toBeLessThanOrEqual(9);
    }
  });
});

describe("generateProblem – Hard (3-digit ÷ 2-digit)", () => {
  const problems = generateMany(DifficultyLevel.Hard, 100);

  it("dividend is 3 digits (100–999)", () => {
    for (const p of problems) {
      expect(digitCount(p.dividend)).toBe(3);
    }
  });

  it("divisor is 2 digits (10–99)", () => {
    for (const p of problems) {
      expect(digitCount(p.divisor)).toBe(2);
      expect(p.divisor).toBeGreaterThanOrEqual(10);
      expect(p.divisor).toBeLessThanOrEqual(99);
    }
  });
});

describe("generateProblem – Expert (4–5 digit ÷ 2–3 digit)", () => {
  const problems = generateMany(DifficultyLevel.Expert, 200);

  it("dividend is 4 or 5 digits (1000–99999)", () => {
    for (const p of problems) {
      const dc = digitCount(p.dividend);
      expect(dc).toBeGreaterThanOrEqual(4);
      expect(dc).toBeLessThanOrEqual(5);
    }
  });

  it("divisor is 2 or 3 digits (10–999)", () => {
    for (const p of problems) {
      const dc = digitCount(p.divisor);
      expect(dc).toBeGreaterThanOrEqual(2);
      expect(dc).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Remainder / non-remainder control
// ---------------------------------------------------------------------------

describe("generateProblem – remainder control", () => {
  it("allowRemainder=false always produces remainder 0", () => {
    const allLevels = Object.values(DifficultyLevel);
    for (const level of allLevels) {
      const problems = generateMany(level, 30, false);
      for (const p of problems) {
        expect(p.remainder).toBe(0);
        expect(p.dividend % p.divisor).toBe(0);
      }
    }
  });

  it("allowRemainder=true always produces remainder > 0", () => {
    const allLevels = Object.values(DifficultyLevel);
    for (const level of allLevels) {
      const problems = generateMany(level, 30, true);
      for (const p of problems) {
        expect(p.remainder).toBeGreaterThan(0);
      }
    }
  });

  it("allowRemainder=undefined produces a mix of both", () => {
    // Generate enough that we should see both cases with high probability.
    const problems = generateMany(DifficultyLevel.Easy, 200);
    const withRemainder = problems.filter((p) => p.remainder > 0).length;
    const withoutRemainder = problems.filter((p) => p.remainder === 0).length;
    expect(withRemainder).toBeGreaterThan(0);
    expect(withoutRemainder).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Edge-case & variety checks
// ---------------------------------------------------------------------------

describe("generateProblem – variety", () => {
  it("produces distinct problems across multiple calls", () => {
    const problems = generateMany(DifficultyLevel.Medium, 20);
    const dividends = new Set(problems.map((p) => p.dividend));
    // With 20 random 3-digit dividends, we expect at least a few unique values.
    expect(dividends.size).toBeGreaterThan(1);
  });

  it("Expert tier produces both 4-digit and 5-digit dividends", () => {
    const problems = generateMany(DifficultyLevel.Expert, 200);
    const fourDigit = problems.filter((p) => digitCount(p.dividend) === 4);
    const fiveDigit = problems.filter((p) => digitCount(p.dividend) === 5);
    expect(fourDigit.length).toBeGreaterThan(0);
    expect(fiveDigit.length).toBeGreaterThan(0);
  });

  it("Expert tier produces both 2-digit and 3-digit divisors", () => {
    const problems = generateMany(DifficultyLevel.Expert, 200);
    const twoDigit = problems.filter((p) => digitCount(p.divisor) === 2);
    const threeDigit = problems.filter((p) => digitCount(p.divisor) === 3);
    expect(twoDigit.length).toBeGreaterThan(0);
    expect(threeDigit.length).toBeGreaterThan(0);
  });
});
