import assert from "node:assert/strict";
import test from "node:test";

import { createNewPlayerSave, type PlayerSaveFile } from "../lib/domain";
import {
  GAME_START_PLAYER_NAME_REQUIRED_MESSAGE,
  INVALID_RUNTIME_SAVE_FILE_MESSAGE,
  doesLoadedSaveMatchRequestedPlayerName,
  initializeLoadedGameRuntimeState,
  initializeNewGameRuntimeState,
  requirePlayerName,
} from "../lib/game-start";

test("requirePlayerName trims whitespace and rejects empty values", () => {
  assert.equal(requirePlayerName("  Rex  "), "Rex");
  assert.throws(() => requirePlayerName("   "), {
    message: GAME_START_PLAYER_NAME_REQUIRED_MESSAGE,
  });
});

test("initializeNewGameRuntimeState builds runtime state from player name", () => {
  const state = initializeNewGameRuntimeState(
    " Blue ",
    "2026-02-16T10:00:00.000Z",
  );

  assert.equal(state.mode, "new-game");
  assert.equal(state.initializedAt, "2026-02-16T10:00:00.000Z");
  assert.equal(state.playerSave.playerName, "Blue");
  assert.equal(state.playerSave.totalProblemsSolved, 0);
  assert.equal(state.playerSave.currentDifficulty, "two-digit-by-one-digit");
  assert.deepEqual(state.playerSave.unlockedDinosaurs, []);
  assert.deepEqual(state.playerSave.sessionHistory, []);
});

test("initializeLoadedGameRuntimeState keeps loaded data and marks mode", () => {
  const save = createNewPlayerSave("Rex");
  save.totalProblemsSolved = 9;
  save.currentDifficulty = "four-digit-by-two-digit";
  save.unlockedDinosaurs.push({
    name: "Tyrannosaurus Rex",
    imagePath: "/dinosaurs/rex.png",
    earnedAt: "2026-02-15T20:00:00.000Z",
  });

  const state = initializeLoadedGameRuntimeState(
    {
      ...save,
      playerName: "  Rex  ",
    },
    "2026-02-16T10:05:00.000Z",
  );

  assert.equal(state.mode, "loaded-save");
  assert.equal(state.initializedAt, "2026-02-16T10:05:00.000Z");
  assert.equal(state.playerSave.playerName, "Rex");
  assert.equal(state.playerSave.totalProblemsSolved, 9);
  assert.equal(state.playerSave.currentDifficulty, "four-digit-by-two-digit");
  assert.equal(state.playerSave.unlockedDinosaurs.length, 1);
});

test("initializeLoadedGameRuntimeState rejects invalid save payloads", () => {
  const invalidSave = {
    playerName: "Rex",
  } as PlayerSaveFile;

  assert.throws(() => initializeLoadedGameRuntimeState(invalidSave), {
    message: INVALID_RUNTIME_SAVE_FILE_MESSAGE,
  });
});

test("doesLoadedSaveMatchRequestedPlayerName compares normalized names", () => {
  assert.equal(
    doesLoadedSaveMatchRequestedPlayerName(" Blue ", "blue"),
    true,
  );
  assert.equal(
    doesLoadedSaveMatchRequestedPlayerName("Charlie", "Delta"),
    false,
  );
});
