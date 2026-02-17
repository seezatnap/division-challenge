import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function transpileTypeScriptToDataUrl(relativePath, replacements = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  for (const [specifier, replacement] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
    compiled = compiled.replaceAll(`from '${specifier}'`, `from "${replacement}"`);
  }

  return toDataUrl(compiled);
}

async function loadTypeScriptModule(relativePath) {
  return import(await transpileTypeScriptToDataUrl(relativePath));
}

const gameLoopModule = loadTypeScriptModule("src/features/division-engine/lib/game-loop.ts");
const problemGeneratorModule = loadTypeScriptModule(
  "src/features/division-engine/lib/problem-generator.ts",
);
const longDivisionSolverModule = loadTypeScriptModule(
  "src/features/division-engine/lib/long-division-solver.ts",
);
const stepValidationModule = loadTypeScriptModule(
  "src/features/division-engine/lib/step-validation.ts",
);
const rewardMilestoneModule = (async () => {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const imageCacheModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/gemini-image-cache.ts",
  );
  const milestoneModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/milestones.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
      "./gemini-image-cache": imageCacheModuleUrl,
    },
  );

  return import(milestoneModuleUrl);
})();

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createBaseState(overrides = {}) {
  const baseState = {
    activeProblem: null,
    steps: [],
    activeInputTarget: null,
    progress: {
      session: {
        sessionId: "session-test-loop",
        startedAt: "2026-02-17T10:00:00.000Z",
        solvedProblems: 0,
        attemptedProblems: 0,
      },
      lifetime: {
        totalProblemsSolved: 0,
        totalProblemsAttempted: 0,
        currentDifficultyLevel: 1,
        rewardsUnlocked: 0,
      },
    },
    unlockedRewards: [],
  };

  const overrideProgress = overrides.progress ?? {};
  const overrideSession = overrideProgress.session ?? {};
  const overrideLifetime = overrideProgress.lifetime ?? {};

  return {
    ...baseState,
    ...overrides,
    progress: {
      session: {
        ...baseState.progress.session,
        ...overrideSession,
      },
      lifetime: {
        ...baseState.progress.lifetime,
        ...overrideLifetime,
      },
    },
    steps: overrides.steps ?? baseState.steps,
    unlockedRewards: overrides.unlockedRewards ?? baseState.unlockedRewards,
  };
}

async function createOrchestrator(options = {}) {
  const [{ createDivisionGameLoopOrchestrator }, problemGenerator, solver, stepValidation, rewards] =
    await Promise.all([
      gameLoopModule,
      problemGeneratorModule,
      longDivisionSolverModule,
      stepValidationModule,
      rewardMilestoneModule,
    ]);

  return createDivisionGameLoopOrchestrator({
    dependencies: {
      generateDivisionProblemForSolvedCount: problemGenerator.generateDivisionProblemForSolvedCount,
      getDifficultyLevelForSolvedCount: problemGenerator.getDifficultyLevelForSolvedCount,
      solveLongDivision: solver.solveLongDivision,
      validateLongDivisionStepAnswer: stepValidation.validateLongDivisionStepAnswer,
      resolveRewardMilestones: (request) =>
        rewards.resolveRewardMilestones({
          ...request,
          now: options.now ?? (() => new Date("2026-02-17T12:00:00.000Z")),
        }),
      triggerNearMilestoneRewardPrefetch: options.triggerNearMilestoneRewardPrefetch,
    },
    random: options.random ?? createSeededRandom(20260217),
    remainderMode: options.remainderMode ?? "forbid",
  });
}

test("startNextProblem creates the active problem and increments attempted counters", async () => {
  const orchestrator = await createOrchestrator();
  const result = orchestrator.startNextProblem(createBaseState());

  assert.equal(result.state.activeProblem?.id, result.startedProblem.id);
  assert.ok(result.state.steps.length > 0);
  assert.equal(result.state.activeStepIndex, 0);
  assert.equal(result.state.revealedStepCount, 0);
  assert.equal(result.state.activeInputTarget?.stepId, result.state.steps[0].id);
  assert.equal(result.startedStepId, result.state.steps[0].id);
  assert.equal(result.state.progress.session.attemptedProblems, 1);
  assert.equal(result.state.progress.session.solvedProblems, 0);
  assert.equal(result.state.progress.lifetime.totalProblemsAttempted, 1);
  assert.equal(result.state.progress.lifetime.totalProblemsSolved, 0);
});

test("startNextProblem triggers near-milestone prefetch only for problems 3 and 4 of each 5-problem set", async () => {
  const prefetchCalls = [];
  const orchestrator = await createOrchestrator({
    triggerNearMilestoneRewardPrefetch: (request) => {
      prefetchCalls.push(request.totalProblemsSolved);
    },
  });

  const solvedCountSamples = [0, 1, 2, 3, 4, 5, 7, 8, 9];

  for (const totalProblemsSolved of solvedCountSamples) {
    orchestrator.startNextProblem(
      createBaseState({
        progress: {
          lifetime: {
            totalProblemsSolved,
            totalProblemsAttempted: totalProblemsSolved,
          },
        },
      }),
    );
  }

  assert.deepEqual(prefetchCalls, [2, 3, 7, 8]);
});

test("incorrect inline input keeps focus on the current active step", async () => {
  const orchestrator = await createOrchestrator();
  const started = orchestrator.startNextProblem(createBaseState());
  const activeStep = started.state.steps[started.state.activeStepIndex ?? 0];
  const wrongValue = activeStep.expectedValue === "999999" ? "888888" : "999999";

  const result = orchestrator.applyLiveStepInput({
    state: started.state,
    submittedValue: wrongValue,
  });

  assert.equal(result.validation.outcome, "incorrect");
  assert.equal(result.chainedToNextProblem, false);
  assert.equal(result.completedProblem, null);
  assert.deepEqual(result.newlyUnlockedRewards, []);
  assert.equal(result.nextProblem, null);
  assert.equal(result.state.activeStepIndex, started.state.activeStepIndex);
  assert.equal(result.state.revealedStepCount, started.state.revealedStepCount);
  assert.equal(result.state.activeInputTarget?.stepId, started.state.activeInputTarget?.stepId);
  assert.equal(result.state.progress.session.attemptedProblems, 1);
  assert.equal(result.state.progress.session.solvedProblems, 0);
});

test("correct inline input advances to the next step without changing solved counters", async () => {
  const orchestrator = await createOrchestrator();
  const started = orchestrator.startNextProblem(createBaseState());

  assert.ok(started.state.steps.length > 1);
  assert.equal(started.state.activeStepIndex, 0);

  const firstStep = started.state.steps[0];
  const result = orchestrator.applyLiveStepInput({
    state: started.state,
    submittedValue: firstStep.expectedValue,
  });

  assert.equal(result.validation.outcome, "correct");
  assert.equal(result.chainedToNextProblem, false);
  assert.equal(result.completedProblem, null);
  assert.deepEqual(result.newlyUnlockedRewards, []);
  assert.equal(result.state.activeStepIndex, 1);
  assert.equal(result.state.revealedStepCount, 1);
  assert.equal(result.state.activeInputTarget?.stepId, started.state.steps[1].id);
  assert.equal(result.state.progress.session.attemptedProblems, 1);
  assert.equal(result.state.progress.session.solvedProblems, 0);
  assert.equal(result.state.progress.lifetime.totalProblemsSolved, 0);
});

test("final correct input updates solved counters and auto-chains into the next problem", async () => {
  const orchestrator = await createOrchestrator({
    random: createSeededRandom(77),
    remainderMode: "forbid",
  });
  const started = orchestrator.startNextProblem(
    createBaseState({
      progress: {
        lifetime: {
          totalProblemsSolved: 4,
          totalProblemsAttempted: 4,
          currentDifficultyLevel: 1,
        },
      },
    }),
  );

  const completedProblemId = started.state.activeProblem?.id;
  const stepCount = started.state.steps.length;
  let state = started.state;
  let finalResult = null;

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    if (state.activeStepIndex === null) {
      assert.fail("Expected an active step while solving the current problem.");
    }

    const result = orchestrator.applyLiveStepInput({
      state,
      submittedValue: state.steps[state.activeStepIndex].expectedValue,
    });

    state = result.state;

    if (stepIndex < stepCount - 1) {
      assert.equal(result.chainedToNextProblem, false);
      assert.equal(result.completedProblem, null);
    } else {
      finalResult = result;
    }
  }

  assert.ok(finalResult);
  assert.equal(finalResult.validation.outcome, "complete");
  assert.equal(finalResult.chainedToNextProblem, true);
  assert.equal(finalResult.completedProblem?.problemId, completedProblemId);
  assert.equal(finalResult.completedProblem?.totalProblemsSolved, 5);
  assert.equal(finalResult.completedProblem?.solvedProblemsThisSession, 1);
  assert.equal(finalResult.newlyUnlockedRewards.length, 1);
  assert.equal(finalResult.newlyUnlockedRewards[0]?.dinosaurName, "Tyrannosaurus Rex");
  assert.equal(finalResult.newlyUnlockedRewards[0]?.milestoneSolvedCount, 5);
  assert.ok(finalResult.nextProblem);

  assert.equal(state.progress.session.solvedProblems, 1);
  assert.equal(state.progress.session.attemptedProblems, 2);
  assert.equal(state.progress.lifetime.totalProblemsSolved, 5);
  assert.equal(state.progress.lifetime.totalProblemsAttempted, 6);
  assert.equal(state.progress.lifetime.currentDifficultyLevel, 2);
  assert.equal(state.progress.lifetime.rewardsUnlocked, 1);
  assert.equal(state.unlockedRewards.length, 1);
  assert.equal(state.unlockedRewards[0]?.dinosaurName, "Tyrannosaurus Rex");
  assert.equal(state.activeStepIndex, 0);
  assert.equal(state.revealedStepCount, 0);
  assert.equal(state.activeProblem?.difficultyLevel, 2);
  assert.notEqual(state.activeProblem?.id, completedProblemId);
});

test("milestone unlocks catch up in deterministic order when earlier rewards were missed", async () => {
  const orchestrator = await createOrchestrator({
    random: createSeededRandom(2026),
    remainderMode: "forbid",
  });
  const started = orchestrator.startNextProblem(
    createBaseState({
      progress: {
        lifetime: {
          totalProblemsSolved: 9,
          totalProblemsAttempted: 9,
          currentDifficultyLevel: 2,
          rewardsUnlocked: 0,
        },
      },
      unlockedRewards: [],
    }),
  );

  let state = started.state;
  let finalResult = null;

  for (let stepIndex = 0; stepIndex < started.state.steps.length; stepIndex += 1) {
    if (state.activeStepIndex === null) {
      assert.fail("Expected an active step while solving the current problem.");
    }

    const result = orchestrator.applyLiveStepInput({
      state,
      submittedValue: state.steps[state.activeStepIndex].expectedValue,
    });
    state = result.state;

    if (stepIndex === started.state.steps.length - 1) {
      finalResult = result;
    }
  }

  assert.ok(finalResult);
  assert.equal(finalResult.validation.outcome, "complete");
  assert.equal(finalResult.completedProblem?.totalProblemsSolved, 10);
  assert.deepEqual(
    finalResult.newlyUnlockedRewards.map((reward) => reward.dinosaurName),
    ["Tyrannosaurus Rex", "Velociraptor"],
  );
  assert.deepEqual(
    state.unlockedRewards.map((reward) => reward.dinosaurName),
    ["Tyrannosaurus Rex", "Velociraptor"],
  );
  assert.deepEqual(
    state.unlockedRewards.map((reward) => reward.milestoneSolvedCount),
    [5, 10],
  );
  assert.equal(state.progress.lifetime.rewardsUnlocked, 2);
});

test("applyLiveStepInput requires an active in-progress problem", async () => {
  const orchestrator = await createOrchestrator();

  assert.throws(
    () =>
      orchestrator.applyLiveStepInput({
        state: createBaseState(),
        submittedValue: "1",
      }),
    /An active problem is required/,
  );
});
