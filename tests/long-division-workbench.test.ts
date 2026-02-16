import assert from "node:assert/strict";
import test from "node:test";

import type { DivisionProblem } from "../lib/domain";
import {
  advanceLongDivisionWorkbenchProblem,
  createLongDivisionWorkbenchState,
  createLongDivisionWorkbenchStateFromProblem,
  submitLongDivisionWorkbenchStepInput,
} from "../lib/long-division-workbench";
import {
  getCurrentLongDivisionStep,
  isLongDivisionStepStateComplete,
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

test("workbench initializes from a problem with first-step guidance", () => {
  const state = createLongDivisionWorkbenchStateFromProblem(createProblem());

  assert.equal(state.difficulty, "three-digit-by-one-digit");
  assert.equal(state.solvedCount, 0);
  assert.equal(state.pendingAdvance, false);
  assert.equal(state.attempts.length, 0);
  assert.equal(state.feedback.tone, "idle");
  assert.match(state.feedback.message, /Divide 9 by 5/i);
});

test("incorrect input keeps the same step and returns immediate hint feedback", () => {
  const initialState = createLongDivisionWorkbenchStateFromProblem(createProblem());
  const result = submitLongDivisionWorkbenchStepInput(initialState, 3);

  assert.equal(result.validation.isCorrect, false);
  assert.equal(result.state.stepState.currentStepIndex, 0);
  assert.equal(result.state.pendingAdvance, false);
  assert.equal(result.state.feedback.tone, "error");
  assert.match(result.state.feedback.message, /too large/i);
  assert.equal(result.state.attempts.length, 1);
  assert.equal(result.state.attempts[0]?.step, "divide");
  assert.equal(result.state.attempts[0]?.inputValue, 3);
  assert.equal(result.state.attempts[0]?.expectedValue, 1);
});

test("solving every step marks the problem complete and queues next transition", () => {
  let state = createLongDivisionWorkbenchStateFromProblem(createProblem());

  while (!isLongDivisionStepStateComplete(state.stepState)) {
    const currentStep = getCurrentLongDivisionStep(state.stepState);
    if (currentStep === null) {
      throw new Error("Expected a current step while problem is incomplete.");
    }

    const result = submitLongDivisionWorkbenchStepInput(
      state,
      currentStep.expectedValue,
    );
    assert.equal(result.validation.isCorrect, true);
    state = result.state;
  }

  assert.equal(state.solvedCount, 1);
  assert.equal(state.pendingAdvance, true);
  assert.equal(state.feedback.tone, "complete");
  assert.match(state.feedback.message, /Next problem loading/i);
  assert.equal(state.attempts.length, 11);
});

test("advancing to the next problem resets paper state and keeps solved totals", () => {
  let solvedState = createLongDivisionWorkbenchStateFromProblem(createProblem());

  while (!isLongDivisionStepStateComplete(solvedState.stepState)) {
    const currentStep = getCurrentLongDivisionStep(solvedState.stepState);
    if (currentStep === null) {
      throw new Error("Expected a current step while problem is incomplete.");
    }

    solvedState = submitLongDivisionWorkbenchStepInput(
      solvedState,
      currentStep.expectedValue,
    ).state;
  }

  const nextState = advanceLongDivisionWorkbenchProblem(solvedState, {
    random: () => 0.25,
    createdAt: "2026-02-16T02:00:00.000Z",
  });

  assert.equal(nextState.problem.difficulty, solvedState.difficulty);
  assert.equal(nextState.solvedCount, solvedState.solvedCount);
  assert.equal(nextState.pendingAdvance, false);
  assert.equal(nextState.attempts.length, 0);
  assert.equal(nextState.stepState.currentStepIndex, 0);
  assert.equal(isLongDivisionStepStateComplete(nextState.stepState), false);
  assert.equal(nextState.feedback.tone, "idle");
});

test("generator-backed state creation keeps supplied solved count", () => {
  const state = createLongDivisionWorkbenchState({
    difficulty: "two-digit-by-one-digit",
    solvedCount: 4,
    random: () => 0.25,
    createdAt: "2026-02-16T03:00:00.000Z",
  });

  assert.equal(state.difficulty, "two-digit-by-one-digit");
  assert.equal(state.solvedCount, 4);
  assert.equal(state.problem.difficulty, "two-digit-by-one-digit");
});
