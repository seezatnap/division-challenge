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
const renderModelModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/multiplication-render-model.ts",
);

async function buildSolvedModel(overrides = {}, revealedStepCount = 0) {
  const { solveLongMultiplication } = await solverModule;
  const { buildMultiplicationRenderModel } = await renderModelModule;
  const problem = {
    id: "multiplication-render-test",
    multiplicand: 234,
    multiplier: 56,
    difficultyLevel: 5,
    ...overrides,
  };
  const solution = solveLongMultiplication(problem);

  return buildMultiplicationRenderModel({
    multiplicand: problem.multiplicand,
    multiplier: problem.multiplier,
    steps: solution.steps,
    revealedStepCount,
  });
}

test("render model sizes the grid to the product width", async () => {
  const model = await buildSolvedModel();

  assert.equal(model.multiplicandText, "234");
  assert.equal(model.multiplierText, "56");
  assert.equal(model.productText, "13104");
  assert.equal(model.columnCount, 5);
  assert.equal(model.hasSumRow, true);
});

test("render model reveals only filled and active rows", async () => {
  const initialModel = await buildSolvedModel({}, 0);
  assert.equal(initialModel.workRows.length, 1);
  assert.equal(initialModel.workRows[0].isActive, true);
  assert.equal(initialModel.workRows[0].isFilled, false);
  assert.equal(initialModel.workRows[0].multiplierDigitText, "6");

  const midModel = await buildSolvedModel({}, 1);
  assert.equal(midModel.workRows.length, 2);
  assert.equal(midModel.workRows[0].isFilled, true);
  assert.equal(midModel.workRows[0].value, "1404");
  assert.equal(midModel.workRows[1].isActive, true);
  assert.equal(midModel.workRows[1].multiplierDigitText, "5");

  const sumModel = await buildSolvedModel({}, 2);
  assert.equal(sumModel.workRows.length, 3);
  assert.equal(sumModel.workRows[2].kind, "product-sum");
  assert.equal(sumModel.workRows[2].isActive, true);
});

test("render model right-aligns rows with place-value shifts", async () => {
  const model = await buildSolvedModel({}, 2);
  const [firstPartialRow, secondPartialRow, sumRow] = model.workRows;

  assert.equal(firstPartialRow.shiftZeroCount, 0);
  assert.equal(firstPartialRow.startColumn, 2);
  assert.equal(firstPartialRow.displayPrefix, "");

  assert.equal(secondPartialRow.shiftZeroCount, 1);
  assert.equal(secondPartialRow.startColumn, 1);
  assert.equal(secondPartialRow.displayPrefix, "+");

  assert.equal(sumRow.shiftZeroCount, 0);
  assert.equal(sumRow.startColumn, 1);
  assert.equal(sumRow.expectedDigitCount, 5);
});

test("render model omits the sum row for single-digit multipliers", async () => {
  const model = await buildSolvedModel(
    { multiplicand: 48, multiplier: 7 },
    0,
  );

  assert.equal(model.hasSumRow, false);
  assert.equal(model.columnCount, 3);
  assert.equal(model.workRows.length, 1);
  assert.equal(model.workRows[0].kind, "partial-product");
  assert.equal(model.workRows[0].displayPrefix, "");
});

test("active step focus exposes carry digits for the working partial product", async () => {
  // 234 × 6: 6×4=24 carries 2 into the tens column; 6×3+2=20 carries 2 into hundreds.
  const firstRowModel = await buildSolvedModel({}, 0);
  assert.deepEqual(firstRowModel.activeStepFocus.carryDigits, [0, 2, 2]);

  // 234 × 5: 5×4=20 carries 2; 5×3+2=17 carries 1.
  const secondRowModel = await buildSolvedModel({}, 1);
  assert.deepEqual(secondRowModel.activeStepFocus.carryDigits, [0, 2, 1]);

  // Product-sum: 1404 + 11700 column-wise — column 2 sums 4+7=11, carrying 1 into column 3.
  const sumRowModel = await buildSolvedModel({}, 2);
  assert.deepEqual(sumRowModel.activeStepFocus.carryDigits, [0, 0, 0, 1, 0]);

  const completeModel = await buildSolvedModel({}, 3);
  assert.deepEqual(completeModel.activeStepFocus.carryDigits, []);
});

test("active step focus tracks the working multiplier digit", async () => {
  const partialFocusModel = await buildSolvedModel({}, 1);
  assert.equal(partialFocusModel.activeStepFocus.stepKind, "partial-product");
  assert.equal(partialFocusModel.activeStepFocus.multiplierDigitText, "5");
  assert.equal(partialFocusModel.activeStepFocus.shiftZeroCount, 1);

  const completeFocusModel = await buildSolvedModel({}, 3);
  assert.equal(completeFocusModel.activeStepFocus.stepKind, "none");
  assert.equal(completeFocusModel.activeStepId, null);
});
