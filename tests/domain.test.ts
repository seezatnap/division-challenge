import assert from "node:assert/strict";
import test from "node:test";

import {
  DIVISION_DIFFICULTY_IDS,
  createNewPlayerSave,
  isDivisionDifficultyId,
  isDivisionProblem,
  isPlayerSaveFile,
  type DivisionProblem,
  type PlayerSaveFile,
} from "../lib/domain";

const now = "2026-02-16T00:00:00.000Z";

test("difficulty guard accepts the declared ids", () => {
  for (const id of DIVISION_DIFFICULTY_IDS) {
    assert.equal(isDivisionDifficultyId(id), true);
  }

  assert.equal(isDivisionDifficultyId("invalid"), false);
});

test("division problem guard validates core shape and remainder rule", () => {
  const validProblem: DivisionProblem = {
    id: "prob-1",
    dividend: 128,
    divisor: 4,
    quotient: 32,
    remainder: 0,
    difficulty: "three-digit-by-one-digit",
    createdAt: now,
  };

  assert.equal(isDivisionProblem(validProblem), true);
  assert.equal(
    isDivisionProblem({
      ...validProblem,
      remainder: 4,
    }),
    false,
  );
});

test("player save guard validates nested unlocked dino and session records", () => {
  const validSave: PlayerSaveFile = {
    playerName: "Rex",
    totalProblemsSolved: 7,
    currentDifficulty: "three-digit-by-one-digit",
    unlockedDinosaurs: [
      {
        name: "Tyrannosaurus Rex",
        imagePath: "/dinosaurs/trex-1.png",
        earnedAt: now,
      },
    ],
    sessionHistory: [
      {
        sessionId: "session-1",
        startedAt: now,
        endedAt: now,
        problemsSolved: 7,
      },
    ],
  };

  assert.equal(isPlayerSaveFile(validSave), true);

  assert.equal(
    isPlayerSaveFile({
      ...validSave,
      unlockedDinosaurs: [
        {
          name: "Velociraptor",
          imagePath: "/dinosaurs/raptor-1.png",
          earnedAt: "not-a-date",
        },
      ],
    }),
    false,
  );
});

test("createNewPlayerSave returns a valid baseline save payload", () => {
  const save = createNewPlayerSave("  Blue  ");

  assert.equal(save.playerName, "Blue");
  assert.equal(save.totalProblemsSolved, 0);
  assert.equal(save.currentDifficulty, DIVISION_DIFFICULTY_IDS[0]);
  assert.equal(save.unlockedDinosaurs.length, 0);
  assert.equal(save.sessionHistory.length, 0);
  assert.equal(isPlayerSaveFile(save), true);
});
