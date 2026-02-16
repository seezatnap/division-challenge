import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_CONFIGS,
  getDifficultyConfig,
  ALL_TIERS,
} from "../difficulty";
import type { DifficultyTier } from "@/types";

describe("DIFFICULTY_CONFIGS", () => {
  it("has exactly 5 tiers", () => {
    expect(Object.keys(DIFFICULTY_CONFIGS)).toHaveLength(5);
  });

  it.each([1, 2, 3, 4, 5] as DifficultyTier[])(
    "tier %d has valid digit ranges",
    (tier) => {
      const config = DIFFICULTY_CONFIGS[tier];
      expect(config.tier).toBe(tier);
      expect(config.label).toBeTruthy();
      expect(config.dividendDigits.min).toBeGreaterThanOrEqual(1);
      expect(config.dividendDigits.max).toBeGreaterThanOrEqual(
        config.dividendDigits.min,
      );
      expect(config.divisorDigits.min).toBeGreaterThanOrEqual(1);
      expect(config.divisorDigits.max).toBeGreaterThanOrEqual(
        config.divisorDigits.min,
      );
    },
  );

  it("dividend digit range always >= divisor digit range", () => {
    for (const tier of ALL_TIERS) {
      const config = DIFFICULTY_CONFIGS[tier];
      expect(config.dividendDigits.min).toBeGreaterThanOrEqual(
        config.divisorDigits.min,
      );
    }
  });

  it("tier 1 is 2-digit ÷ 1-digit", () => {
    const c = DIFFICULTY_CONFIGS[1];
    expect(c.dividendDigits).toEqual({ min: 2, max: 2 });
    expect(c.divisorDigits).toEqual({ min: 1, max: 1 });
  });

  it("tier 5 is 4–5 digit ÷ 2–3 digit", () => {
    const c = DIFFICULTY_CONFIGS[5];
    expect(c.dividendDigits).toEqual({ min: 4, max: 5 });
    expect(c.divisorDigits).toEqual({ min: 2, max: 3 });
  });
});

describe("getDifficultyConfig", () => {
  it("returns the correct config for each tier", () => {
    for (const tier of ALL_TIERS) {
      expect(getDifficultyConfig(tier)).toBe(DIFFICULTY_CONFIGS[tier]);
    }
  });
});

describe("ALL_TIERS", () => {
  it("contains tiers 1 through 5 in order", () => {
    expect(ALL_TIERS).toEqual([1, 2, 3, 4, 5]);
  });
});
