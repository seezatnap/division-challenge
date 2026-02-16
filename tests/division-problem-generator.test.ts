import assert from "node:assert/strict";
import test from "node:test";

import {
  DIVISION_DIFFICULTIES,
  isDivisionProblem,
  type DivisionDifficultyId,
} from "../lib/domain";
import {
  generateDivisionProblem,
  getDivisionDifficultyByTier,
  getDivisionDifficultyDefinition,
  isDivisionRemainderMode,
} from "../lib/division-problem-generator";

function countDigits(value: number): number {
  return Math.abs(value).toString().length;
}

function assertArithmeticIdentity(
  dividend: number,
  divisor: number,
  quotient: number,
  remainder: number,
): void {
  assert.equal(dividend, (divisor * quotient) + remainder);
  assert.equal(remainder >= 0, true);
  assert.equal(remainder < divisor, true);
}

test("tier lookups expose the configured difficulty definitions", () => {
  assert.equal(getDivisionDifficultyByTier(1).id, "two-digit-by-one-digit");
  assert.equal(
    getDivisionDifficultyDefinition("four-digit-by-two-digit").label,
    "4-digit ÷ 2-digit",
  );

  assert.throws(() => getDivisionDifficultyByTier(0), {
    message: "Tier must be an integer between 1 and 4.",
  });

  assert.equal(isDivisionRemainderMode("allow"), true);
  assert.equal(isDivisionRemainderMode("require"), true);
  assert.equal(isDivisionRemainderMode("forbid"), true);
  assert.equal(isDivisionRemainderMode("invalid"), false);
});

test("top tier spans 4-digit/2-digit through 5-digit/3-digit generation", () => {
  const difficulty: DivisionDifficultyId =
    "four-to-five-digit-by-two-to-three-digit";
  const createdAt = "2026-02-16T00:00:00.000Z";

  const lowEnd = generateDivisionProblem({
    difficulty,
    remainderMode: "forbid",
    random: () => 0,
    createdAt,
  });
  const highEnd = generateDivisionProblem({
    difficulty,
    remainderMode: "forbid",
    random: () => 0.999999,
    createdAt,
  });

  assert.equal(countDigits(lowEnd.dividend), 4);
  assert.equal(countDigits(lowEnd.divisor), 2);
  assert.equal(lowEnd.difficultyMetadata.generatedDividendDigits, 4);
  assert.equal(lowEnd.difficultyMetadata.generatedDivisorDigits, 2);
  assert.equal(lowEnd.difficultyMetadata.tier, DIVISION_DIFFICULTIES.length);
  assert.equal(lowEnd.difficultyMetadata.tierCount, DIVISION_DIFFICULTIES.length);

  assert.equal(countDigits(highEnd.dividend), 5);
  assert.equal(countDigits(highEnd.divisor), 3);
  assert.equal(highEnd.difficultyMetadata.generatedDividendDigits, 5);
  assert.equal(highEnd.difficultyMetadata.generatedDivisorDigits, 3);
});

test("remainder modes enforce required and forbidden remainder behavior", () => {
  const createdAt = new Date("2026-02-16T00:00:00.000Z");

  const requiredRemainder = generateDivisionProblem({
    difficulty: "three-digit-by-one-digit",
    remainderMode: "require",
    random: () => 0,
    createdAt,
  });
  assert.equal(requiredRemainder.remainder > 0, true);
  assert.equal(requiredRemainder.hasRemainder, true);
  assert.equal(requiredRemainder.difficultyMetadata.hasRemainder, true);
  assert.equal(requiredRemainder.difficultyMetadata.remainderMode, "require");
  assertArithmeticIdentity(
    requiredRemainder.dividend,
    requiredRemainder.divisor,
    requiredRemainder.quotient,
    requiredRemainder.remainder,
  );

  const forbiddenRemainder = generateDivisionProblem({
    difficulty: "three-digit-by-one-digit",
    remainderMode: "forbid",
    random: () => 0,
    createdAt,
  });
  assert.equal(forbiddenRemainder.remainder, 0);
  assert.equal(forbiddenRemainder.hasRemainder, false);
  assert.equal(forbiddenRemainder.difficultyMetadata.hasRemainder, false);
  assert.equal(forbiddenRemainder.difficultyMetadata.remainderMode, "forbid");
  assertArithmeticIdentity(
    forbiddenRemainder.dividend,
    forbiddenRemainder.divisor,
    forbiddenRemainder.quotient,
    forbiddenRemainder.remainder,
  );
});

test("generated problem includes valid arithmetic and difficulty metadata", () => {
  const createdAt = "2026-02-16T00:00:00.000Z";
  const problem = generateDivisionProblem({
    tier: 2,
    remainderMode: "allow",
    random: () => 0.42,
    createdAt,
  });

  assert.equal(problem.difficulty, "three-digit-by-one-digit");
  assert.equal(problem.difficultyMetadata.id, "three-digit-by-one-digit");
  assert.equal(problem.difficultyMetadata.label, "3-digit ÷ 1-digit");
  assert.equal(problem.difficultyMetadata.tier, 2);
  assert.equal(problem.difficultyMetadata.tierCount, DIVISION_DIFFICULTIES.length);
  assert.equal(problem.createdAt, createdAt);
  assert.equal(
    problem.difficultyMetadata.generatedDividendDigits >=
      problem.difficultyMetadata.dividendDigits[0],
    true,
  );
  assert.equal(
    problem.difficultyMetadata.generatedDividendDigits <=
      problem.difficultyMetadata.dividendDigits[1],
    true,
  );
  assert.equal(
    problem.difficultyMetadata.generatedDivisorDigits >=
      problem.difficultyMetadata.divisorDigits[0],
    true,
  );
  assert.equal(
    problem.difficultyMetadata.generatedDivisorDigits <=
      problem.difficultyMetadata.divisorDigits[1],
    true,
  );
  assertArithmeticIdentity(
    problem.dividend,
    problem.divisor,
    problem.quotient,
    problem.remainder,
  );
  assert.equal(isDivisionProblem(problem), true);
});

test("generator rejects conflicting selectors", () => {
  assert.throws(
    () =>
      generateDivisionProblem({
        difficulty: "two-digit-by-one-digit",
        tier: 1,
      }),
    {
      message: "Provide either difficulty or tier, but not both.",
    },
  );
});
