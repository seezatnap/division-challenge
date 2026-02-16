import assert from "node:assert/strict";
import test from "node:test";

import type { DivisionProblem } from "../lib/domain";
import {
  advanceLongDivisionWorkbenchProblem,
  createLongDivisionWorkbenchState,
  createLongDivisionWorkbenchStateFromProblem,
  LONG_DIVISION_REWARD_INTERVAL,
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

function solveProblemToCompletion(initialState: ReturnType<typeof createLongDivisionWorkbenchStateFromProblem>) {
  let state = initialState;
  let lastSubmission: ReturnType<typeof submitLongDivisionWorkbenchStepInput> | null =
    null;

  while (!isLongDivisionStepStateComplete(state.stepState)) {
    const currentStep = getCurrentLongDivisionStep(state.stepState);
    if (currentStep === null) {
      throw new Error("Expected a current step while problem is incomplete.");
    }

    lastSubmission = submitLongDivisionWorkbenchStepInput(
      state,
      currentStep.expectedValue,
    );
    assert.equal(lastSubmission.validation.isCorrect, true);
    state = lastSubmission.state;
  }

  if (lastSubmission === null) {
    throw new Error("Expected at least one step submission while solving.");
  }

  return {
    solvedState: state,
    lastSubmission,
  };
}

test("workbench initializes from a problem with first-step guidance", () => {
  const state = createLongDivisionWorkbenchStateFromProblem(createProblem());

  assert.equal(state.difficulty, "three-digit-by-one-digit");
  assert.equal(state.solvedCount, 0);
  assert.equal(state.lifetimeSolvedCount, 0);
  assert.equal(state.pendingAdvance, false);
  assert.equal(state.pendingRewardTrigger, null);
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
  assert.equal(result.rewardTrigger, null);
  assert.equal(result.state.pendingRewardTrigger, null);
  assert.equal(result.state.attempts.length, 1);
  assert.equal(result.state.attempts[0]?.step, "divide");
  assert.equal(result.state.attempts[0]?.inputValue, 3);
  assert.equal(result.state.attempts[0]?.expectedValue, 1);
});

test("solving every step marks the problem complete and queues next transition", () => {
  const { solvedState, lastSubmission } = solveProblemToCompletion(
    createLongDivisionWorkbenchStateFromProblem(createProblem()),
  );

  assert.equal(solvedState.solvedCount, 1);
  assert.equal(solvedState.lifetimeSolvedCount, 1);
  assert.equal(solvedState.pendingAdvance, true);
  assert.equal(solvedState.pendingRewardTrigger, null);
  assert.equal(lastSubmission.rewardTrigger, null);
  assert.equal(solvedState.feedback.tone, "complete");
  assert.match(solvedState.feedback.message, /Next problem loading/i);
  assert.equal(solvedState.attempts.length, 11);
});

test("completion emits a reward trigger every 5 lifetime solves", () => {
  const initialState = createLongDivisionWorkbenchStateFromProblem(createProblem(), {
    solvedCount: 0,
    lifetimeSolvedCount: LONG_DIVISION_REWARD_INTERVAL - 1,
  });
  const { solvedState, lastSubmission } = solveProblemToCompletion(initialState);

  assert.deepEqual(lastSubmission.rewardTrigger, {
    rewardIndex: 0,
    lifetimeSolvedCount: LONG_DIVISION_REWARD_INTERVAL,
  });
  assert.deepEqual(solvedState.pendingRewardTrigger, {
    rewardIndex: 0,
    lifetimeSolvedCount: LONG_DIVISION_REWARD_INTERVAL,
  });
  assert.equal(solvedState.lifetimeSolvedCount, LONG_DIVISION_REWARD_INTERVAL);
  assert.match(solvedState.feedback.message, /reward milestone/i);
});

test("progression logic raises difficulty as lifetime solved count grows", () => {
  const initialState = createLongDivisionWorkbenchStateFromProblem(
    createProblem({
      difficulty: "two-digit-by-one-digit",
    }),
    {
      solvedCount: 0,
      lifetimeSolvedCount: LONG_DIVISION_REWARD_INTERVAL - 1,
    },
  );
  const { solvedState } = solveProblemToCompletion(initialState);

  assert.equal(solvedState.difficulty, "three-digit-by-one-digit");
  assert.match(solvedState.feedback.message, /leveled up/i);
});

test("advancing to the next problem resets paper state and keeps solved totals", () => {
  const { solvedState } = solveProblemToCompletion(
    createLongDivisionWorkbenchStateFromProblem(createProblem()),
  );

  const nextState = advanceLongDivisionWorkbenchProblem(solvedState, {
    random: () => 0.25,
    createdAt: "2026-02-16T02:00:00.000Z",
  });

  assert.equal(nextState.problem.difficulty, solvedState.difficulty);
  assert.equal(nextState.solvedCount, solvedState.solvedCount);
  assert.equal(nextState.lifetimeSolvedCount, solvedState.lifetimeSolvedCount);
  assert.equal(nextState.pendingAdvance, false);
  assert.equal(nextState.pendingRewardTrigger, null);
  assert.equal(nextState.attempts.length, 0);
  assert.equal(nextState.stepState.currentStepIndex, 0);
  assert.equal(isLongDivisionStepStateComplete(nextState.stepState), false);
  assert.equal(nextState.feedback.tone, "idle");
});

test("generator-backed state creation keeps supplied session and lifetime totals", () => {
  const state = createLongDivisionWorkbenchState({
    difficulty: "two-digit-by-one-digit",
    solvedCount: 4,
    lifetimeSolvedCount: 12,
    random: () => 0.25,
    createdAt: "2026-02-16T03:00:00.000Z",
  });

  assert.equal(state.difficulty, "four-digit-by-two-digit");
  assert.equal(state.solvedCount, 4);
  assert.equal(state.lifetimeSolvedCount, 12);
  assert.equal(state.problem.difficulty, "four-digit-by-two-digit");
});
