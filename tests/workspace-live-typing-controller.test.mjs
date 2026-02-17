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

function createStep(kind, sequenceIndex, expectedValue) {
  return {
    id: `step-${sequenceIndex}-${kind}`,
    problemId: "workspace-live-input-problem",
    kind,
    sequenceIndex,
    expectedValue,
    inputTargetId: `target-${sequenceIndex}`,
  };
}

const controllerModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/live-typing-controller.ts",
);
const stepValidationModule = loadTypeScriptModule(
  "src/features/division-engine/lib/step-validation.ts",
);

const sampleSteps = [
  createStep("quotient-digit", 0, "3"),
  createStep("multiply-result", 1, "36"),
  createStep("subtraction-result", 2, "0"),
];

const bringDownSampleSteps = [
  createStep("quotient-digit", 0, "3"),
  createStep("multiply-result", 1, "36"),
  createStep("subtraction-result", 2, "7"),
  createStep("bring-down", 3, "72"),
  createStep("quotient-digit", 4, "6"),
];

test("createLiveWorkspaceTypingState clamps the revealed step count", async () => {
  const { createLiveWorkspaceTypingState } = await controllerModule;

  const hiddenState = createLiveWorkspaceTypingState({
    stepCount: sampleSteps.length,
    revealedStepCount: Number.NEGATIVE_INFINITY,
  });
  const oversizedState = createLiveWorkspaceTypingState({
    stepCount: sampleSteps.length,
    revealedStepCount: 999,
  });

  assert.equal(hiddenState.revealedStepCount, 0);
  assert.equal(oversizedState.revealedStepCount, sampleSteps.length);
  assert.deepEqual(hiddenState.draftEntryValues, {});
  assert.deepEqual(oversizedState.draftEntryValues, {});
});

test("sanitizeInlineWorkspaceEntryValue keeps only numeric characters", async () => {
  const { sanitizeInlineWorkspaceEntryValue } = await controllerModule;

  assert.equal(sanitizeInlineWorkspaceEntryValue(" 0a3 \n"), "03");
  assert.equal(sanitizeInlineWorkspaceEntryValue(""), "");
  assert.equal(sanitizeInlineWorkspaceEntryValue("dino"), "");
});

test("incorrect active-cell typing stores draft text and keeps glow on the same step", async () => {
  const [{ applyLiveWorkspaceEntryInput, createLiveWorkspaceTypingState }, { validateLongDivisionStepAnswer }] =
    await Promise.all([controllerModule, stepValidationModule]);

  const state = createLiveWorkspaceTypingState({
    stepCount: sampleSteps.length,
    revealedStepCount: 0,
  });

  const transition = applyLiveWorkspaceEntryInput({
    steps: sampleSteps,
    state,
    stepId: sampleSteps[0].id,
    rawValue: "d9",
    validateStep: validateLongDivisionStepAnswer,
  });

  assert.equal(transition.didAdvance, false);
  assert.equal(transition.lockedStepId, null);
  assert.equal(transition.sanitizedValue, "9");
  assert.equal(transition.validation?.outcome, "incorrect");
  assert.equal(transition.state.revealedStepCount, 0);
  assert.equal(transition.state.draftEntryValues[sampleSteps[0].id], "9");
});

test("correct active-cell typing locks the value and auto-advances to the next target", async () => {
  const [{ applyLiveWorkspaceEntryInput, createLiveWorkspaceTypingState }, { validateLongDivisionStepAnswer }] =
    await Promise.all([controllerModule, stepValidationModule]);

  const state = createLiveWorkspaceTypingState({
    stepCount: sampleSteps.length,
    revealedStepCount: 0,
  });

  const transition = applyLiveWorkspaceEntryInput({
    steps: sampleSteps,
    state,
    stepId: sampleSteps[0].id,
    rawValue: "03",
    validateStep: validateLongDivisionStepAnswer,
  });

  assert.equal(transition.didAdvance, true);
  assert.equal(transition.lockedStepId, sampleSteps[0].id);
  assert.equal(transition.validation?.outcome, "correct");
  assert.equal(transition.state.revealedStepCount, 1);
  assert.equal(transition.state.draftEntryValues[sampleSteps[0].id], undefined);
});

test("final correct entry reveals all steps and emits completion validation", async () => {
  const [{ applyLiveWorkspaceEntryInput, createLiveWorkspaceTypingState }, { validateLongDivisionStepAnswer }] =
    await Promise.all([controllerModule, stepValidationModule]);

  const state = createLiveWorkspaceTypingState({
    stepCount: sampleSteps.length,
    revealedStepCount: sampleSteps.length - 1,
  });

  const transition = applyLiveWorkspaceEntryInput({
    steps: sampleSteps,
    state,
    stepId: sampleSteps.at(-1).id,
    rawValue: "0",
    validateStep: validateLongDivisionStepAnswer,
  });

  assert.equal(transition.didAdvance, true);
  assert.equal(transition.lockedStepId, sampleSteps.at(-1).id);
  assert.equal(transition.validation?.outcome, "complete");
  assert.equal(transition.state.revealedStepCount, sampleSteps.length);
});

test("resolveInlineWorkspaceEntryValue prefers locked values and falls back to draft text", async () => {
  const { resolveInlineWorkspaceEntryValue } = await controllerModule;
  const stepId = sampleSteps[1].id;

  assert.equal(
    resolveInlineWorkspaceEntryValue({
      stepId,
      lockedValue: "36",
      isFilled: true,
      draftEntryValues: { [stepId]: "0" },
    }),
    "36",
  );
  assert.equal(
    resolveInlineWorkspaceEntryValue({
      stepId,
      lockedValue: "36",
      isFilled: false,
      draftEntryValues: { [stepId]: "63" },
    }),
    "63",
  );
  assert.equal(
    resolveInlineWorkspaceEntryValue({
      stepId,
      lockedValue: "36",
      isFilled: false,
      draftEntryValues: {},
    }),
    "",
  );
});

test("tryAutoAdvanceBringDownStep auto-locks active bring-down rows and advances focus", async () => {
  const [{ createLiveWorkspaceTypingState, tryAutoAdvanceBringDownStep }, { validateLongDivisionStepAnswer }] =
    await Promise.all([controllerModule, stepValidationModule]);

  const state = createLiveWorkspaceTypingState({
    stepCount: bringDownSampleSteps.length,
    revealedStepCount: 3,
  });

  const transition = tryAutoAdvanceBringDownStep({
    steps: bringDownSampleSteps,
    state,
    validateStep: validateLongDivisionStepAnswer,
  });

  assert.notEqual(transition, null);
  assert.equal(transition?.didAdvance, true);
  assert.equal(transition?.lockedStepId, bringDownSampleSteps[3].id);
  assert.equal(transition?.validation?.outcome, "correct");
  assert.equal(transition?.state.revealedStepCount, 4);
});

test("tryAutoAdvanceBringDownStep returns null when the active step is not bring-down", async () => {
  const [{ createLiveWorkspaceTypingState, tryAutoAdvanceBringDownStep }, { validateLongDivisionStepAnswer }] =
    await Promise.all([controllerModule, stepValidationModule]);

  const state = createLiveWorkspaceTypingState({
    stepCount: bringDownSampleSteps.length,
    revealedStepCount: 1,
  });

  const transition = tryAutoAdvanceBringDownStep({
    steps: bringDownSampleSteps,
    state,
    validateStep: validateLongDivisionStepAnswer,
  });

  assert.equal(transition, null);
});
