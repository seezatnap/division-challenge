import { describe, it, expect } from "vitest";
import { createNewPlayerSave } from "@/types";
import type {
  PlayerSave,
  DivisionProblem,
  DifficultyConfig,
  DivisionStep,
  StepValidationResult,
  UnlockedDinosaur,
  SessionRecord,
} from "@/types";

describe("createNewPlayerSave", () => {
  it("returns a save with the given player name", () => {
    const save = createNewPlayerSave("Dr. Malcolm");
    expect(save.playerName).toBe("Dr. Malcolm");
  });

  it("starts at version 1", () => {
    const save = createNewPlayerSave("Rex");
    expect(save.version).toBe(1);
  });

  it("starts with zero problems solved", () => {
    const save = createNewPlayerSave("Rex");
    expect(save.totalProblemsSolved).toBe(0);
  });

  it("starts at difficulty 1", () => {
    const save = createNewPlayerSave("Rex");
    expect(save.currentDifficulty).toBe(1);
  });

  it("starts with empty unlocked dinosaurs", () => {
    const save = createNewPlayerSave("Rex");
    expect(save.unlockedDinosaurs).toEqual([]);
  });

  it("starts with empty session history", () => {
    const save = createNewPlayerSave("Rex");
    expect(save.sessionHistory).toEqual([]);
  });
});

describe("domain type shapes (compile-time + runtime)", () => {
  it("DivisionProblem can be constructed with correct shape", () => {
    const problem: DivisionProblem = {
      id: "prob-1",
      dividend: 144,
      divisor: 12,
      quotient: 12,
      remainder: 0,
      difficulty: {
        tier: 2,
        label: "3-digit ÷ 2-digit",
        dividendDigits: { min: 100, max: 999 },
        divisorDigits: { min: 10, max: 99 },
      },
    };
    expect(problem.dividend / problem.divisor).toBe(problem.quotient);
  });

  it("DifficultyConfig has required fields", () => {
    const config: DifficultyConfig = {
      tier: 1,
      label: "2-digit ÷ 1-digit",
      dividendDigits: { min: 10, max: 99 },
      divisorDigits: { min: 2, max: 9 },
    };
    expect(config.tier).toBe(1);
    expect(config.label).toBeTruthy();
  });

  it("DivisionStep kinds cover all phases", () => {
    const steps: DivisionStep[] = [
      { kind: "divide", expected: 4, prompt: "Divide 12 by 3" },
      { kind: "multiply", expected: 12, prompt: "Multiply 4 × 3" },
      { kind: "subtract", expected: 0, prompt: "Subtract 12 from 12" },
      { kind: "bring-down", expected: 5, prompt: "Bring down the 5" },
    ];
    const kinds = steps.map((s) => s.kind);
    expect(kinds).toEqual(["divide", "multiply", "subtract", "bring-down"]);
  });

  it("StepValidationResult expresses correct and incorrect", () => {
    const correct: StepValidationResult = { correct: true };
    const incorrect: StepValidationResult = {
      correct: false,
      hint: "Try again!",
    };
    expect(correct.correct).toBe(true);
    expect(correct.hint).toBeUndefined();
    expect(incorrect.correct).toBe(false);
    expect(incorrect.hint).toBe("Try again!");
  });

  it("UnlockedDinosaur has required fields", () => {
    const dino: UnlockedDinosaur = {
      name: "Triceratops",
      imagePath: "/dinos/triceratops.png",
      dateEarned: "2026-02-01T00:00:00.000Z",
    };
    expect(dino.name).toBeTruthy();
    expect(dino.imagePath).toBeTruthy();
    expect(new Date(dino.dateEarned).getFullYear()).toBe(2026);
  });

  it("SessionRecord can represent an active session", () => {
    const session: SessionRecord = {
      startedAt: "2026-02-01T10:00:00.000Z",
      problemsSolved: 3,
      problemsAttempted: 5,
      startDifficulty: 1,
      endDifficulty: 2,
    };
    expect(session.endedAt).toBeUndefined();
  });

  it("SessionRecord can represent a completed session", () => {
    const session: SessionRecord = {
      startedAt: "2026-02-01T10:00:00.000Z",
      endedAt: "2026-02-01T11:00:00.000Z",
      problemsSolved: 10,
      problemsAttempted: 10,
      startDifficulty: 1,
      endDifficulty: 3,
    };
    expect(session.endedAt).toBeTruthy();
  });

  it("PlayerSave conforms to spec shape", () => {
    const save: PlayerSave = {
      version: 1,
      playerName: "Ellie Sattler",
      totalProblemsSolved: 25,
      currentDifficulty: 4,
      unlockedDinosaurs: [
        {
          name: "Brachiosaurus",
          imagePath: "/dinos/brachio.png",
          dateEarned: "2026-02-01T00:00:00.000Z",
        },
      ],
      sessionHistory: [
        {
          startedAt: "2026-02-01T10:00:00.000Z",
          endedAt: "2026-02-01T11:00:00.000Z",
          problemsSolved: 25,
          problemsAttempted: 28,
          startDifficulty: 1,
          endDifficulty: 4,
        },
      ],
    };
    expect(save.version).toBe(1);
    expect(save.unlockedDinosaurs).toHaveLength(1);
    expect(save.sessionHistory).toHaveLength(1);
  });
});
