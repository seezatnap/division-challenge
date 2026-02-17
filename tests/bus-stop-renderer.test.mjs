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

function countActiveEntries(model) {
  return [...model.quotientCells, ...model.workRows].filter((entry) => entry.isActive).length;
}

const sampleSteps = [
  createStep("quotient-digit", 0, "3"),
  createStep("multiply-result", 1, "36"),
  createStep("subtraction-result", 2, "7"),
  createStep("bring-down", 3, "72"),
  createStep("quotient-digit", 4, "6"),
  createStep("multiply-result", 5, "72"),
  createStep("subtraction-result", 6, "0"),
];

const busStopRenderModelModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/bus-stop-render-model.ts",
);

test("buildBusStopRenderModel reveals quotient cells and work rows by visible step count", async () => {
  const { buildBusStopRenderModel } = await busStopRenderModelModule;

  const partialModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: sampleSteps,
    revealedStepCount: 4,
  });

  assert.equal(partialModel.divisorText, "12");
  assert.equal(partialModel.dividendText, "432");
  assert.deepEqual(
    partialModel.quotientCells.map((cell) => cell.value),
    ["3", ""],
  );
  assert.deepEqual(
    partialModel.workRows.map((row) => `${row.kind}:${row.value}`),
    ["multiply-result:36", "subtraction-result:7", "bring-down:72"],
  );
  assert.equal(partialModel.activeStepId, sampleSteps[4].id);
  assert.equal(partialModel.activeTargetId, "target-4");
  assert.equal(countActiveEntries(partialModel), 1);
  assert.equal(partialModel.quotientCells[1].isActive, true);
});

test("buildBusStopRenderModel keeps the active work-row target visible as an inline pending cell", async () => {
  const { buildBusStopRenderModel } = await busStopRenderModelModule;

  const model = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: sampleSteps,
    revealedStepCount: 2,
  });

  assert.equal(model.activeTargetId, "target-2");
  assert.deepEqual(
    model.workRows.map((row) => `${row.kind}:${row.value}:${row.isFilled ? "filled" : "pending"}`),
    ["multiply-result:36:filled", "subtraction-result::pending"],
  );
  assert.equal(countActiveEntries(model), 1);
  assert.equal(model.workRows[1].isActive, true);
});

test("buildBusStopRenderModel clamps revealed step count and marks multiply rows with minus prefix", async () => {
  const { buildBusStopRenderModel } = await busStopRenderModelModule;

  const fullModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: sampleSteps,
    revealedStepCount: 999,
  });

  assert.deepEqual(
    fullModel.quotientCells.map((cell) => cell.value),
    ["3", "6"],
  );
  assert.deepEqual(
    fullModel.workRows.map((row) => row.displayPrefix),
    ["-", "", "", "-", ""],
  );
  assert.equal(fullModel.activeStepId, null);
  assert.equal(fullModel.activeTargetId, null);
  assert.equal(countActiveEntries(fullModel), 0);

  const hiddenModel = buildBusStopRenderModel({
    divisor: 12,
    dividend: 432,
    steps: sampleSteps,
    revealedStepCount: Number.NEGATIVE_INFINITY,
  });

  assert.deepEqual(
    hiddenModel.quotientCells.map((cell) => cell.value),
    ["", ""],
  );
  assert.equal(hiddenModel.workRows.length, 0);
  assert.equal(hiddenModel.activeStepId, "step-0-quotient-digit");
  assert.equal(hiddenModel.activeTargetId, "target-0");
  assert.equal(countActiveEntries(hiddenModel), 1);
});

test("buildBusStopRenderModel enforces a single active glow cell even when target ids collide", async () => {
  const { buildBusStopRenderModel } = await busStopRenderModelModule;
  const collisionSteps = [
    createStep("quotient-digit", 0, "3", {
      id: "collision-step-0",
      inputTargetId: "shared-target",
    }),
    createStep("multiply-result", 1, "36", {
      id: "collision-step-1",
      inputTargetId: "shared-target",
    }),
    createStep("subtraction-result", 2, "0", {
      id: "collision-step-2",
      inputTargetId: "shared-target",
    }),
  ];

  const model = buildBusStopRenderModel({
    divisor: 12,
    dividend: 36,
    steps: collisionSteps,
    revealedStepCount: 1,
  });

  assert.equal(model.activeStepId, "collision-step-1");
  assert.equal(model.activeTargetId, "shared-target");
  assert.equal(countActiveEntries(model), 1);
  assert.equal(model.quotientCells[0].isActive, false);
  assert.equal(model.workRows[0].isActive, true);
});

test("bus-stop renderer component uses inline workspace entries and avoids standalone form controls", async () => {
  const source = await readRepoFile("src/features/workspace-ui/components/bus-stop-long-division-renderer.tsx");

  for (const fragment of [
    'data-ui-component="bus-stop-renderer"',
    'className="quotient-track"',
    'className="divisor-cell"',
    'className="bracket-stack"',
    'className="work-rows"',
    "WorkspaceInlineEntry",
    'data-entry-inline="true"',
    'data-entry-auto={isAutoEntry ? "true" : "false"}',
    'data-entry-animation={isLockingIn ? "lock-in" : "none"}',
    'data-workspace-live-typing={liveTypingEnabled ? "enabled" : "disabled"}',
    'data-bring-down-animation={bringDownAnimationStepId ? "running" : "idle"}',
    'data-entry-glow={isActive ? "amber" : "none"}',
    "applyLiveWorkspaceEntryInput",
    "buildBringDownAnimationSourceByStepId",
    "tryAutoAdvanceBringDownStep",
    "validateLongDivisionStepAnswer",
    "dividend-digit-bring-down-origin",
    "bring-down-digit-slide",
    "inline-entry-lock-in",
    "glow-amber",
    "contentEditable={isEditable}",
    "suppressContentEditableWarning={isEditable}",
  ]) {
    assert.ok(source.includes(fragment), `Expected renderer fragment: ${fragment}`);
  }

  for (const disallowedFragment of ["<form", "<input", "<select", "<textarea", "<option", "dropdown"]) {
    assert.equal(
      source.includes(disallowedFragment),
      false,
      `Renderer should avoid form control markup: ${disallowedFragment}`,
    );
  }
});

test("home page renders the workspace through the reusable bus-stop renderer", async () => {
  const homePageSource = await readRepoFile("src/app/page.tsx");
  const workspacePanelSource = await readRepoFile(
    "src/features/workspace-ui/components/live-division-workspace-panel.tsx",
  );

  for (const fragment of [
    "LiveDivisionWorkspacePanel",
    "workspacePreviewSolution",
    "solveLongDivision(workspacePreviewProblem)",
  ]) {
    assert.ok(homePageSource.includes(fragment), `Expected home-page workspace fragment: ${fragment}`);
  }

  for (const fragment of ["BusStopLongDivisionRenderer", "enableLiveTyping", "onStepValidation"]) {
    assert.ok(workspacePanelSource.includes(fragment), `Expected workspace-panel fragment: ${fragment}`);
  }
});

test("home page wires dino feedback messaging to validation outcomes", async () => {
  const source = await readRepoFile("src/features/workspace-ui/components/live-division-workspace-panel.tsx");

  for (const fragment of [
    "DEFAULT_DINO_FEEDBACK_MESSAGE",
    "resolveDinoFeedbackMessage",
    "handleWorkspaceStepValidation",
    "onStepValidation={handleWorkspaceStepValidation}",
    'data-feedback-tone={activeCoachMessage.tone}',
    'data-feedback-outcome={activeCoachMessage.outcome}',
    "data-feedback-key={message.messageKey}",
    "{message.text}",
    "{activeCoachMessage.note}",
  ]) {
    assert.ok(source.includes(fragment), `Expected feedback wiring fragment: ${fragment}`);
  }
});
