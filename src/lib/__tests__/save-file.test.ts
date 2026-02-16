import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isFileSystemAccessSupported,
  UNSUPPORTED_BROWSER_MESSAGE,
  saveFileName,
  saveGame,
  loadGame,
} from "../save-file";
import { createNewPlayerSave } from "@/types";
import type { PlayerSave } from "@/types";

// ─── Helpers ────────────────────────────────────────────────

function validSave(name = "Rex"): PlayerSave {
  return createNewPlayerSave(name);
}

function makeMockWritable() {
  return {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockFileHandle(content: string, fileName = "rex-save.json") {
  return {
    kind: "file" as const,
    name: fileName,
    getFile: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(content),
      name: fileName,
    }),
    createWritable: vi.fn().mockResolvedValue(makeMockWritable()),
  };
}

// ─── isFileSystemAccessSupported ────────────────────────────

describe("isFileSystemAccessSupported", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error restoring original undefined state
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("returns false when window is undefined (SSR)", () => {
    const w = globalThis.window;
    // @ts-expect-error simulating SSR
    delete globalThis.window;
    expect(isFileSystemAccessSupported()).toBe(false);
    globalThis.window = w;
  });

  it("returns false when showSaveFilePicker is missing", () => {
    // @ts-expect-error partial window mock
    globalThis.window = { showOpenFilePicker: vi.fn() };
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it("returns false when showOpenFilePicker is missing", () => {
    // @ts-expect-error partial window mock
    globalThis.window = { showSaveFilePicker: vi.fn() };
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it("returns true when both pickers are present", () => {
    // @ts-expect-error partial window mock
    globalThis.window = {
      showSaveFilePicker: vi.fn(),
      showOpenFilePicker: vi.fn(),
    };
    expect(isFileSystemAccessSupported()).toBe(true);
  });
});

// ─── saveFileName ───────────────────────────────────────────

describe("saveFileName", () => {
  it("produces lowercase slug with -save.json suffix", () => {
    expect(saveFileName("Rex")).toBe("rex-save.json");
  });

  it("replaces spaces and special characters with hyphens", () => {
    expect(saveFileName("Alan Grant")).toBe("alan-grant-save.json");
  });

  it("strips leading/trailing hyphens", () => {
    expect(saveFileName("  --Rex--  ")).toBe("rex-save.json");
  });

  it("collapses consecutive special characters", () => {
    expect(saveFileName("Dr.  Ian  Malcolm!")).toBe("dr-ian-malcolm-save.json");
  });

  it("falls back to 'player' for empty/whitespace-only names", () => {
    expect(saveFileName("")).toBe("player-save.json");
    expect(saveFileName("   ")).toBe("player-save.json");
  });

  it("handles names with numbers", () => {
    expect(saveFileName("Player1")).toBe("player1-save.json");
  });
});

// ─── saveGame ───────────────────────────────────────────────

describe("saveGame", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const writable = makeMockWritable();
    const handle = {
      createWritable: vi.fn().mockResolvedValue(writable),
    };
    // @ts-expect-error partial window mock
    globalThis.window = {
      showSaveFilePicker: vi.fn().mockResolvedValue(handle),
      showOpenFilePicker: vi.fn(),
    };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error restoring original undefined state
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("returns error when API is unsupported", async () => {
    // @ts-expect-error simulating missing API
    delete globalThis.window;
    const result = await saveGame(validSave());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(UNSUPPORTED_BROWSER_MESSAGE);
    }
  });

  it("calls showSaveFilePicker with correct options", async () => {
    const save = validSave("Alan Grant");
    await saveGame(save);
    expect(window.showSaveFilePicker).toHaveBeenCalledWith({
      suggestedName: "alan-grant-save.json",
      types: [
        {
          description: "Dino Division Save File",
          accept: { "application/json": [".json"] },
        },
      ],
    });
  });

  it("writes JSON to the writable stream and closes it", async () => {
    const save = validSave("Rex");
    const result = await saveGame(save);
    expect(result.ok).toBe(true);

    const handle = await window.showSaveFilePicker();
    const writable = await handle.createWritable();
    // The first call was from saveGame; the handle mock always returns same writable
    expect(writable.write).toHaveBeenCalled();
    expect(writable.close).toHaveBeenCalled();
  });

  it("returns ok:true on success", async () => {
    const result = await saveGame(validSave());
    expect(result).toEqual({ ok: true });
  });

  it("returns user-cancelled error on AbortError", async () => {
    const abort = new DOMException("User cancelled", "AbortError");
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abort);
    const result = await saveGame(validSave());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Save cancelled by user.");
    }
  });

  it("returns error message on unexpected failure", async () => {
    window.showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(new Error("Disk full"));
    const result = await saveGame(validSave());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Disk full");
    }
  });
});

// ─── loadGame ───────────────────────────────────────────────

describe("loadGame", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error restoring original undefined state
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  function setupWindow(content: string) {
    const handle = makeMockFileHandle(content);
    // @ts-expect-error partial window mock
    globalThis.window = {
      showSaveFilePicker: vi.fn(),
      showOpenFilePicker: vi.fn().mockResolvedValue([handle]),
    };
    return handle;
  }

  it("returns error when API is unsupported", async () => {
    // @ts-expect-error simulating missing API
    delete globalThis.window;
    const result = await loadGame();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(UNSUPPORTED_BROWSER_MESSAGE);
    }
  });

  it("calls showOpenFilePicker with correct options", async () => {
    const save = validSave("Rex");
    setupWindow(JSON.stringify(save));
    await loadGame();
    expect(window.showOpenFilePicker).toHaveBeenCalledWith({
      types: [
        {
          description: "Dino Division Save File",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    });
  });

  it("loads and returns valid save data", async () => {
    const save = validSave("Rex");
    setupWindow(JSON.stringify(save));
    const result = await loadGame();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.playerName).toBe("Rex");
      expect(result.data.version).toBe(1);
    }
  });

  it("loads a fully populated save", async () => {
    const save: PlayerSave = {
      version: 1,
      playerName: "Alan Grant",
      totalProblemsSolved: 42,
      currentDifficulty: 3,
      unlockedDinosaurs: [
        {
          name: "Tyrannosaurus Rex",
          imagePath: "/dinos/t-rex.png",
          dateEarned: "2026-01-15T10:30:00.000Z",
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
    setupWindow(JSON.stringify(save));
    const result = await loadGame();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalProblemsSolved).toBe(42);
      expect(result.data.unlockedDinosaurs).toHaveLength(1);
      expect(result.data.sessionHistory).toHaveLength(1);
    }
  });

  it("returns error for invalid JSON", async () => {
    setupWindow("not valid json {{{");
    const result = await loadGame();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("The selected file is not valid JSON.");
    }
  });

  it("returns error for JSON that fails schema validation", async () => {
    setupWindow(JSON.stringify({ version: 99, playerName: "" }));
    const result = await loadGame();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/^Invalid save file:/);
    }
  });

  it("returns user-cancelled error on AbortError", async () => {
    const abort = new DOMException("User cancelled", "AbortError");
    // @ts-expect-error partial window mock
    globalThis.window = {
      showSaveFilePicker: vi.fn(),
      showOpenFilePicker: vi.fn().mockRejectedValue(abort),
    };
    const result = await loadGame();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Load cancelled by user.");
    }
  });

  it("returns error message on unexpected failure", async () => {
    // @ts-expect-error partial window mock
    globalThis.window = {
      showSaveFilePicker: vi.fn(),
      showOpenFilePicker: vi
        .fn()
        .mockRejectedValue(new Error("Permission denied")),
    };
    const result = await loadGame();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Permission denied");
    }
  });
});

// ─── UNSUPPORTED_BROWSER_MESSAGE ────────────────────────────

describe("UNSUPPORTED_BROWSER_MESSAGE", () => {
  it("is a non-empty string", () => {
    expect(typeof UNSUPPORTED_BROWSER_MESSAGE).toBe("string");
    expect(UNSUPPORTED_BROWSER_MESSAGE.length).toBeGreaterThan(0);
  });

  it("mentions browser compatibility", () => {
    expect(UNSUPPORTED_BROWSER_MESSAGE).toMatch(/Chrome|Edge|Opera/);
  });
});
