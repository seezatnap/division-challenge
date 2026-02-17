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

test("earned reward panel uses egg-hatching loading UX and polling helpers", async () => {
  const source = await readRepoFile("src/features/rewards/components/earned-reward-reveal-panel.tsx");

  for (const fragment of [
    "pollEarnedRewardImageUntilReady",
    "fetchEarnedRewardImageStatus",
    'data-reward-phase={phase}',
    'data-reward-motion={isRewardTransitionPhase(phase) ? phase : "fallback"}',
    "reward-egg-loader",
    'data-hatch-state={phase}',
    "The reward egg is hatching...",
    "setPhase(\"cracking\")",
    "setPhase(\"revealed\")",
    'data-reveal-state={phase === "revealing" ? "revealing" : "revealed"}',
  ]) {
    assert.ok(source.includes(fragment), `Expected earned reward panel fragment: ${fragment}`);
  }
});

test("earned reward panel resets reveal state when reward identity props change", async () => {
  const source = await readRepoFile("src/features/rewards/components/earned-reward-reveal-panel.tsx");

  for (const fragment of [
    "function createRewardRevealResetKey(",
    'return `${dinosaurName}|${initialStatus}|${initialImagePath ?? ""}`;',
    "<EarnedRewardRevealPanelContent",
    "key={rewardRevealResetKey}",
    "initialStatus={initialStatus}",
    "initialImagePath={initialImagePath}",
  ]) {
    assert.ok(
      source.includes(fragment),
      `Expected prop-change reveal state reset fragment: ${fragment}`,
    );
  }
});

test("home page renders the earned reward reveal surface", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  for (const fragment of [
    'data-ui-surface="earned-reward"',
    "<EarnedRewardRevealPanel",
    "milestoneSolvedCount={15}",
  ]) {
    assert.ok(source.includes(fragment), `Expected home page fragment: ${fragment}`);
  }
});

test("global stylesheet defines egg-hatching and reveal animation styles", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".earned-reward-panel",
    '.earned-reward-panel[data-reward-motion="cracking"]',
    ".reward-egg-loader",
    '.reward-egg-loader[data-hatch-state="cracking"] .reward-egg-shell',
    ".reward-egg-shell",
    ".reward-egg-shell-crack",
    "@keyframes reward-egg-wobble",
    "@keyframes reward-egg-wobble-cracking",
    "@keyframes reward-hatch-crack",
    "@keyframes reward-hatch-crack-widen",
    ".reward-reveal-image",
    '.reward-reveal-figure[data-reveal-state="revealing"] .reward-reveal-image',
    "@keyframes reward-reveal-in",
    "@keyframes reward-reveal-glow",
  ]) {
    assert.ok(source.includes(fragment), `Expected reward styling fragment: ${fragment}`);
  }
});
