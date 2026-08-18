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
    multiplicandDisplayText: "234",
    multiplierDisplayText: "56",
    multiplicandDecimalPlaces: 0,
    multiplierDecimalPlaces: 0,
    productDecimalPlaces: 0,
    carryDigits: [],
    ...overrides,
  };
}

function createDecimalFocus(overrides = {}) {
  // 8.84 x 8.6 = 76.024
  return createFocus({
    multiplicandText: "884",
    multiplierText: "86",
    multiplicandDisplayText: "8.84",
    multiplierDisplayText: "8.6",
    multiplicandDecimalPlaces: 2,
    multiplierDecimalPlaces: 1,
    productDecimalPlaces: 3,
    ...overrides,
  });
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

test("coach tells decimal players to multiply the bare digits and ignore the points", async () => {
  const { resolveMultiplicationStepCoachMessage } = await coachModule;

  const onesMessage = resolveMultiplicationStepCoachMessage(createDecimalFocus());
  assert.ok(onesMessage.text.includes("Multiply 884 by 6"));
  assert.ok(onesMessage.text.includes("right-most digit of 8.6"));
  assert.ok(onesMessage.text.includes("Ignore the decimal points"));
  assert.ok(!onesMessage.text.includes("ones digit"));

  const tensMessage = resolveMultiplicationStepCoachMessage(
    createDecimalFocus({ multiplierDigitText: "8", shiftZeroCount: 1 }),
  );
  assert.ok(tensMessage.text.includes("second-from-right digit of 8.6"));

  const sumMessage = resolveMultiplicationStepCoachMessage(
    createDecimalFocus({ stepKind: "product-sum", multiplierDigitText: null }),
  );
  assert.ok(sumMessage.text.includes("place the decimal point"));
});

test("coach guides the decimal-point placement step", async () => {
  const { resolveMultiplicationStepCoachMessage } = await coachModule;

  const message = resolveMultiplicationStepCoachMessage(
    createDecimalFocus({
      stepId: "problem:step:3:decimal-point",
      stepKind: "decimal-point",
      multiplierDigitText: null,
    }),
  );

  assert.equal(message.statusLabel, "Place The Decimal Point");
  assert.equal(message.tone, "encouragement");
  assert.equal(message.outcome, "ready");
  assert.equal(message.messageKey, "dino.coach.current-step.decimal-point");
  assert.ok(message.text.includes("8.84"));
  assert.ok(message.text.includes("8.6"));
  assert.ok(message.text.includes("tap the glowing dot"));
  assert.ok(message.note.includes("both factors combined"));
});
