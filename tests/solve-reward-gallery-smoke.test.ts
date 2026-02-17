import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DinoGallery from "../app/dino-gallery";
import type { DivisionProblem } from "../lib/domain";
import {
  applyRuntimeProgressUpdate,
  initializeNewGameRuntimeState,
} from "../lib/game-start";
import {
  createLongDivisionWorkbenchStateFromProblem,
  submitLongDivisionWorkbenchStepInput,
} from "../lib/long-division-workbench";
import {
  getCurrentLongDivisionStep,
  isLongDivisionStepStateComplete,
} from "../lib/long-division-step-engine";
import {
  getHighestRewardIndexForSolvedCount,
  processPendingRewardMilestones,
} from "../lib/reward-orchestration";

function createProblem(overrides: Partial<DivisionProblem> = {}): DivisionProblem {
  return {
    id: "problem-975-5-smoke",
    dividend: 975,
    divisor: 5,
    quotient: 195,
    remainder: 0,
    difficulty: "three-digit-by-one-digit",
    createdAt: "2026-02-16T16:00:00.000Z",
    ...overrides,
  };
}

function solveProblemToCompletion(
  initialState: ReturnType<typeof createLongDivisionWorkbenchStateFromProblem>,
) {
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

test("integration smoke: solve -> reward unlock -> gallery render with mocked Gemini", async () => {
  let runtimeState = initializeNewGameRuntimeState(
    "Rex",
    "2026-02-16T16:00:00.000Z",
  );

  runtimeState = applyRuntimeProgressUpdate(runtimeState, {
    difficulty: "three-digit-by-one-digit",
    solvedCount: 4,
    lifetimeSolvedCount: 4,
  });

  const { solvedState, lastSubmission } = solveProblemToCompletion(
    createLongDivisionWorkbenchStateFromProblem(createProblem(), {
      solvedCount: 4,
      lifetimeSolvedCount: 4,
    }),
  );

  assert.deepEqual(lastSubmission.rewardTrigger, {
    rewardIndex: 0,
    lifetimeSolvedCount: 5,
  });

  runtimeState = applyRuntimeProgressUpdate(runtimeState, {
    difficulty: solvedState.difficulty,
    solvedCount: solvedState.solvedCount,
    lifetimeSolvedCount: solvedState.lifetimeSolvedCount,
  });
  assert.equal(runtimeState.playerSave.totalProblemsSolved, 5);

  const highestRewardIndex = getHighestRewardIndexForSolvedCount(
    runtimeState.playerSave.totalProblemsSolved,
  );
  assert.equal(highestRewardIndex, 0);

  const requestedDinosaurNames: string[] = [];
  const rewardResult = await processPendingRewardMilestones({
    playerSave: runtimeState.playerSave,
    highestRewardIndex,
    earnedAt: "2026-02-16T16:05:00.000Z",
    generateRewardImage: async (dinosaurName) => {
      requestedDinosaurNames.push(dinosaurName);
      return {
        imagePath: "/generated-dinosaurs/tyrannosaurus-rex-smoke.png",
      };
    },
  });

  assert.equal(rewardResult.failedRewardIndex, null);
  assert.equal(rewardResult.errorMessage, null);
  assert.deepEqual(requestedDinosaurNames, ["Tyrannosaurus Rex"]);
  assert.equal(rewardResult.playerSave.unlockedDinosaurs.length, 1);
  assert.equal(
    rewardResult.playerSave.unlockedDinosaurs[0]?.name,
    "Tyrannosaurus Rex",
  );

  const galleryMarkup = renderToStaticMarkup(
    createElement(DinoGallery, {
      unlockedDinosaurs: rewardResult.playerSave.unlockedDinosaurs,
    }),
  );

  assert.match(galleryMarkup, /Dino Gallery/);
  assert.match(galleryMarkup, /Tyrannosaurus Rex/);
  assert.match(
    galleryMarkup,
    /src="\/generated-dinosaurs\/tyrannosaurus-rex-smoke\.png"/,
  );
  assert.match(galleryMarkup, /Earned/);
});
