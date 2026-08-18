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

test("solver appends a decimal-point step whose answer is the combined decimal places", async () => {
  const { solveLongMultiplication } = await solverModule;

  // 8.84 x 8.6 = 76.024
  const solution = solveLongMultiplication(
    createProblem({
      multiplicand: 884,
      multiplier: 86,
      multiplicandDecimalPlaces: 2,
      multiplierDecimalPlaces: 1,
    }),
  );

  assert.equal(solution.product, 76024);
  assert.equal(solution.multiplicandDecimalPlaces, 2);
  assert.equal(solution.multiplierDecimalPlaces, 1);
  assert.equal(solution.productDecimalPlaces, 3);
  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    ["partial-product", "partial-product", "product-sum", "decimal-point"],
  );
  assert.deepEqual(
    solution.steps.map((step) => step.expectedValue),
    ["5304", "7072", "76024", "3"],
  );
  assert.equal(solution.steps[3].sequenceIndex, 3);
  assert.equal(solution.steps[3].id, "multiplication-test-problem:step:3:decimal-point");
});

test("solver places the decimal-point step right after a lone partial product", async () => {
  const { solveLongMultiplication } = await solverModule;

  // 4.8 x .7 = 3.36
  const solution = solveLongMultiplication(
    createProblem({
      multiplicand: 48,
      multiplier: 7,
      multiplicandDecimalPlaces: 1,
      multiplierDecimalPlaces: 1,
    }),
  );

  assert.deepEqual(
    solution.steps.map((step) => step.kind),
    ["partial-product", "decimal-point"],
  );
  assert.equal(solution.steps[1].expectedValue, "2");
});

test("solver reports zero decimal places and no decimal step for whole numbers", async () => {
  const { solveLongMultiplication, getMultiplicationDecimalPlaces } = await solverModule;

  const solution = solveLongMultiplication(createProblem());
  assert.equal(solution.productDecimalPlaces, 0);
  assert.ok(!solution.steps.some((step) => step.kind === "decimal-point"));

  assert.deepEqual(getMultiplicationDecimalPlaces({}), {
    multiplicandDecimalPlaces: 0,
    multiplierDecimalPlaces: 0,
    productDecimalPlaces: 0,
  });
});

test("solver rejects decimal problems that would need padding zeros", async () => {
  const { solveLongMultiplication } = await solverModule;

  // .1 x .1 = .01 needs a zero that is not in the product digits "1".
  assert.throws(
    () =>
      solveLongMultiplication(
        createProblem({
          multiplicand: 1,
          multiplier: 1,
          multiplicandDecimalPlaces: 1,
          multiplierDecimalPlaces: 1,
        }),
      ),
    RangeError,
  );

  // .2 x .5 = .10 is fine: the point sits right before the leading 1.
  const edgeSolution = solveLongMultiplication(
    createProblem({
      multiplicand: 2,
      multiplier: 5,
      multiplicandDecimalPlaces: 1,
      multiplierDecimalPlaces: 1,
    }),
  );
  assert.equal(edgeSolution.steps.at(-1).expectedValue, "2");

  assert.throws(
    () =>
      solveLongMultiplication(
        createProblem({ multiplicand: 48, multiplier: 7, multiplicandDecimalPlaces: 3 }),
      ),
    RangeError,
  );
  assert.throws(
    () => solveLongMultiplication(createProblem({ multiplierDecimalPlaces: -1 })),
    RangeError,
  );
});

test("formatDigitsWithDecimalPoint inserts the point, adding a leading zero only when the point comes first", async () => {
  const { formatDigitsWithDecimalPoint } = await solverModule;

  assert.equal(formatDigitsWithDecimalPoint("884", 0), "884");
  assert.equal(formatDigitsWithDecimalPoint("884", 2), "8.84");
  assert.equal(formatDigitsWithDecimalPoint("884", 3), "0.884");
  assert.equal(formatDigitsWithDecimalPoint("7", 1), "0.7");
  assert.equal(formatDigitsWithDecimalPoint("76024", 3), "76.024");
  assert.throws(() => formatDigitsWithDecimalPoint("884", 4), RangeError);
  assert.throws(() => formatDigitsWithDecimalPoint("8.84", 1), Error);
});
