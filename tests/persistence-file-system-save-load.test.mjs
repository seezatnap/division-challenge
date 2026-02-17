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

const persistenceModule = loadTypeScriptModule(
  "src/features/persistence/lib/file-system-save-load.ts",
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

test("parseDinoDivisionSaveFile rejects payloads missing required fields", async () => {
  const { parseDinoDivisionSaveFile } = await persistenceModule;

  assert.throws(
    () => parseDinoDivisionSaveFile(JSON.stringify({ playerName: "Rex" })),
    /Missing required save field "schemaVersion"/,
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
