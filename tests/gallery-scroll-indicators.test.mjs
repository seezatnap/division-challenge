import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function loadTypeScriptModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("scroll indicator state resolves overflow and direction from scroll metrics", async () => {
  const { resolveScrollIndicatorState } = await loadTypeScriptModule(
    "src/features/hooks/scroll-indicator-state.ts",
  );

  assert.deepEqual(
    resolveScrollIndicatorState({ scrollTop: 0, clientHeight: 320, scrollHeight: 320 }),
    {
      isScrollable: false,
      canScrollUp: false,
      canScrollDown: false,
    },
  );
  assert.deepEqual(
    resolveScrollIndicatorState({ scrollTop: 0, clientHeight: 320, scrollHeight: 860 }),
    {
      isScrollable: true,
      canScrollUp: false,
      canScrollDown: true,
    },
  );
  assert.deepEqual(
    resolveScrollIndicatorState({ scrollTop: 210, clientHeight: 320, scrollHeight: 860 }),
    {
      isScrollable: true,
      canScrollUp: true,
      canScrollDown: true,
    },
  );
  assert.deepEqual(
    resolveScrollIndicatorState({ scrollTop: 540, clientHeight: 320, scrollHeight: 860 }),
    {
      isScrollable: true,
      canScrollUp: true,
      canScrollDown: false,
    },
  );
  assert.deepEqual(
    resolveScrollIndicatorState({ scrollTop: -20, clientHeight: 320, scrollHeight: 860 }),
    {
      isScrollable: true,
      canScrollUp: false,
      canScrollDown: true,
    },
  );
});

test("gallery detail and overflow modal panels expose scroll-indicator data attributes", async () => {
  const gallerySource = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");
  const pageSource = await readRepoFile("src/app/page.tsx");
  const rewardSource = await readRepoFile("src/features/rewards/components/earned-reward-reveal-panel.tsx");

  for (const fragment of [
    "useScrollIndicatorState",
    "selectedRewardModalScrollIndicators",
    "data-scroll-indicator-enabled={selectedRewardModalScrollIndicators.isScrollable ? \"true\" : \"false\"}",
    "data-scroll-indicator-up={selectedRewardModalScrollIndicators.canScrollUp ? \"true\" : \"false\"}",
    "data-scroll-indicator-down={selectedRewardModalScrollIndicators.canScrollDown ? \"true\" : \"false\"}",
  ]) {
    assert.ok(gallerySource.includes(fragment), `Expected gallery scroll-indicator fragment: ${fragment}`);
  }

  for (const fragment of [
    "hybridLabModalScrollIndicators",
    "hybridDetailModalScrollIndicators",
    "data-scroll-indicator-enabled={hybridLabModalScrollIndicators.isScrollable ? \"true\" : \"false\"}",
    "data-scroll-indicator-enabled={hybridDetailModalScrollIndicators.isScrollable ? \"true\" : \"false\"}",
    "data-scroll-indicator-up={hybridLabModalScrollIndicators.canScrollUp ? \"true\" : \"false\"}",
    "data-scroll-indicator-down={hybridDetailModalScrollIndicators.canScrollDown ? \"true\" : \"false\"}",
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected overflow panel scroll-indicator fragment: ${fragment}`);
  }

  for (const fragment of [
    "revealModalScrollIndicators",
    "data-scroll-indicator-enabled={revealModalScrollIndicators.isScrollable ? \"true\" : \"false\"}",
    "data-scroll-indicator-up={revealModalScrollIndicators.canScrollUp ? \"true\" : \"false\"}",
    "data-scroll-indicator-down={revealModalScrollIndicators.canScrollDown ? \"true\" : \"false\"}",
  ]) {
    assert.ok(rewardSource.includes(fragment), `Expected reward modal scroll-indicator fragment: ${fragment}`);
  }
});

test("global stylesheet defines red triangular scroll arrows for overflow modal surfaces", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".jp-modal[data-scroll-indicator-up=\"true\"]::before",
    ".jp-modal[data-scroll-indicator-down=\"true\"]::after",
    "clip-path: polygon(50% 2%, 4% 98%, 96% 98%);",
    "clip-path: polygon(4% 2%, 96% 2%, 50% 98%);",
    "var(--jp-accent-red)",
  ]) {
    assert.ok(source.includes(fragment), `Expected scroll indicator style fragment: ${fragment}`);
  }
});
