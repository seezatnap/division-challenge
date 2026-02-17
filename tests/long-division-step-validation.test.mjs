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

const longDivisionSolverModule = loadTypeScriptModule(
  "src/features/division-engine/lib/long-division-solver.ts",
);
const stepValidationModule = loadTypeScriptModule(
  "src/features/division-engine/lib/step-validation.ts",
);

function createProblem(overrides = {}) {
  return {
    id: "division-validation-problem",
    dividend: 144,
    divisor: 12,
    allowRemainder: false,
    difficultyLevel: 3,
    ...overrides,
  };
}

test("correct answers advance immediately and return encouragement hint hooks", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;
  const { validateLongDivisionStepAnswer } = await stepValidationModule;

  const solution = solveLongDivision(createProblem());
  const result = validateLongDivisionStepAnswer({
    steps: solution.steps,
    currentStepIndex: 0,
    submittedValue: "1",
  });

  assert.equal(result.outcome, "correct");
  assert.equal(result.didAdvance, true);
  assert.equal(result.isProblemComplete, false);
  assert.equal(result.focusStepIndex, 1);
  assert.equal(result.focusStepId, solution.steps[1].id);
  assert.equal(result.hintHook.id, "dino-feedback:correct:quotient-digit");
  assert.equal(result.hintHook.tone, "encouragement");
  assert.equal(result.hintHook.messageKey, "dino.feedback.correct.quotient-digit");
});

test("incorrect answers keep focus on the same step and return retry hint hooks", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;
  const { validateLongDivisionStepAnswer } = await stepValidationModule;

  const solution = solveLongDivision(createProblem());
  const result = validateLongDivisionStepAnswer({
    steps: solution.steps,
    currentStepIndex: 1,
    submittedValue: "13",
  });

  assert.equal(result.outcome, "incorrect");
  assert.equal(result.didAdvance, false);
  assert.equal(result.focusStepIndex, 1);
  assert.equal(result.focusStepId, solution.steps[1].id);
  assert.equal(result.hintHook.id, "dino-feedback:retry:multiply-result");
  assert.equal(result.hintHook.tone, "retry");
  assert.equal(result.hintHook.messageKey, "dino.feedback.retry.multiply-result");
});

test("validator normalizes numeric input while checking correctness", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;
  const { validateLongDivisionStepAnswer } = await stepValidationModule;

  const solution = solveLongDivision(createProblem());
  const result = validateLongDivisionStepAnswer({
    steps: solution.steps,
    currentStepIndex: 1,
    submittedValue: " 0012 ",
  });

  assert.equal(result.outcome, "correct");
  assert.equal(result.normalizedSubmittedValue, "12");
  assert.equal(result.focusStepIndex, 2);
});

test("final correct answer marks the problem complete and returns a completion hint hook", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;
  const { validateLongDivisionStepAnswer } = await stepValidationModule;

  const solution = solveLongDivision(createProblem());
  const finalStepIndex = solution.steps.length - 1;
  const result = validateLongDivisionStepAnswer({
    steps: solution.steps,
    currentStepIndex: finalStepIndex,
    submittedValue: "000",
  });

  assert.equal(result.outcome, "complete");
  assert.equal(result.didAdvance, true);
  assert.equal(result.isProblemComplete, true);
  assert.equal(result.focusStepIndex, null);
  assert.equal(result.focusStepId, null);
  assert.equal(result.hintHook.id, "dino-feedback:complete:problem");
  assert.equal(result.hintHook.tone, "celebration");
  assert.equal(result.hintHook.messageKey, "dino.feedback.complete.problem");
});

test("validator guards invalid request data and malformed step metadata", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;
  const { validateLongDivisionStepAnswer } = await stepValidationModule;

  const solution = solveLongDivision(createProblem());

  assert.throws(
    () =>
      validateLongDivisionStepAnswer({
        steps: [],
        currentStepIndex: 0,
        submittedValue: "1",
      }),
    /steps must include at least one long-division step/,
  );

  assert.throws(
    () =>
      validateLongDivisionStepAnswer({
        steps: solution.steps,
        currentStepIndex: 999,
        submittedValue: "1",
      }),
    /currentStepIndex must reference an existing step/,
  );

  assert.throws(
    () =>
      validateLongDivisionStepAnswer({
        steps: solution.steps,
        currentStepIndex: 0,
        submittedValue: 1,
      }),
    /submittedValue must be a string/,
  );

  const malformedSteps = solution.steps.map((step, index) =>
    index === 0 ? { ...step, expectedValue: "not-a-number" } : step,
  );

  assert.throws(
    () =>
      validateLongDivisionStepAnswer({
        steps: malformedSteps,
        currentStepIndex: 0,
        submittedValue: "1",
      }),
    /steps\[0\]\.expectedValue must be a non-empty integer string/,
  );
});
