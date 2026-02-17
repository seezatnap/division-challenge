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

function createSaveFile(overrides = {}) {
  return {
    schemaVersion: 1,
    playerName: "Raptor Scout",
    totalProblemsSolved: 28,
    currentDifficultyLevel: 4,
    progress: {
      session: {
        sessionId: "session-previous",
        startedAt: "2026-02-14T12:00:00.000Z",
        solvedProblems: 9,
        attemptedProblems: 11,
      },
      lifetime: {
        totalProblemsSolved: 26,
        totalProblemsAttempted: 24,
        currentDifficultyLevel: 3,
        rewardsUnlocked: 1,
      },
    },
    unlockedDinosaurs: [
      {
        rewardId: "reward-1",
        dinosaurName: "Tyrannosaurus Rex",
        imagePath: "/rewards/rex.png",
        earnedAt: "2026-02-12T08:30:00.000Z",
        milestoneSolvedCount: 5,
      },
      {
        rewardId: "reward-2",
        dinosaurName: "Velociraptor",
        imagePath: "/rewards/raptor.png",
        earnedAt: "2026-02-14T09:10:00.000Z",
        milestoneSolvedCount: 10,
      },
    ],
    sessionHistory: [
      {
        sessionId: "session-1",
        startedAt: "2026-02-12T08:00:00.000Z",
        endedAt: "2026-02-12T08:35:00.000Z",
        solvedProblems: 12,
        attemptedProblems: 15,
      },
    ],
    updatedAt: "2026-02-17T09:15:00.000Z",
    ...overrides,
  };
}

const gameStartFlowModule = loadTypeScriptModule("src/features/persistence/lib/game-start-flow.ts");

test("createInMemoryGameSession initializes a fresh new-game session", async () => {
  const { createInMemoryGameSession } = await gameStartFlowModule;

  const session = createInMemoryGameSession({
    playerName: "  Amber   Ranger ",
    mode: "start-new",
    clock: () => new Date("2026-02-17T12:00:00.000Z"),
    createSessionId: () => "session-new-1",
  });

  assert.equal(session.playerName, "Amber Ranger");
  assert.equal(session.startedAt, "2026-02-17T12:00:00.000Z");
  assert.equal(session.startMode, "start-new");
  assert.equal(session.sourceSaveUpdatedAt, null);
  assert.deepEqual(session.sessionHistory, []);
  assert.deepEqual(session.gameState, {
    activeProblem: null,
    steps: [],
    activeInputTarget: null,
    progress: {
      session: {
        sessionId: "session-new-1",
        startedAt: "2026-02-17T12:00:00.000Z",
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
  });
});

test("createInMemoryGameSession loads save-backed lifetime state while opening a new active session", async () => {
  const { createInMemoryGameSession } = await gameStartFlowModule;
  const saveFile = createSaveFile();

  const session = createInMemoryGameSession({
    playerName: "Raptor Scout",
    mode: "load-existing-save",
    saveFile,
    clock: () => new Date("2026-02-17T13:45:00.000Z"),
    createSessionId: () => "session-load-1",
  });

  assert.equal(session.playerName, "Raptor Scout");
  assert.equal(session.startMode, "load-existing-save");
  assert.equal(session.sourceSaveUpdatedAt, "2026-02-17T09:15:00.000Z");
  assert.deepEqual(session.gameState.progress.session, {
    sessionId: "session-load-1",
    startedAt: "2026-02-17T13:45:00.000Z",
    solvedProblems: 0,
    attemptedProblems: 0,
  });
  assert.deepEqual(session.gameState.progress.lifetime, {
    totalProblemsSolved: 28,
    totalProblemsAttempted: 28,
    currentDifficultyLevel: 4,
    rewardsUnlocked: 2,
  });
  assert.equal(session.gameState.unlockedRewards.length, 2);
  assert.notStrictEqual(session.gameState.unlockedRewards, saveFile.unlockedDinosaurs);
  assert.equal(session.sessionHistory.length, 1);
  assert.notStrictEqual(session.sessionHistory, saveFile.sessionHistory);
});

test("buildGameStartOptions toggles load-existing availability", async () => {
  const { buildGameStartOptions } = await gameStartFlowModule;

  const withoutSave = buildGameStartOptions(false);
  const withSave = buildGameStartOptions(true);
  const loadWithoutSave = withoutSave.find((option) => option.mode === "load-existing-save");
  const loadWithSave = withSave.find((option) => option.mode === "load-existing-save");

  assert.equal(loadWithoutSave?.disabled, true);
  assert.equal(loadWithSave?.disabled, false);
});

test("createInMemoryGameSession validates required start-flow inputs", async () => {
  const { createInMemoryGameSession } = await gameStartFlowModule;

  assert.throws(
    () =>
      createInMemoryGameSession({
        playerName: "   ",
        mode: "start-new",
      }),
    /playerName must include at least one non-space character/,
  );

  assert.throws(
    () =>
      createInMemoryGameSession({
        playerName: "Raptor Scout",
        mode: "load-existing-save",
      }),
    /saveFile is required/,
  );

  assert.throws(
    () =>
      createInMemoryGameSession({
        playerName: "Amber Ranger",
        mode: "load-existing-save",
        saveFile: createSaveFile(),
      }),
    /playerName must match the selected save file/,
  );
});
