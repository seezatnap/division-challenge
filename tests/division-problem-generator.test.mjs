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
