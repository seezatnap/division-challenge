/**
 * Jurassic Theme — Design System
 *
 * Provides the design tokens, utility classes, and theme constants
 * for the Jurassic Park-inspired visual design system.
 *
 * Palette: earth/jungle tones — deep greens, warm ambers, rich browns
 * Typography: bold display headings with a primal feel
 * Motifs: dino silhouette SVGs for overlays and decorations
 */

// ── Color Palette ──────────────────────────────────────────────────────
export const colors = {
  // Primary jungle greens
  jungleDeep: "#1a3a1a",
  jungleDark: "#2d5a27",
  jungleMid: "#3d7a35",
  jungleLight: "#5a9e4f",
  junglePale: "#a8d5a0",

  // Earth/amber warm tones
  amberGlow: "#d4a017",
  amberLight: "#f0c94d",
  amberPale: "#fbe89a",
  amberDark: "#8b6914",

  // Rich browns
  earthDark: "#2c1810",
  earthMid: "#5c3a28",
  earthLight: "#8b6849",
  earthPale: "#c4a882",

  // Volcanic accents
  volcanicRed: "#8b2500",
  lavaOrange: "#cc5500",

  // Fossil neutrals
  fossilLight: "#f5f0e8",
  fossilMid: "#e0d5c5",
  fossilDark: "#6b5b4a",
  bone: "#faf7f0",

  // Text
  textPrimary: "#1a1a0f",
  textSecondary: "#5c4a3a",
  textMuted: "#8b7a68",
  textOnDark: "#f5f0e8",
  textOnGlow: "#2c1810",
} as const;

// ── Typography Scale ───────────────────────────────────────────────────
export const typography = {
  displayLg: "text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight",
  displayMd: "text-3xl sm:text-4xl font-bold tracking-tight",
  displaySm: "text-2xl sm:text-3xl font-bold",
  heading: "text-xl sm:text-2xl font-semibold",
  subheading: "text-lg font-medium",
  body: "text-base",
  caption: "text-sm",
  small: "text-xs",
} as const;

// ── Layout Breakpoint Utilities ────────────────────────────────────────
export const layout = {
  container: "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8",
  containerNarrow: "mx-auto w-full max-w-3xl px-4 sm:px-6",
  section: "py-8 sm:py-12 lg:py-16",
  card: "rounded-xl border p-4 sm:p-6",
  grid2: "grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6",
  grid3: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6",
  grid4: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4",
} as const;

// ── Dino SVG Motifs ────────────────────────────────────────────────────
// Inline SVG path data for overlay silhouettes (no external dependencies)

export const dinoMotifs = {
  /** Simplified T-Rex silhouette path */
  trex: "M30 80 Q35 60 45 55 Q50 50 55 45 L60 40 Q65 35 70 30 L75 28 Q78 30 80 35 L82 40 Q80 45 75 48 L70 50 Q65 55 60 60 L55 70 Q50 75 48 80 L50 85 Q55 88 58 85 L60 80 Q62 82 60 88 L55 90 Q50 92 48 90 L45 88 Q40 85 38 80 L35 85 Q33 88 30 85 Z",

  /** Simplified Brachiosaurus silhouette path */
  brachiosaurus:
    "M20 85 Q22 80 25 75 L28 65 Q30 55 32 45 L35 35 Q38 28 42 25 Q46 22 50 25 Q48 28 46 32 L44 38 Q42 42 40 50 L38 60 Q36 70 35 75 L40 78 Q45 80 50 82 L55 83 Q60 82 65 80 L68 78 Q70 82 68 85 L60 88 Q50 90 40 88 L30 87 Q25 88 20 85 Z",

  /** Simplified leaf/fern motif */
  fern: "M50 10 Q48 20 45 30 Q42 35 38 38 Q42 40 46 38 Q48 35 50 30 Q52 35 54 38 Q58 40 62 38 Q58 35 55 30 Q52 20 50 10 Z M50 30 Q48 40 45 50 Q42 55 38 58 Q42 60 46 58 Q48 55 50 50 Q52 55 54 58 Q58 60 62 58 Q58 55 55 50 Q52 40 50 30 Z",

  /** Dinosaur footprint */
  footprint:
    "M50 20 Q48 25 45 28 L42 35 Q40 40 42 45 L45 48 Q48 50 50 48 Q52 50 55 48 L58 45 Q60 40 58 35 L55 28 Q52 25 50 20 Z M42 15 Q40 12 42 10 Q44 12 42 15 Z M50 12 Q48 9 50 7 Q52 9 50 12 Z M58 15 Q56 12 58 10 Q60 12 58 15 Z",
} as const;

// ── CSS class composition helpers ──────────────────────────────────────

/** Classes for the primary page background with jungle texture feel */
export const pageBackground =
  "min-h-screen bg-gradient-to-b from-[#1a3a1a] via-[#2d5a27] to-[#1a3a1a]";

/** Classes for a themed card surface */
export const cardSurface =
  "rounded-xl border border-[#5c3a28]/30 bg-[#faf7f0]/95 shadow-lg backdrop-blur-sm";

/** Classes for the amber/gold glow used on active input cells */
export const glowActive =
  "ring-2 ring-[#d4a017] shadow-[0_0_12px_rgba(212,160,23,0.5)] animate-pulse";

/** Heading text styled for the Jurassic theme */
export const headingJurassic =
  "font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#d4a017] to-[#8b6914]";
