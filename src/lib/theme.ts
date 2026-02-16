/**
 * Jurassic / Dinosaur theme constants.
 *
 * Centralises the earthy-jungle colour palette, dino-themed copy, and
 * decorative motifs so they can be reused across components and tested.
 */

// ─── Colour palette tokens ─────────────────────────────────
// These mirror the CSS custom-property names defined in globals.css.
// Components reference Tailwind utilities that resolve to these tokens.

export const PALETTE = {
  /** Deep jungle green — primary accent */
  jungleGreen: "#2d6a4f",
  /** Lighter jungle green for hover */
  jungleGreenLight: "#40916c",
  /** Dark fern — backgrounds / cards in dark-mode */
  fern: "#1b4332",
  /** Warm amber — reward / highlight accent */
  amber: "#b5651d",
  /** Sandy tan — secondary background */
  sand: "#f5e6ca",
  /** Ivory — light-mode card surface */
  ivory: "#faf6ed",
  /** Volcanic dark — dark-mode page bg */
  volcanic: "#1a1409",
  /** Lava rock — dark-mode card surface */
  lavaRock: "#2a2215",
  /** Earthy brown — borders & muted text */
  earthBrown: "#6b4e32",
  /** Fossil grey — muted text in light mode */
  fossil: "#7a7062",
  /** Leaf green for progress / success */
  leaf: "#52b788",
} as const;

// ─── Dino motif characters ─────────────────────────────────
// Small decorative dino / leaf / footprint symbols used in headers and
// section dividers. Kept as plain strings so they can be tested.

export const MOTIFS = {
  dino: "🦕",
  trex: "🦖",
  footprint: "🐾",
  leaf: "🌿",
  volcano: "🌋",
  bone: "🦴",
  egg: "🥚",
  trophy: "🏆",
} as const;

// ─── Encouragement messages ────────────────────────────────
// Used by DivisionWorkspace for per-step feedback.

export const SUCCESS_MESSAGES = [
  "Roarsome!",
  "You're dino-mite!",
  "Rawr-ight on!",
  "T-Riffic!",
  "Jurassic genius!",
  "Clever girl!",
  "Dino-score!",
  "Steg-tacular!",
  "Raptor speed!",
  "Tricer-tops work!",
  "Fossil-tastic!",
  "You rex'd that!",
  "Dino-nailed it!",
  "Bronto-brilliant!",
  "Saur-prisingly good!",
] as const;

export const ERROR_MESSAGES = [
  "Uh oh, the raptor got that one…",
  "Even a T-Rex stumbles sometimes!",
  "Try again, dino explorer!",
  "The fossils say otherwise…",
  "Not quite — dig deeper!",
  "The volcano rumbles… try once more!",
  "That answer went extinct!",
  "The pteranodon swooped your answer away!",
  "Don't let the dinos outsmart you!",
  "Almost — even raptors need a second try!",
] as const;

export const COMPLETION_MESSAGES = [
  "Extinction-level solve!",
  "You conquered that like a T-Rex!",
  "The herd is impressed!",
  "Paleontologist-grade work!",
  "That problem didn't stand a chance!",
] as const;

export const LEVEL_UP_MESSAGES = [
  "Roarsome! You leveled up to Tier",
  "The ground shakes — you reached Tier",
  "Evolution! You've advanced to Tier",
] as const;

// ─── Helpers ───────────────────────────────────────────────

export function randomMessage(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}
