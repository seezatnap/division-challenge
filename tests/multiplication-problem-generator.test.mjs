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

const generatorModule = loadTypeScriptModule(
  "src/features/multiplication-engine/lib/problem-generator.ts",
);

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function digitCount(value) {
  return String(value).length;
}

test("generator respects digit ranges for every difficulty tier", async () => {
  const { generateMultiplicationProblem, MULTIPLICATION_DIFFICULTY_TIERS } =
    await generatorModule;
  const random = createSeededRandom(20260610);

  for (const tier of MULTIPLICATION_DIFFICULTY_TIERS) {
    for (let sampleIndex = 0; sampleIndex < 40; sampleIndex += 1) {
      const problem = generateMultiplicationProblem({
        difficultyLevel: tier.level,
        random,
      });

      assert.equal(problem.difficultyLevel, tier.level);
      assert.ok(
        digitCount(problem.multiplicand) >= tier.minMultiplicandDigits &&
          digitCount(problem.multiplicand) <= tier.maxMultiplicandDigits,
        `multiplicand ${problem.multiplicand} should match tier ${tier.level} digits`,
      );
      assert.ok(
        digitCount(problem.multiplier) >= tier.minMultiplierDigits &&
          digitCount(problem.multiplier) <= tier.maxMultiplierDigits,
        `multiplier ${problem.multiplier} should match tier ${tier.level} digits`,
      );
      assert.match(problem.id, /^multiplication-\d-[a-z0-9]{6,}$/);
    }
  }
});

test("generator avoids zero digits in factors so partial rows stay meaningful", async () => {
  const { generateMultiplicationProblem } = await generatorModule;
  const random = createSeededRandom(99);

  for (let sampleIndex = 0; sampleIndex < 80; sampleIndex += 1) {
    const problem = generateMultiplicationProblem({ difficultyLevel: 5, random });

    assert.ok(!String(problem.multiplicand).includes("0"), "multiplicand has no zero digits");
    assert.ok(!String(problem.multiplier).includes("0"), "multiplier has no zero digits");
  }
});

test("difficulty progression unlocks levels at solved-count thresholds", async () => {
  const { getMultiplicationDifficultyLevelForSolvedCount } = await generatorModule;

  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(0), 1);
  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(4), 1);
  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(5), 2);
  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(12), 3);
  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(20), 4);
  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(35), 5);
  assert.equal(getMultiplicationDifficultyLevelForSolvedCount(500), 5);
});

test("tier lookup clamps out-of-range levels and validates input", async () => {
  const { getMultiplicationDifficultyTier } = await generatorModule;

  assert.equal(getMultiplicationDifficultyTier(99).level, 5);
  assert.throws(() => getMultiplicationDifficultyTier(0), RangeError);
  assert.throws(() => getMultiplicationDifficultyTier(1.5), RangeError);
});

test("lifetime-aware generation maps solved counts to tier levels", async () => {
  const { generateMultiplicationProblemForSolvedCount } = await generatorModule;
  const random = createSeededRandom(7);

  const beginnerProblem = generateMultiplicationProblemForSolvedCount({
    totalProblemsSolved: 0,
    random,
  });
  assert.equal(beginnerProblem.difficultyLevel, 1);

  const apexProblem = generateMultiplicationProblemForSolvedCount({
    totalProblemsSolved: 40,
    random,
  });
  assert.equal(apexProblem.difficultyLevel, 5);
});
