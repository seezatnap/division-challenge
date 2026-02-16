import { describe, it, expect } from "vitest";
import { generateProblem, generateProblems } from "../generate-problem";
import { ALL_TIERS, DIFFICULTY_CONFIGS } from "../difficulty";
import type { DifficultyTier } from "@/types";

/** Count the number of decimal digits in a positive integer. */
function digitCount(n: number): number {
  return n.toString().length;
}

describe("generateProblem", () => {
  describe.each(ALL_TIERS)("tier %d", (tier: DifficultyTier) => {
    const config = DIFFICULTY_CONFIGS[tier];

    // Generate multiple problems to account for randomness
    const problems = Array.from({ length: 50 }, () => generateProblem(tier));

    it("returns a valid DivisionProblem shape", () => {
      for (const p of problems) {
        expect(p).toHaveProperty("id");
        expect(p).toHaveProperty("dividend");
        expect(p).toHaveProperty("divisor");
        expect(p).toHaveProperty("quotient");
        expect(p).toHaveProperty("remainder");
        expect(p).toHaveProperty("difficulty");
      }
    });

    it("generates unique IDs", () => {
      const ids = problems.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("dividend has correct digit count", () => {
      for (const p of problems) {
        const digits = digitCount(p.dividend);
        expect(digits).toBeGreaterThanOrEqual(config.dividendDigits.min);
        expect(digits).toBeLessThanOrEqual(config.dividendDigits.max);
      }
    });

    it("divisor has correct digit count", () => {
      for (const p of problems) {
        const digits = digitCount(p.divisor);
        expect(digits).toBeGreaterThanOrEqual(config.divisorDigits.min);
        expect(digits).toBeLessThanOrEqual(config.divisorDigits.max);
      }
    });

    it("divisor is never zero", () => {
      for (const p of problems) {
        expect(p.divisor).toBeGreaterThan(0);
      }
    });

    it("dividend >= divisor (quotient >= 1)", () => {
      for (const p of problems) {
        expect(p.dividend).toBeGreaterThanOrEqual(p.divisor);
        expect(p.quotient).toBeGreaterThanOrEqual(1);
      }
    });

    it("quotient and remainder are mathematically correct", () => {
      for (const p of problems) {
        expect(p.dividend).toBe(p.divisor * p.quotient + p.remainder);
      }
    });

    it("remainder is in [0, divisor)", () => {
      for (const p of problems) {
        expect(p.remainder).toBeGreaterThanOrEqual(0);
        expect(p.remainder).toBeLessThan(p.divisor);
      }
    });

    it("difficulty metadata matches the tier config", () => {
      for (const p of problems) {
        expect(p.difficulty).toEqual(config);
      }
    });
  });

  it("produces problems with zero remainder (exact division) sometimes for tier 1", () => {
    // Generate many tier-1 problems; at least some should have remainder === 0
    const problems = Array.from({ length: 200 }, () => generateProblem(1));
    const hasExact = problems.some((p) => p.remainder === 0);
    expect(hasExact).toBe(true);
  });

  it("produces problems with non-zero remainder sometimes for tier 1", () => {
    const problems = Array.from({ length: 200 }, () => generateProblem(1));
    const hasRemainder = problems.some((p) => p.remainder > 0);
    expect(hasRemainder).toBe(true);
  });
});

describe("generateProblems", () => {
  it("returns the requested number of problems", () => {
    const problems = generateProblems(1, 10);
    expect(problems).toHaveLength(10);
  });

  it("returns an empty array when count is 0", () => {
    const problems = generateProblems(1, 0);
    expect(problems).toHaveLength(0);
  });

  it("all problems in the batch have the correct tier", () => {
    const problems = generateProblems(3, 15);
    for (const p of problems) {
      expect(p.difficulty.tier).toBe(3);
    }
  });

  it("all problems in the batch have unique IDs", () => {
    const problems = generateProblems(2, 20);
    const ids = problems.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
