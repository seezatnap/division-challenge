import { DifficultyLevel, SAVE_FILE_VERSION } from "@/types";
import type { SaveFile } from "@/types";
import {
  createNewSession,
  restoreSessionFromSave,
  validatePlayerName,
  saveFileNameFromPlayer,
} from "@/features/game-session/session-init";

// ---------------------------------------------------------------------------
// createNewSession
// ---------------------------------------------------------------------------

describe("createNewSession", () => {
  it("creates a session with the given player name", () => {
    const session = createNewSession("Rex");
    expect(session.playerName).toBe("Rex");
  });

  it("marks the session as not loaded from save", () => {
    const session = createNewSession("Rex");
    expect(session.loadedFromSave).toBe(false);
  });

  it("initializes session progress to zero", () => {
    const session = createNewSession("Rex");
    expect(session.progress.session.problemsSolved).toBe(0);
    expect(session.progress.session.problemsAttempted).toBe(0);
    expect(session.progress.session.incorrectInputs).toBe(0);
  });

  it("sets a valid ISO-8601 session start time", () => {
    const before = new Date().toISOString();
    const session = createNewSession("Rex");
    const after = new Date().toISOString();
    expect(session.progress.session.startedAt >= before).toBe(true);
    expect(session.progress.session.startedAt <= after).toBe(true);
  });

  it("initializes lifetime progress to zero with Easy difficulty", () => {
    const session = createNewSession("Rex");
    expect(session.progress.lifetime.totalProblemsSolved).toBe(0);
    expect(session.progress.lifetime.totalProblemsAttempted).toBe(0);
    expect(session.progress.lifetime.currentDifficulty).toBe(
      DifficultyLevel.Easy,
    );
    expect(session.progress.lifetime.sessionsPlayed).toBe(0);
  });

  it("starts with empty unlocked rewards", () => {
    const session = createNewSession("Rex");
    expect(session.unlockedRewards).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// restoreSessionFromSave
// ---------------------------------------------------------------------------

describe("restoreSessionFromSave", () => {
  const mockSave: SaveFile = {
    version: SAVE_FILE_VERSION,
    playerName: "Raptor",
    totalProblemsSolved: 15,
    totalProblemsAttempted: 20,
    currentDifficulty: DifficultyLevel.Medium,
    sessionsPlayed: 3,
    unlockedRewards: [
      {
        dinoName: "Tyrannosaurus Rex",
        imagePath: "/dinos/tyrannosaurus-rex.png",
        earnedAt: "2025-01-01T00:00:00.000Z",
        milestoneNumber: 1,
      },
    ],
    sessionHistory: [],
    lastSavedAt: "2025-01-01T00:00:00.000Z",
  };

  it("restores the player name from the save file", () => {
    const session = restoreSessionFromSave(mockSave);
    expect(session.playerName).toBe("Raptor");
  });

  it("marks the session as loaded from save", () => {
    const session = restoreSessionFromSave(mockSave);
    expect(session.loadedFromSave).toBe(true);
  });

  it("starts a fresh session timer (zeroed session progress)", () => {
    const session = restoreSessionFromSave(mockSave);
    expect(session.progress.session.problemsSolved).toBe(0);
    expect(session.progress.session.problemsAttempted).toBe(0);
    expect(session.progress.session.incorrectInputs).toBe(0);
  });

  it("carries over lifetime stats from the save", () => {
    const session = restoreSessionFromSave(mockSave);
    expect(session.progress.lifetime.totalProblemsSolved).toBe(15);
    expect(session.progress.lifetime.totalProblemsAttempted).toBe(20);
    expect(session.progress.lifetime.currentDifficulty).toBe(
      DifficultyLevel.Medium,
    );
    expect(session.progress.lifetime.sessionsPlayed).toBe(3);
  });

  it("copies unlocked rewards from the save", () => {
    const session = restoreSessionFromSave(mockSave);
    expect(session.unlockedRewards).toHaveLength(1);
    expect(session.unlockedRewards[0].dinoName).toBe("Tyrannosaurus Rex");
  });

  it("does not share array references with the save file", () => {
    const session = restoreSessionFromSave(mockSave);
    expect(session.unlockedRewards).not.toBe(mockSave.unlockedRewards);
  });
});

// ---------------------------------------------------------------------------
// validatePlayerName
// ---------------------------------------------------------------------------

describe("validatePlayerName", () => {
  it("accepts valid names", () => {
    expect(validatePlayerName("Rex")).toBeNull();
    expect(validatePlayerName("Dino King")).toBeNull();
  });

  it("accepts names with letters, numbers, spaces, hyphens, underscores", () => {
    expect(validatePlayerName("Player-1")).toBeNull();
    expect(validatePlayerName("cool_dino")).toBeNull();
    expect(validatePlayerName("Rex 2")).toBeNull();
  });

  it("rejects empty or whitespace-only names", () => {
    expect(validatePlayerName("")).not.toBeNull();
    expect(validatePlayerName("   ")).not.toBeNull();
  });

  it("rejects names shorter than 2 characters", () => {
    expect(validatePlayerName("A")).not.toBeNull();
  });

  it("rejects names longer than 30 characters", () => {
    expect(validatePlayerName("A".repeat(31))).not.toBeNull();
  });

  it("rejects names with special characters", () => {
    expect(validatePlayerName("Rex!")).not.toBeNull();
    expect(validatePlayerName("Dr. Dino")).not.toBeNull();
    expect(validatePlayerName("<script>")).not.toBeNull();
  });

  it("returns a descriptive error string for invalid names", () => {
    const error = validatePlayerName("");
    expect(typeof error).toBe("string");
    expect(error!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// saveFileNameFromPlayer
// ---------------------------------------------------------------------------

describe("saveFileNameFromPlayer", () => {
  it("lowercases and appends -save.json", () => {
    expect(saveFileNameFromPlayer("Rex")).toBe("rex-save.json");
  });

  it("replaces spaces with hyphens", () => {
    expect(saveFileNameFromPlayer("Big Rex")).toBe("big-rex-save.json");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(saveFileNameFromPlayer("Big   Rex")).toBe("big-rex-save.json");
  });

  it("trims leading and trailing whitespace", () => {
    expect(saveFileNameFromPlayer("  Rex  ")).toBe("rex-save.json");
  });
});
