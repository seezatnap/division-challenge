import {
  DifficultyLevel,
  StepKind,
  RewardGenerationStatus,
  SAVE_FILE_VERSION,
  type DivisionProblem,
  type QuotientDigitStep,
  type MultiplyStep,
  type SubtractStep,
  type BringDownStep,
  type DivisionStep,
  type DivisionSolution,
  type ActiveInputTarget,
  type InputValidationResult,
  type SessionProgress,
  type LifetimeProgress,
  type PlayerProgress,
  type UnlockedReward,
  type RewardGenerationState,
  type SaveFile,
} from "@/types";

// ---------------------------------------------------------------------------
// Enum value tests
// ---------------------------------------------------------------------------

describe("DifficultyLevel", () => {
  it("has the four expected tiers", () => {
    expect(DifficultyLevel.Easy).toBe("easy");
    expect(DifficultyLevel.Medium).toBe("medium");
    expect(DifficultyLevel.Hard).toBe("hard");
    expect(DifficultyLevel.Expert).toBe("expert");
  });

  it("contains exactly four values", () => {
    const values = Object.values(DifficultyLevel);
    expect(values).toHaveLength(4);
  });
});

describe("StepKind", () => {
  it("has the four expected step kinds", () => {
    expect(StepKind.QuotientDigit).toBe("quotient_digit");
    expect(StepKind.Multiply).toBe("multiply");
    expect(StepKind.Subtract).toBe("subtract");
    expect(StepKind.BringDown).toBe("bring_down");
  });

  it("contains exactly four values", () => {
    const values = Object.values(StepKind);
    expect(values).toHaveLength(4);
  });
});

describe("RewardGenerationStatus", () => {
  it("has the four expected statuses", () => {
    expect(RewardGenerationStatus.Pending).toBe("pending");
    expect(RewardGenerationStatus.Generating).toBe("generating");
    expect(RewardGenerationStatus.Ready).toBe("ready");
    expect(RewardGenerationStatus.Failed).toBe("failed");
  });

  it("contains exactly four values", () => {
    const values = Object.values(RewardGenerationStatus);
    expect(values).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("SAVE_FILE_VERSION", () => {
  it("is 1", () => {
    expect(SAVE_FILE_VERSION).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Type contract tests — verify objects satisfy interfaces at runtime
// ---------------------------------------------------------------------------

describe("DivisionProblem contract", () => {
  const problem: DivisionProblem = {
    dividend: 84,
    divisor: 7,
    quotient: 12,
    remainder: 0,
    difficulty: DifficultyLevel.Easy,
  };

  it("has all required fields", () => {
    expect(problem.dividend).toBe(84);
    expect(problem.divisor).toBe(7);
    expect(problem.quotient).toBe(12);
    expect(problem.remainder).toBe(0);
    expect(problem.difficulty).toBe(DifficultyLevel.Easy);
  });

  it("supports problems with remainders", () => {
    const withRemainder: DivisionProblem = {
      dividend: 85,
      divisor: 7,
      quotient: 12,
      remainder: 1,
      difficulty: DifficultyLevel.Easy,
    };
    expect(withRemainder.remainder).toBe(1);
  });
});

describe("DivisionStep contracts", () => {
  it("creates a QuotientDigitStep", () => {
    const step: QuotientDigitStep = {
      kind: StepKind.QuotientDigit,
      index: 0,
      digitPosition: 0,
      expectedValue: 1,
    };
    expect(step.kind).toBe(StepKind.QuotientDigit);
    expect(step.expectedValue).toBe(1);
  });

  it("creates a MultiplyStep", () => {
    const step: MultiplyStep = {
      kind: StepKind.Multiply,
      index: 1,
      digitPosition: 0,
      expectedValue: 7,
    };
    expect(step.kind).toBe(StepKind.Multiply);
    expect(step.expectedValue).toBe(7);
  });

  it("creates a SubtractStep", () => {
    const step: SubtractStep = {
      kind: StepKind.Subtract,
      index: 2,
      digitPosition: 0,
      expectedValue: 1,
    };
    expect(step.kind).toBe(StepKind.Subtract);
    expect(step.expectedValue).toBe(1);
  });

  it("creates a BringDownStep", () => {
    const step: BringDownStep = {
      kind: StepKind.BringDown,
      index: 3,
      digitPosition: 1,
      digitBroughtDown: 4,
      newWorkingNumber: 14,
    };
    expect(step.kind).toBe(StepKind.BringDown);
    expect(step.digitBroughtDown).toBe(4);
    expect(step.newWorkingNumber).toBe(14);
  });

  it("forms a union type via DivisionStep", () => {
    const steps: DivisionStep[] = [
      { kind: StepKind.QuotientDigit, index: 0, digitPosition: 0, expectedValue: 1 },
      { kind: StepKind.Multiply, index: 1, digitPosition: 0, expectedValue: 7 },
      { kind: StepKind.Subtract, index: 2, digitPosition: 0, expectedValue: 1 },
      { kind: StepKind.BringDown, index: 3, digitPosition: 1, digitBroughtDown: 4, newWorkingNumber: 14 },
    ];
    expect(steps).toHaveLength(4);
    expect(steps[0].kind).toBe(StepKind.QuotientDigit);
    expect(steps[3].kind).toBe(StepKind.BringDown);
  });
});

describe("DivisionSolution contract", () => {
  it("holds a problem and ordered steps", () => {
    const solution: DivisionSolution = {
      problem: {
        dividend: 84,
        divisor: 7,
        quotient: 12,
        remainder: 0,
        difficulty: DifficultyLevel.Easy,
      },
      steps: [
        { kind: StepKind.QuotientDigit, index: 0, digitPosition: 0, expectedValue: 1 },
        { kind: StepKind.Multiply, index: 1, digitPosition: 0, expectedValue: 7 },
      ],
    };
    expect(solution.problem.dividend).toBe(84);
    expect(solution.steps).toHaveLength(2);
  });
});

describe("ActiveInputTarget contract", () => {
  it("describes a glow position", () => {
    const target: ActiveInputTarget = {
      kind: StepKind.QuotientDigit,
      stepIndex: 0,
      digitPosition: 0,
      row: 0,
      col: 2,
    };
    expect(target.kind).toBe(StepKind.QuotientDigit);
    expect(target.row).toBe(0);
    expect(target.col).toBe(2);
  });
});

describe("InputValidationResult contract", () => {
  it("represents a correct entry", () => {
    const result: InputValidationResult = {
      correct: true,
      enteredValue: 7,
      expectedValue: 7,
      nextTarget: {
        kind: StepKind.Multiply,
        stepIndex: 1,
        digitPosition: 0,
        row: 1,
        col: 2,
      },
    };
    expect(result.correct).toBe(true);
    expect(result.nextTarget).not.toBeNull();
  });

  it("represents an incorrect entry with no advancement", () => {
    const result: InputValidationResult = {
      correct: false,
      enteredValue: 5,
      expectedValue: 7,
      nextTarget: null,
    };
    expect(result.correct).toBe(false);
    expect(result.nextTarget).toBeNull();
  });
});

describe("PlayerProgress contract", () => {
  it("combines session and lifetime progress", () => {
    const session: SessionProgress = {
      problemsSolved: 3,
      problemsAttempted: 4,
      incorrectInputs: 2,
      startedAt: "2026-02-17T12:00:00Z",
    };
    const lifetime: LifetimeProgress = {
      totalProblemsSolved: 25,
      totalProblemsAttempted: 30,
      currentDifficulty: DifficultyLevel.Medium,
      sessionsPlayed: 5,
    };
    const progress: PlayerProgress = { session, lifetime };
    expect(progress.session.problemsSolved).toBe(3);
    expect(progress.lifetime.totalProblemsSolved).toBe(25);
    expect(progress.lifetime.currentDifficulty).toBe(DifficultyLevel.Medium);
  });
});

describe("UnlockedReward contract", () => {
  it("stores a dinosaur reward", () => {
    const reward: UnlockedReward = {
      dinoName: "Tyrannosaurus Rex",
      imagePath: "dinos/tyrannosaurus-rex.png",
      earnedAt: "2026-02-17T12:05:00Z",
      milestoneNumber: 1,
    };
    expect(reward.dinoName).toBe("Tyrannosaurus Rex");
    expect(reward.milestoneNumber).toBe(1);
  });
});

describe("RewardGenerationState contract", () => {
  it("tracks in-flight generation", () => {
    const state: RewardGenerationState = {
      dinoName: "Velociraptor",
      status: RewardGenerationStatus.Generating,
      milestoneNumber: 2,
    };
    expect(state.status).toBe(RewardGenerationStatus.Generating);
  });
});

describe("SaveFile contract", () => {
  const saveFile: SaveFile = {
    version: SAVE_FILE_VERSION,
    playerName: "Rex",
    totalProblemsSolved: 10,
    totalProblemsAttempted: 12,
    currentDifficulty: DifficultyLevel.Medium,
    sessionsPlayed: 2,
    unlockedRewards: [
      {
        dinoName: "Tyrannosaurus Rex",
        imagePath: "dinos/tyrannosaurus-rex.png",
        earnedAt: "2026-02-17T12:05:00Z",
        milestoneNumber: 1,
      },
      {
        dinoName: "Velociraptor",
        imagePath: "dinos/velociraptor.png",
        earnedAt: "2026-02-17T12:10:00Z",
        milestoneNumber: 2,
      },
    ],
    sessionHistory: [
      {
        startedAt: "2026-02-17T11:00:00Z",
        endedAt: "2026-02-17T11:30:00Z",
        problemsSolved: 5,
        problemsAttempted: 6,
      },
      {
        startedAt: "2026-02-17T12:00:00Z",
        endedAt: null,
        problemsSolved: 5,
        problemsAttempted: 6,
      },
    ],
    lastSavedAt: "2026-02-17T12:10:00Z",
  };

  it("has correct schema version", () => {
    expect(saveFile.version).toBe(1);
  });

  it("stores player identity", () => {
    expect(saveFile.playerName).toBe("Rex");
  });

  it("tracks aggregated progress", () => {
    expect(saveFile.totalProblemsSolved).toBe(10);
    expect(saveFile.totalProblemsAttempted).toBe(12);
    expect(saveFile.currentDifficulty).toBe(DifficultyLevel.Medium);
  });

  it("stores unlocked rewards in order", () => {
    expect(saveFile.unlockedRewards).toHaveLength(2);
    expect(saveFile.unlockedRewards[0].dinoName).toBe("Tyrannosaurus Rex");
    expect(saveFile.unlockedRewards[1].milestoneNumber).toBe(2);
  });

  it("records session history", () => {
    expect(saveFile.sessionHistory).toHaveLength(2);
    expect(saveFile.sessionHistory[0].endedAt).not.toBeNull();
    expect(saveFile.sessionHistory[1].endedAt).toBeNull();
  });

  it("records last save timestamp", () => {
    expect(saveFile.lastSavedAt).toBe("2026-02-17T12:10:00Z");
  });

  it("derives save filename from playerName", () => {
    const filename = `${saveFile.playerName.toLowerCase()}-save.json`;
    expect(filename).toBe("rex-save.json");
  });
});

// ---------------------------------------------------------------------------
// Feature module re-export tests
// ---------------------------------------------------------------------------

describe("Feature module re-exports", () => {
  it("division-engine re-exports division types", async () => {
    const mod = await import("@/features/division-engine");
    expect(mod.DifficultyLevel).toBeDefined();
    expect(mod.StepKind).toBeDefined();
  });

  it("workspace-ui re-exports workspace types", async () => {
    const mod = await import("@/features/workspace-ui");
    // Type-only exports won't appear at runtime, so just verify module loads
    expect(mod).toBeDefined();
  });

  it("rewards re-exports reward types", async () => {
    const mod = await import("@/features/rewards");
    expect(mod.RewardGenerationStatus).toBeDefined();
  });

  it("persistence re-exports save-file types", async () => {
    const mod = await import("@/features/persistence");
    expect(mod.SAVE_FILE_VERSION).toBe(1);
  });

  it("gallery re-exports UnlockedReward type", async () => {
    const mod = await import("@/features/gallery");
    expect(mod).toBeDefined();
  });
});
