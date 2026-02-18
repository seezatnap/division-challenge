import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
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

  return import(toDataUrl(compiled));
}

function createStep(kind, sequenceIndex, expectedValue, overrides = {}) {
  return {
    id: `step-${sequenceIndex}-${kind}`,
    problemId: "workspace-problem",
    kind,
    sequenceIndex,
    expectedValue,
    inputTargetId: `target-${sequenceIndex}`,
    ...overrides,
  };
}

const bringDownAnimationModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/bring-down-animation.ts",
);

test("resolveInitialWorkingDividendDigitCount tracks the first visible working number width", async () => {
  const { resolveInitialWorkingDividendDigitCount } = await bringDownAnimationModule;

  assert.equal(resolveInitialWorkingDividendDigitCount(432, 12), 2);
  assert.equal(resolveInitialWorkingDividendDigitCount(100, 200), 3);
});

test("buildBringDownAnimationSourceByStepId maps bring-down steps to source dividend digits", async () => {
  const { buildBringDownAnimationSourceByStepId } = await bringDownAnimationModule;
  const steps = [
    createStep("quotient-digit", 0, "1"),
    createStep("multiply-result", 1, "12"),
    createStep("subtraction-result", 2, "3"),
    createStep("bring-down", 3, "34", { id: "bring-down-0" }),
    createStep("quotient-digit", 4, "2"),
    createStep("multiply-result", 5, "24"),
    createStep("subtraction-result", 6, "10"),
    createStep("bring-down", 7, "103", { id: "bring-down-1" }),
    createStep("quotient-digit", 8, "8"),
    createStep("multiply-result", 9, "96"),
    createStep("subtraction-result", 10, "7"),
    createStep("bring-down", 11, "72", { id: "bring-down-2" }),
  ];

  const sourceByStepId = buildBringDownAnimationSourceByStepId({
    divisor: 12,
    dividend: 15432,
    steps,
  });

  assert.deepEqual(sourceByStepId["bring-down-0"], {
    stepId: "bring-down-0",
    sourceDividendDigitIndex: 2,
    digit: "4",
  });
  assert.deepEqual(sourceByStepId["bring-down-1"], {
    stepId: "bring-down-1",
    sourceDividendDigitIndex: 3,
    digit: "3",
  });
  assert.deepEqual(sourceByStepId["bring-down-2"], {
    stepId: "bring-down-2",
    sourceDividendDigitIndex: 4,
    digit: "2",
  });
});

test("buildBringDownAnimationSourceByStepId returns an empty map when no bring-down steps exist", async () => {
  const { buildBringDownAnimationSourceByStepId } = await bringDownAnimationModule;
  const steps = [
    createStep("quotient-digit", 0, "0"),
    createStep("multiply-result", 1, "0"),
    createStep("subtraction-result", 2, "5"),
  ];

  const sourceByStepId = buildBringDownAnimationSourceByStepId({
    divisor: 12,
    dividend: 5,
    steps,
  });

  assert.deepEqual(sourceByStepId, {});
});
