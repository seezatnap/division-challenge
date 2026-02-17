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

test("home page includes Jurassic surfaces for game, gallery, and save/load UI", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  for (const surface of ['data-ui-surface="game"', 'data-ui-surface="gallery"', 'data-ui-surface="save-load"']) {
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
    "--jp-jungle:",
    "--jp-amber:",
    "--jp-surface:",
    ".motif-claw::after",
    ".motif-fossil::after",
    ".motif-track::after",
    ".inline-entry",
    ".inline-entry-quotient.inline-entry-pending:focus-visible",
    ".inline-entry-work-row.inline-entry-pending",
    ".inline-entry-lock-in",
    ".inline-entry-lock-in[data-entry-lock-pulse=\"multiply-result\"]",
    ".glow-amber",
    ".glow-amber[data-glow-cadence=\"bring-down\"]",
    ".work-row-enter",
    ".work-row[data-row-transition=\"enter\"] .work-row-value-shell",
    ".hint-stack[data-feedback-tone=\"encouragement\"]",
    ".hint-stack[data-feedback-tone=\"retry\"]",
    ".hint-stack[data-feedback-tone=\"celebration\"]",
    ".hint-status",
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
