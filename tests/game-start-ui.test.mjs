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

test("home page requires player name to start and wires localStorage profile persistence", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  for (const fragment of [
    'data-ui-surface="player-start"',
    'data-ui-action="start-session"',
    "Operator ID",
    "Use this Operator ID to log in later and resume your progress on this device.",
    "normalizePlayerProfileName",
    "readPlayerProfileSnapshot",
    "writePlayerProfileSnapshot",
    "window.localStorage",
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected player-start fragment: ${fragment}`);
  }

  assert.ok(
    pageSource.includes('required'),
    "Expected player-name input to require a non-empty value",
  );
  assert.equal(
    pageSource.includes("Expedition Files"),
    false,
    "Expedition Files save/load surface should be removed",
  );
});

test("player-start screen uses InGen login title treatment with serif heading and subtitle", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  assert.ok(
    pageSource.includes("InGen System Login"),
    "Expected InGen login title heading on player-start screen",
  );
  assert.ok(
    pageSource.includes("research-center-title"),
    "Expected research-center-title CSS class on heading",
  );
  assert.ok(
    pageSource.includes("research-center-subtitle"),
    "Expected research-center-subtitle CSS class for subtitle text",
  );
  assert.ok(
    pageSource.includes("research-center-header"),
    "Expected research-center-header wrapper for title treatment",
  );
  assert.ok(
    pageSource.includes("research-center-kicker"),
    "Expected research-center-kicker class for authentication panel kicker text",
  );
});

test("player-name input is styled as a field-station terminal input", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  assert.ok(
    pageSource.includes("terminal-input"),
    "Expected terminal-input CSS class on player-name input",
  );
});

test("global stylesheet defines Research Center title and terminal input styles", async () => {
  const cssSource = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".research-center-header",
    ".research-center-kicker",
    ".research-center-title",
    ".research-center-subtitle",
    ".game-start-input.terminal-input",
    "--font-jurassic-display",
  ]) {
    assert.ok(
      cssSource.includes(fragment),
      `Expected Research Center styling fragment: ${fragment}`,
    );
  }

  assert.ok(
    cssSource.includes(".game-start-input.terminal-input::placeholder"),
    "Expected terminal input placeholder styling",
  );
  assert.ok(
    cssSource.includes(".game-start-input.terminal-input:focus-visible"),
    "Expected terminal input focus-visible styling",
  );
});
