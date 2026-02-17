import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
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

async function loadTypeScriptModule(relativePath, replacements = {}) {
  return import(await transpileTypeScriptToDataUrl(relativePath, replacements));
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createDeferred() {
  let resolve = () => {};
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

function createGeminiImage(dinosaurName) {
  return {
    dinosaurName,
    prompt: `cinematic portrait of ${dinosaurName}`,
    model: "gemini-2.0-flash-exp",
    mimeType: "image/png",
    imageBase64: Buffer.from(`${dinosaurName}-reward-bytes`).toString("base64"),
  };
}

function toPersistableGameState(loopState) {
  return {
    activeProblem: loopState.activeProblem ? { ...loopState.activeProblem } : null,
    steps: loopState.steps.map((step) => ({ ...step })),
    activeInputTarget: loopState.activeInputTarget ? { ...loopState.activeInputTarget } : null,
    progress: {
      session: { ...loopState.progress.session },
      lifetime: { ...loopState.progress.lifetime },
    },
    unlockedRewards: loopState.unlockedRewards.map((reward) => ({ ...reward })),
  };
}

function createSessionWithGameState(baseSession, gameState) {
  return {
    ...baseSession,
    sessionHistory: baseSession.sessionHistory.map((entry) => ({ ...entry })),
    gameState: toPersistableGameState(gameState),
  };
}

async function flushEventLoopTurn() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function loadJourneyModules() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const geminiImageCacheModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/gemini-image-cache.ts",
  );
  const milestonesModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/milestones.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
      "./gemini-image-cache": geminiImageCacheModuleUrl,
    },
  );
  const prefetchModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/prefetch.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
      "./gemini-image-cache": geminiImageCacheModuleUrl,
    },
  );

  const [
    gameLoop,
    gameStartFlow,
    problemGenerator,
    longDivisionSolver,
    stepValidation,
    milestones,
    prefetch,
    earnedRewardReveal,
    gallery,
    geminiImageCache,
    persistence,
  ] = await Promise.all([
    loadTypeScriptModule("src/features/division-engine/lib/game-loop.ts"),
    loadTypeScriptModule("src/features/persistence/lib/game-start-flow.ts"),
    loadTypeScriptModule("src/features/division-engine/lib/problem-generator.ts"),
    loadTypeScriptModule("src/features/division-engine/lib/long-division-solver.ts"),
    loadTypeScriptModule("src/features/division-engine/lib/step-validation.ts"),
    import(milestonesModuleUrl),
    import(prefetchModuleUrl),
    loadTypeScriptModule("src/features/rewards/lib/earned-reward-reveal.ts"),
    loadTypeScriptModule("src/features/gallery/lib/dino-gallery.ts"),
    import(geminiImageCacheModuleUrl),
    loadTypeScriptModule("src/features/persistence/lib/file-system-save-load.ts"),
  ]);

  return {
    gameLoop,
    gameStartFlow,
    problemGenerator,
    longDivisionSolver,
    stepValidation,
    milestones,
    prefetch,
    earnedRewardReveal,
    gallery,
    geminiImageCache,
    persistence,
  };
}

const journeyModules = loadJourneyModules();

test("smoke: full player journey with v1 reward-ordering/retry and save-race regression guards", async () => {
  const modules = await journeyModules;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-player-journey-smoke-"));

  const prefetchGenerationGate = createDeferred();
  let prefetchGenerationStarted = false;
  let generateImageCallCount = 0;
  const prefetchStatuses = [];
  const newlyUnlockedRewards = [];
  let staleGameStateAtSolvedFour = null;
  let retryAttemptCount = 0;

  const generateImage = async ({ dinosaurName }) => {
    prefetchGenerationStarted = true;
    generateImageCallCount += 1;
    await prefetchGenerationGate.promise;
    return createGeminiImage(dinosaurName);
  };

  const orchestrator = modules.gameLoop.createDivisionGameLoopOrchestrator({
    dependencies: {
      generateDivisionProblemForSolvedCount:
        modules.problemGenerator.generateDivisionProblemForSolvedCount,
      getDifficultyLevelForSolvedCount: modules.problemGenerator.getDifficultyLevelForSolvedCount,
      solveLongDivision: modules.longDivisionSolver.solveLongDivision,
      validateLongDivisionStepAnswer: modules.stepValidation.validateLongDivisionStepAnswer,
      resolveRewardMilestones: (request) =>
        modules.milestones.resolveRewardMilestones({
          ...request,
          now: () => new Date("2026-02-17T10:20:00.000Z"),
        }),
      triggerNearMilestoneRewardPrefetch: async (request) => {
        const result = await modules.prefetch.triggerNearMilestoneRewardPrefetch({
          totalProblemsSolved: request.totalProblemsSolved,
          generateImage,
          cacheOptions: {
            outputDirectory: cacheDirectory,
          },
        });

        prefetchStatuses.push({
          totalProblemsSolved: request.totalProblemsSolved,
          status: result.status,
        });

        return result;
      },
    },
    random: createSeededRandom(20260217),
    remainderMode: "forbid",
  });

  const newGameSession = modules.gameStartFlow.createInMemoryGameSession({
    playerName: "Rex",
    mode: "start-new",
    clock: () => new Date("2026-02-17T10:00:00.000Z"),
    createSessionId: () => "session-smoke-live",
  });

  assert.equal(newGameSession.startMode, "start-new");
  assert.equal(newGameSession.gameState.progress.lifetime.totalProblemsSolved, 0);
  assert.equal(newGameSession.gameState.unlockedRewards.length, 0);

  let state = orchestrator.initializeState(newGameSession.gameState);
  state = orchestrator.startNextProblem(state).state;

  while (state.progress.lifetime.totalProblemsSolved < 5) {
    const activeProblemId = state.activeProblem?.id;
    const isFifthProblem = state.progress.lifetime.totalProblemsSolved === 4;
    let injectedRetryFailure = false;

    while (state.activeProblem?.id === activeProblemId) {
      if (state.activeStepIndex === null) {
        assert.fail("Expected an active step while solving the current problem.");
      }

      const expectedValue = state.steps[state.activeStepIndex].expectedValue;

      if (isFifthProblem && !injectedRetryFailure) {
        const wrongValue = expectedValue === "999999" ? "888888" : "999999";
        const retryResult = orchestrator.applyLiveStepInput({
          state,
          submittedValue: wrongValue,
        });
        retryAttemptCount += 1;
        injectedRetryFailure = true;

        assert.equal(retryResult.validation.outcome, "incorrect");
        assert.equal(retryResult.completedProblem, null);
        assert.equal(retryResult.newlyUnlockedRewards.length, 0);
        assert.equal(retryResult.state.progress.lifetime.totalProblemsSolved, 4);
        state = retryResult.state;
        continue;
      }

      const result = orchestrator.applyLiveStepInput({
        state,
        submittedValue: state.steps[state.activeStepIndex].expectedValue,
      });
      state = result.state;

      if (result.completedProblem?.totalProblemsSolved === 4 && !staleGameStateAtSolvedFour) {
        staleGameStateAtSolvedFour = toPersistableGameState(result.state);
      }

      if (result.newlyUnlockedRewards.length > 0) {
        newlyUnlockedRewards.push(...result.newlyUnlockedRewards.map((reward) => ({ ...reward })));
      }
    }
  }

  for (let attempt = 0; attempt < 20 && prefetchStatuses.length < 2; attempt += 1) {
    await flushEventLoopTurn();
  }

  assert.equal(retryAttemptCount, 1);
  assert.equal(state.progress.lifetime.totalProblemsSolved, 5);
  assert.equal(state.progress.lifetime.rewardsUnlocked, 1);
  assert.equal(state.unlockedRewards.length, 1);
  assert.deepEqual(
    newlyUnlockedRewards.map((reward) => reward.rewardId),
    ["reward-1"],
  );
  assert.deepEqual(
    state.unlockedRewards.map((reward) => reward.rewardId),
    ["reward-1"],
  );
  assert.ok(staleGameStateAtSolvedFour, "Expected solved-4 snapshot for save-race regression.");

  prefetchStatuses.sort((left, right) => left.totalProblemsSolved - right.totalProblemsSolved);
  assert.deepEqual(prefetchStatuses, [
    { totalProblemsSolved: 2, status: "prefetch-started" },
    { totalProblemsSolved: 3, status: "prefetch-already-in-flight" },
  ]);
  assert.equal(prefetchGenerationStarted, true);

  const [earnedReward] = newlyUnlockedRewards;
  const statusBeforeReveal = await modules.geminiImageCache.getGeminiRewardImageGenerationStatus(
    earnedReward.dinosaurName,
    {
      outputDirectory: cacheDirectory,
    },
  );
  assert.equal(statusBeforeReveal.status, "generating");

  let revealWaitCount = 0;
  const revealResult = await modules.earnedRewardReveal.pollEarnedRewardImageUntilReady({
    dinosaurName: earnedReward.dinosaurName,
    pollIntervalMs: 5,
    maxPollAttempts: 5,
    pollStatus: (dinosaurName) =>
      modules.geminiImageCache.getGeminiRewardImageGenerationStatus(dinosaurName, {
        outputDirectory: cacheDirectory,
      }),
    wait: async () => {
      revealWaitCount += 1;
      if (revealWaitCount === 1) {
        prefetchGenerationGate.resolve();
      }
    },
  });

  assert.equal(revealResult.outcome, "revealed");
  assert.equal(revealResult.snapshot.dinosaurName, earnedReward.dinosaurName);
  assert.equal(revealResult.snapshot.imagePath, earnedReward.imagePath);
  assert.equal(generateImageCallCount, 1);

  const galleryReward = modules.gallery.createGalleryRewardFromUnlock({
    dinosaurName: earnedReward.dinosaurName,
    imagePath: revealResult.snapshot.imagePath ?? earnedReward.imagePath,
    milestoneSolvedCount: earnedReward.milestoneSolvedCount,
    earnedAt: earnedReward.earnedAt,
  });
  const galleryMergedRewards = modules.gallery.mergeUnlockedRewardsForGallery([], [galleryReward]);
  const galleryEventDetail =
    modules.gallery.createDinoGalleryRewardsUpdatedEventDetail(galleryMergedRewards);
  const refreshedGalleryRewards = modules.gallery.mergeUnlockedRewardsForGallery(
    [],
    modules.gallery.readUnlockedRewardsFromGalleryEvent({ detail: galleryEventDetail }),
  );

  assert.deepEqual(
    refreshedGalleryRewards.map((reward) => reward.rewardId),
    ["reward-1"],
  );
  assert.equal(refreshedGalleryRewards[0]?.dinosaurName, earnedReward.dinosaurName);

  const staleSession = createSessionWithGameState(newGameSession, staleGameStateAtSolvedFour);
  const latestSession = createSessionWithGameState(newGameSession, state);

  const firstWriteGate = createDeferred();
  let persistedJson = "";
  let createWritableCalls = 0;
  const writeOrder = [];

  const saveHandle = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return persistedJson;
        },
      };
    },
    async createWritable() {
      createWritableCalls += 1;
      const writeNumber = createWritableCalls;
      let stagedJson = "";

      return {
        async write(content) {
          writeOrder.push(`write-start-${writeNumber}`);
          stagedJson = content;

          if (writeNumber === 1) {
            await firstWriteGate.promise;
          }
        },
        async close() {
          writeOrder.push(`write-close-${writeNumber}`);
          persistedJson = stagedJson;
        },
        async abort() {
          writeOrder.push(`write-abort-${writeNumber}`);
        },
      };
    },
  };

  const firstSavePromise = modules.persistence.saveSessionToFileSystem({
    session: staleSession,
    handle: saveHandle,
    clock: () => new Date("2026-02-17T10:25:00.000Z"),
  });
  await flushEventLoopTurn();

  const secondSavePromise = modules.persistence.saveSessionToFileSystem({
    session: latestSession,
    handle: saveHandle,
    clock: () => new Date("2026-02-17T10:26:00.000Z"),
  });

  firstWriteGate.resolve();

  const [firstSaveResult, secondSaveResult] = await Promise.all([
    firstSavePromise,
    secondSavePromise,
  ]);
  const persistedSaveFile = JSON.parse(persistedJson);

  assert.equal(firstSaveResult.saveFile.totalProblemsSolved, 4);
  assert.equal(secondSaveResult.saveFile.totalProblemsSolved, 5);
  assert.equal(persistedSaveFile.totalProblemsSolved, 5);
  assert.equal(persistedSaveFile.unlockedDinosaurs.length, 1);
  assert.equal(persistedSaveFile.unlockedDinosaurs[0]?.rewardId, "reward-1");
  assert.deepEqual(writeOrder, [
    "write-start-1",
    "write-close-1",
    "write-start-2",
    "write-close-2",
  ]);

  const loadedSave = await modules.persistence.loadSaveFromFileSystem({
    fileSystem: {
      async showOpenFilePicker() {
        return [saveHandle];
      },
      async showSaveFilePicker() {
        return saveHandle;
      },
    },
  });

  assert.equal(loadedSave.fileName, "rex-save.json");
  assert.equal(loadedSave.saveFile.totalProblemsSolved, 5);
  assert.equal(loadedSave.saveFile.unlockedDinosaurs.length, 1);
  assert.equal(loadedSave.saveFile.unlockedDinosaurs[0]?.rewardId, "reward-1");

  const restoredSession = modules.gameStartFlow.createInMemoryGameSession({
    playerName: "Rex",
    mode: "load-existing-save",
    saveFile: loadedSave.saveFile,
    clock: () => new Date("2026-02-17T10:30:00.000Z"),
    createSessionId: () => "session-smoke-restored",
  });

  assert.equal(restoredSession.startMode, "load-existing-save");
  assert.equal(restoredSession.gameState.progress.lifetime.totalProblemsSolved, 5);
  assert.equal(restoredSession.gameState.unlockedRewards.length, 1);
  assert.equal(restoredSession.gameState.progress.session.sessionId, "session-smoke-restored");
  assert.equal(restoredSession.gameState.progress.session.solvedProblems, 0);
  assert.equal(restoredSession.gameState.progress.session.attemptedProblems, 0);
});
