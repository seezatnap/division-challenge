import assert from "node:assert/strict";
import test from "node:test";

import { createNewPlayerSave, type PlayerSaveFile } from "../lib/domain";
import {
  FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE,
  INVALID_PLAYER_NAME_FOR_FILE_MESSAGE,
  INVALID_PLAYER_SAVE_DATA_MESSAGE,
  INVALID_SAVE_FILE_JSON_MESSAGE,
  INVALID_SAVE_FILE_SCHEMA_MESSAGE,
  LOAD_CANCELLED_MESSAGE,
  LOAD_PERMISSION_CONFIRM_MESSAGE,
  LOAD_PERMISSION_DENIED_MESSAGE,
  NO_SAVE_FILE_SELECTED_MESSAGE,
  SAVE_CANCELLED_MESSAGE,
  SAVE_PERMISSION_CONFIRM_MESSAGE,
  SAVE_PERMISSION_DENIED_MESSAGE,
  getPlayerSaveFileName,
  isFileSystemAccessSupported,
  loadPlayerSaveFile,
  savePlayerSaveFile,
  type FileSystemAccessHost,
  type FileSystemFileHandleLike,
  type FileSystemWritableLike,
} from "../lib/save-file";

function makeHost(overrides: Partial<FileSystemAccessHost>): FileSystemAccessHost {
  return {
    async showSaveFilePicker() {
      throw new Error("showSaveFilePicker not implemented for this test.");
    },
    async showOpenFilePicker() {
      throw new Error("showOpenFilePicker not implemented for this test.");
    },
    confirm() {
      return true;
    },
    ...overrides,
  };
}

test("getPlayerSaveFileName normalizes player names and enforces suffix", () => {
  assert.equal(getPlayerSaveFileName(" Rex "), "rex-save.json");
  assert.equal(getPlayerSaveFileName("Blue Team"), "blue-team-save.json");

  assert.throws(() => getPlayerSaveFileName("   "), {
    message: INVALID_PLAYER_NAME_FOR_FILE_MESSAGE,
  });
});

test("isFileSystemAccessSupported requires both file picker APIs", () => {
  assert.equal(isFileSystemAccessSupported(null), false);
  assert.equal(
    isFileSystemAccessSupported({
      async showSaveFilePicker() {
        return {};
      },
    }),
    false,
  );
  assert.equal(isFileSystemAccessSupported(makeHost({})), true);
});

test("savePlayerSaveFile shows unsupported-browser error when APIs are missing", async () => {
  await assert.rejects(() => savePlayerSaveFile(createNewPlayerSave("Rex"), {}), {
    message: FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE,
  });
});

test("savePlayerSaveFile validates schema before writing", async () => {
  const invalidSave = {
    playerName: "Rex",
  } as PlayerSaveFile;

  await assert.rejects(
    () => savePlayerSaveFile(invalidSave, makeHost({})),
    {
      message: INVALID_PLAYER_SAVE_DATA_MESSAGE,
    },
  );
});

test("savePlayerSaveFile asks for explicit confirmation before picker access", async () => {
  let savePickerCalled = false;

  const host = makeHost({
    confirm(message) {
      assert.equal(message, SAVE_PERMISSION_CONFIRM_MESSAGE);
      return false;
    },
    async showSaveFilePicker() {
      savePickerCalled = true;
      return {};
    },
  });

  await assert.rejects(
    () => savePlayerSaveFile(createNewPlayerSave("Rex"), host),
    {
      message: SAVE_PERMISSION_DENIED_MESSAGE,
    },
  );
  assert.equal(savePickerCalled, false);
});

test("savePlayerSaveFile writes formatted JSON with readwrite permission", async () => {
  const save = createNewPlayerSave("Rex");
  let confirmMessage = "";
  let requestedMode = "";
  let suggestedName = "";
  let writtenContents = "";
  let closeCalled = false;

  const writable: FileSystemWritableLike = {
    async write(data) {
      writtenContents = data;
    },
    async close() {
      closeCalled = true;
    },
  };

  const saveHandle: FileSystemFileHandleLike = {
    name: "rex-save.json",
    async queryPermission() {
      return "prompt";
    },
    async requestPermission(descriptor) {
      requestedMode = descriptor.mode ?? "";
      return "granted";
    },
    async createWritable() {
      return writable;
    },
  };

  const host = makeHost({
    confirm(message) {
      confirmMessage = message;
      return true;
    },
    async showSaveFilePicker(options) {
      suggestedName = options.suggestedName;
      return saveHandle;
    },
  });

  const result = await savePlayerSaveFile(save, host);

  assert.equal(confirmMessage, SAVE_PERMISSION_CONFIRM_MESSAGE);
  assert.equal(suggestedName, "rex-save.json");
  assert.equal(requestedMode, "readwrite");
  assert.equal(closeCalled, true);
  assert.deepEqual(JSON.parse(writtenContents) as unknown, save);
  assert.equal(result.fileName, "rex-save.json");
});

test("savePlayerSaveFile maps abort to user-friendly cancelled message", async () => {
  const host = makeHost({
    async showSaveFilePicker() {
      throw { name: "AbortError" };
    },
  });

  await assert.rejects(
    () => savePlayerSaveFile(createNewPlayerSave("Rex"), host),
    {
      message: SAVE_CANCELLED_MESSAGE,
    },
  );
});

test("loadPlayerSaveFile asks for explicit confirmation before picker access", async () => {
  let openPickerCalled = false;

  const host = makeHost({
    confirm(message) {
      assert.equal(message, LOAD_PERMISSION_CONFIRM_MESSAGE);
      return false;
    },
    async showOpenFilePicker() {
      openPickerCalled = true;
      return [];
    },
  });

  await assert.rejects(() => loadPlayerSaveFile(host), {
    message: LOAD_PERMISSION_DENIED_MESSAGE,
  });
  assert.equal(openPickerCalled, false);
});

test("loadPlayerSaveFile reads and validates a save payload", async () => {
  const expectedSave = createNewPlayerSave("Blue");
  expectedSave.totalProblemsSolved = 12;
  let confirmMessage = "";
  let requestedMode = "";

  const openHandle: FileSystemFileHandleLike = {
    async queryPermission() {
      return "prompt";
    },
    async requestPermission(descriptor) {
      requestedMode = descriptor.mode ?? "";
      return "granted";
    },
    async getFile() {
      return {
        async text() {
          return JSON.stringify(expectedSave);
        },
      };
    },
  };

  const host = makeHost({
    confirm(message) {
      confirmMessage = message;
      return true;
    },
    async showOpenFilePicker() {
      return [openHandle];
    },
  });

  const loaded = await loadPlayerSaveFile(host);

  assert.equal(confirmMessage, LOAD_PERMISSION_CONFIRM_MESSAGE);
  assert.equal(requestedMode, "read");
  assert.deepEqual(loaded, expectedSave);
});

test("loadPlayerSaveFile rejects non-JSON files", async () => {
  const openHandle: FileSystemFileHandleLike = {
    async getFile() {
      return {
        async text() {
          return "{ definitely-not-json }";
        },
      };
    },
  };

  const host = makeHost({
    async showOpenFilePicker() {
      return [openHandle];
    },
  });

  await assert.rejects(() => loadPlayerSaveFile(host), {
    message: INVALID_SAVE_FILE_JSON_MESSAGE,
  });
});

test("loadPlayerSaveFile rejects files that fail schema validation", async () => {
  const openHandle: FileSystemFileHandleLike = {
    async getFile() {
      return {
        async text() {
          return JSON.stringify({
            playerName: "Rex",
            totalProblemsSolved: "not-a-number",
          });
        },
      };
    },
  };

  const host = makeHost({
    async showOpenFilePicker() {
      return [openHandle];
    },
  });

  await assert.rejects(() => loadPlayerSaveFile(host), {
    message: INVALID_SAVE_FILE_SCHEMA_MESSAGE,
  });
});

test("loadPlayerSaveFile reports when no file was selected", async () => {
  const host = makeHost({
    async showOpenFilePicker() {
      return [];
    },
  });

  await assert.rejects(() => loadPlayerSaveFile(host), {
    message: NO_SAVE_FILE_SELECTED_MESSAGE,
  });
});

test("loadPlayerSaveFile maps abort to user-friendly cancelled message", async () => {
  const host = makeHost({
    async showOpenFilePicker() {
      throw { name: "AbortError" };
    },
  });

  await assert.rejects(() => loadPlayerSaveFile(host), {
    message: LOAD_CANCELLED_MESSAGE,
  });
});
