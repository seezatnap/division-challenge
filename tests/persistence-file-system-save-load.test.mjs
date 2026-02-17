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

function createInMemorySession(overrides = {}) {
  return {
    playerName: "Rex",
    startedAt: "2026-02-17T10:00:00.000Z",
    startMode: "start-new",
    sourceSaveUpdatedAt: null,
    sessionHistory: [
      {
        sessionId: "session-archive-1",
        startedAt: "2026-02-16T09:00:00.000Z",
        endedAt: "2026-02-16T09:40:00.000Z",
        solvedProblems: 4,
        attemptedProblems: 5,
      },
    ],
    gameState: {
      activeProblem: null,
      steps: [],
      activeInputTarget: null,
      progress: {
        session: {
          sessionId: "session-live-1",
          startedAt: "2026-02-17T10:00:00.000Z",
          solvedProblems: 7,
          attemptedProblems: 9,
        },
        lifetime: {
          totalProblemsSolved: 27,
          totalProblemsAttempted: 32,
          currentDifficultyLevel: 4,
          rewardsUnlocked: 2,
        },
      },
      unlockedRewards: [
        {
          rewardId: "reward-rex-1",
          dinosaurName: "Tyrannosaurus Rex",
          imagePath: "/rewards/rex.png",
          earnedAt: "2026-02-12T09:15:00.000Z",
          milestoneSolvedCount: 5,
        },
        {
          rewardId: "reward-raptor-2",
          dinosaurName: "Velociraptor",
          imagePath: "/rewards/raptor.png",
          earnedAt: "2026-02-14T12:40:00.000Z",
          milestoneSolvedCount: 10,
        },
      ],
    },
    ...overrides,
  };
}

function createSessionWithLifetimeProgress({
  totalProblemsSolved,
  totalProblemsAttempted = totalProblemsSolved,
  currentDifficultyLevel = 4,
  unlockedRewards,
}) {
  const baseSession = createInMemorySession();
  const mergedUnlockedRewards = unlockedRewards ?? baseSession.gameState.unlockedRewards;

  return {
    ...baseSession,
    gameState: {
      ...baseSession.gameState,
      progress: {
        session: {
          ...baseSession.gameState.progress.session,
          solvedProblems: Math.max(
            baseSession.gameState.progress.session.solvedProblems,
            totalProblemsSolved,
          ),
          attemptedProblems: Math.max(
            baseSession.gameState.progress.session.attemptedProblems,
            totalProblemsAttempted,
          ),
        },
        lifetime: {
          ...baseSession.gameState.progress.lifetime,
          totalProblemsSolved,
          totalProblemsAttempted,
          currentDifficultyLevel,
          rewardsUnlocked: mergedUnlockedRewards.length,
        },
      },
      unlockedRewards: mergedUnlockedRewards.map((reward) => ({ ...reward })),
    },
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

const persistenceModule = loadTypeScriptModule(
  "src/features/persistence/lib/file-system-save-load.ts",
);
const gameStartFlowModule = loadTypeScriptModule(
  "src/features/persistence/lib/game-start-flow.ts",
);

test("buildPlayerSaveFileName creates player-named JSON files", async () => {
  const { buildPlayerSaveFileName } = await persistenceModule;

  assert.equal(buildPlayerSaveFileName("Rex"), "rex-save.json");
  assert.equal(buildPlayerSaveFileName("Raptor Scout"), "raptor-scout-save.json");
  assert.equal(buildPlayerSaveFileName("  Blue   Team  "), "blue-team-save.json");
});

test("createDinoDivisionSavePayload emits all required save fields", async () => {
  const { createDinoDivisionSavePayload, REQUIRED_SAVE_FILE_FIELDS } = await persistenceModule;

  const payload = createDinoDivisionSavePayload(
    createInMemorySession(),
    () => new Date("2026-02-17T11:30:00.000Z"),
  );

  assert.deepEqual(Object.keys(payload), [...REQUIRED_SAVE_FILE_FIELDS]);
  assert.equal(payload.playerName, "Rex");
  assert.equal(payload.updatedAt, "2026-02-17T11:30:00.000Z");
  assert.equal(payload.unlockedDinosaurs[0].dinosaurName, "Tyrannosaurus Rex");
  assert.equal(payload.unlockedDinosaurs[0].imagePath, "/rewards/rex.png");
  assert.equal(payload.unlockedDinosaurs[0].earnedAt, "2026-02-12T09:15:00.000Z");

  const currentSessionHistory = payload.sessionHistory.find(
    (entry) => entry.sessionId === "session-live-1",
  );
  assert.deepEqual(currentSessionHistory, {
    sessionId: "session-live-1",
    startedAt: "2026-02-17T10:00:00.000Z",
    endedAt: null,
    solvedProblems: 7,
    attemptedProblems: 9,
  });
});

test("saveSessionToFileSystem requests permission and writes JSON to a player-named file", async () => {
  const { saveSessionToFileSystem } = await persistenceModule;

  const permissionLog = [];
  let suggestedName = null;
  let writtenJson = "";
  let didClose = false;

  const handle = {
    name: "rex-save.json",
    async queryPermission({ mode }) {
      permissionLog.push(`query:${mode}`);
      return "prompt";
    },
    async requestPermission({ mode }) {
      permissionLog.push(`request:${mode}`);
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return writtenJson;
        },
      };
    },
    async createWritable() {
      return {
        async write(content) {
          writtenJson += content;
        },
        async close() {
          didClose = true;
        },
      };
    },
  };

  const saveResult = await saveSessionToFileSystem({
    session: createInMemorySession(),
    clock: () => new Date("2026-02-17T12:00:00.000Z"),
    fileSystem: {
      async showOpenFilePicker() {
        return [handle];
      },
      async showSaveFilePicker(options = {}) {
        suggestedName = options.suggestedName ?? null;
        return handle;
      },
    },
  });

  assert.ok(saveResult);
  assert.equal(saveResult.fileName, "rex-save.json");
  assert.equal(suggestedName, "rex-save.json");
  assert.deepEqual(permissionLog, ["query:readwrite", "request:readwrite"]);
  assert.equal(didClose, true);

  const parsedSave = JSON.parse(writtenJson);
  assert.equal(parsedSave.playerName, "Rex");
  assert.equal(parsedSave.updatedAt, "2026-02-17T12:00:00.000Z");
});

test("saveSessionToFileSystem and loadSaveFromFileSystem reject when permissions are denied", async () => {
  const { createDinoDivisionSavePayload, loadSaveFromFileSystem, saveSessionToFileSystem } =
    await persistenceModule;
  const permissionLog = [];
  let saveCreateWritableCalls = 0;

  const saveHandle = {
    name: "rex-save.json",
    async queryPermission({ mode }) {
      permissionLog.push(`save-query:${mode}`);
      return "prompt";
    },
    async requestPermission({ mode }) {
      permissionLog.push(`save-request:${mode}`);
      return "denied";
    },
    async getFile() {
      return {
        async text() {
          return "";
        },
      };
    },
    async createWritable() {
      saveCreateWritableCalls += 1;
      return {
        async write() {},
        async close() {},
      };
    },
  };

  await assert.rejects(
    () =>
      saveSessionToFileSystem({
        session: createInMemorySession(),
        handle: saveHandle,
      }),
    /Permission denied: unable to save game progress/,
  );
  assert.equal(saveCreateWritableCalls, 0);

  const jsonPayload = JSON.stringify(
    createDinoDivisionSavePayload(
      createInMemorySession(),
      () => new Date("2026-02-17T12:01:00.000Z"),
    ),
  );
  const loadHandle = {
    name: "rex-save.json",
    async queryPermission({ mode }) {
      permissionLog.push(`load-query:${mode}`);
      return "prompt";
    },
    async requestPermission({ mode }) {
      permissionLog.push(`load-request:${mode}`);
      return "denied";
    },
    async getFile() {
      return {
        async text() {
          return jsonPayload;
        },
      };
    },
    async createWritable() {
      return {
        async write() {},
        async close() {},
      };
    },
  };

  await assert.rejects(
    () =>
      loadSaveFromFileSystem({
        fileSystem: {
          async showOpenFilePicker() {
            return [loadHandle];
          },
          async showSaveFilePicker() {
            return loadHandle;
          },
        },
      }),
    /Permission denied: unable to load a save file/,
  );

  assert.deepEqual(permissionLog, [
    "save-query:readwrite",
    "save-request:readwrite",
    "load-query:read",
    "load-request:read",
  ]);
});

test("saveSessionToFileSystem queues concurrent writes for the same file handle", async () => {
  const { saveSessionToFileSystem } = await persistenceModule;

  const writeOrder = [];
  const firstWriteGate = createDeferred();
  let committedJson = "";
  let writableCalls = 0;

  const handle = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return committedJson;
        },
      };
    },
    async createWritable() {
      writableCalls += 1;
      const writeNumber = writableCalls;
      let stagedJson = "";

      return {
        async write(content) {
          writeOrder.push(`write-start-${writeNumber}`);
          stagedJson = content;

          if (writeNumber === 1) {
            await firstWriteGate.promise;
          }

          writeOrder.push(`write-end-${writeNumber}`);
        },
        async close() {
          writeOrder.push(`close-${writeNumber}`);
          committedJson = stagedJson;
        },
      };
    },
  };

  const firstSave = saveSessionToFileSystem({
    session: createInMemorySession(),
    handle,
    clock: () => new Date("2026-02-17T12:05:00.000Z"),
  });
  const secondSave = saveSessionToFileSystem({
    session: createSessionWithLifetimeProgress({
      totalProblemsSolved: 28,
      totalProblemsAttempted: 33,
    }),
    handle,
    clock: () => new Date("2026-02-17T12:06:00.000Z"),
  });

  firstWriteGate.resolve();
  await Promise.all([firstSave, secondSave]);

  assert.deepEqual(writeOrder, [
    "write-start-1",
    "write-end-1",
    "close-1",
    "write-start-2",
    "write-end-2",
    "close-2",
  ]);
});

test("saveSessionToFileSystem merges stale incoming snapshots with latest on-disk progress", async () => {
  const { createDinoDivisionSavePayload, saveSessionToFileSystem } = await persistenceModule;
  const baselineRewards = createInMemorySession().gameState.unlockedRewards;
  const [rewardOne, rewardTwo] = baselineRewards;

  let committedJson = JSON.stringify(
    createDinoDivisionSavePayload(
      createSessionWithLifetimeProgress({
        totalProblemsSolved: 10,
        totalProblemsAttempted: 12,
        unlockedRewards: [rewardOne],
      }),
      () => new Date("2026-02-17T12:10:00.000Z"),
    ),
  );

  const handle = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return committedJson;
        },
      };
    },
    async createWritable() {
      let stagedJson = committedJson;

      return {
        async write(content) {
          stagedJson = content;
        },
        async close() {
          committedJson = stagedJson;
        },
        async abort() {
          stagedJson = committedJson;
        },
      };
    },
  };

  const solveProgressSnapshot = createSessionWithLifetimeProgress({
    totalProblemsSolved: 11,
    totalProblemsAttempted: 13,
    unlockedRewards: [rewardOne],
  });
  const rewardUnlockSnapshot = createSessionWithLifetimeProgress({
    totalProblemsSolved: 10,
    totalProblemsAttempted: 12,
    unlockedRewards: [rewardOne, rewardTwo],
  });

  await Promise.all([
    saveSessionToFileSystem({
      session: solveProgressSnapshot,
      handle,
      clock: () => new Date("2026-02-17T12:11:00.000Z"),
    }),
    saveSessionToFileSystem({
      session: rewardUnlockSnapshot,
      handle,
      clock: () => new Date("2026-02-17T12:12:00.000Z"),
    }),
  ]);

  const mergedSave = JSON.parse(committedJson);
  assert.equal(mergedSave.totalProblemsSolved, 11);
  assert.equal(mergedSave.progress.lifetime.totalProblemsSolved, 11);
  assert.equal(mergedSave.unlockedDinosaurs.length, 2);
  assert.equal(mergedSave.progress.lifetime.rewardsUnlocked, 2);
});

test("saveSessionToFileSystem preserves a newly loaded active session when save payload session IDs differ", async () => {
  const { createDinoDivisionSavePayload, saveSessionToFileSystem } = await persistenceModule;
  const { createInMemoryGameSession } = await gameStartFlowModule;

  const existingSaveFile = createDinoDivisionSavePayload(
    createSessionWithLifetimeProgress({
      totalProblemsSolved: 31,
      totalProblemsAttempted: 35,
    }),
    () => new Date("2026-02-17T12:15:00.000Z"),
  );
  let committedJson = JSON.stringify(existingSaveFile);

  const handle = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return committedJson;
        },
      };
    },
    async createWritable() {
      let stagedJson = committedJson;

      return {
        async write(content) {
          stagedJson = content;
        },
        async close() {
          committedJson = stagedJson;
        },
        async abort() {
          stagedJson = committedJson;
        },
      };
    },
  };

  const loadedSession = createInMemoryGameSession({
    playerName: existingSaveFile.playerName,
    mode: "load-existing-save",
    saveFile: existingSaveFile,
    clock: () => new Date("2026-02-17T13:45:00.000Z"),
    createSessionId: () => "session-load-2",
  });

  const saveResult = await saveSessionToFileSystem({
    session: loadedSession,
    handle,
    clock: () => new Date("2026-02-17T13:46:00.000Z"),
  });

  assert.ok(saveResult);
  assert.equal(saveResult.saveFile.progress.session.sessionId, "session-load-2");
  assert.equal(saveResult.saveFile.progress.session.solvedProblems, 0);
  assert.equal(saveResult.saveFile.progress.session.attemptedProblems, 0);
  assert.equal(saveResult.saveFile.totalProblemsSolved, 31);
  assert.equal(saveResult.saveFile.progress.lifetime.totalProblemsSolved, 31);

  const persistedSave = JSON.parse(committedJson);
  assert.equal(persistedSave.progress.session.sessionId, "session-load-2");
  assert.equal(persistedSave.progress.session.startedAt, "2026-02-17T13:45:00.000Z");
  assert.equal(persistedSave.progress.session.solvedProblems, 0);
  assert.equal(persistedSave.progress.session.attemptedProblems, 0);

  const newlyLoadedSessionHistoryEntry = persistedSave.sessionHistory.find(
    (entry) => entry.sessionId === "session-load-2",
  );
  assert.deepEqual(newlyLoadedSessionHistoryEntry, {
    sessionId: "session-load-2",
    startedAt: "2026-02-17T13:45:00.000Z",
    endedAt: null,
    solvedProblems: 0,
    attemptedProblems: 0,
  });

  const previousSessionHistoryEntry = persistedSave.sessionHistory.find(
    (entry) => entry.sessionId === "session-live-1",
  );
  assert.ok(previousSessionHistoryEntry);
  assert.equal(previousSessionHistoryEntry.solvedProblems, 31);
  assert.equal(previousSessionHistoryEntry.attemptedProblems, 35);
});

test("saveSessionToFileSystem uses atomic write flow and aborts failed writes without committing", async () => {
  const { createDinoDivisionSavePayload, saveSessionToFileSystem } = await persistenceModule;

  const existingSave = createDinoDivisionSavePayload(
    createInMemorySession(),
    () => new Date("2026-02-17T12:20:00.000Z"),
  );
  const existingJson = JSON.stringify(existingSave);
  let committedJson = existingJson;
  let abortCalls = 0;
  let writableOptionsSnapshot = null;

  const handle = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return committedJson;
        },
      };
    },
    async createWritable(options) {
      writableOptionsSnapshot = options ?? null;

      return {
        async write() {
          throw new Error("disk write failed");
        },
        async close() {
          committedJson = "unexpected-close";
        },
        async abort() {
          abortCalls += 1;
        },
      };
    },
  };

  await assert.rejects(
    () =>
      saveSessionToFileSystem({
        session: createSessionWithLifetimeProgress({
          totalProblemsSolved: 35,
          totalProblemsAttempted: 39,
          unlockedRewards: createInMemorySession().gameState.unlockedRewards,
        }),
        handle,
        clock: () => new Date("2026-02-17T12:21:00.000Z"),
      }),
    /disk write failed/,
  );

  assert.equal(abortCalls, 1);
  assert.deepEqual(writableOptionsSnapshot, { keepExistingData: false });
  assert.equal(committedJson, existingJson);
});

test("saveSessionToFileSystem write queue remains isolated per handle and recovers after failures", async () => {
  const { saveSessionToFileSystem } = await persistenceModule;

  const handleOneGate = createDeferred();
  let handleOneWriteStarted = false;
  let handleOneCommittedJson = "";
  const handleOne = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return handleOneCommittedJson;
        },
      };
    },
    async createWritable() {
      let stagedJson = "";
      return {
        async write(content) {
          handleOneWriteStarted = true;
          stagedJson = content;
          await handleOneGate.promise;
        },
        async close() {
          handleOneCommittedJson = stagedJson;
        },
      };
    },
  };

  let handleTwoCommittedJson = "";
  let handleTwoCreateWritableCalls = 0;
  const handleTwo = {
    name: "rex-save-two.json",
    async queryPermission() {
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return handleTwoCommittedJson;
        },
      };
    },
    async createWritable() {
      handleTwoCreateWritableCalls += 1;
      const callNumber = handleTwoCreateWritableCalls;
      let stagedJson = "";
      return {
        async write(content) {
          if (callNumber === 1) {
            throw new Error("handle-two first write failed");
          }
          stagedJson = content;
        },
        async close() {
          handleTwoCommittedJson = stagedJson;
        },
        async abort() {},
      };
    },
  };

  const blockedSaveOnHandleOne = saveSessionToFileSystem({
    session: createInMemorySession(),
    handle: handleOne,
    clock: () => new Date("2026-02-17T12:22:00.000Z"),
  });

  const failingSaveOnHandleTwo = saveSessionToFileSystem({
    session: createInMemorySession(),
    handle: handleTwo,
    clock: () => new Date("2026-02-17T12:22:10.000Z"),
  });

  await assert.rejects(
    () => failingSaveOnHandleTwo,
    /handle-two first write failed/,
  );
  assert.equal(handleOneWriteStarted, true);

  const recoveredSaveOnHandleTwo = await saveSessionToFileSystem({
    session: createSessionWithLifetimeProgress({
      totalProblemsSolved: 28,
      totalProblemsAttempted: 33,
    }),
    handle: handleTwo,
    clock: () => new Date("2026-02-17T12:22:20.000Z"),
  });

  assert.ok(recoveredSaveOnHandleTwo);
  assert.equal(recoveredSaveOnHandleTwo.saveFile.totalProblemsSolved, 28);
  assert.equal(handleTwoCreateWritableCalls, 2);

  handleOneGate.resolve();
  await blockedSaveOnHandleOne;
  assert.match(handleOneCommittedJson, /"playerName": "Rex"/);
});

test("loadSaveFromFileSystem requests read permission and validates the payload", async () => {
  const { createDinoDivisionSavePayload, loadSaveFromFileSystem } = await persistenceModule;

  const jsonPayload = JSON.stringify(
    createDinoDivisionSavePayload(
      createInMemorySession(),
      () => new Date("2026-02-17T12:30:00.000Z"),
    ),
  );
  const permissionLog = [];
  let pickerOptionSnapshot = null;

  const handle = {
    name: "rex-save.json",
    async queryPermission({ mode }) {
      permissionLog.push(`query:${mode}`);
      return "prompt";
    },
    async requestPermission({ mode }) {
      permissionLog.push(`request:${mode}`);
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return jsonPayload;
        },
      };
    },
    async createWritable() {
      return {
        async write() {},
        async close() {},
      };
    },
  };

  const loadResult = await loadSaveFromFileSystem({
    fileSystem: {
      async showOpenFilePicker(options = {}) {
        pickerOptionSnapshot = options;
        return [handle];
      },
      async showSaveFilePicker() {
        return handle;
      },
    },
  });

  assert.ok(loadResult);
  assert.equal(loadResult.fileName, "rex-save.json");
  assert.equal(loadResult.saveFile.playerName, "Rex");
  assert.equal(loadResult.saveFile.unlockedDinosaurs.length, 2);
  assert.equal(pickerOptionSnapshot?.multiple, false);
  assert.deepEqual(permissionLog, ["query:read", "request:read"]);
});

test("loadSaveFromFileSystem skips requestPermission when read permission is already granted", async () => {
  const { createDinoDivisionSavePayload, loadSaveFromFileSystem } = await persistenceModule;

  const jsonPayload = JSON.stringify(
    createDinoDivisionSavePayload(
      createInMemorySession(),
      () => new Date("2026-02-17T12:31:00.000Z"),
    ),
  );
  let requestPermissionCalls = 0;

  const handle = {
    name: "rex-save.json",
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      requestPermissionCalls += 1;
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return jsonPayload;
        },
      };
    },
    async createWritable() {
      return {
        async write() {},
        async close() {},
      };
    },
  };

  const loadResult = await loadSaveFromFileSystem({
    fileSystem: {
      async showOpenFilePicker() {
        return [handle];
      },
      async showSaveFilePicker() {
        return handle;
      },
    },
  });

  assert.ok(loadResult);
  assert.equal(loadResult.saveFile.playerName, "Rex");
  assert.equal(requestPermissionCalls, 0);
});

test("parseDinoDivisionSaveFile rejects payloads missing required fields", async () => {
  const { parseDinoDivisionSaveFile } = await persistenceModule;

  assert.throws(
    () => parseDinoDivisionSaveFile(JSON.stringify({ playerName: "Rex" })),
    /Missing required save field "schemaVersion"/,
  );
});

test("parseDinoDivisionSaveFile preserves schema-integrity on save/load round-trips", async () => {
  const { createDinoDivisionSavePayload, parseDinoDivisionSaveFile } = await persistenceModule;

  const payload = createDinoDivisionSavePayload(
    createSessionWithLifetimeProgress({
      totalProblemsSolved: 31,
      totalProblemsAttempted: 40,
      currentDifficultyLevel: 5,
    }),
    () => new Date("2026-02-17T12:40:00.000Z"),
  );

  const roundTrippedPayload = parseDinoDivisionSaveFile(JSON.stringify(payload));

  assert.deepEqual(roundTrippedPayload, payload);
});

test("parseDinoDivisionSaveFile rejects unsupported schema versions", async () => {
  const { createDinoDivisionSavePayload, parseDinoDivisionSaveFile } = await persistenceModule;

  const saveFile = createDinoDivisionSavePayload(
    createInMemorySession(),
    () => new Date("2026-02-17T12:41:00.000Z"),
  );
  const unsupportedSchemaPayload = JSON.stringify({
    ...saveFile,
    schemaVersion: 2,
  });

  assert.throws(
    () => parseDinoDivisionSaveFile(unsupportedSchemaPayload),
    /Unsupported schemaVersion 2. Expected 1/,
  );
});

test("saveSessionToFileSystem and loadSaveFromFileSystem return null when picker selection is canceled", async () => {
  const { loadSaveFromFileSystem, saveSessionToFileSystem } = await persistenceModule;
  const abortError = { name: "AbortError" };

  const fileSystem = {
    async showOpenFilePicker() {
      throw abortError;
    },
    async showSaveFilePicker() {
      throw abortError;
    },
  };

  const saveResult = await saveSessionToFileSystem({
    session: createInMemorySession(),
    fileSystem,
  });
  const loadResult = await loadSaveFromFileSystem({ fileSystem });

  assert.equal(saveResult, null);
  assert.equal(loadResult, null);
});

test("supportsJsonSaveImportExportFallback detects when JSON fallback runtime is available", async () => {
  const { supportsJsonSaveImportExportFallback } = await persistenceModule;

  assert.equal(supportsJsonSaveImportExportFallback(null), false);
  assert.equal(
    supportsJsonSaveImportExportFallback({
      Blob: class MockBlob {},
      URL: { createObjectURL() {} },
      document: { createElement() {} },
    }),
    true,
  );
});

test("exportSessionToJsonDownload reuses save schema and player-named JSON output", async () => {
  const { exportSessionToJsonDownload, REQUIRED_SAVE_FILE_FIELDS } = await persistenceModule;
  const downloadEvents = [];

  const exportResult = await exportSessionToJsonDownload({
    session: createInMemorySession(),
    clock: () => new Date("2026-02-17T13:00:00.000Z"),
    downloader: {
      async downloadJson(fileName, json) {
        downloadEvents.push({ fileName, json });
      },
    },
  });

  assert.equal(exportResult.fileName, "rex-save.json");
  assert.equal(downloadEvents.length, 1);
  assert.equal(downloadEvents[0].fileName, "rex-save.json");

  const parsedSave = JSON.parse(downloadEvents[0].json);
  assert.deepEqual(Object.keys(parsedSave), [...REQUIRED_SAVE_FILE_FIELDS]);
  assert.equal(parsedSave.playerName, "Rex");
  assert.equal(parsedSave.updatedAt, "2026-02-17T13:00:00.000Z");
});

test("exportSessionToJsonDownload supports browser fallback runtime import/export flow", async () => {
  const { exportSessionToJsonDownload } = await persistenceModule;
  const fallbackEvents = [];

  class MockBlob {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.options = options;
    }
  }

  const anchor = {
    href: "",
    download: "",
    click() {
      fallbackEvents.push("anchor-click");
    },
    remove() {
      fallbackEvents.push("anchor-remove");
    },
  };
  const fallbackRuntime = {
    Blob: MockBlob,
    URL: {
      createObjectURL(blob) {
        fallbackEvents.push(["create-object-url", blob.options?.type, blob.parts?.length ?? 0]);
        return "blob:rex-save";
      },
      revokeObjectURL(url) {
        fallbackEvents.push(["revoke-object-url", url]);
      },
    },
    document: {
      createElement(tagName) {
        fallbackEvents.push(["create-element", tagName]);
        return anchor;
      },
      body: {
        appendChild(node) {
          fallbackEvents.push(["append-child", node === anchor]);
          return node;
        },
      },
    },
  };

  const exportResult = await exportSessionToJsonDownload({
    session: createInMemorySession(),
    clock: () => new Date("2026-02-17T13:20:00.000Z"),
    fallbackRuntime,
  });

  assert.equal(anchor.download, "rex-save.json");
  assert.equal(anchor.href, "blob:rex-save");
  assert.equal(exportResult.fileName, "rex-save.json");
  assert.deepEqual(fallbackEvents, [
    ["create-object-url", "application/json", 1],
    ["create-element", "a"],
    ["append-child", true],
    "anchor-click",
    "anchor-remove",
    ["revoke-object-url", "blob:rex-save"],
  ]);
});

test("loadSaveFromJsonFile parses and validates fallback imports with the same schema rules", async () => {
  const { createDinoDivisionSavePayload, loadSaveFromJsonFile } = await persistenceModule;
  const jsonPayload = JSON.stringify(
    createDinoDivisionSavePayload(
      createInMemorySession(),
      () => new Date("2026-02-17T13:30:00.000Z"),
    ),
  );

  const loadResult = await loadSaveFromJsonFile({
    name: "rex-save.json",
    async text() {
      return jsonPayload;
    },
  });

  assert.ok(loadResult);
  assert.equal(loadResult.fileName, "rex-save.json");
  assert.equal(loadResult.saveFile.playerName, "Rex");
  assert.equal(loadResult.saveFile.unlockedDinosaurs.length, 2);
});

test("loadSaveFromJsonFile returns null on canceled imports and rejects invalid payloads", async () => {
  const { loadSaveFromJsonFile } = await persistenceModule;

  assert.equal(await loadSaveFromJsonFile(null), null);

  await assert.rejects(
    async () =>
      loadSaveFromJsonFile({
        name: "broken-save.json",
        async text() {
          return JSON.stringify({ playerName: "Rex" });
        },
      }),
    /Missing required save field "schemaVersion"/,
  );
});

test("exportSessionToJsonDownload rejects when browser fallback runtime is unavailable", async () => {
  const { exportSessionToJsonDownload } = await persistenceModule;

  await assert.rejects(
    () =>
      exportSessionToJsonDownload({
        session: createInMemorySession(),
        fallbackRuntime: {},
      }),
    /JSON save fallback is not available in this environment/,
  );
});
