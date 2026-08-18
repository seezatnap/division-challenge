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

async function buildDecimalModel(revealedStepCount) {
  const { solveLongMultiplication } = await solverModule;
  const { buildMultiplicationRenderModel } = await renderModelModule;
  // 8.84 x 8.6 = 76.024
  const problem = {
    id: "multiplication-decimal-render-test",
    multiplicand: 884,
    multiplier: 86,
    multiplicandDecimalPlaces: 2,
    multiplierDecimalPlaces: 1,
    difficultyLevel: 5,
  };
  const solution = solveLongMultiplication(problem);

  return buildMultiplicationRenderModel({
    multiplicand: problem.multiplicand,
    multiplier: problem.multiplier,
    multiplicandDecimalPlaces: problem.multiplicandDecimalPlaces,
    multiplierDecimalPlaces: problem.multiplierDecimalPlaces,
    steps: solution.steps,
    revealedStepCount,
  });
}

test("whole-number render model has no decimal points and no decimal step", async () => {
  const model = await buildSolvedModel();

  assert.equal(model.multiplicandDisplayText, "234");
  assert.equal(model.multiplierDisplayText, "56");
  assert.equal(model.productDisplayText, "13104");
  assert.equal(model.productDecimalPlaces, 0);
  assert.equal(model.multiplicandDecimalPoint, null);
  assert.equal(model.multiplierDecimalPoint, null);
  assert.equal(model.decimalPoint, null);
  assert.equal(model.activeStepFocus.productDecimalPlaces, 0);
});

test("decimal render model positions the factor points on the digit to their right", async () => {
  const model = await buildDecimalModel(0);

  assert.equal(model.columnCount, 5);
  assert.equal(model.multiplicandDisplayText, "8.84");
  assert.equal(model.multiplierDisplayText, "8.6");
  assert.equal(model.productDisplayText, "76.024");
  // Multiplicand 884 sits in columns 3-5; the point precedes digit "8" at index 1.
  assert.deepEqual(model.multiplicandDecimalPoint, {
    digitIndex: 1,
    column: 4,
    leadingZeroColumn: null,
  });
  // Multiplier 86 sits in columns 4-5; the point precedes "6" at index 1.
  assert.deepEqual(model.multiplierDecimalPoint, {
    digitIndex: 1,
    column: 5,
    leadingZeroColumn: null,
  });
  assert.equal(model.activeStepFocus.multiplicandDisplayText, "8.84");
  assert.equal(model.activeStepFocus.productDecimalPlaces, 3);
});

test("decimal render model keeps the decimal step out of the work rows", async () => {
  const model = await buildDecimalModel(3);

  assert.deepEqual(
    model.workRows.map((row) => row.kind),
    ["partial-product", "partial-product", "product-sum"],
  );
  assert.ok(model.workRows.every((row) => row.isFilled));
  assert.equal(model.activeStepFocus.stepKind, "decimal-point");
  assert.deepEqual(model.activeStepFocus.carryDigits, []);
});

test("decimal render model offers a slot before the first digit and between each pair", async () => {
  const model = await buildDecimalModel(3);
  const decimalPoint = model.decimalPoint;

  assert.ok(decimalPoint);
  assert.equal(decimalPoint.rowStepId, "multiplication-decimal-render-test:step:2:product-sum");
  assert.equal(decimalPoint.stepId, "multiplication-decimal-render-test:step:3:decimal-point");
  assert.equal(decimalPoint.expectedDecimalPlaces, 3);
  assert.equal(decimalPoint.productDigitCount, 5);
  assert.equal(decimalPoint.isActive, true);
  assert.equal(decimalPoint.isFilled, false);
  assert.equal(decimalPoint.placedPosition, null);
  assert.deepEqual(
    decimalPoint.slots.map((slot) => [
      slot.decimalPlaces,
      slot.digitIndex,
      slot.column,
      slot.leadingZeroColumn,
    ]),
    [
      [5, 0, 1, 0],
      [4, 1, 2, null],
      [3, 2, 3, null],
      [2, 3, 4, null],
      [1, 4, 5, null],
    ],
  );
});

test("decimal render model stays pending before the sum and locks the point once placed", async () => {
  const pendingModel = await buildDecimalModel(1);
  assert.equal(pendingModel.decimalPoint.isActive, false);
  assert.equal(pendingModel.decimalPoint.isFilled, false);
  assert.equal(pendingModel.activeStepFocus.stepKind, "partial-product");

  const placedModel = await buildDecimalModel(4);
  assert.equal(placedModel.decimalPoint.isActive, false);
  assert.equal(placedModel.decimalPoint.isFilled, true);
  assert.deepEqual(placedModel.decimalPoint.placedPosition, {
    digitIndex: 2,
    column: 3,
    leadingZeroColumn: null,
  });
  assert.equal(placedModel.activeStepFocus.stepKind, "none");
});

test("decimal render model attaches the point to a lone partial product row", async () => {
  const { solveLongMultiplication } = await solverModule;
  const { buildMultiplicationRenderModel } = await renderModelModule;
  // 4.8 x .7 = 3.36
  const problem = {
    id: "single-row-decimal",
    multiplicand: 48,
    multiplier: 7,
    multiplicandDecimalPlaces: 1,
    multiplierDecimalPlaces: 1,
    difficultyLevel: 2,
  };
  const model = buildMultiplicationRenderModel({
    multiplicand: 48,
    multiplier: 7,
    multiplicandDecimalPlaces: 1,
    multiplierDecimalPlaces: 1,
    steps: solveLongMultiplication(problem).steps,
    revealedStepCount: 1,
  });

  assert.equal(model.hasSumRow, false);
  assert.equal(model.decimalPoint.rowStepId, "single-row-decimal:step:0:partial-product");
  assert.equal(model.decimalPoint.isActive, true);
  // A point before the first digit renders with a leading zero: 0.7.
  assert.equal(model.multiplierDisplayText, "0.7");
  assert.equal(model.columnCount, 3);
  assert.deepEqual(model.multiplierDecimalPoint, {
    digitIndex: 0,
    column: 3,
    leadingZeroColumn: 2,
  });
  assert.equal(model.productDisplayText, "3.36");
});

test("decimal render model reserves a leading-zero column when the product point comes first", async () => {
  const { solveLongMultiplication } = await solverModule;
  const { buildMultiplicationRenderModel } = await renderModelModule;
  // 0.452 x 0.78 = 0.35256: five decimal places into a five-digit product.
  const problem = {
    id: "leading-zero-product",
    multiplicand: 452,
    multiplier: 78,
    multiplicandDecimalPlaces: 3,
    multiplierDecimalPlaces: 2,
    difficultyLevel: 5,
  };
  const steps = solveLongMultiplication(problem).steps;
  const build = (revealedStepCount) =>
    buildMultiplicationRenderModel({
      multiplicand: 452,
      multiplier: 78,
      multiplicandDecimalPlaces: 3,
      multiplierDecimalPlaces: 2,
      steps,
      revealedStepCount,
    });

  const choosingModel = build(3);
  assert.equal(choosingModel.columnCount, 6);
  assert.equal(choosingModel.multiplicandDisplayText, "0.452");
  assert.equal(choosingModel.multiplierDisplayText, "0.78");
  assert.equal(choosingModel.productDisplayText, "0.35256");
  // Product digits occupy columns 2-6; the leading zero would take column 1.
  assert.equal(choosingModel.workRows.at(-1).startColumn, 2);
  assert.deepEqual(choosingModel.multiplicandDecimalPoint, {
    digitIndex: 0,
    column: 4,
    leadingZeroColumn: 3,
  });
  assert.deepEqual(choosingModel.multiplierDecimalPoint, {
    digitIndex: 0,
    column: 5,
    leadingZeroColumn: 4,
  });
  assert.equal(choosingModel.decimalPoint.placedPosition, null);
  assert.deepEqual(choosingModel.decimalPoint.slots[0], {
    decimalPlaces: 5,
    digitIndex: 0,
    column: 2,
    leadingZeroColumn: 1,
  });

  const placedModel = build(4);
  assert.deepEqual(placedModel.decimalPoint.placedPosition, {
    digitIndex: 0,
    column: 2,
    leadingZeroColumn: 1,
  });
});

test("decimal render model rejects decimal places that need padding zeros", async () => {
  const { buildMultiplicationRenderModel } = await renderModelModule;

  assert.throws(
    () =>
      buildMultiplicationRenderModel({
        multiplicand: 1,
        multiplier: 1,
        multiplicandDecimalPlaces: 1,
        multiplierDecimalPlaces: 1,
        steps: [],
      }),
    RangeError,
  );
  assert.throws(
    () =>
      buildMultiplicationRenderModel({
        multiplicand: 48,
        multiplier: 7,
        multiplicandDecimalPlaces: 3,
        steps: [],
      }),
    RangeError,
  );
});
