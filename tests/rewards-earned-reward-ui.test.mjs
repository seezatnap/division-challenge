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
    "setIsRevealModalOpen(true)",
    'data-ui-surface="reward-reveal-modal"',
    "Back To Board",
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
    "milestoneSolvedCount={activeRewardReveal.milestoneSolvedCount}",
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

test("earned reward panel uses JP3 green panel + wood frame aesthetic", async () => {
  const source = await readRepoFile("src/app/globals.css");

  // Earned reward panel should use JP3 green background and wood frame border
  assert.ok(
    source.includes(".earned-reward-panel"),
    "Expected .earned-reward-panel rule in stylesheet",
  );

  // Extract the earned-reward-panel block to verify JP3 styling
  const panelRuleStart = source.indexOf(".earned-reward-panel {");
  const panelRuleEnd = source.indexOf("}", panelRuleStart);
  const panelRule = source.slice(panelRuleStart, panelRuleEnd + 1);

  assert.ok(
    panelRule.includes("var(--jp-panel-bg)"),
    "Expected earned-reward-panel to use --jp-panel-bg green background",
  );
  assert.ok(
    panelRule.includes("var(--jp-frame)"),
    "Expected earned-reward-panel to use --jp-frame wood border color",
  );
  assert.ok(
    panelRule.includes("var(--jp-panel-text)"),
    "Expected earned-reward-panel to use --jp-panel-text cream text color",
  );
  assert.ok(
    panelRule.includes("var(--jp-frame-grain)"),
    "Expected earned-reward-panel to use wood grain texture overlay",
  );
});

test("reward reveal image uses bordered frame matching comp dinosaur portrait", async () => {
  const source = await readRepoFile("src/app/globals.css");

  // Reward reveal image should have JP3 dark-green bordered frame
  const imageRuleStart = source.indexOf(".reward-reveal-image {");
  const imageRuleEnd = source.indexOf("}", imageRuleStart);
  const imageRule = source.slice(imageRuleStart, imageRuleEnd + 1);

  assert.ok(
    imageRule.includes("var(--jp-panel-border)"),
    "Expected reward-reveal-image to use --jp-panel-border for bordered frame",
  );
  assert.ok(
    imageRule.includes("box-shadow"),
    "Expected reward-reveal-image to have box-shadow for inset portrait effect",
  );

  // Reward reveal figure should have portrait-area styling
  const figureRuleStart = source.indexOf(".reward-reveal-figure {");
  const figureRuleEnd = source.indexOf("}", figureRuleStart);
  const figureRule = source.slice(figureRuleStart, figureRuleEnd + 1);

  assert.ok(
    figureRule.includes("var(--jp-panel-border)"),
    "Expected reward-reveal-figure to use --jp-panel-border for portrait area border",
  );
  assert.ok(
    figureRule.includes("padding"),
    "Expected reward-reveal-figure to have padding for portrait area framing",
  );
});

test("reward reveal modal uses JP3 wood frame border aesthetic", async () => {
  const source = await readRepoFile("src/app/globals.css");

  const modalRuleStart = source.indexOf(".reward-reveal-modal {");
  const modalRuleEnd = source.indexOf("}", modalRuleStart);
  const modalRule = source.slice(modalRuleStart, modalRuleEnd + 1);

  assert.ok(
    modalRule.includes("var(--jp-frame)"),
    "Expected reward-reveal-modal to use --jp-frame wood border",
  );
  assert.ok(
    modalRule.includes("var(--jp-frame-grain)"),
    "Expected reward-reveal-modal to use wood grain texture overlay",
  );
});

test("reward modal image uses bordered frame matching comp dinosaur portrait", async () => {
  const source = await readRepoFile("src/app/globals.css");

  const rewardModalImageRuleStart = source.indexOf(".reward-modal-image {");
  const rewardModalImageRuleEnd = source.indexOf("}", rewardModalImageRuleStart);
  const rewardModalImageRule = source.slice(rewardModalImageRuleStart, rewardModalImageRuleEnd + 1);

  assert.ok(
    rewardModalImageRule.includes("var(--jp-panel-border)"),
    "Expected reward-modal-image to use --jp-panel-border for bordered frame",
  );
  assert.ok(
    rewardModalImageRule.includes("box-shadow"),
    "Expected reward-modal-image to have box-shadow for portrait frame effect",
  );
});
