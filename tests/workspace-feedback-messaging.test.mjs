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

function createValidation(overrides = {}) {
  const baseValidation = {
    outcome: "correct",
    didAdvance: true,
    isProblemComplete: false,
    currentStepIndex: 0,
    currentStepId: "step-0-quotient-digit",
    focusStepIndex: 1,
    focusStepId: "step-1-multiply-result",
    expectedValue: "3",
    normalizedSubmittedValue: "3",
    hintHook: {
      id: "dino-feedback:correct:quotient-digit",
      stepKind: "quotient-digit",
      tone: "encouragement",
      messageKey: "dino.feedback.correct.quotient-digit",
    },
  };

  return {
    ...baseValidation,
    ...overrides,
    hintHook: {
      ...baseValidation.hintHook,
      ...(overrides.hintHook ?? {}),
    },
  };
}

const feedbackMessagingModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/dino-feedback-messaging.ts",
);

test("default dino feedback message starts in a ready state", async () => {
  const { DEFAULT_DINO_FEEDBACK_MESSAGE } = await feedbackMessagingModule;

  assert.equal(DEFAULT_DINO_FEEDBACK_MESSAGE.outcome, "ready");
  assert.equal(DEFAULT_DINO_FEEDBACK_MESSAGE.tone, "encouragement");
  assert.equal(DEFAULT_DINO_FEEDBACK_MESSAGE.messageKey, "dino.feedback.ready");
  assert.match(DEFAULT_DINO_FEEDBACK_MESSAGE.text, /glowing cell/i);
});

test("resolver maps encouragement outcomes to dino-themed success messaging", async () => {
  const { resolveDinoFeedbackMessage } = await feedbackMessagingModule;
  const message = resolveDinoFeedbackMessage(createValidation());

  assert.equal(message.outcome, "correct");
  assert.equal(message.tone, "encouragement");
  assert.equal(message.messageKey, "dino.feedback.correct.quotient-digit");
  assert.equal(message.statusLabel, "Roarsome Progress");
  assert.equal(message.text, "Roarsome! That quotient digit locked in perfectly.");
});

test("resolver maps retry outcomes to playful retry hints", async () => {
  const { resolveDinoFeedbackMessage } = await feedbackMessagingModule;
  const message = resolveDinoFeedbackMessage(
    createValidation({
      outcome: "incorrect",
      didAdvance: false,
      focusStepIndex: 1,
      focusStepId: "step-1-multiply-result",
      normalizedSubmittedValue: "13",
      hintHook: {
        id: "dino-feedback:retry:multiply-result",
        stepKind: "multiply-result",
        tone: "retry",
        messageKey: "dino.feedback.retry.multiply-result",
      },
    }),
  );

  assert.equal(message.outcome, "incorrect");
  assert.equal(message.tone, "retry");
  assert.equal(message.statusLabel, "Retry Multiplication");
  assert.equal(message.text, "The T-Rex says: try multiplying again!");
});

test("resolver maps completion outcomes to celebration messaging", async () => {
  const { resolveDinoFeedbackMessage } = await feedbackMessagingModule;
  const message = resolveDinoFeedbackMessage(
    createValidation({
      outcome: "complete",
      isProblemComplete: true,
      focusStepIndex: null,
      focusStepId: null,
      hintHook: {
        id: "dino-feedback:complete:problem",
        tone: "celebration",
        messageKey: "dino.feedback.complete.problem",
      },
    }),
  );

  assert.equal(message.outcome, "complete");
  assert.equal(message.tone, "celebration");
  assert.equal(message.statusLabel, "Dino-Mite Finish");
  assert.match(message.text, /Fossil-five/i);
});

test("resolver falls back to tone defaults when message key is unknown", async () => {
  const { resolveDinoFeedbackMessage } = await feedbackMessagingModule;
  const message = resolveDinoFeedbackMessage(
    createValidation({
      outcome: "incorrect",
      didAdvance: false,
      hintHook: {
        id: "dino-feedback:retry:custom",
        tone: "retry",
        messageKey: "dino.feedback.retry.unknown",
      },
    }),
  );

  assert.equal(message.statusLabel, "Try Again");
  assert.match(message.text, /one more attempt/i);
});

test("resolver validates malformed validation payloads", async () => {
  const { resolveDinoFeedbackMessage } = await feedbackMessagingModule;

  assert.throws(() => resolveDinoFeedbackMessage(null), /hintHook/);
  assert.throws(
    () =>
      resolveDinoFeedbackMessage({
        outcome: "correct",
      }),
    /hintHook/,
  );
});

test("current-step coach resolver generates quotient guidance from active focus values", async () => {
  const { resolveCurrentStepCoachMessage } = await feedbackMessagingModule;
  const message = resolveCurrentStepCoachMessage({
    stepId: "workspace-preview-problem:step:0:quotient-digit",
    stepKind: "quotient-digit",
    divisorText: "12",
    workingValueText: "43",
    quotientDigitText: "3",
    multiplyValueText: null,
    subtractionValueText: null,
    bringDownDigitText: null,
  });

  assert.equal(message.outcome, "ready");
  assert.equal(message.tone, "encouragement");
  assert.equal(message.statusLabel, "Choose Quotient Digit");
  assert.equal(message.text, "How many times does 12 go into 43?");
  assert.match(message.note, /quotient digit/i);
});

test("current-step coach resolver returns celebration guidance once the active step is complete", async () => {
  const { resolveCurrentStepCoachMessage } = await feedbackMessagingModule;
  const message = resolveCurrentStepCoachMessage({
    stepId: null,
    stepKind: "none",
    divisorText: "12",
    workingValueText: null,
    quotientDigitText: null,
    multiplyValueText: null,
    subtractionValueText: null,
    bringDownDigitText: null,
  });

  assert.equal(message.outcome, "complete");
  assert.equal(message.tone, "celebration");
  assert.equal(message.statusLabel, "Dino-Mite Finish");
});
