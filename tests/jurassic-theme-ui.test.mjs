import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

  assert.ok(source.includes("InGen Division Dashboard"), "Expected themed Jurassic heading content");
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
  assert.equal(
    source.includes("Use this Operator ID to log in later and resume your progress on this device."),
    false,
    "Expected the login-mode helper copy to be removed",
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
  assert.ok(
    source.includes("Fusion Preview"),
    "Expected hybrid lab to render fusion preview copy",
  );
  assert.ok(
    source.includes("hybrid-preview-row"),
    "Expected hybrid lab to render preview tiles for selected dinosaurs",
  );
  assert.ok(
    source.includes("setIsHybridFusionInProgress(true);"),
    "Expected hybrid creation to enter a fusion-loading state",
  );
  assert.ok(
    source.includes("await requestHybridImageGeneration("),
    "Expected hybrid creation flow to wait for generation before opening detail modal",
  );
  assert.ok(
    source.includes("setSelectedHybridReward("),
    "Expected hybrid creation flow to open the hybrid detail modal after generation resolves",
  );
});

test("home page includes Research Center title treatment on player-start screen", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  assert.ok(
    source.includes("InGen System Login"),
    "Expected InGen login heading on player-start screen",
  );
  assert.ok(
    source.includes("research-center-header"),
    "Expected research-center-header class for title treatment",
  );
  assert.ok(
    source.includes("research-center-kicker"),
    "Expected research-center-kicker class for auth panel kicker text",
  );
  assert.ok(
    source.includes("research-center-title"),
    "Expected research-center-title class for serif heading",
  );
  assert.ok(
    source.includes("research-center-subtitle"),
    "Expected research-center-subtitle class for subtitle text",
  );
  assert.ok(
    source.includes("terminal-input"),
    "Expected terminal-input class on player-name input for field-station styling",
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

test("root layout includes JP3 wood frame wrapper with corner bolt elements", async () => {
  const source = await readRepoFile("src/app/layout.tsx");

  assert.ok(
    source.includes('className="jp3-frame"'),
    "Expected jp3-frame wrapper element in layout",
  );
  assert.ok(
    source.includes('data-ui-frame="wood-border"'),
    "Expected data-ui-frame attribute on frame wrapper",
  );
  for (const corner of ["tl", "tr", "bl", "br"]) {
    assert.ok(
      source.includes(`jp3-frame-bolt--${corner}`),
      `Expected corner bolt element for ${corner} corner`,
    );
  }
  assert.ok(
    source.includes('aria-hidden="true"'),
    "Expected bolt elements to be aria-hidden decorative elements",
  );
});

test("global stylesheet defines JP3 wood frame and corner bolt styles", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".jp3-frame",
    "--jp-frame:",
    "--jp-frame-grain:",
    "border-image:",
    ".jp3-frame-bolt",
    ".jp3-frame-bolt--tl",
    ".jp3-frame-bolt--tr",
    ".jp3-frame-bolt--bl",
    ".jp3-frame-bolt--br",
    ".jp3-frame-bolt::before",
    ".jp3-frame-bolt::after",
  ]) {
    assert.ok(source.includes(fragment), `Expected wood frame styling fragment: ${fragment}`);
  }
});

test("global stylesheet defines JP3 green panel design tokens", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    "--jp-panel-bg:",
    "--jp-panel-text:",
    "--jp-panel-border:",
    "--jp-accent-red:",
  ]) {
    assert.ok(source.includes(fragment), `Expected JP3 design token: ${fragment}`);
  }

  // Verify JP3 green panel values (approximately #1a7a2e for panel bg)
  assert.ok(
    source.includes("#1a7a2e"),
    "Expected JP3 green panel background color #1a7a2e",
  );
  // Verify cream/white panel text color
  assert.ok(
    source.includes("#f0edd8"),
    "Expected cream panel text color #f0edd8",
  );
  // Verify dark green panel border
  assert.ok(
    source.includes("#145a22"),
    "Expected dark green panel border color #145a22",
  );
  // Verify accent red
  assert.ok(
    source.includes("#cc3333"),
    "Expected accent red color #cc3333",
  );
});

test("global stylesheet defines Jurassic palette, motif overlays, glow animation, and responsive breakpoints", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    "--jp-jungle:",
    "--jp-amber:",
    "--jp-surface:",
    ".motif-claw::after",
    ".motif-fossil::after",
    ".motif-track::after",
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
    ".hybrid-preview-row",
    ".hybrid-preview-card",
    ".hybrid-fusion-loader",
    ".hybrid-fusion-spinner",
    ".hybrid-lab-actions",
    ".coach-item[data-feedback-tone=\"retry\"]",
    "@keyframes amber-pulse",
    "@keyframes amber-pulse-bring-down",
    "@keyframes barbasol-spin",
    "@keyframes inline-entry-lock-in",
    "@keyframes inline-entry-lock-ring",
    "@keyframes work-row-enter",
    "@media (min-width: 48rem)",
    "@media (min-width: 64rem)",
  ]) {
    assert.ok(source.includes(fragment), `Expected styling fragment: ${fragment}`);
  }
});

test("global stylesheet defines Research Center title treatment and terminal input styles", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".research-center-header",
    ".research-center-title",
    ".research-center-subtitle",
    ".terminal-input",
    ".player-start-panel",
  ]) {
    assert.ok(source.includes(fragment), `Expected player-start styling fragment: ${fragment}`);
  }
});

test("global stylesheet defines JP3 gallery grid with green tile backgrounds", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".gallery-grid",
    ".gallery-card",
    ".gallery-card-trigger",
    ".gallery-thumb",
    ".gallery-image",
    ".gallery-name",
  ]) {
    assert.ok(source.includes(fragment), `Expected gallery grid styling fragment: ${fragment}`);
  }

  // Verify gallery uses green tile backgrounds (JP3 bright green)
  assert.ok(
    source.includes("#2d8a2d"),
    "Expected bright green tile background (#2d8a2d) for gallery cards",
  );
});

test("global stylesheet defines earned reward panel with wood frame and green panel aesthetic", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".earned-reward-panel",
    ".reward-can-loader",
    ".barbasol-spinner",
    ".reward-reveal-figure",
    ".reward-reveal-image",
    ".reward-reveal-modal",
  ]) {
    assert.ok(source.includes(fragment), `Expected earned reward styling fragment: ${fragment}`);
  }

  // Verify reward panel uses wood frame border
  assert.ok(
    source.includes("var(--jp-frame)"),
    "Expected earned reward panel to reference --jp-frame for wood border",
  );
  // Verify reward panel uses green panel background
  assert.ok(
    source.includes("var(--jp-panel-bg)"),
    "Expected earned reward panel to reference --jp-panel-bg for green background",
  );
});
