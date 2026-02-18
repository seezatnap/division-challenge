import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("home page includes Jurassic surfaces for game, gallery, and player-start UI", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  for (const surface of [
    'data-ui-surface="game"',
    'data-ui-surface="gallery"',
    'data-ui-surface="hybrid-gallery"',
    'data-ui-surface="player-start"',
  ]) {
    assert.ok(source.includes(surface), `Expected ${surface} to be defined`);
  }

  assert.ok(source.includes("Jurassic Command Deck"), "Expected themed Jurassic heading content");
  assert.equal(
    source.includes("Earth-tone surfaces, jungle overlays, and amber-glow focus states now span the live game board"),
    false,
    "Expected UX-marketing hero copy to be removed",
  );
  assert.equal(
    source.includes("Feature Module Map"),
    false,
    "Expected footer-style feature-map UX copy to be removed",
  );
  assert.ok(
    source.includes('data-ui-action="next-problem"'),
    "Expected NEXT problem action button wiring in the game surface",
  );
  assert.equal(
    source.includes("Expedition Files"),
    false,
    "Expected expedition-file save/load UX copy to be removed",
  );
  assert.ok(
    source.includes("Profiles are auto-saved in this browser by lowercase player name."),
    "Expected player-start copy to describe lowercase localStorage profile behavior",
  );
  assert.ok(
    source.includes('data-ui-action="trade-amber-for-dino"'),
    "Expected amber trade action wiring in the gallery surface",
  );
  assert.ok(
    source.includes('data-ui-action="open-hybrid-lab"'),
    "Expected hybrid lab action wiring in the gallery surface",
  );
  assert.ok(
    source.includes('data-ui-surface="hybrid-lab-modal"'),
    "Expected hybrid lab modal surface to be rendered from the home page",
  );
});

test("root layout wires themed typography variables", async () => {
  const source = await readRepoFile("src/app/layout.tsx");

  for (const fragment of [
    "Cinzel",
    "Alegreya_Sans",
    "IBM_Plex_Mono",
    "--font-jurassic-display",
    "--font-jurassic-body",
    "--font-jurassic-mono",
  ]) {
    assert.ok(source.includes(fragment), `Expected themed typography fragment: ${fragment}`);
  }

  assert.equal(source.includes("Geist"), false, "Geist font wiring should be removed for Jurassic typography");
});

test("global stylesheet defines Jurassic palette, motif overlays, glow animation, and responsive breakpoints", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    "--jp-panel-bg:",
    "--jp-panel-text:",
    "--jp-panel-border:",
    "--jp-frame:",
    "--jp-frame-grain:",
    "--jp-frame-thickness:",
    "--jp-frame-rivet-size:",
    "--jp-frame-rivet-offset:",
    "--jp-toolbar:",
    "--jp-toolbar-text:",
    "--jp-accent-red:",
    "--jp-jungle:",
    "--jp-amber:",
    "--jp-glow:",
    "--jp-surface:",
    "body::before {",
    "body::after {",
    "var(--jp-frame-thickness)",
    "var(--jp-frame-rivet-size)",
    "left var(--jp-frame-rivet-offset) top var(--jp-frame-rivet-offset)",
    "circle at 32% 30%",
    ".jurassic-panel {",
    "background: var(--jp-panel-bg);",
    "color: var(--jp-panel-text);",
    "inset 0 0 0 1px color-mix(in srgb, var(--jp-panel-border) 84%, black)",
    ".jurassic-panel :where(p, h1, h2, h3, h4, h5, h6, li, label, legend, time, dt, dd, figcaption)",
    ".motif-claw::after",
    ".motif-fossil::after",
    ".motif-track::after",
    "rgba(20, 90, 34, 0.2)",
    "rgba(16, 68, 29, 0.18)",
    "rgba(240, 237, 216, 0.12)",
    "rgba(10, 44, 18, 0.2)",
    "opacity: 0.74;",
    "opacity: 0.66;",
    "opacity: 0.62;",
    "opacity: 0.68;",
    ".inline-entry",
    '.inline-entry[data-entry-inline="true"][contenteditable="true"]:focus-visible',
    ".inline-entry-quotient.inline-entry-pending:focus-visible",
    ".inline-entry-work-row.inline-entry-pending",
    ".inline-entry-lock-in",
    ".inline-entry-lock-in[data-entry-lock-pulse=\"multiply-result\"]",
    ".glow-amber",
    ".glow-amber[data-glow-cadence=\"bring-down\"]",
    ".jp-button:focus-visible",
    ".work-row-enter",
    ".work-row[data-row-transition=\"enter\"] .work-row-value-shell",
    ".hint-stack[data-feedback-tone=\"encouragement\"]",
    ".hint-stack[data-feedback-tone=\"retry\"]",
    ".hint-stack[data-feedback-tone=\"celebration\"]",
    ".hint-status",
    ".amber-bank",
    ".amber-actions",
    ".hybrid-lab-modal",
    ".hybrid-lab-select",
    ".hybrid-lab-actions",
    ".coach-item[data-feedback-tone=\"retry\"]",
    "@keyframes amber-pulse",
    "@keyframes amber-pulse-bring-down",
    "@keyframes inline-entry-lock-in",
    "@keyframes inline-entry-lock-ring",
    "@keyframes work-row-enter",
    "@media (min-width: 48rem)",
    "@media (min-width: 64rem)",
  ]) {
    assert.ok(source.includes(fragment), `Expected styling fragment: ${fragment}`);
  }
});

test("global stylesheet uses a full-viewport jungle canopy body background image", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.equal(
    source.includes("--background: radial-gradient"),
    false,
    "Expected radial-gradient body background token to be removed",
  );
  assert.ok(
    source.includes('--background-image: url("/jungle-canopy-bg.jpg");'),
    "Expected canopy JPG token in the root palette",
  );
  assert.ok(source.includes("background-image:"), "Expected body background-image declaration");
  assert.ok(source.includes("var(--background-image);"), "Expected body to use canopy image token");
  assert.ok(source.includes("background-size: cover;"), "Expected full-viewport cover sizing on body");

  const canopyImage = await stat(path.join(repoRoot, "public/jungle-canopy-bg.jpg"));
  assert.ok(canopyImage.isFile(), "Expected jungle canopy JPG asset to exist in public/");
  assert.ok(canopyImage.size > 0, "Expected jungle canopy JPG asset to be non-empty");
});

test("bus-stop workspace color styling renders cream text on green surfaces while preserving amber and error states", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".workspace-paper {",
    "color: color-mix(in srgb, var(--jp-panel-text) 92%, white);",
    ".workspace-label {",
    "color: color-mix(in srgb, var(--jp-panel-text) 84%, white);",
    ".bracket-stack {",
    "border-left: var(--division-bracket-stroke-width) solid color-mix(in srgb, var(--jp-panel-text) 72%, transparent);",
    ".work-row[data-step-kind=\"multiply-result\"] .work-row-value-shell::after",
    "border-bottom: 0.12rem solid color-mix(in srgb, var(--jp-panel-text) 66%, transparent);",
    ".dividend-line,",
    ".work-row-op {",
    "color: var(--jp-panel-text);",
    ".inline-entry.inline-entry-error-pulse {",
    "background: rgba(131, 26, 26, 0.56);",
    ".inline-entry.inline-entry-retry-lock {",
    "background: rgba(104, 19, 19, 0.46);",
    ".glow-amber {",
    "@keyframes inline-entry-lock-in",
    "background: color-mix(in srgb, var(--jp-amber-bright) 36%, rgba(4, 16, 8, 0.18));",
  ]) {
    assert.ok(source.includes(fragment), `Expected bus-stop workspace styling fragment: ${fragment}`);
  }

  assert.equal(
    source.includes("border-left: var(--division-bracket-stroke-width) solid rgba(45, 36, 25, 0.68);"),
    false,
    "Expected brown bracket stroke color to be removed for green-panel workspace rendering",
  );
});

test("surveillance toolbar renders JP3 footer affordances with icon controls and MORE link", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");
  const toolbarSource = await readRepoFile(
    "src/features/toolbar/components/isla-sorna-surveillance-toolbar.tsx",
  );
  const cssSource = await readRepoFile("src/app/globals.css");

  assert.ok(
    pageSource.includes("<IslaSornaSurveillanceToolbar sessionStats={toolbarSessionStats} />"),
    "Expected home page to render the persistent surveillance toolbar with session stats",
  );

  for (const fragment of [
    "const toolbarSessionStats = {",
    "problemsSolved: gameSession.sessionSolvedProblems,",
    "currentStreak: gameSession.sessionSolvedProblems,",
    "difficultyLevel: gameSession.activeProblem.difficultyLevel,",
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected page session stats wiring fragment: ${fragment}`);
  }

  for (const fragment of [
    'data-ui-surface="surveillance-toolbar"',
    "ISLA SORNA SURVEILLANCE DEVICE",
    "MORE",
    'iconKind: "footprint"',
    'iconKind: "fossil"',
    'iconKind: "dna"',
    'iconKind: "egg"',
    "Session statistics readouts",
    "Problems Solved",
    "Current Streak",
    "Difficulty Level",
  ]) {
    assert.ok(toolbarSource.includes(fragment), `Expected toolbar fragment: ${fragment}`);
  }

  for (const fragment of [
    ".surveillance-toolbar-shell",
    ".surveillance-toolbar {",
    ".surveillance-toolbar-controls",
    ".surveillance-toolbar-label",
    ".surveillance-toolbar-icon-button",
    ".surveillance-toolbar-readouts",
    ".surveillance-toolbar-readout",
    ".surveillance-toolbar-readout-label",
    ".surveillance-toolbar-readout-value",
    ".surveillance-toolbar-more",
    ".surveillance-toolbar-more-arrow",
    "var(--jp-toolbar)",
    "var(--jp-toolbar-text)",
    "var(--jp-accent-red)",
    "font-variant-caps: all-small-caps;",
  ]) {
    assert.ok(cssSource.includes(fragment), `Expected surveillance toolbar styling fragment: ${fragment}`);
  }
});
