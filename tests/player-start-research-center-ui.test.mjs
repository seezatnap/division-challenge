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

test("player start screen uses Research Center title treatment and terminal-style input", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");
  const cssSource = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    'className="surface-title player-start-title"',
    "The Research Center",
    "Use the field terminal to open or resume your Isla Sorna operator profile.",
    'className="game-start-label player-start-label"',
    'className="game-start-input player-start-input"',
    'className="game-start-helper player-start-helper"',
    'className="game-start-error player-start-error"',
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected player-start fragment: ${fragment}`);
  }

  for (const fragment of [
    ".player-start-header {",
    ".player-start-title {",
    ".player-start-subtitle {",
    ".player-start-label {",
    ".player-start-input {",
    "font-family: var(--font-jurassic-mono), \"IBM Plex Mono\", monospace;",
    "background: linear-gradient(",
    "color: color-mix(in srgb, var(--jp-panel-text) 95%, white);",
    ".player-start-input::placeholder {",
    ".player-start-helper {",
    ".player-start-error {",
  ]) {
    assert.ok(cssSource.includes(fragment), `Expected player-start style fragment: ${fragment}`);
  }
});
