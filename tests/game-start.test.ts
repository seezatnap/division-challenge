import assert from "node:assert/strict";
import test from "node:test";

import { createNewPlayerSave, type PlayerSaveFile } from "../lib/domain";
import {
  applyRuntimeProgressUpdate,
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
  assert.equal(state.sessionId, "blue-20260216100000000");
  assert.equal(state.playerSave.playerName, "Blue");
  assert.equal(state.playerSave.totalProblemsSolved, 0);
  assert.equal(state.playerSave.currentDifficulty, "two-digit-by-one-digit");
  assert.deepEqual(state.playerSave.unlockedDinosaurs, []);
  assert.deepEqual(state.playerSave.sessionHistory, [
    {
      sessionId: "blue-20260216100000000",
      startedAt: "2026-02-16T10:00:00.000Z",
      endedAt: null,
      problemsSolved: 0,
    },
  ]);
});

test("initializeLoadedGameRuntimeState keeps loaded data, closes old open sessions, and starts a new runtime session", () => {
  const save = createNewPlayerSave("Rex");
  save.totalProblemsSolved = 9;
  save.currentDifficulty = "four-digit-by-two-digit";
  save.unlockedDinosaurs.push({
    name: "Tyrannosaurus Rex",
    imagePath: "/dinosaurs/rex.png",
    earnedAt: "2026-02-15T20:00:00.000Z",
  });
  save.sessionHistory.push({
    sessionId: "rex-20260215180000000",
    startedAt: "2026-02-15T18:00:00.000Z",
    endedAt: "2026-02-15T19:00:00.000Z",
    problemsSolved: 4,
  });
  save.sessionHistory.push({
    sessionId: "rex-20260216090000000",
    startedAt: "2026-02-16T09:00:00.000Z",
    endedAt: null,
    problemsSolved: 5,
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
  assert.equal(state.sessionId, "rex-20260216100500000");
  assert.equal(state.playerSave.playerName, "Rex");
  assert.equal(state.playerSave.totalProblemsSolved, 9);
  assert.equal(state.playerSave.currentDifficulty, "four-digit-by-two-digit");
  assert.equal(state.playerSave.unlockedDinosaurs.length, 1);
  assert.deepEqual(state.playerSave.sessionHistory, [
    {
      sessionId: "rex-20260215180000000",
      startedAt: "2026-02-15T18:00:00.000Z",
      endedAt: "2026-02-15T19:00:00.000Z",
      problemsSolved: 4,
    },
    {
      sessionId: "rex-20260216090000000",
      startedAt: "2026-02-16T09:00:00.000Z",
      endedAt: "2026-02-16T10:05:00.000Z",
      problemsSolved: 5,
    },
    {
      sessionId: "rex-20260216100500000",
      startedAt: "2026-02-16T10:05:00.000Z",
      endedAt: null,
      problemsSolved: 0,
    },
  ]);
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

test("applyRuntimeProgressUpdate syncs difficulty, lifetime solved count, and active session solved progress", () => {
  const runtimeState = initializeNewGameRuntimeState(
    "Rex",
    "2026-02-16T11:00:00.000Z",
  );

  const updatedState = applyRuntimeProgressUpdate(runtimeState, {
    difficulty: "three-digit-by-one-digit",
    solvedCount: 2,
    lifetimeSolvedCount: 7,
  });

  assert.equal(updatedState.playerSave.totalProblemsSolved, 7);
  assert.equal(updatedState.playerSave.currentDifficulty, "three-digit-by-one-digit");
  assert.deepEqual(updatedState.playerSave.sessionHistory, [
    {
      sessionId: "rex-20260216110000000",
      startedAt: "2026-02-16T11:00:00.000Z",
      endedAt: null,
      problemsSolved: 2,
    },
  ]);
});

test("applyRuntimeProgressUpdate ignores lower stale solved counts and returns unchanged state for identical snapshots", () => {
  const runtimeState = initializeNewGameRuntimeState(
    "Blue",
    "2026-02-16T11:30:00.000Z",
  );
  const progressedState = applyRuntimeProgressUpdate(runtimeState, {
    difficulty: "three-digit-by-one-digit",
    solvedCount: 3,
    lifetimeSolvedCount: 8,
  });

  const staleUpdateState = applyRuntimeProgressUpdate(progressedState, {
    difficulty: "three-digit-by-one-digit",
    solvedCount: 1,
    lifetimeSolvedCount: 6,
  });
  assert.equal(staleUpdateState.playerSave.totalProblemsSolved, 8);
  assert.equal(staleUpdateState.playerSave.sessionHistory[0]?.problemsSolved, 3);

  const unchangedState = applyRuntimeProgressUpdate(staleUpdateState, {
    difficulty: "three-digit-by-one-digit",
    solvedCount: 3,
    lifetimeSolvedCount: 8,
  });
  assert.equal(unchangedState, staleUpdateState);
});
