import type { DifficultyConfig, DifficultyTier } from "@/types";

/**
 * Predefined difficulty configurations mapping tiers to dividend/divisor digit ranges.
 *
 * Tier 1: 2-digit ÷ 1-digit  (e.g. 12 ÷ 3)
 * Tier 2: 3-digit ÷ 1-digit  (e.g. 456 ÷ 7)
 * Tier 3: 3-digit ÷ 2-digit  (e.g. 789 ÷ 12)
 * Tier 4: 4-digit ÷ 2-digit  (e.g. 3456 ÷ 34)
 * Tier 5: 4–5 digit ÷ 2–3 digit (e.g. 12345 ÷ 123)
 */
export const DIFFICULTY_CONFIGS: Record<DifficultyTier, DifficultyConfig> = {
  1: {
    tier: 1,
    label: "2-digit ÷ 1-digit",
    dividendDigits: { min: 2, max: 2 },
    divisorDigits: { min: 1, max: 1 },
  },
  2: {
    tier: 2,
    label: "3-digit ÷ 1-digit",
    dividendDigits: { min: 3, max: 3 },
    divisorDigits: { min: 1, max: 1 },
  },
  3: {
    tier: 3,
    label: "3-digit ÷ 2-digit",
    dividendDigits: { min: 3, max: 3 },
    divisorDigits: { min: 2, max: 2 },
  },
  4: {
    tier: 4,
    label: "4-digit ÷ 2-digit",
    dividendDigits: { min: 4, max: 4 },
    divisorDigits: { min: 2, max: 2 },
  },
  5: {
    tier: 5,
    label: "4–5 digit ÷ 2–3 digit",
    dividendDigits: { min: 4, max: 5 },
    divisorDigits: { min: 2, max: 3 },
  },
};

/** Get the difficulty configuration for a given tier. */
export function getDifficultyConfig(tier: DifficultyTier): DifficultyConfig {
  return DIFFICULTY_CONFIGS[tier];
}

/** All valid difficulty tiers in order. */
export const ALL_TIERS: DifficultyTier[] = [1, 2, 3, 4, 5];
