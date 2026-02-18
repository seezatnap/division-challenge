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
