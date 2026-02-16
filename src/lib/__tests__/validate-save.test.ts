import { describe, it, expect } from "vitest";
import { validatePlayerSave } from "../validate-save";
import { createNewPlayerSave } from "@/types";
import type { PlayerSave } from "@/types";

describe("validatePlayerSave", () => {
  it("accepts a valid new player save", () => {
    const save = createNewPlayerSave("Rex");
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.playerName).toBe("Rex");
    }
  });

  it("accepts a fully populated save", () => {
    const save: PlayerSave = {
      version: 1,
      playerName: "Alan Grant",
      totalProblemsSolved: 42,
      currentDifficulty: 3,
      unlockedDinosaurs: [
        {
          name: "Tyrannosaurus Rex",
          imagePath: "/dinos/t-rex-abc123.png",
          dateEarned: "2026-01-15T10:30:00.000Z",
        },
        {
          name: "Velociraptor",
          imagePath: "/dinos/raptor-def456.png",
          dateEarned: "2026-01-16T14:00:00.000Z",
        },
      ],
      sessionHistory: [
        {
          startedAt: "2026-01-15T10:00:00.000Z",
          endedAt: "2026-01-15T10:45:00.000Z",
          problemsSolved: 10,
          problemsAttempted: 12,
          startDifficulty: 1,
          endDifficulty: 2,
        },
      ],
    };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(true);
  });

  it("rejects null", () => {
    const result = validatePlayerSave(null);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain("Save data must be a JSON object.");
    }
  });

  it("rejects an array", () => {
    const result = validatePlayerSave([]);
    expect(result.valid).toBe(false);
  });

  it("rejects a non-object primitive", () => {
    const result = validatePlayerSave("hello");
    expect(result.valid).toBe(false);
  });

  it("rejects wrong version", () => {
    const save = { ...createNewPlayerSave("Rex"), version: 2 };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("version"))).toBe(true);
    }
  });

  it("rejects empty playerName", () => {
    const save = createNewPlayerSave("");
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("playerName"))).toBe(true);
    }
  });

  it("rejects negative totalProblemsSolved", () => {
    const save = { ...createNewPlayerSave("Rex"), totalProblemsSolved: -1 };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("totalProblemsSolved"))
      ).toBe(true);
    }
  });

  it("rejects invalid currentDifficulty", () => {
    const save = {
      ...createNewPlayerSave("Rex"),
      currentDifficulty: 6 as never,
    };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("currentDifficulty"))
      ).toBe(true);
    }
  });

  it("rejects dinosaur with missing name", () => {
    const save = {
      ...createNewPlayerSave("Rex"),
      unlockedDinosaurs: [
        { name: "", imagePath: "/foo.png", dateEarned: "2026-01-01T00:00:00Z" },
      ],
    };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("unlockedDinosaurs[0].name"))
      ).toBe(true);
    }
  });

  it("rejects dinosaur with invalid dateEarned", () => {
    const save = {
      ...createNewPlayerSave("Rex"),
      unlockedDinosaurs: [
        {
          name: "T-Rex",
          imagePath: "/foo.png",
          dateEarned: "not-a-date",
        },
      ],
    };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) =>
          e.includes("unlockedDinosaurs[0].dateEarned")
        )
      ).toBe(true);
    }
  });

  it("rejects session with invalid startedAt", () => {
    const save = {
      ...createNewPlayerSave("Rex"),
      sessionHistory: [
        {
          startedAt: "bad",
          problemsSolved: 1,
          problemsAttempted: 1,
          startDifficulty: 1,
          endDifficulty: 1,
        },
      ],
    };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(
        result.errors.some((e) => e.includes("sessionHistory[0].startedAt"))
      ).toBe(true);
    }
  });

  it("accepts session without endedAt (still active)", () => {
    const save = {
      ...createNewPlayerSave("Rex"),
      sessionHistory: [
        {
          startedAt: "2026-01-15T10:00:00.000Z",
          problemsSolved: 5,
          problemsAttempted: 5,
          startDifficulty: 1 as const,
          endDifficulty: 1 as const,
        },
      ],
    };
    const result = validatePlayerSave(save);
    expect(result.valid).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const result = validatePlayerSave({
      version: 99,
      playerName: "",
      totalProblemsSolved: -5,
      currentDifficulty: 0,
      unlockedDinosaurs: "not-an-array",
      sessionHistory: "not-an-array",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    }
  });
});
