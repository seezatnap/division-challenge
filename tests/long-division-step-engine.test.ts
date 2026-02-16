import assert from "node:assert/strict";
import test from "node:test";

import type { DivisionProblem } from "../lib/domain";
import {
  createLongDivisionStepState,
  getCurrentLongDivisionStep,
  isLongDivisionStepStateComplete,
  validateLongDivisionStepInput,
} from "../lib/long-division-step-engine";

function createProblem(overrides: Partial<DivisionProblem> = {}): DivisionProblem {
  return {
    id: "problem-975-5",
    dividend: 975,
    divisor: 5,
    quotient: 195,
    remainder: 0,
    difficulty: "three-digit-by-one-digit",
    createdAt: "2026-02-16T00:00:00.000Z",
    ...overrides,
  };
}

test("step engine follows divide -> multiply -> subtract -> bring down progression", () => {
  let state = createLongDivisionStepState(createProblem());
  const seenSteps: string[] = [];
  const seenValues: number[] = [];

  while (!isLongDivisionStepStateComplete(state)) {
    const currentStep = getCurrentLongDivisionStep(state);
    if (currentStep === null) {
      throw new Error("Expected a current step while problem is incomplete.");
    }

    seenSteps.push(currentStep.step);
    seenValues.push(currentStep.expectedValue);

    const result = validateLongDivisionStepInput(state, currentStep.expectedValue);
    assert.equal(result.isCorrect, true);
    state = result.state;
  }

  assert.deepEqual(seenSteps, [
    "divide",
    "multiply",
    "subtract",
    "bring-down",
    "divide",
    "multiply",
    "subtract",
    "bring-down",
    "divide",
    "multiply",
    "subtract",
  ]);
  assert.deepEqual(seenValues, [1, 5, 4, 47, 9, 45, 2, 25, 5, 25, 0]);
  assert.equal(isLongDivisionStepStateComplete(state), true);
  assert.equal(getCurrentLongDivisionStep(state), null);
});

test("invalid and incorrect inputs return hints and do not advance state", () => {
  const initialState = createLongDivisionStepState(createProblem());

  const invalidResult = validateLongDivisionStepInput(initialState, "1.5");
  assert.equal(invalidResult.isCorrect, false);
  assert.match(invalidResult.hint ?? "", /non-negative whole number/i);
  assert.equal(invalidResult.state.currentStepIndex, 0);

  const tooHighDivide = validateLongDivisionStepInput(initialState, 3);
  assert.equal(tooHighDivide.isCorrect, false);
  assert.match(tooHighDivide.hint ?? "", /too large/i);
  assert.equal(tooHighDivide.state.currentStepIndex, 0);

  const firstCorrect = validateLongDivisionStepInput(initialState, 1);
  assert.equal(firstCorrect.isCorrect, true);

  const wrongMultiply = validateLongDivisionStepInput(firstCorrect.state, 7);
  assert.equal(wrongMultiply.isCorrect, false);
  assert.match(wrongMultiply.hint ?? "", /Multiply the divisor 5 by the quotient digit 1/i);
  assert.equal(wrongMultiply.state.currentStepIndex, 1);
});

test("string inputs solve remainder problems and report completion", () => {
  let state = createLongDivisionStepState(
    createProblem({
      id: "problem-123-5",
      dividend: 123,
      divisor: 5,
      quotient: 24,
      remainder: 3,
    }),
  );
  let resultComplete = false;

  while (!isLongDivisionStepStateComplete(state)) {
    const currentStep = getCurrentLongDivisionStep(state);
    if (currentStep === null) {
      throw new Error("Expected a current step while problem is incomplete.");
    }

    const result = validateLongDivisionStepInput(
      state,
      `${currentStep.expectedValue}`,
    );
    assert.equal(result.isCorrect, true);
    resultComplete = result.isComplete;
    state = result.state;
  }

  assert.equal(resultComplete, true);
  assert.equal(isLongDivisionStepStateComplete(state), true);

  const afterComplete = validateLongDivisionStepInput(state, 0);
  assert.equal(afterComplete.isCorrect, false);
  assert.equal(afterComplete.isComplete, true);
  assert.match(afterComplete.hint ?? "", /already complete/i);
});

test("engine supports quotient steps that include zero", () => {
  let state = createLongDivisionStepState(
    createProblem({
      id: "problem-1005-5",
      dividend: 1005,
      divisor: 5,
      quotient: 201,
      remainder: 0,
    }),
  );
  const seenValues: number[] = [];

  while (!isLongDivisionStepStateComplete(state)) {
    const currentStep = getCurrentLongDivisionStep(state);
    if (currentStep === null) {
      throw new Error("Expected a current step while problem is incomplete.");
    }
    seenValues.push(currentStep.expectedValue);

    const result = validateLongDivisionStepInput(state, currentStep.expectedValue);
    assert.equal(result.isCorrect, true);
    state = result.state;
  }

  assert.deepEqual(seenValues, [2, 10, 0, 0, 0, 0, 0, 5, 1, 5, 0]);
});

test("engine rejects mathematically inconsistent problems", () => {
  assert.throws(
    () =>
      createLongDivisionStepState(
        createProblem({
          quotient: 196,
        }),
      ),
    {
      message: "A valid division problem is required to build step state.",
    },
  );
});
