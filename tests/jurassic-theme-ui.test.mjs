import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
    source.includes("The Research Center"),
    "Expected player-start heading to use the Research Center title treatment",
  );
  assert.ok(
    source.includes("field-station terminal"),
    "Expected player-start subtitle copy to reference the field-station terminal",
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
    source.includes("<SurveillanceToolbar />"),
    "Expected persistent surveillance toolbar component to be mounted on the home page",
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
    'className="jurassic-app-frame"',
    'data-ui-decoration="viewport-frame"',
  ]) {
    assert.ok(source.includes(fragment), `Expected themed typography fragment: ${fragment}`);
  }

  assert.equal(source.includes("Geist"), false, "Geist font wiring should be removed for Jurassic typography");
});

test("surveillance toolbar component includes JP3 footer label, icon controls, and MORE affordance", async () => {
  const source = await readRepoFile("src/features/workspace-ui/components/surveillance-toolbar.tsx");

  for (const fragment of [
    'data-ui-surface="surveillance-toolbar"',
    "ISLA SORNA SURVEILLANCE DEVICE",
    "Footprint tracker",
    "Fossil scanner",
    "DNA analyzer",
    "Egg monitor",
    'data-ui-action="toolbar-more"',
    "MORE",
    "jp-surveillance-icon-button",
  ]) {
    assert.ok(source.includes(fragment), `Expected surveillance toolbar fragment: ${fragment}`);
  }
});

test("global stylesheet defines Jurassic palette, motif overlays, glow animation, and responsive breakpoints", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    "--jp-jungle:",
    "--jp-panel-bg:",
    "--jp-panel-text:",
    "--jp-panel-border:",
    ".jurassic-panel {",
    "background: var(--jp-panel-bg);",
    "color: var(--jp-panel-text);",
    "--jp-bark: var(--jp-panel-text);",
    "inset 0 0 0 1px color-mix(in srgb, var(--jp-panel-border) 86%, black)",
    "--jp-frame:",
    "--jp-frame-width:",
    "--jp-frame-rivet-size:",
    "--jp-frame-grain:",
    ".jurassic-app-frame {",
    ".jurassic-app-frame::before",
    ".jurassic-app-frame::after",
    "-webkit-mask-composite: xor;",
    "mask-composite: exclude;",
    "--jp-toolbar:",
    "--jp-toolbar-text:",
    "--jp-accent-red:",
    ".jp-surveillance-toolbar",
    "position: fixed;",
    ".jp-surveillance-toolbar-label",
    "font-variant: small-caps;",
    ".jp-surveillance-toolbar-icons",
    ".jp-surveillance-icon-button",
    ".jp-surveillance-toolbar-more",
    ".jp-surveillance-toolbar-more::after",
    "border-left: 0.45rem solid var(--jp-accent-red);",
    "--background-image: url(\"/jp3-jungle-canopy.jpg\");",
    "--jp-amber:",
    "--jp-glow:",
    ".motif-canopy::after",
    ".motif-claw::after",
    ".motif-fossil::after",
    ".motif-track::after",
    "color-mix(in srgb, var(--jp-panel-text) 20%, transparent)",
    "color-mix(in srgb, var(--jp-panel-border) 24%, transparent)",
    "color-mix(in srgb, var(--jp-panel-text) 18%, transparent)",
    "color-mix(in srgb, var(--jp-panel-text) 16%, transparent)",
    "color-mix(in srgb, var(--jp-panel-border) 26%, transparent)",
    "opacity: 0.7;",
    "opacity: 0.52;",
    "opacity: 0.5;",
    "opacity: 0.46;",
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
    ".player-start-research-intro",
    ".player-start-title",
    ".player-start-subtitle",
    ".game-start-input-terminal",
    "font-family: var(--font-jurassic-mono), \"IBM Plex Mono\", monospace;",
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

  assert.ok(source.includes("background-size: cover;"), "Expected full-viewport canopy image sizing");
  assert.ok(source.includes("background-position: center;"), "Expected centered canopy framing");
  assert.equal(
    source.includes("radial-gradient(circle at 18% 10%"),
    false,
    "Legacy radial gradient body background should be removed",
  );
  assert.equal(source.includes("--jp-sand:"), false, "Legacy sand token should be removed");
  assert.equal(source.includes("--jp-ivory:"), false, "Legacy ivory token should be removed");
  assert.equal(
    source.includes("rgba(244, 236, 214"),
    false,
    "Legacy translucent ivory panel fill should be removed",
  );
});

test("jungle canopy background asset exists in public", async () => {
  await access(path.join(repoRoot, "public/jp3-jungle-canopy.jpg"));
});
