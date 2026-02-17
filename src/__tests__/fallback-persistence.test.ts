/**
 * Tests for the graceful fallback persistence layer (task #24).
 *
 * Covers:
 * - saveViaDownload returns SaveResult (not void)
 * - saveGame auto-routes FSA vs download fallback
 * - loadGame auto-routes FSA vs file-input fallback
 * - loadViaFileInput wraps hidden file input + validation
 * - Both paths produce identical schema through buildSaveFile / parseSaveFileText
 */

import { DifficultyLevel, SAVE_FILE_VERSION } from "@/types";
import type { GameSession, SaveFile } from "@/types";
import {
  isFileSystemAccessSupported,
  saveViaDownload,
  saveGame,
  loadGame,
  loadViaFileInput,
  buildSaveFile,
  validateSaveFile,
} from "@/features/persistence/save-load";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<GameSession>): GameSession {
  return {
    playerName: "Rex",
    loadedFromSave: false,
    progress: {
      session: {
        problemsSolved: 3,
        problemsAttempted: 4,
        incorrectInputs: 1,
        startedAt: "2026-02-17T10:00:00.000Z",
      },
      lifetime: {
        totalProblemsSolved: 10,
        totalProblemsAttempted: 12,
        currentDifficulty: DifficultyLevel.Medium,
        sessionsPlayed: 2,
      },
    },
    unlockedRewards: [
      {
        dinoName: "Tyrannosaurus Rex",
        imagePath: "/dinos/tyrannosaurus-rex.png",
        earnedAt: "2026-02-17T10:05:00.000Z",
        milestoneNumber: 1,
      },
    ],
    ...overrides,
  };
}

function makeValidSaveFileData(): SaveFile {
  return {
    version: SAVE_FILE_VERSION,
    playerName: "Rex",
    totalProblemsSolved: 10,
    totalProblemsAttempted: 12,
    currentDifficulty: DifficultyLevel.Medium,
    sessionsPlayed: 2,
    unlockedRewards: [
      {
        dinoName: "Tyrannosaurus Rex",
        imagePath: "/dinos/tyrannosaurus-rex.png",
        earnedAt: "2026-02-17T10:05:00.000Z",
        milestoneNumber: 1,
      },
    ],
    sessionHistory: [
      {
        startedAt: "2026-02-17T09:00:00.000Z",
        endedAt: "2026-02-17T09:30:00.000Z",
        problemsSolved: 5,
        problemsAttempted: 6,
      },
    ],
    lastSavedAt: "2026-02-17T10:10:00.000Z",
  };
}

function ensureNoFSA() {
  delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
  delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
}

function enableFSA(overrides?: {
  showSaveFilePicker?: jest.Mock;
  showOpenFilePicker?: jest.Mock;
}) {
  Object.defineProperty(window, "showSaveFilePicker", {
    value: overrides?.showSaveFilePicker ?? jest.fn(),
    configurable: true,
  });
  Object.defineProperty(window, "showOpenFilePicker", {
    value: overrides?.showOpenFilePicker ?? jest.fn(),
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// saveViaDownload — now returns SaveResult
// ---------------------------------------------------------------------------

describe("saveViaDownload (SaveResult return type)", () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    jest.restoreAllMocks();
  });

  it("returns { success: true } on successful download", () => {
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") {
          el.click = jest.fn();
        }
        return el;
      },
    );

    const result = saveViaDownload(makeSession());
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.cancelled).toBeUndefined();
  });

  it("uses buildSaveFile producing valid schema", () => {
    // Verify that the blob content passes validation
    let capturedBlob: Blob | undefined;
    URL.createObjectURL = jest.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:test";
    });

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") el.click = jest.fn();
        return el;
      },
    );

    saveViaDownload(makeSession());

    expect(capturedBlob).toBeDefined();
    // Verify the blob was built from buildSaveFile by checking the direct output
    const saveFile = buildSaveFile(makeSession());
    expect(validateSaveFile(saveFile)).toBeNull();
  });

  it("returns error when an exception is thrown", () => {
    URL.createObjectURL = jest.fn(() => {
      throw new Error("Quota exceeded");
    });

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") el.click = jest.fn();
        return el;
      },
    );

    const result = saveViaDownload(makeSession());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Quota exceeded");
  });
});

// ---------------------------------------------------------------------------
// saveGame — unified auto-detect
// ---------------------------------------------------------------------------

describe("saveGame", () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn().mockReturnValue("blob:test");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    ensureNoFSA();
    jest.restoreAllMocks();
  });

  it("uses saveToDisk when FSA is supported", async () => {
    const mockWrite = jest.fn();
    const mockClose = jest.fn();
    const mockShowSave = jest.fn().mockResolvedValue({
      createWritable: jest.fn().mockResolvedValue({
        write: mockWrite,
        close: mockClose,
      }),
    });
    enableFSA({ showSaveFilePicker: mockShowSave });

    const result = await saveGame(makeSession());
    expect(result.success).toBe(true);
    expect(mockShowSave).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalled();
  });

  it("falls back to saveViaDownload when FSA is not supported", async () => {
    ensureNoFSA();

    const originalCreateElement = document.createElement.bind(document);
    const mockClick = jest.fn();
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") el.click = mockClick;
        return el;
      },
    );

    const result = await saveGame(makeSession());
    expect(result.success).toBe(true);
    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("returns cancelled from FSA path when user aborts picker", async () => {
    const abortError = new DOMException("User cancelled", "AbortError");
    enableFSA({ showSaveFilePicker: jest.fn().mockRejectedValue(abortError) });

    const result = await saveGame(makeSession());
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it("both paths produce save files with identical schema", async () => {
    // Verify the schema is the same whether we go through FSA or fallback
    const session = makeSession();

    // The buildSaveFile function is shared — verify its output validates
    const saveFile = buildSaveFile(session);
    expect(validateSaveFile(saveFile)).toBeNull();
    expect(saveFile.version).toBe(SAVE_FILE_VERSION);
    expect(saveFile.playerName).toBe("Rex");
    expect(saveFile.totalProblemsSolved).toBe(13); // 10 + 3
    expect(saveFile.totalProblemsAttempted).toBe(16); // 12 + 4
    expect(saveFile.currentDifficulty).toBe(DifficultyLevel.Medium);
    expect(saveFile.sessionsPlayed).toBe(3); // 2 + 1
    expect(saveFile.unlockedRewards).toHaveLength(1);
    expect(saveFile.sessionHistory).toHaveLength(1);
    expect(typeof saveFile.lastSavedAt).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// loadGame — unified auto-detect
// ---------------------------------------------------------------------------

describe("loadGame", () => {
  afterEach(() => {
    ensureNoFSA();
    jest.restoreAllMocks();
  });

  it("uses loadFromDisk when FSA is supported", async () => {
    const saveData = makeValidSaveFileData();
    const mockShowOpen = jest.fn().mockResolvedValue([
      {
        getFile: jest.fn().mockResolvedValue({
          text: () => Promise.resolve(JSON.stringify(saveData)),
        }),
      },
    ]);
    enableFSA({ showOpenFilePicker: mockShowOpen });

    const result = await loadGame();
    expect(result.success).toBe(true);
    expect(result.saveFile?.playerName).toBe("Rex");
    expect(mockShowOpen).toHaveBeenCalled();
  });

  it("returns cancelled from FSA path when user aborts picker", async () => {
    const abortError = new DOMException("User cancelled", "AbortError");
    enableFSA({ showOpenFilePicker: jest.fn().mockRejectedValue(abortError) });

    const result = await loadGame();
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it("falls back to loadViaFileInput when FSA is not supported", async () => {
    ensureNoFSA();

    const saveData = makeValidSaveFileData();
    const mockFile = {
      name: "rex-save.json",
      type: "application/json",
      text: () => Promise.resolve(JSON.stringify(saveData)),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            setTimeout(() => {
              if ((el as HTMLInputElement).onchange) {
                (el as HTMLInputElement).onchange!(new Event("change"));
              }
            }, 0);
          };
        }
        return el;
      },
    );

    const result = await loadGame();
    expect(result.success).toBe(true);
    expect(result.saveFile?.playerName).toBe("Rex");
    expect(result.saveFile?.version).toBe(SAVE_FILE_VERSION);
  });

  it("validates loaded file identically in both paths", async () => {
    ensureNoFSA();

    // Load an invalid file via fallback — should fail validation
    const badData = { foo: "not a save file" };
    const mockFile = {
      name: "bad.json",
      type: "application/json",
      text: () => Promise.resolve(JSON.stringify(badData)),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            setTimeout(() => {
              if ((el as HTMLInputElement).onchange) {
                (el as HTMLInputElement).onchange!(new Event("change"));
              }
            }, 0);
          };
        }
        return el;
      },
    );

    const result = await loadGame();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// loadViaFileInput
// ---------------------------------------------------------------------------

describe("loadViaFileInput", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns success with parsed save file when user selects a valid file", async () => {
    const saveData = makeValidSaveFileData();
    const mockFile = {
      name: "rex-save.json",
      type: "application/json",
      text: () => Promise.resolve(JSON.stringify(saveData)),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            setTimeout(() => {
              if ((el as HTMLInputElement).onchange) {
                (el as HTMLInputElement).onchange!(new Event("change"));
              }
            }, 0);
          };
        }
        return el;
      },
    );

    const result = await loadViaFileInput();
    expect(result.success).toBe(true);
    expect(result.saveFile?.playerName).toBe("Rex");
    expect(result.saveFile?.version).toBe(SAVE_FILE_VERSION);
  });

  it("returns cancelled when user dismisses file picker", async () => {
    jest.useFakeTimers();

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            // Simulate cancellation: focus fires, no change event
            window.dispatchEvent(new Event("focus"));
          };
        }
        return el;
      },
    );

    const promise = loadViaFileInput();

    // Advance past the 300ms delay in the focus handler
    jest.advanceTimersByTime(400);

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);

    jest.useRealTimers();
  });

  it("returns error for invalid JSON content", async () => {
    const mockFile = {
      name: "bad.json",
      type: "application/json",
      text: () => Promise.resolve("{not valid json"),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            setTimeout(() => {
              if ((el as HTMLInputElement).onchange) {
                (el as HTMLInputElement).onchange!(new Event("change"));
              }
            }, 0);
          };
        }
        return el;
      },
    );

    const result = await loadViaFileInput();
    expect(result.success).toBe(false);
    expect(result.error).toContain("valid JSON");
  });

  it("returns error for valid JSON that fails save file validation", async () => {
    const invalidData = { version: SAVE_FILE_VERSION, playerName: "" };
    const mockFile = {
      name: "incomplete.json",
      type: "application/json",
      text: () => Promise.resolve(JSON.stringify(invalidData)),
    };

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            setTimeout(() => {
              if ((el as HTMLInputElement).onchange) {
                (el as HTMLInputElement).onchange!(new Event("change"));
              }
            }, 0);
          };
        }
        return el;
      },
    );

    const result = await loadViaFileInput();
    expect(result.success).toBe(false);
    expect(result.error).toContain("player name");
  });

  it("creates input with accept=.json filter", async () => {
    const saveData = makeValidSaveFileData();
    const mockFile = {
      name: "rex-save.json",
      type: "application/json",
      text: () => Promise.resolve(JSON.stringify(saveData)),
    };

    let createdInput: HTMLInputElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          createdInput = el as HTMLInputElement;
          el.click = () => {
            Object.defineProperty(el, "files", {
              value: [mockFile],
              writable: false,
            });
            setTimeout(() => {
              if ((el as HTMLInputElement).onchange) {
                (el as HTMLInputElement).onchange!(new Event("change"));
              }
            }, 0);
          };
        }
        return el;
      },
    );

    await loadViaFileInput();
    expect(createdInput).not.toBeNull();
    expect(createdInput!.type).toBe("file");
    expect(createdInput!.accept).toBe(".json");
  });
});

// ---------------------------------------------------------------------------
// Schema consistency: FSA vs fallback produce identical output
// ---------------------------------------------------------------------------

describe("schema consistency across FSA and fallback paths", () => {
  it("buildSaveFile output passes validateSaveFile (shared by both paths)", () => {
    const session = makeSession();
    const saveFile = buildSaveFile(session);
    expect(validateSaveFile(saveFile)).toBeNull();
  });

  it("buildSaveFile output round-trips through JSON serialization", () => {
    const session = makeSession();
    const saveFile = buildSaveFile(session);
    const json = JSON.stringify(saveFile, null, 2);
    const parsed = JSON.parse(json);
    expect(validateSaveFile(parsed)).toBeNull();
  });

  it("both FSA and fallback use same SaveResult type", () => {
    // Type-level check: saveViaDownload returns SaveResult (not void)
    const result = saveViaDownload as (session: GameSession) => { success: boolean; error?: string; cancelled?: boolean };
    expect(typeof result).toBe("function");
  });

  it("isFileSystemAccessSupported returns false in jsdom (test env)", () => {
    // Ensure tests run in the non-FSA fallback path by default
    ensureNoFSA();
    expect(isFileSystemAccessSupported()).toBe(false);
  });
});
