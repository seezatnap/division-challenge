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
    problemId: "workspace-ui-integration-problem",
    kind,
    sequenceIndex,
    expectedValue,
    inputTargetId: `target-${sequenceIndex}`,
    ...overrides,
  };
}

function countActiveEntries(model) {
  return [...model.quotientCells, ...model.workRows].filter((entry) => entry.isActive).length;
}

function findModelEntry(model, stepId) {
  return [...model.quotientCells, ...model.workRows].find((entry) => entry.stepId === stepId) ?? null;
}

const liveTypingControllerModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/live-typing-controller.ts",
);
const busStopRenderModelModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/bus-stop-render-model.ts",
);
const stepValidationModule = loadTypeScriptModule(
  "src/features/division-engine/lib/step-validation.ts",
);
const bringDownAnimationModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/bring-down-animation.ts",
);
const feedbackMessagingModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/dino-feedback-messaging.ts",
);

const progressiveSteps = [
  createStep("quotient-digit", 0, "3"),
  createStep("multiply-result", 1, "36"),
  createStep("subtraction-result", 2, "7"),
  createStep("bring-down", 3, "72"),
  createStep("quotient-digit", 4, "6"),
  createStep("multiply-result", 5, "72"),
  createStep("subtraction-result", 6, "0"),
];

test("integration: in-place typing keeps draft values inline and locks in on correct entry", async () => {
  const [
    {
      applyLiveWorkspaceEntryInput,
      createLiveWorkspaceTypingState,
      resolveInlineWorkspaceEntryValue,
    },
    { buildBusStopRenderModel },
    { validateLongDivisionStepAnswer },
  ] = await Promise.all([
    liveTypingControllerModule,
    busStopRenderModelModule,
    stepValidationModule,
  ]);

  const initialState = createLiveWorkspaceTypingState({
    stepCount: progressiveSteps.length,
    revealedStepCount: 0,
  });
  const firstStep = progressiveSteps[0];

  const incorrectTransition = applyLiveWorkspaceEntryInput({
    steps: progressiveSteps,
    state: initialState,
    stepId: firstStep.id,
    rawValue: "x9",
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.equal(incorrectTransition.didAdvance, false);
  assert.equal(incorrectTransition.sanitizedValue, "9");
  assert.equal(incorrectTransition.state.revealedStepCount, 0);

  const incorrectModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: progressiveSteps,
    revealedStepCount: incorrectTransition.state.revealedStepCount,
  });
  const pendingFirstCell = incorrectModel.quotientCells[0];
  assert.equal(pendingFirstCell.isActive, true);
  assert.equal(
    resolveInlineWorkspaceEntryValue({
      stepId: pendingFirstCell.stepId,
      lockedValue: pendingFirstCell.value,
      isFilled: pendingFirstCell.isFilled,
      draftEntryValues: incorrectTransition.state.draftEntryValues,
    }),
    "9",
  );

  const correctedTransition = applyLiveWorkspaceEntryInput({
    steps: progressiveSteps,
    state: incorrectTransition.state,
    stepId: firstStep.id,
    rawValue: "03",
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.equal(correctedTransition.didAdvance, true);
  assert.equal(correctedTransition.lockedStepId, firstStep.id);
  assert.equal(correctedTransition.validation?.outcome, "correct");
  assert.equal(correctedTransition.state.revealedStepCount, 1);
  assert.equal(correctedTransition.state.draftEntryValues[firstStep.id], undefined);

  const correctedModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: progressiveSteps,
    revealedStepCount: correctedTransition.state.revealedStepCount,
  });
  const lockedFirstCell = correctedModel.quotientCells[0];
  assert.equal(lockedFirstCell.isFilled, true);
  assert.equal(lockedFirstCell.value, "3");
  assert.equal(correctedModel.activeStepId, progressiveSteps[1].id);
  assert.equal(countActiveEntries(correctedModel), 1);
});

test("integration: single-glow enforcement is preserved across the full live progression", async () => {
  const [
    { applyLiveWorkspaceEntryInput, createLiveWorkspaceTypingState, tryAutoAdvanceBringDownStep },
    { buildBusStopRenderModel },
    { validateLongDivisionStepAnswer },
  ] = await Promise.all([
    liveTypingControllerModule,
    busStopRenderModelModule,
    stepValidationModule,
  ]);

  let state = createLiveWorkspaceTypingState({
    stepCount: progressiveSteps.length,
    revealedStepCount: 0,
  });

  for (let iteration = 0; iteration < progressiveSteps.length + 1; iteration += 1) {
    const model = buildBusStopRenderModel({
      divisor: 12,
      dividend: 432,
      steps: progressiveSteps,
      revealedStepCount: state.revealedStepCount,
    });
    const isProblemComplete = state.revealedStepCount >= progressiveSteps.length;
    assert.equal(countActiveEntries(model), isProblemComplete ? 0 : 1);

    if (isProblemComplete) {
      break;
    }

    const activeStep = progressiveSteps[state.revealedStepCount];
    if (activeStep.kind === "bring-down") {
      const transition = tryAutoAdvanceBringDownStep({
        steps: progressiveSteps,
        state,
        validateStep: validateLongDivisionStepAnswer,
      });
      assert.notEqual(transition, null);
      state = transition.state;
      continue;
    }

    const transition = applyLiveWorkspaceEntryInput({
      steps: progressiveSteps,
      state,
      stepId: activeStep.id,
      rawValue: activeStep.expectedValue,
      validateStep: validateLongDivisionStepAnswer,
    });
    assert.equal(transition.didAdvance, true);
    state = transition.state;
  }

  assert.equal(state.revealedStepCount, progressiveSteps.length);
});

test("integration: incorrect and correct typing transitions map to retry, encouragement, and completion states", async () => {
  const [
    { applyLiveWorkspaceEntryInput, createLiveWorkspaceTypingState },
    { buildBusStopRenderModel },
    { validateLongDivisionStepAnswer },
    { resolveDinoFeedbackMessage },
  ] = await Promise.all([
    liveTypingControllerModule,
    busStopRenderModelModule,
    stepValidationModule,
    feedbackMessagingModule,
  ]);
  const steps = [
    createStep("quotient-digit", 0, "3"),
    createStep("multiply-result", 1, "36"),
    createStep("subtraction-result", 2, "0"),
  ];

  let state = createLiveWorkspaceTypingState({
    stepCount: steps.length,
    revealedStepCount: 0,
  });

  const incorrect = applyLiveWorkspaceEntryInput({
    steps,
    state,
    stepId: steps[0].id,
    rawValue: "8",
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.equal(incorrect.didAdvance, false);
  assert.equal(incorrect.validation?.outcome, "incorrect");
  const retryMessage = resolveDinoFeedbackMessage(incorrect.validation);
  assert.equal(retryMessage.tone, "retry");
  assert.equal(retryMessage.messageKey, "dino.feedback.retry.quotient-digit");
  const retryModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 36,
    steps,
    revealedStepCount: incorrect.state.revealedStepCount,
  });
  assert.equal(retryModel.activeStepId, steps[0].id);
  assert.equal(countActiveEntries(retryModel), 1);
  state = incorrect.state;

  const correctFirst = applyLiveWorkspaceEntryInput({
    steps,
    state,
    stepId: steps[0].id,
    rawValue: "3",
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.equal(correctFirst.didAdvance, true);
  assert.equal(correctFirst.validation?.outcome, "correct");
  const encouragementMessage = resolveDinoFeedbackMessage(correctFirst.validation);
  assert.equal(encouragementMessage.tone, "encouragement");
  assert.equal(encouragementMessage.messageKey, "dino.feedback.correct.quotient-digit");
  state = correctFirst.state;

  const correctSecond = applyLiveWorkspaceEntryInput({
    steps,
    state,
    stepId: steps[1].id,
    rawValue: "36",
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.equal(correctSecond.didAdvance, true);
  assert.equal(correctSecond.validation?.outcome, "correct");
  state = correctSecond.state;

  const complete = applyLiveWorkspaceEntryInput({
    steps,
    state,
    stepId: steps[2].id,
    rawValue: "0",
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.equal(complete.didAdvance, true);
  assert.equal(complete.validation?.outcome, "complete");
  const completionMessage = resolveDinoFeedbackMessage(complete.validation);
  assert.equal(completionMessage.tone, "celebration");
  assert.equal(completionMessage.messageKey, "dino.feedback.complete.problem");
  const completeModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 36,
    steps,
    revealedStepCount: complete.state.revealedStepCount,
  });
  assert.equal(completeModel.activeStepId, null);
  assert.equal(countActiveEntries(completeModel), 0);
});

test("integration: bring-down progression advances from active pending row to locked row and next quotient focus", async () => {
  const [
    { applyLiveWorkspaceEntryInput, createLiveWorkspaceTypingState, tryAutoAdvanceBringDownStep },
    { buildBusStopRenderModel },
    { validateLongDivisionStepAnswer },
    { buildBringDownAnimationSourceByStepId },
    { resolveDinoFeedbackMessage },
  ] = await Promise.all([
    liveTypingControllerModule,
    busStopRenderModelModule,
    stepValidationModule,
    bringDownAnimationModule,
    feedbackMessagingModule,
  ]);

  const bringDownStep = progressiveSteps[3];
  let state = createLiveWorkspaceTypingState({
    stepCount: progressiveSteps.length,
    revealedStepCount: 0,
  });

  for (const step of progressiveSteps.slice(0, 3)) {
    const transition = applyLiveWorkspaceEntryInput({
      steps: progressiveSteps,
      state,
      stepId: step.id,
      rawValue: step.expectedValue,
      validateStep: validateLongDivisionStepAnswer,
    });
    assert.equal(transition.didAdvance, true);
    state = transition.state;
  }

  const bringDownSourceByStepId = buildBringDownAnimationSourceByStepId({
    divisor: 12,
    dividend: 432,
    steps: progressiveSteps,
  });
  assert.deepEqual(bringDownSourceByStepId[bringDownStep.id], {
    stepId: bringDownStep.id,
    sourceDividendDigitIndex: 2,
    digit: "2",
  });

  const pendingBringDownModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: progressiveSteps,
    revealedStepCount: state.revealedStepCount,
  });
  assert.equal(pendingBringDownModel.activeStepId, bringDownStep.id);
  assert.equal(countActiveEntries(pendingBringDownModel), 1);
  const pendingBringDownEntry = findModelEntry(pendingBringDownModel, bringDownStep.id);
  assert.ok(pendingBringDownEntry);
  assert.equal(pendingBringDownEntry.isFilled, false);
  assert.equal(pendingBringDownEntry.isActive, true);

  const bringDownTransition = tryAutoAdvanceBringDownStep({
    steps: progressiveSteps,
    state,
    validateStep: validateLongDivisionStepAnswer,
  });
  assert.notEqual(bringDownTransition, null);
  assert.equal(bringDownTransition.lockedStepId, bringDownStep.id);
  assert.equal(bringDownTransition.validation?.outcome, "correct");
  const bringDownFeedback = resolveDinoFeedbackMessage(bringDownTransition.validation);
  assert.equal(bringDownFeedback.messageKey, "dino.feedback.correct.bring-down");

  const postBringDownModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: progressiveSteps,
    revealedStepCount: bringDownTransition.state.revealedStepCount,
  });
  assert.equal(postBringDownModel.activeStepId, progressiveSteps[4].id);
  assert.equal(countActiveEntries(postBringDownModel), 1);
  const lockedBringDownEntry = findModelEntry(postBringDownModel, bringDownStep.id);
  assert.ok(lockedBringDownEntry);
  assert.equal(lockedBringDownEntry.isFilled, true);
  assert.equal(lockedBringDownEntry.isActive, false);
});
