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

test("IslaSornaToolbar component exists and exports a named function", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes("export function IslaSornaToolbar"),
    "Expected named export IslaSornaToolbar",
  );
});

test("IslaSornaToolbar renders a nav with the surveillance device label", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes("Isla Sorna Surveillance Device"),
    "Expected the surveillance device label text",
  );
  assert.ok(
    source.includes('className="isla-sorna-toolbar"'),
    "Expected the toolbar root CSS class",
  );
  assert.ok(
    source.includes('data-ui-surface="toolbar"'),
    "Expected data-ui-surface=\"toolbar\" attribute for test targeting",
  );
});

test("IslaSornaToolbar renders icon buttons for footprint, fossil, DNA helix, and egg", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  for (const iconLabel of ["Footprint", "Fossil", "DNA Helix", "Egg"]) {
    assert.ok(
      source.includes(`aria-label="${iconLabel}"`),
      `Expected icon button with aria-label="${iconLabel}"`,
    );
  }

  assert.ok(
    source.includes("toolbar-icon-btn"),
    "Expected toolbar-icon-btn CSS class on icon buttons",
  );
});

test("IslaSornaToolbar renders a MORE link with red arrow indicator", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes("toolbar-more-link"),
    "Expected the toolbar-more-link CSS class",
  );
  assert.ok(
    source.includes("toolbar-more-arrow"),
    "Expected the toolbar-more-arrow CSS class for the red arrow",
  );
  assert.ok(
    source.includes("More"),
    "Expected the MORE link text",
  );
});

test("toolbar label uses small-caps in CSS", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".toolbar-label"),
    "Expected .toolbar-label style rule in globals.css",
  );
  assert.ok(
    source.includes("font-variant: small-caps"),
    "Expected small-caps font-variant on the toolbar label",
  );
});

test("toolbar uses dark metallic background from design tokens", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".isla-sorna-toolbar"),
    "Expected .isla-sorna-toolbar style rule in globals.css",
  );
  assert.ok(
    source.includes("var(--jp-toolbar)"),
    "Expected --jp-toolbar token used in toolbar background",
  );
  assert.ok(
    source.includes("var(--jp-toolbar-text)"),
    "Expected --jp-toolbar-text token used for toolbar text color",
  );
});

test("toolbar icon buttons use amber color from design tokens", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".toolbar-icon-btn"),
    "Expected .toolbar-icon-btn style rule in globals.css",
  );
  assert.ok(
    source.includes("var(--jp-amber)"),
    "Expected --jp-amber token used for icon button color",
  );
});

test("MORE arrow uses accent red color from design tokens", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".toolbar-more-arrow"),
    "Expected .toolbar-more-arrow style rule in globals.css",
  );
  assert.ok(
    source.includes("var(--jp-accent-red)"),
    "Expected --jp-accent-red token used for the MORE arrow color",
  );
});

test("toolbar is fixed to the bottom of the viewport", async () => {
  const source = await readRepoFile("src/app/globals.css");

  // Verify position fixed and bottom 0 in the toolbar styles
  const toolbarRuleMatch = source.match(
    /\.isla-sorna-toolbar\s*\{[^}]+\}/s,
  );
  assert.ok(toolbarRuleMatch, "Expected .isla-sorna-toolbar CSS rule block");

  const toolbarRule = toolbarRuleMatch[0];
  assert.ok(
    toolbarRule.includes("position: fixed"),
    "Expected position: fixed on toolbar",
  );
  assert.ok(
    toolbarRule.includes("bottom: 0"),
    "Expected bottom: 0 on toolbar",
  );
});

test("page.tsx imports and renders IslaSornaToolbar", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  assert.ok(
    source.includes('import { IslaSornaToolbar } from "./isla-sorna-toolbar"'),
    "Expected IslaSornaToolbar import in page.tsx",
  );
  assert.ok(
    source.includes("<IslaSornaToolbar"),
    "Expected IslaSornaToolbar JSX element rendered in page.tsx",
  );

  // Toolbar should appear in both pre-session and in-session views
  const occurrences = source.split("<IslaSornaToolbar").length - 1;
  assert.ok(
    occurrences >= 2,
    `Expected IslaSornaToolbar to appear at least twice (pre-session and in-session), found ${occurrences}`,
  );
});

// ——— Session stats readout tests (#7) ———

test("IslaSornaToolbar exports IslaSornaToolbarStats interface", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes("export interface IslaSornaToolbarStats"),
    "Expected exported IslaSornaToolbarStats interface",
  );
  assert.ok(
    source.includes("problemsSolved: number"),
    "Expected problemsSolved field in IslaSornaToolbarStats",
  );
  assert.ok(
    source.includes("currentStreak: number"),
    "Expected currentStreak field in IslaSornaToolbarStats",
  );
  assert.ok(
    source.includes("difficultyLevel: number"),
    "Expected difficultyLevel field in IslaSornaToolbarStats",
  );
});

test("IslaSornaToolbar accepts optional stats prop", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes("stats?: IslaSornaToolbarStats"),
    "Expected optional stats prop of type IslaSornaToolbarStats",
  );
});

test("IslaSornaToolbar renders readout elements when stats are provided", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes('className="toolbar-readouts"'),
    "Expected toolbar-readouts container class",
  );
  assert.ok(
    source.includes('className="toolbar-readout"'),
    "Expected toolbar-readout class for individual stat readouts",
  );
  assert.ok(
    source.includes('className="toolbar-readout-label"'),
    "Expected toolbar-readout-label class for stat labels",
  );
  assert.ok(
    source.includes('className="toolbar-readout-value"'),
    "Expected toolbar-readout-value class for stat values",
  );
});

test("IslaSornaToolbar conditionally renders stats only when provided", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes("{stats ?"),
    "Expected conditional rendering based on stats prop",
  );
});

test("toolbar readouts display problems solved, streak, and difficulty level", async () => {
  const source = await readRepoFile("src/app/isla-sorna-toolbar.tsx");

  assert.ok(
    source.includes('data-stat="problems-solved"'),
    "Expected data-stat=\"problems-solved\" attribute on readout value",
  );
  assert.ok(
    source.includes('data-stat="current-streak"'),
    "Expected data-stat=\"current-streak\" attribute on readout value",
  );
  assert.ok(
    source.includes('data-stat="difficulty-level"'),
    "Expected data-stat=\"difficulty-level\" attribute on readout value",
  );
  assert.ok(
    source.includes("stats.problemsSolved"),
    "Expected stats.problemsSolved to be rendered",
  );
  assert.ok(
    source.includes("stats.currentStreak"),
    "Expected stats.currentStreak to be rendered",
  );
  assert.ok(
    source.includes("stats.difficultyLevel"),
    "Expected stats.difficultyLevel to be rendered",
  );
});

test("toolbar readout CSS uses dark metallic aesthetic", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".toolbar-readouts"),
    "Expected .toolbar-readouts style rule in globals.css",
  );
  assert.ok(
    source.includes(".toolbar-readout"),
    "Expected .toolbar-readout style rule in globals.css",
  );
  assert.ok(
    source.includes(".toolbar-readout-label"),
    "Expected .toolbar-readout-label style rule in globals.css",
  );
  assert.ok(
    source.includes(".toolbar-readout-value"),
    "Expected .toolbar-readout-value style rule in globals.css",
  );
});

test("toolbar readout labels use small-caps and toolbar-text color", async () => {
  const source = await readRepoFile("src/app/globals.css");

  const labelRuleMatch = source.match(
    /\.toolbar-readout-label\s*\{[^}]+\}/s,
  );
  assert.ok(labelRuleMatch, "Expected .toolbar-readout-label CSS rule block");

  const labelRule = labelRuleMatch[0];
  assert.ok(
    labelRule.includes("font-variant: small-caps"),
    "Expected small-caps font-variant on readout labels",
  );
  assert.ok(
    labelRule.includes("var(--jp-toolbar-text)"),
    "Expected --jp-toolbar-text color on readout labels",
  );
});

test("toolbar readout values use monospace font and amber-bright color", async () => {
  const source = await readRepoFile("src/app/globals.css");

  const valueRuleMatch = source.match(
    /\.toolbar-readout-value\s*\{[^}]+\}/s,
  );
  assert.ok(valueRuleMatch, "Expected .toolbar-readout-value CSS rule block");

  const valueRule = valueRuleMatch[0];
  assert.ok(
    valueRule.includes("font-weight: 700"),
    "Expected bold font-weight on readout values",
  );
  assert.ok(
    valueRule.includes("--jp-amber-bright"),
    "Expected --jp-amber-bright token used for readout value color",
  );
});

test("page.tsx passes session stats to in-session IslaSornaToolbar", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  assert.ok(
    source.includes("problemsSolved:"),
    "Expected problemsSolved being passed to toolbar stats prop",
  );
  assert.ok(
    source.includes("currentStreak:"),
    "Expected currentStreak being passed to toolbar stats prop",
  );
  assert.ok(
    source.includes("difficultyLevel:"),
    "Expected difficultyLevel being passed to toolbar stats prop",
  );
});

test("pre-session toolbar does not receive stats prop", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // Find the pre-session view (before isSessionStarted check returns early)
  const preSessionMatch = source.match(
    /if\s*\(\s*!isSessionStarted\s*\)\s*\{[\s\S]*?<IslaSornaToolbar\s*\/>/,
  );
  assert.ok(
    preSessionMatch,
    "Expected pre-session IslaSornaToolbar rendered without props (self-closing)",
  );
});

test("jurassic-shell has bottom padding to prevent toolbar from covering content", async () => {
  const source = await readRepoFile("src/app/globals.css");

  // Find the jurassic-shell rule and verify it has padding-bottom
  const shellRuleMatch = source.match(
    /\.jurassic-shell\s*\{[^}]+\}/s,
  );
  assert.ok(shellRuleMatch, "Expected .jurassic-shell CSS rule block");

  const shellRule = shellRuleMatch[0];
  assert.ok(
    shellRule.includes("padding-bottom"),
    "Expected padding-bottom on .jurassic-shell to accommodate toolbar",
  );
});
