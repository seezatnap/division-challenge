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

function createProblem(overrides = {}) {
  return {
    id: "division-test-problem",
    dividend: 144,
    divisor: 12,
    allowRemainder: false,
    difficultyLevel: 3,
    ...overrides,
  };
}

test("solver emits strict long-division step order with expected values for exact division", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;

  const solution = solveLongDivision(createProblem());

  assert.equal(solution.problemId, "division-test-problem");
  assert.equal(solution.quotient, 12);
  assert.equal(solution.remainder, 0);

  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    [
      "quotient-digit",
      "multiply-result",
      "subtraction-result",
      "bring-down",
      "quotient-digit",
      "multiply-result",
      "subtraction-result",
    ],
  );

  assert.deepEqual(
    solution.steps.map((step) => step.expectedValue),
    ["1", "12", "2", "24", "2", "24", "0"],
  );

  assert.equal(solution.steps.at(-1)?.kind, "subtraction-result");
});

test("solver keeps zero quotient digits in the emitted workflow", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;

  const solution = solveLongDivision(
    createProblem({
      id: "division-test-zero-digit",
      dividend: 1005,
      divisor: 5,
      allowRemainder: false,
      difficultyLevel: 4,
    }),
  );

  assert.equal(solution.quotient, 201);
  assert.equal(solution.remainder, 0);

  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    [
      "quotient-digit",
      "multiply-result",
      "subtraction-result",
      "bring-down",
      "quotient-digit",
      "multiply-result",
      "subtraction-result",
      "bring-down",
      "quotient-digit",
      "multiply-result",
      "subtraction-result",
    ],
  );

  assert.deepEqual(
    solution.steps.map((step) => step.expectedValue),
    ["2", "10", "0", "0", "0", "0", "0", "5", "1", "5", "0"],
  );
});

test("solver delays the first quotient step until the working number reaches the divisor", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;

  const solution = solveLongDivision(
    createProblem({
      id: "division-test-leading-digits",
      dividend: 105,
      divisor: 25,
      allowRemainder: true,
      difficultyLevel: 2,
    }),
  );

  assert.equal(solution.quotient, 4);
  assert.equal(solution.remainder, 5);
  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    ["quotient-digit", "multiply-result", "subtraction-result"],
  );
  assert.deepEqual(
    solution.steps.map((step) => step.expectedValue),
    ["4", "100", "5"],
  );
});

test("solver emits deterministic sequence indexes and input target ids", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;

  const solution = solveLongDivision(
    createProblem({
      id: "division-test-remainder",
      dividend: 125,
      divisor: 6,
      allowRemainder: true,
      difficultyLevel: 2,
    }),
  );

  assert.equal(solution.quotient, 20);
  assert.equal(solution.remainder, 5);

  const expectedSequence = Array.from({ length: solution.steps.length }, (_, index) => index);
  assert.deepEqual(
    solution.steps.map((step) => step.sequenceIndex),
    expectedSequence,
  );

  for (const step of solution.steps) {
    assert.equal(step.problemId, "division-test-remainder");
    assert.equal(typeof step.id, "string");
    assert.equal(typeof step.inputTargetId, "string");
    assert.ok(step.id.length > 0);
    assert.ok(step.inputTargetId.length > 0);
  }
});

test("solver validates invalid problem inputs", async () => {
  const { solveLongDivision } = await longDivisionSolverModule;

  assert.throws(
    () =>
      solveLongDivision(
        createProblem({
          id: "   ",
        }),
      ),
    /problem\.id must be a non-empty string/,
  );

  assert.throws(
    () =>
      solveLongDivision(
        createProblem({
          dividend: -1,
        }),
      ),
    /problem\.dividend must be a non-negative integer/,
  );

  assert.throws(
    () =>
      solveLongDivision(
        createProblem({
          divisor: 0,
        }),
      ),
    /problem\.divisor must be a positive integer/,
  );
});
