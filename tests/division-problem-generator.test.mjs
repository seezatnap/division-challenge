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

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function digitCount(value) {
  return String(Math.abs(value)).length;
}

const divisionGeneratorModule = loadTypeScriptModule("src/features/division-engine/lib/problem-generator.ts");

test("difficulty tier map starts at 2-digit / 1-digit and scales to 4-5 digit / 2-3 digit", async () => {
  const { DIVISION_DIFFICULTY_TIERS, getDivisionDifficultyTier } = await divisionGeneratorModule;

  assert.deepEqual(DIVISION_DIFFICULTY_TIERS[0], {
    level: 1,
    minDividendDigits: 2,
    maxDividendDigits: 2,
    minDivisorDigits: 1,
    maxDivisorDigits: 1,
  });

  assert.deepEqual(DIVISION_DIFFICULTY_TIERS.at(-1), {
    level: 5,
    minDividendDigits: 4,
    maxDividendDigits: 5,
    minDivisorDigits: 2,
    maxDivisorDigits: 3,
  });

  assert.equal(getDivisionDifficultyTier(999).level, 5);
});

test("generator keeps dividend/divisor digits inside the selected difficulty tier", async () => {
  const { generateDivisionProblem, getDivisionDifficultyTier } = await divisionGeneratorModule;
  const random = createSeededRandom(1337);

  for (let level = 1; level <= 7; level += 1) {
    const tier = getDivisionDifficultyTier(level);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const problem = generateDivisionProblem({
        difficultyLevel: level,
        remainderMode: "allow",
        random,
      });

      const dividendDigits = digitCount(problem.dividend);
      const divisorDigits = digitCount(problem.divisor);

      assert.equal(problem.difficultyLevel, tier.level);
      assert.ok(
        dividendDigits >= tier.minDividendDigits && dividendDigits <= tier.maxDividendDigits,
        `Expected dividend digits ${dividendDigits} in [${tier.minDividendDigits}, ${tier.maxDividendDigits}]`,
      );
      assert.ok(
        divisorDigits >= tier.minDivisorDigits && divisorDigits <= tier.maxDivisorDigits,
        `Expected divisor digits ${divisorDigits} in [${tier.minDivisorDigits}, ${tier.maxDivisorDigits}]`,
      );
      assert.ok(problem.divisor >= 2, "Expected divisor to stay above 1 for meaningful division");
      assert.match(problem.id, /^division-\d+-[a-z0-9]+$/);
    }
  }
});

test("forbid mode always returns exact division and marks allowRemainder=false", async () => {
  const { generateDivisionProblem } = await divisionGeneratorModule;
  const random = createSeededRandom(9001);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const problem = generateDivisionProblem({
      difficultyLevel: 4,
      remainderMode: "forbid",
      random,
    });

    assert.equal(problem.dividend % problem.divisor, 0);
    assert.equal(problem.allowRemainder, false);
  }
});

test("require mode always returns non-zero remainder and marks allowRemainder=true", async () => {
  const { generateDivisionProblem } = await divisionGeneratorModule;
  const random = createSeededRandom(42);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const problem = generateDivisionProblem({
      difficultyLevel: 5,
      remainderMode: "require",
      random,
    });

    assert.notEqual(problem.dividend % problem.divisor, 0);
    assert.equal(problem.allowRemainder, true);
  }
});

test("allow mode can emit both exact and remainder problems over a deterministic sequence", async () => {
  const { generateDivisionProblem } = await divisionGeneratorModule;
  const random = createSeededRandom(20260217);
  let sawExact = false;
  let sawRemainder = false;

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const problem = generateDivisionProblem({
      difficultyLevel: 3,
      remainderMode: "allow",
      random,
    });

    if (problem.dividend % problem.divisor === 0) {
      sawExact = true;
    } else {
      sawRemainder = true;
    }

    if (sawExact && sawRemainder) {
      break;
    }
  }

  assert.equal(sawExact, true);
  assert.equal(sawRemainder, true);
});

test("allow mode keeps allowRemainder aligned with arithmetic remainder outcomes", async () => {
  const { generateDivisionProblem } = await divisionGeneratorModule;
  const random = createSeededRandom(314159);

  for (let level = 1; level <= 5; level += 1) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const problem = generateDivisionProblem({
        difficultyLevel: level,
        remainderMode: "allow",
        random,
      });

      assert.equal(problem.allowRemainder, problem.dividend % problem.divisor !== 0);
    }
  }
});

test("difficulty progression derives levels from cumulative solved problem counts", async () => {
  const {
    DIVISION_DIFFICULTY_PROGRESSION_RULES,
    getDifficultyLevelForSolvedCount,
    getDivisionDifficultyTierForSolvedCount,
  } = await divisionGeneratorModule;

  assert.deepEqual(DIVISION_DIFFICULTY_PROGRESSION_RULES, [
    { level: 1, minimumSolvedCount: 0 },
    { level: 2, minimumSolvedCount: 5 },
    { level: 3, minimumSolvedCount: 12 },
    { level: 4, minimumSolvedCount: 20 },
    { level: 5, minimumSolvedCount: 35 },
  ]);

  assert.equal(getDifficultyLevelForSolvedCount(0), 1);
  assert.equal(getDifficultyLevelForSolvedCount(4), 1);
  assert.equal(getDifficultyLevelForSolvedCount(5), 2);
  assert.equal(getDifficultyLevelForSolvedCount(11), 2);
  assert.equal(getDifficultyLevelForSolvedCount(12), 3);
  assert.equal(getDifficultyLevelForSolvedCount(19), 3);
  assert.equal(getDifficultyLevelForSolvedCount(20), 4);
  assert.equal(getDifficultyLevelForSolvedCount(34), 4);
  assert.equal(getDifficultyLevelForSolvedCount(35), 5);
  assert.equal(getDifficultyLevelForSolvedCount(500), 5);

  assert.equal(getDivisionDifficultyTierForSolvedCount(0).level, 1);
  assert.equal(getDivisionDifficultyTierForSolvedCount(20).level, 4);
  assert.equal(getDivisionDifficultyTierForSolvedCount(999).level, 5);
});

test("lifetime-aware generation follows progression threshold boundaries exactly", async () => {
  const { generateDivisionProblemForSolvedCount } = await divisionGeneratorModule;
  const random = createSeededRandom(271828);
  const thresholdCases = [
    { totalProblemsSolved: 4, expectedLevel: 1 },
    { totalProblemsSolved: 5, expectedLevel: 2 },
    { totalProblemsSolved: 11, expectedLevel: 2 },
    { totalProblemsSolved: 12, expectedLevel: 3 },
    { totalProblemsSolved: 19, expectedLevel: 3 },
    { totalProblemsSolved: 20, expectedLevel: 4 },
    { totalProblemsSolved: 34, expectedLevel: 4 },
    { totalProblemsSolved: 35, expectedLevel: 5 },
  ];

  for (const { totalProblemsSolved, expectedLevel } of thresholdCases) {
    const problem = generateDivisionProblemForSolvedCount({
      totalProblemsSolved,
      random,
      remainderMode: "allow",
    });

    assert.equal(problem.difficultyLevel, expectedLevel);
  }
});

test("difficulty progression requires solved counts to be non-negative integers", async () => {
  const { getDifficultyLevelForSolvedCount, generateDivisionProblemForSolvedCount } =
    await divisionGeneratorModule;

  assert.throws(
    () => getDifficultyLevelForSolvedCount(-1),
    /totalProblemsSolved must be a non-negative integer/,
  );
  assert.throws(
    () => getDifficultyLevelForSolvedCount(1.5),
    /totalProblemsSolved must be a non-negative integer/,
  );

  assert.throws(
    () =>
      generateDivisionProblemForSolvedCount({
        totalProblemsSolved: -2,
      }),
    /totalProblemsSolved must be a non-negative integer/,
  );
});

test("lifetime-aware generation resolves difficulty from solved count before creating a problem", async () => {
  const { generateDivisionProblemForSolvedCount, getDivisionDifficultyTierForSolvedCount } =
    await divisionGeneratorModule;
  const random = createSeededRandom(24680);

  const solvedCountSamples = [0, 6, 12, 23, 44];

  for (const totalProblemsSolved of solvedCountSamples) {
    const tier = getDivisionDifficultyTierForSolvedCount(totalProblemsSolved);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const problem = generateDivisionProblemForSolvedCount({
        totalProblemsSolved,
        random,
        remainderMode: "allow",
      });

      assert.equal(problem.difficultyLevel, tier.level);
      assert.ok(
        digitCount(problem.dividend) >= tier.minDividendDigits &&
          digitCount(problem.dividend) <= tier.maxDividendDigits,
      );
      assert.ok(
        digitCount(problem.divisor) >= tier.minDivisorDigits &&
          digitCount(problem.divisor) <= tier.maxDivisorDigits,
      );
    }
  }
});
