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

const solverModule = loadTypeScriptModule(
  "src/features/multiplication-engine/lib/long-multiplication-solver.ts",
);

function createProblem(overrides = {}) {
  return {
    id: "multiplication-test-problem",
    multiplicand: 234,
    multiplier: 56,
    difficultyLevel: 5,
    ...overrides,
  };
}

test("solver emits one partial product per multiplier digit plus a product sum", async () => {
  const { solveLongMultiplication } = await solverModule;

  const solution = solveLongMultiplication(createProblem());

  assert.equal(solution.problemId, "multiplication-test-problem");
  assert.equal(solution.product, 13104);

  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    ["partial-product", "partial-product", "product-sum"],
  );

  assert.deepEqual(
    solution.steps.map((step) => step.expectedValue),
    ["1404", "1170", "13104"],
  );

  assert.deepEqual(
    solution.partialProducts.map((partial) => partial.multiplierDigit),
    [6, 5],
  );
  assert.deepEqual(
    solution.partialProducts.map((partial) => partial.position),
    [0, 1],
  );
});

test("solver skips the product-sum step for single-digit multipliers", async () => {
  const { solveLongMultiplication } = await solverModule;

  const solution = solveLongMultiplication(
    createProblem({ id: "single-digit", multiplicand: 48, multiplier: 7 }),
  );

  assert.equal(solution.product, 336);
  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    ["partial-product"],
  );
  assert.deepEqual(
    solution.steps.map((step) => step.expectedValue),
    ["336"],
  );
});

test("solver step ids follow the problem step id scheme with sequence indexes", async () => {
  const { solveLongMultiplication } = await solverModule;

  const solution = solveLongMultiplication(createProblem());

  solution.steps.forEach((step, stepIndex) => {
    assert.equal(step.sequenceIndex, stepIndex);
    assert.equal(step.id, `multiplication-test-problem:step:${stepIndex}:${step.kind}`);
    assert.equal(step.inputTargetId, `${step.id}:target`);
    assert.equal(step.problemId, "multiplication-test-problem");
  });
});

test("getShiftedPartialProductText applies the place-value shift", async () => {
  const { solveLongMultiplication, getShiftedPartialProductText } = await solverModule;

  const solution = solveLongMultiplication(createProblem());

  assert.equal(getShiftedPartialProductText(solution.partialProducts[0]), "1404");
  assert.equal(getShiftedPartialProductText(solution.partialProducts[1]), "11700");
});

test("solver rejects non-positive factors", async () => {
  const { solveLongMultiplication } = await solverModule;

  assert.throws(() => solveLongMultiplication(createProblem({ multiplicand: 0 })), RangeError);
  assert.throws(() => solveLongMultiplication(createProblem({ multiplier: -3 })), RangeError);
});
