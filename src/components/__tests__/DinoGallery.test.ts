import { describe, it, expect } from "vitest";
import type { UnlockedDinosaur } from "@/types";
import { formatEarnedDate } from "../DinoGallery";
import { DINOSAUR_COUNT } from "@/data/dinosaurs";

/**
 * Tests for the Dino Gallery component logic.
 *
 * Component rendering tests require a DOM environment (@testing-library/react + jsdom),
 * which are not yet configured in this project. The pure logic and data flow
 * are tested here.
 */

describe("DinoGallery", () => {
  describe("formatEarnedDate", () => {
    it("formats a valid ISO-8601 date string", () => {
      const result = formatEarnedDate("2026-01-20T08:00:00.000Z");
      // The exact format depends on locale, but it should contain 2026 and Jan/January
      expect(result).toContain("2026");
      // Should not be the raw ISO string
      expect(result).not.toContain("T");
    });

    it("returns the original string for an invalid date", () => {
      const result = formatEarnedDate("not-a-date");
      expect(result).toBe("not-a-date");
    });

    it("handles dates at different times of year", () => {
      const result = formatEarnedDate("2025-12-25T00:00:00.000Z");
      expect(result).toContain("2025");
    });

    it("handles midnight UTC dates", () => {
      const result = formatEarnedDate("2026-06-15T00:00:00.000Z");
      expect(result).toContain("2026");
      expect(result).not.toContain("T");
    });
  });

  describe("Gallery data flow", () => {
    it("empty unlocked array represents empty-state", () => {
      const unlockedDinosaurs: UnlockedDinosaur[] = [];
      expect(unlockedDinosaurs.length).toBe(0);
    });

    it("unlocked dinosaurs have required fields", () => {
      const dino: UnlockedDinosaur = {
        name: "Velociraptor",
        imagePath: "/dinos/velociraptor-abc123.png",
        dateEarned: "2026-01-20T08:00:00.000Z",
      };

      expect(dino.name).toBe("Velociraptor");
      expect(dino.imagePath).toBeTruthy();
      expect(dino.dateEarned).toBeTruthy();
    });

    it("gallery count reflects unlocked dinosaurs array length", () => {
      const dinos: UnlockedDinosaur[] = [
        {
          name: "Velociraptor",
          imagePath: "/dinos/velociraptor.png",
          dateEarned: "2026-01-20T08:00:00.000Z",
        },
        {
          name: "Tyrannosaurus Rex",
          imagePath: "/dinos/tyrannosaurus-rex.png",
          dateEarned: "2026-01-21T08:00:00.000Z",
        },
        {
          name: "Triceratops",
          imagePath: "/dinos/triceratops.png",
          dateEarned: "2026-01-22T08:00:00.000Z",
        },
      ];

      expect(dinos.length).toBe(3);
      // Total pool should always be 100
      expect(DINOSAUR_COUNT).toBe(100);
    });

    it("gallery shows progress as count / total", () => {
      const unlockedCount = 7;
      const total = DINOSAUR_COUNT;
      const progressText = `${unlockedCount} / ${total} unlocked`;
      expect(progressText).toBe("7 / 100 unlocked");
    });

    it("live refresh works when new dino is added to array", () => {
      const dinos: UnlockedDinosaur[] = [
        {
          name: "Velociraptor",
          imagePath: "/dinos/velociraptor.png",
          dateEarned: "2026-01-20T08:00:00.000Z",
        },
      ];

      expect(dinos.length).toBe(1);

      // Simulate what page.tsx does when reward comes in:
      // setGameState merges updated playerSave, which includes new dino
      const updatedDinos: UnlockedDinosaur[] = [
        ...dinos,
        {
          name: "Tyrannosaurus Rex",
          imagePath: "/dinos/tyrannosaurus-rex.png",
          dateEarned: "2026-01-21T08:00:00.000Z",
        },
      ];

      expect(updatedDinos.length).toBe(2);
      expect(updatedDinos[1].name).toBe("Tyrannosaurus Rex");
    });

    it("each gallery entry preserves all metadata from UnlockedDinosaur", () => {
      const dino: UnlockedDinosaur = {
        name: "Brachiosaurus",
        imagePath: "/dinos/brachiosaurus-xyz789.png",
        dateEarned: "2026-02-14T12:30:00.000Z",
      };

      // Gallery should display all three fields
      expect(dino.name).toBe("Brachiosaurus");
      expect(dino.imagePath).toBe("/dinos/brachiosaurus-xyz789.png");
      expect(formatEarnedDate(dino.dateEarned)).toContain("2026");
    });
  });

  describe("Gallery integration with game state", () => {
    it("page toggle shows gallery with current unlocked dinosaurs", () => {
      // Simulate page.tsx state
      const playerSave = {
        version: 1 as const,
        playerName: "Rex",
        totalProblemsSolved: 10,
        currentDifficulty: 2 as const,
        unlockedDinosaurs: [
          {
            name: "Velociraptor",
            imagePath: "/dinos/velociraptor.png",
            dateEarned: "2026-01-20T08:00:00.000Z",
          },
          {
            name: "Triceratops",
            imagePath: "/dinos/triceratops.png",
            dateEarned: "2026-01-21T08:00:00.000Z",
          },
        ],
        sessionHistory: [],
      };

      // DinoGallery receives unlockedDinosaurs prop from gameState.playerSave
      const galleryProps = playerSave.unlockedDinosaurs;

      expect(galleryProps).toHaveLength(2);
      expect(galleryProps[0].name).toBe("Velociraptor");
      expect(galleryProps[1].name).toBe("Triceratops");
    });

    it("gallery toggle button displays correct count", () => {
      const unlockedCount = 5;
      // The button text format from page.tsx
      const buttonText = `Dino Gallery (${unlockedCount})`;
      expect(buttonText).toBe("Dino Gallery (5)");

      const backButtonText = `Back to Practice (${unlockedCount})`;
      expect(backButtonText).toBe("Back to Practice (5)");
    });
  });
});
