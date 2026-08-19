import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

const engine = loadTypeScriptModule("src/features/fraction-engine/lib/index.ts");

/** Deterministic stand-in for Math.random that cycles a fixed list. */
function createSequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

test("the offered choices are 2, 3, 5, 7, 9, 11 plus none of the above", async () => {
  const { FRACTION_DIVISOR_CHOICES, NO_COMMON_DIVISOR_CHOICE } = await engine;

  assert.deepEqual([...FRACTION_DIVISOR_CHOICES], [2, 3, 5, 7, 9, 11]);
  assert.equal(NO_COMMON_DIVISOR_CHOICE, "none");
});

test("only divisors that divide both halves are valid", async () => {
  const { getValidFractionDivisors, isFractionReductionChoiceCorrect } = await engine;

  // 350/1000: both even and both multiples of 5; nothing else on the list fits.
  assert.deepEqual([...getValidFractionDivisors({ numerator: 350, denominator: 1000 })], [2, 5]);
  // 7/20 shares nothing.
  assert.deepEqual([...getValidFractionDivisors({ numerator: 7, denominator: 20 })], []);
  // 25/100 is odd on top, so 2 is out.
  assert.deepEqual([...getValidFractionDivisors({ numerator: 25, denominator: 100 })], [5]);

  const fraction = { numerator: 350, denominator: 1000 };
  assert.equal(isFractionReductionChoiceCorrect(fraction, 5), true);
  assert.equal(isFractionReductionChoiceCorrect(fraction, 2), true);
  for (const wrongChoice of [3, 7, 9, 11]) {
    assert.equal(isFractionReductionChoiceCorrect(fraction, wrongChoice), false, `${wrongChoice}`);
  }
});

test("none of the above is correct only once nothing divides both", async () => {
  const { isFractionReductionChoiceCorrect, isFractionFullyReduced } = await engine;

  assert.equal(isFractionReductionChoiceCorrect({ numerator: 350, denominator: 1000 }, "none"), false);
  assert.equal(isFractionReductionChoiceCorrect({ numerator: 7, denominator: 20 }, "none"), true);
  assert.equal(isFractionFullyReduced({ numerator: 1, denominator: 2 }), true);
  assert.equal(isFractionFullyReduced({ numerator: 2, denominator: 4 }), false);
});

test("dividing produces the reduced fraction and counts the rounds left", async () => {
  const { applyFractionDivisor, getFractionDivisionTargets, countRemainingReductionRounds } =
    await engine;

  assert.deepEqual(getFractionDivisionTargets({ numerator: 350, denominator: 1000 }, 5), {
    numerator: 70,
    denominator: 200,
  });
  assert.deepEqual(applyFractionDivisor({ numerator: 70, denominator: 200 }, 2), {
    numerator: 35,
    denominator: 100,
  });
  assert.throws(
    () => applyFractionDivisor({ numerator: 7, denominator: 20 }, 3),
    /does not divide both/,
  );

  // 350/1000 = 2 * 5^2 * 7 over 2^3 * 5^3 → three rounds (one 2, two 5s).
  assert.equal(countRemainingReductionRounds({ numerator: 350, denominator: 1000 }), 3);
  assert.equal(countRemainingReductionRounds({ numerator: 7, denominator: 20 }), 0);
});

test("difficulty tiers map to the promised amount of work", async () => {
  const { getFractionDifficultyTier } = await engine;

  // easy = 1-2 rounds, medium = 3-4, hard = 5-6.
  for (const level of [1, 2]) {
    assert.deepEqual(
      [getFractionDifficultyTier(level).minReductionRounds, getFractionDifficultyTier(level).maxReductionRounds],
      [1, 2],
      `level ${level}`,
    );
  }
  for (const level of [3, 4]) {
    assert.deepEqual(
      [getFractionDifficultyTier(level).minReductionRounds, getFractionDifficultyTier(level).maxReductionRounds],
      [3, 4],
      `level ${level}`,
    );
  }
  for (const level of [5, 6, 9]) {
    assert.deepEqual(
      [getFractionDifficultyTier(level).minReductionRounds, getFractionDifficultyTier(level).maxReductionRounds],
      [5, 6],
      `level ${level}`,
    );
  }
});

test("generated problems are proper fractions over a power of ten with the right workload", async () => {
  const {
    generateFractionReductionProblem,
    countRemainingReductionRounds,
    getFractionDifficultyTier,
  } = await engine;

  for (const difficultyLevel of [1, 2, 3, 4, 5]) {
    const tier = getFractionDifficultyTier(difficultyLevel);

    for (let iteration = 0; iteration < 60; iteration += 1) {
      const problem = generateFractionReductionProblem({ difficultyLevel });
      const { numerator, denominator } = problem.fraction;

      assert.ok(
        [100, 1000, 10000].includes(denominator),
        `denominator ${denominator} must be 100, 1000 or 10000`,
      );
      assert.ok(numerator > 0 && numerator < denominator, `${numerator}/${denominator} must be proper`);
      assert.equal(Number.isInteger(numerator), true);

      const rounds = countRemainingReductionRounds(problem.fraction);
      assert.equal(rounds, problem.reductionRounds, `${numerator}/${denominator}`);
      assert.ok(
        rounds >= tier.minReductionRounds && rounds <= tier.maxReductionRounds,
        `level ${difficultyLevel} produced ${rounds} rounds for ${numerator}/${denominator}`,
      );

      // Every round must be answerable with 2 or 5 — the denominator is a power
      // of ten, so nothing else can ever be a shared divisor.
      assert.equal(problem.id.startsWith("fraction-"), true);
    }
  }
});

test("generation is deterministic for a given random sequence", async () => {
  const { generateFractionReductionProblem } = await engine;

  const first = generateFractionReductionProblem({
    difficultyLevel: 3,
    random: createSequenceRandom([0.1, 0.4, 0.7, 0.2]),
  });
  const second = generateFractionReductionProblem({
    difficultyLevel: 3,
    random: createSequenceRandom([0.1, 0.4, 0.7, 0.2]),
  });

  assert.deepEqual(first, second);
});

test("a session walks the fraction down to its lowest terms", async () => {
  const {
    createFractionReductionSession,
    applyFractionDivisorChoice,
    applyFractionReductionEntry,
    getCurrentFraction,
    isFractionReductionSolved,
    getFractionReductionProgress,
  } = await engine;

  const problem = {
    id: "fraction-350-1000-test",
    difficultyLevel: 3,
    fraction: { numerator: 350, denominator: 1000 },
    reductionRounds: 3,
  };

  let state = createFractionReductionSession(problem);
  assert.equal(state.status, "choosing-divisor");
  assert.equal(state.rows.length, 1);
  assert.deepEqual(getCurrentFraction(state), { numerator: 350, denominator: 1000 });

  // Wrong divisor: rejected, nothing moves, and the mistake is recorded.
  const rejected = applyFractionDivisorChoice(state, 3);
  assert.equal(rejected.outcome, "divisor-rejected");
  assert.equal(rejected.state.status, "choosing-divisor");
  assert.equal(rejected.state.incorrectAttempts, 1);

  // "none of the above" is also wrong while the fraction still reduces.
  assert.equal(applyFractionDivisorChoice(state, "none").outcome, "divisor-rejected");

  const rounds = [
    { divisor: 5, numerator: 70, denominator: 200 },
    { divisor: 5, numerator: 14, denominator: 40 },
    { divisor: 2, numerator: 7, denominator: 20 },
  ];

  for (const round of rounds) {
    const accepted = applyFractionDivisorChoice(state, round.divisor);
    assert.equal(accepted.outcome, "divisor-accepted");
    state = accepted.state;
    assert.equal(state.status, "dividing");

    const wrongEntry = applyFractionReductionEntry(state, "numerator", round.numerator + 1);
    assert.equal(wrongEntry.outcome, "entry-rejected");

    const numeratorEntry = applyFractionReductionEntry(state, "numerator", round.numerator);
    assert.equal(numeratorEntry.outcome, "entry-accepted");
    state = numeratorEntry.state;

    const denominatorEntry = applyFractionReductionEntry(state, "denominator", round.denominator);
    assert.equal(denominatorEntry.outcome, "row-complete");
    state = denominatorEntry.state;

    assert.equal(state.status, "choosing-divisor");
    assert.deepEqual(getCurrentFraction(state), {
      numerator: round.numerator,
      denominator: round.denominator,
    });
  }

  // Every step of the work is still on screen.
  assert.equal(state.rows.length, 4);
  assert.deepEqual(
    state.rows.map((row) => `${row.fraction.numerator}/${row.fraction.denominator}`),
    ["350/1000", "70/200", "14/40", "7/20"],
  );

  const progress = getFractionReductionProgress(state);
  assert.deepEqual(
    [progress.completedRounds, progress.totalRounds, progress.isFinalFractionReached],
    [3, 3, true],
  );

  // Now a divisor is the wrong answer and "none of the above" finishes it.
  assert.equal(applyFractionDivisorChoice(state, 2).outcome, "divisor-rejected");
  const solved = applyFractionDivisorChoice(state, "none");
  assert.equal(solved.outcome, "problem-solved");
  assert.equal(isFractionReductionSolved(solved.state), true);

  // A solved session ignores further input.
  assert.equal(applyFractionDivisorChoice(solved.state, 5).outcome, "ignored");
  assert.equal(applyFractionReductionEntry(solved.state, "numerator", 1).outcome, "ignored");
});

test("entries are ignored until a divisor has been chosen", async () => {
  const { createFractionReductionSession, applyFractionReductionEntry } = await engine;

  const state = createFractionReductionSession({
    id: "fraction-50-100-test",
    difficultyLevel: 1,
    fraction: { numerator: 50, denominator: 100 },
    reductionRounds: 2,
  });

  assert.equal(applyFractionReductionEntry(state, "numerator", 25).outcome, "ignored");
});

test("every generated problem can actually be solved through the session API", async () => {
  const {
    generateFractionReductionProblem,
    createFractionReductionSession,
    applyFractionDivisorChoice,
    applyFractionReductionEntry,
    getValidFractionDivisors,
    getCurrentFraction,
    getFractionDivisionTargets,
    isFractionReductionSolved,
  } = await engine;

  for (const difficultyLevel of [1, 3, 5]) {
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const problem = generateFractionReductionProblem({ difficultyLevel });
      let state = createFractionReductionSession(problem);
      let guard = 0;

      while (!isFractionReductionSolved(state) && guard < 32) {
        guard += 1;
        const fraction = getCurrentFraction(state);
        const [divisor] = getValidFractionDivisors(fraction);

        if (divisor === undefined) {
          state = applyFractionDivisorChoice(state, "none").state;
          continue;
        }

        state = applyFractionDivisorChoice(state, divisor).state;
        const targets = getFractionDivisionTargets(fraction, divisor);
        state = applyFractionReductionEntry(state, "numerator", targets.numerator).state;
        state = applyFractionReductionEntry(state, "denominator", targets.denominator).state;
      }

      assert.equal(isFractionReductionSolved(state), true, `stuck on ${problem.id}`);
      assert.equal(state.rows.length, problem.reductionRounds + 1, problem.id);
      assert.equal(state.incorrectAttempts, 0, problem.id);
    }
  }
});
