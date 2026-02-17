import { DifficultyLevel } from "@/types";
import type { PlayerProgress } from "@/types";
import {
  getDifficultyForSolvedCount,
  getCurrentDifficulty,
  problemsUntilNextTier,
  getNextDifficultyLevel,
  getAllDifficultyLevels,
  DIFFICULTY_THRESHOLDS,
} from "@/features/division-engine/difficulty-progression";
import { generateProblemForPlayer } from "@/features/division-engine/problem-generator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal PlayerProgress with the given lifetime solved count. */
function makeProgress(totalProblemsSolved: number): PlayerProgress {
  return {
    session: {
      problemsSolved: 0,
      problemsAttempted: 0,
      incorrectInputs: 0,
      startedAt: new Date().toISOString(),
    },
    lifetime: {
      totalProblemsSolved,
      totalProblemsAttempted: totalProblemsSolved,
      currentDifficulty: getDifficultyForSolvedCount(totalProblemsSolved),
      sessionsPlayed: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// Threshold configuration integrity
// ---------------------------------------------------------------------------

describe("DIFFICULTY_THRESHOLDS", () => {
  it("has exactly 4 tiers", () => {
    expect(DIFFICULTY_THRESHOLDS).toHaveLength(4);
  });

  it("starts at 0 (Easy is immediately available)", () => {
    expect(DIFFICULTY_THRESHOLDS[0].minSolved).toBe(0);
    expect(DIFFICULTY_THRESHOLDS[0].level).toBe(DifficultyLevel.Easy);
  });

  it("thresholds are in strictly ascending order", () => {
    for (let i = 1; i < DIFFICULTY_THRESHOLDS.length; i++) {
      expect(DIFFICULTY_THRESHOLDS[i].minSolved).toBeGreaterThan(
        DIFFICULTY_THRESHOLDS[i - 1].minSolved,
      );
    }
  });

  it("covers all DifficultyLevel enum values exactly once", () => {
    const levels = DIFFICULTY_THRESHOLDS.map((t) => t.level);
    const allLevels = Object.values(DifficultyLevel);
    expect(levels).toEqual(expect.arrayContaining(allLevels));
    expect(allLevels).toEqual(expect.arrayContaining(levels));
    // No duplicates
    expect(new Set(levels).size).toBe(levels.length);
  });
});

// ---------------------------------------------------------------------------
// getDifficultyForSolvedCount
// ---------------------------------------------------------------------------

describe("getDifficultyForSolvedCount", () => {
  it("returns Easy for 0 problems solved", () => {
    expect(getDifficultyForSolvedCount(0)).toBe(DifficultyLevel.Easy);
  });

  it("returns Easy for 1–9 problems solved", () => {
    for (let i = 1; i <= 9; i++) {
      expect(getDifficultyForSolvedCount(i)).toBe(DifficultyLevel.Easy);
    }
  });

  it("returns Medium at exactly 10 problems solved", () => {
    expect(getDifficultyForSolvedCount(10)).toBe(DifficultyLevel.Medium);
  });

  it("returns Medium for 10–24 problems solved", () => {
    for (let i = 10; i <= 24; i++) {
      expect(getDifficultyForSolvedCount(i)).toBe(DifficultyLevel.Medium);
    }
  });

  it("returns Hard at exactly 25 problems solved", () => {
    expect(getDifficultyForSolvedCount(25)).toBe(DifficultyLevel.Hard);
  });

  it("returns Hard for 25–49 problems solved", () => {
    for (let i = 25; i <= 49; i++) {
      expect(getDifficultyForSolvedCount(i)).toBe(DifficultyLevel.Hard);
    }
  });

  it("returns Expert at exactly 50 problems solved", () => {
    expect(getDifficultyForSolvedCount(50)).toBe(DifficultyLevel.Expert);
  });

  it("returns Expert for 50+ problems solved (including large numbers)", () => {
    expect(getDifficultyForSolvedCount(50)).toBe(DifficultyLevel.Expert);
    expect(getDifficultyForSolvedCount(100)).toBe(DifficultyLevel.Expert);
    expect(getDifficultyForSolvedCount(500)).toBe(DifficultyLevel.Expert);
    expect(getDifficultyForSolvedCount(9999)).toBe(DifficultyLevel.Expert);
  });

  it("transitions happen at exact boundary values", () => {
    // Easy → Medium boundary
    expect(getDifficultyForSolvedCount(9)).toBe(DifficultyLevel.Easy);
    expect(getDifficultyForSolvedCount(10)).toBe(DifficultyLevel.Medium);

    // Medium → Hard boundary
    expect(getDifficultyForSolvedCount(24)).toBe(DifficultyLevel.Medium);
    expect(getDifficultyForSolvedCount(25)).toBe(DifficultyLevel.Hard);

    // Hard → Expert boundary
    expect(getDifficultyForSolvedCount(49)).toBe(DifficultyLevel.Hard);
    expect(getDifficultyForSolvedCount(50)).toBe(DifficultyLevel.Expert);
  });
});

// ---------------------------------------------------------------------------
// getCurrentDifficulty (PlayerProgress-based)
// ---------------------------------------------------------------------------

describe("getCurrentDifficulty", () => {
  it("derives difficulty from lifetime.totalProblemsSolved", () => {
    expect(getCurrentDifficulty(makeProgress(0))).toBe(DifficultyLevel.Easy);
    expect(getCurrentDifficulty(makeProgress(9))).toBe(DifficultyLevel.Easy);
    expect(getCurrentDifficulty(makeProgress(10))).toBe(DifficultyLevel.Medium);
    expect(getCurrentDifficulty(makeProgress(25))).toBe(DifficultyLevel.Hard);
    expect(getCurrentDifficulty(makeProgress(50))).toBe(DifficultyLevel.Expert);
  });

  it("ignores session-level solved count (only lifetime matters)", () => {
    const progress = makeProgress(5); // Easy tier
    // Even if session has many solved, lifetime is what counts
    progress.session.problemsSolved = 100;
    expect(getCurrentDifficulty(progress)).toBe(DifficultyLevel.Easy);
  });
});

// ---------------------------------------------------------------------------
// problemsUntilNextTier
// ---------------------------------------------------------------------------

describe("problemsUntilNextTier", () => {
  it("returns correct count when in Easy tier", () => {
    expect(problemsUntilNextTier(0)).toBe(10);
    expect(problemsUntilNextTier(5)).toBe(5);
    expect(problemsUntilNextTier(9)).toBe(1);
  });

  it("returns correct count when in Medium tier", () => {
    expect(problemsUntilNextTier(10)).toBe(15);
    expect(problemsUntilNextTier(20)).toBe(5);
    expect(problemsUntilNextTier(24)).toBe(1);
  });

  it("returns correct count when in Hard tier", () => {
    expect(problemsUntilNextTier(25)).toBe(25);
    expect(problemsUntilNextTier(40)).toBe(10);
    expect(problemsUntilNextTier(49)).toBe(1);
  });

  it("returns null when already at Expert (highest tier)", () => {
    expect(problemsUntilNextTier(50)).toBeNull();
    expect(problemsUntilNextTier(100)).toBeNull();
    expect(problemsUntilNextTier(9999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getNextDifficultyLevel
// ---------------------------------------------------------------------------

describe("getNextDifficultyLevel", () => {
  it("returns Medium when currently Easy", () => {
    expect(getNextDifficultyLevel(0)).toBe(DifficultyLevel.Medium);
    expect(getNextDifficultyLevel(9)).toBe(DifficultyLevel.Medium);
  });

  it("returns Hard when currently Medium", () => {
    expect(getNextDifficultyLevel(10)).toBe(DifficultyLevel.Hard);
    expect(getNextDifficultyLevel(24)).toBe(DifficultyLevel.Hard);
  });

  it("returns Expert when currently Hard", () => {
    expect(getNextDifficultyLevel(25)).toBe(DifficultyLevel.Expert);
    expect(getNextDifficultyLevel(49)).toBe(DifficultyLevel.Expert);
  });

  it("returns null when already at Expert", () => {
    expect(getNextDifficultyLevel(50)).toBeNull();
    expect(getNextDifficultyLevel(500)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAllDifficultyLevels
// ---------------------------------------------------------------------------

describe("getAllDifficultyLevels", () => {
  it("returns levels in progression order", () => {
    expect(getAllDifficultyLevels()).toEqual([
      DifficultyLevel.Easy,
      DifficultyLevel.Medium,
      DifficultyLevel.Hard,
      DifficultyLevel.Expert,
    ]);
  });
});

// ---------------------------------------------------------------------------
// generateProblemForPlayer integration
// ---------------------------------------------------------------------------

describe("generateProblemForPlayer", () => {
  it("generates Easy problems for a new player", () => {
    const progress = makeProgress(0);
    const problems = Array.from({ length: 20 }, () =>
      generateProblemForPlayer(progress),
    );
    for (const p of problems) {
      expect(p.difficulty).toBe(DifficultyLevel.Easy);
    }
  });

  it("generates Medium problems after 10 lifetime solves", () => {
    const progress = makeProgress(10);
    const problems = Array.from({ length: 20 }, () =>
      generateProblemForPlayer(progress),
    );
    for (const p of problems) {
      expect(p.difficulty).toBe(DifficultyLevel.Medium);
    }
  });

  it("generates Hard problems after 25 lifetime solves", () => {
    const progress = makeProgress(25);
    const problems = Array.from({ length: 20 }, () =>
      generateProblemForPlayer(progress),
    );
    for (const p of problems) {
      expect(p.difficulty).toBe(DifficultyLevel.Hard);
    }
  });

  it("generates Expert problems after 50 lifetime solves", () => {
    const progress = makeProgress(50);
    const problems = Array.from({ length: 20 }, () =>
      generateProblemForPlayer(progress),
    );
    for (const p of problems) {
      expect(p.difficulty).toBe(DifficultyLevel.Expert);
    }
  });

  it("respects allowRemainder option", () => {
    const progress = makeProgress(15); // Medium tier
    const exact = Array.from({ length: 20 }, () =>
      generateProblemForPlayer(progress, { allowRemainder: false }),
    );
    for (const p of exact) {
      expect(p.remainder).toBe(0);
    }

    const withRemainder = Array.from({ length: 20 }, () =>
      generateProblemForPlayer(progress, { allowRemainder: true }),
    );
    for (const p of withRemainder) {
      expect(p.remainder).toBeGreaterThan(0);
    }
  });

  it("difficulty updates as lifetime count crosses thresholds", () => {
    // Simulate a player progressing through tiers
    const progress = makeProgress(0);

    // Start at Easy
    let problem = generateProblemForPlayer(progress);
    expect(problem.difficulty).toBe(DifficultyLevel.Easy);

    // Progress to Medium
    progress.lifetime.totalProblemsSolved = 10;
    problem = generateProblemForPlayer(progress);
    expect(problem.difficulty).toBe(DifficultyLevel.Medium);

    // Progress to Hard
    progress.lifetime.totalProblemsSolved = 25;
    problem = generateProblemForPlayer(progress);
    expect(problem.difficulty).toBe(DifficultyLevel.Hard);

    // Progress to Expert
    progress.lifetime.totalProblemsSolved = 50;
    problem = generateProblemForPlayer(progress);
    expect(problem.difficulty).toBe(DifficultyLevel.Expert);
  });
});
