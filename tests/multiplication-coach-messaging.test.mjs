import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

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

const coachModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/multiplication-coach-messaging.ts",
);

function createFocus(overrides = {}) {
  return {
    stepId: "problem:step:0:partial-product",
    stepKind: "partial-product",
    multiplicandText: "234",
    multiplierText: "56",
    multiplierDigitText: "6",
    shiftZeroCount: 0,
    partialRowCount: 2,
    ...overrides,
  };
}

test("coach explains the active partial product with the place name", async () => {
  const { resolveMultiplicationStepCoachMessage } = await coachModule;

  const onesMessage = resolveMultiplicationStepCoachMessage(createFocus());
  assert.equal(onesMessage.statusLabel, "Build The Partial Product");
  assert.ok(onesMessage.text.includes("Multiply 234 by 6"));
  assert.ok(onesMessage.text.includes("ones digit"));

  const tensMessage = resolveMultiplicationStepCoachMessage(
    createFocus({ multiplierDigitText: "5", shiftZeroCount: 1 }),
  );
  assert.ok(tensMessage.text.includes("Multiply 234 by 5"));
  assert.ok(tensMessage.text.includes("tens digit"));
  assert.ok(tensMessage.note.includes("place-holder zero"));
});

test("coach guides the product sum and celebrates completion", async () => {
  const { resolveMultiplicationStepCoachMessage } = await coachModule;

  const sumMessage = resolveMultiplicationStepCoachMessage(
    createFocus({ stepKind: "product-sum", multiplierDigitText: null }),
  );
  assert.equal(sumMessage.statusLabel, "Add The Partial Products");
  assert.equal(sumMessage.tone, "encouragement");

  const completeMessage = resolveMultiplicationStepCoachMessage(
    createFocus({ stepId: null, stepKind: "none" }),
  );
  assert.equal(completeMessage.tone, "celebration");
  assert.equal(completeMessage.outcome, "complete");
});

test("default multiplication coach message primes right-to-left entry", async () => {
  const { DEFAULT_MULTIPLICATION_FEEDBACK_MESSAGE } = await coachModule;

  assert.equal(DEFAULT_MULTIPLICATION_FEEDBACK_MESSAGE.outcome, "ready");
  assert.ok(DEFAULT_MULTIPLICATION_FEEDBACK_MESSAGE.note.includes("right to left"));
});
