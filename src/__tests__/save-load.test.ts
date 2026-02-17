import { DifficultyLevel, SAVE_FILE_VERSION } from "@/types";
import type { GameSession, SaveFile, SessionRecord } from "@/types";
import {
  isFileSystemAccessSupported,
  buildSaveFile,
  validateSaveFile,
  parseSaveFileText,
  saveToDisk,
  loadFromDisk,
  loadFromFile,
  saveViaDownload,
} from "@/features/persistence/save-load";
import { restoreSessionFromSave } from "@/features/game-session/session-init";

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
    priorSessionHistory: [],
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

// ---------------------------------------------------------------------------
// isFileSystemAccessSupported
// ---------------------------------------------------------------------------

describe("isFileSystemAccessSupported", () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore window if needed
    if (!global.window) {
      Object.defineProperty(global, "window", { value: originalWindow, writable: true });
    }
  });

  it("returns true when showSaveFilePicker and showOpenFilePicker are present", () => {
    Object.defineProperty(window, "showSaveFilePicker", { value: jest.fn(), configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: jest.fn(), configurable: true });
    expect(isFileSystemAccessSupported()).toBe(true);
    // Cleanup
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
    delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
  });

  it("returns false when showSaveFilePicker is missing", () => {
    // jsdom doesn't define these by default
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
    delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
    expect(isFileSystemAccessSupported()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSaveFile
// ---------------------------------------------------------------------------

describe("buildSaveFile", () => {
  it("creates a save file with the correct version", () => {
    const save = buildSaveFile(makeSession());
    expect(save.version).toBe(SAVE_FILE_VERSION);
  });

  it("uses the session player name", () => {
    const save = buildSaveFile(makeSession({ playerName: "Raptor" }));
    expect(save.playerName).toBe("Raptor");
  });

  it("combines lifetime and session problems solved", () => {
    const save = buildSaveFile(makeSession());
    // lifetime: 10, session: 3 → total: 13
    expect(save.totalProblemsSolved).toBe(13);
  });

  it("combines lifetime and session problems attempted", () => {
    const save = buildSaveFile(makeSession());
    // lifetime: 12, session: 4 → total: 16
    expect(save.totalProblemsAttempted).toBe(16);
  });

  it("carries over the current difficulty", () => {
    const save = buildSaveFile(makeSession());
    expect(save.currentDifficulty).toBe(DifficultyLevel.Medium);
  });

  it("increments sessions played by one", () => {
    const save = buildSaveFile(makeSession());
    // lifetime: 2 + 1 = 3
    expect(save.sessionsPlayed).toBe(3);
  });

  it("copies unlocked rewards without sharing references", () => {
    const session = makeSession();
    const save = buildSaveFile(session);
    expect(save.unlockedRewards).toHaveLength(1);
    expect(save.unlockedRewards[0].dinoName).toBe("Tyrannosaurus Rex");
    expect(save.unlockedRewards).not.toBe(session.unlockedRewards);
  });

  it("creates a session history entry with session timing", () => {
    const save = buildSaveFile(makeSession());
    expect(save.sessionHistory).toHaveLength(1);
    expect(save.sessionHistory[0].startedAt).toBe("2026-02-17T10:00:00.000Z");
    expect(save.sessionHistory[0].endedAt).not.toBeNull();
    expect(save.sessionHistory[0].problemsSolved).toBe(3);
    expect(save.sessionHistory[0].problemsAttempted).toBe(4);
  });

  it("sets lastSavedAt to current time (ISO-8601)", () => {
    const before = new Date().toISOString();
    const save = buildSaveFile(makeSession());
    const after = new Date().toISOString();
    expect(save.lastSavedAt >= before).toBe(true);
    expect(save.lastSavedAt <= after).toBe(true);
  });

  it("handles a fresh session with zero progress", () => {
    const session = makeSession({
      progress: {
        session: {
          problemsSolved: 0,
          problemsAttempted: 0,
          incorrectInputs: 0,
          startedAt: new Date().toISOString(),
        },
        lifetime: {
          totalProblemsSolved: 0,
          totalProblemsAttempted: 0,
          currentDifficulty: DifficultyLevel.Easy,
          sessionsPlayed: 0,
        },
      },
      unlockedRewards: [],
    });
    const save = buildSaveFile(session);
    expect(save.totalProblemsSolved).toBe(0);
    expect(save.totalProblemsAttempted).toBe(0);
    expect(save.sessionsPlayed).toBe(1);
    expect(save.unlockedRewards).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateSaveFile
// ---------------------------------------------------------------------------

describe("validateSaveFile", () => {
  it("returns null for a valid save file", () => {
    expect(validateSaveFile(makeValidSaveFileData())).toBeNull();
  });

  it("rejects null", () => {
    expect(validateSaveFile(null)).not.toBeNull();
  });

  it("rejects non-object types", () => {
    expect(validateSaveFile("string")).not.toBeNull();
    expect(validateSaveFile(42)).not.toBeNull();
    expect(validateSaveFile(true)).not.toBeNull();
  });

  it("rejects wrong version", () => {
    const data = { ...makeValidSaveFileData(), version: 99 };
    expect(validateSaveFile(data)).toContain("version");
  });

  it("rejects missing player name", () => {
    const data = { ...makeValidSaveFileData(), playerName: "" };
    expect(validateSaveFile(data)).toContain("player name");
  });

  it("rejects non-string player name", () => {
    const data = { ...makeValidSaveFileData(), playerName: 123 };
    expect(validateSaveFile(data)).toContain("player name");
  });

  it("rejects negative totalProblemsSolved", () => {
    const data = { ...makeValidSaveFileData(), totalProblemsSolved: -1 };
    expect(validateSaveFile(data)).toContain("totalProblemsSolved");
  });

  it("rejects non-number totalProblemsSolved", () => {
    const data = { ...makeValidSaveFileData(), totalProblemsSolved: "ten" };
    expect(validateSaveFile(data)).toContain("totalProblemsSolved");
  });

  it("rejects negative totalProblemsAttempted", () => {
    const data = { ...makeValidSaveFileData(), totalProblemsAttempted: -5 };
    expect(validateSaveFile(data)).toContain("totalProblemsAttempted");
  });

  it("rejects invalid difficulty", () => {
    const data = { ...makeValidSaveFileData(), currentDifficulty: "impossible" };
    expect(validateSaveFile(data)).toContain("currentDifficulty");
  });

  it("rejects negative sessionsPlayed", () => {
    const data = { ...makeValidSaveFileData(), sessionsPlayed: -1 };
    expect(validateSaveFile(data)).toContain("sessionsPlayed");
  });

  it("rejects missing unlockedRewards array", () => {
    const data = { ...makeValidSaveFileData() } as Record<string, unknown>;
    delete data.unlockedRewards;
    expect(validateSaveFile(data)).toContain("unlockedRewards");
  });

  it("rejects invalid reward entries", () => {
    const data = {
      ...makeValidSaveFileData(),
      unlockedRewards: [{ dinoName: "T-Rex" }], // missing fields
    };
    expect(validateSaveFile(data)).toContain("reward entry");
  });

  it("rejects missing sessionHistory", () => {
    const data = { ...makeValidSaveFileData() } as Record<string, unknown>;
    delete data.sessionHistory;
    expect(validateSaveFile(data)).toContain("sessionHistory");
  });

  it("rejects missing lastSavedAt", () => {
    const data = { ...makeValidSaveFileData() } as Record<string, unknown>;
    delete data.lastSavedAt;
    expect(validateSaveFile(data)).toContain("lastSavedAt");
  });

  it("accepts zero values for numeric fields", () => {
    const data = {
      ...makeValidSaveFileData(),
      totalProblemsSolved: 0,
      totalProblemsAttempted: 0,
      sessionsPlayed: 0,
    };
    expect(validateSaveFile(data)).toBeNull();
  });

  it("accepts all valid difficulty levels", () => {
    for (const diff of Object.values(DifficultyLevel)) {
      const data = { ...makeValidSaveFileData(), currentDifficulty: diff };
      expect(validateSaveFile(data)).toBeNull();
    }
  });

  it("accepts empty arrays for rewards and history", () => {
    const data = {
      ...makeValidSaveFileData(),
      unlockedRewards: [],
      sessionHistory: [],
    };
    expect(validateSaveFile(data)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseSaveFileText
// ---------------------------------------------------------------------------

describe("parseSaveFileText", () => {
  it("parses valid JSON save file text", () => {
    const text = JSON.stringify(makeValidSaveFileData());
    const result = parseSaveFileText(text);
    expect(result.playerName).toBe("Rex");
    expect(result.version).toBe(SAVE_FILE_VERSION);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseSaveFileText("{invalid")).toThrow("valid JSON");
  });

  it("throws on valid JSON that fails validation", () => {
    expect(() => parseSaveFileText('{"foo": "bar"}')).toThrow();
  });

  it("throws with descriptive message for missing fields", () => {
    const badData = { version: SAVE_FILE_VERSION, playerName: "Rex" };
    expect(() => parseSaveFileText(JSON.stringify(badData))).toThrow("totalProblemsSolved");
  });
});

// ---------------------------------------------------------------------------
// saveToDisk
// ---------------------------------------------------------------------------

describe("saveToDisk", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
    delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
  });

  it("returns error when FSA is not supported", async () => {
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
    delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
    const result = await saveToDisk(makeSession());
    expect(result.success).toBe(false);
    expect(result.error).toContain("not supported");
  });

  it("writes save file via FSA API", async () => {
    const mockWrite = jest.fn();
    const mockClose = jest.fn();
    const mockCreateWritable = jest.fn().mockResolvedValue({
      write: mockWrite,
      close: mockClose,
    });
    const mockShowSave = jest.fn().mockResolvedValue({
      createWritable: mockCreateWritable,
    });

    Object.defineProperty(window, "showSaveFilePicker", { value: mockShowSave, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: jest.fn(), configurable: true });

    const result = await saveToDisk(makeSession());
    expect(result.success).toBe(true);
    expect(mockShowSave).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: "rex-save.json",
      }),
    );
    expect(mockWrite).toHaveBeenCalledWith(expect.any(String));

    // Verify the written JSON is valid
    const writtenJson = mockWrite.mock.calls[0][0];
    const parsed = JSON.parse(writtenJson);
    expect(parsed.playerName).toBe("Rex");
    expect(parsed.version).toBe(SAVE_FILE_VERSION);

    expect(mockClose).toHaveBeenCalled();
  });

  it("returns cancelled when user aborts file picker", async () => {
    const abortError = new DOMException("User cancelled", "AbortError");
    const mockShowSave = jest.fn().mockRejectedValue(abortError);

    Object.defineProperty(window, "showSaveFilePicker", { value: mockShowSave, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: jest.fn(), configurable: true });

    const result = await saveToDisk(makeSession());
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns error on write failure", async () => {
    const mockShowSave = jest.fn().mockRejectedValue(new Error("Disk full"));

    Object.defineProperty(window, "showSaveFilePicker", { value: mockShowSave, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: jest.fn(), configurable: true });

    const result = await saveToDisk(makeSession());
    expect(result.success).toBe(false);
    expect(result.error).toBe("Disk full");
  });

  it("suggests player-named filename", async () => {
    const mockShowSave = jest.fn().mockResolvedValue({
      createWritable: jest.fn().mockResolvedValue({
        write: jest.fn(),
        close: jest.fn(),
      }),
    });

    Object.defineProperty(window, "showSaveFilePicker", { value: mockShowSave, configurable: true });
    Object.defineProperty(window, "showOpenFilePicker", { value: jest.fn(), configurable: true });

    await saveToDisk(makeSession({ playerName: "Big Raptor" }));
    expect(mockShowSave).toHaveBeenCalledWith(
      expect.objectContaining({
        suggestedName: "big-raptor-save.json",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// loadFromDisk
// ---------------------------------------------------------------------------

describe("loadFromDisk", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
    delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
  });

  it("returns error when FSA is not supported", async () => {
    delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
    delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
    const result = await loadFromDisk();
    expect(result.success).toBe(false);
    expect(result.error).toContain("not supported");
  });

  it("loads and validates a save file via FSA API", async () => {
    const saveData = makeValidSaveFileData();
    const mockGetFile = jest.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify(saveData)),
    });
    const mockShowOpen = jest.fn().mockResolvedValue([{ getFile: mockGetFile }]);

    Object.defineProperty(window, "showOpenFilePicker", { value: mockShowOpen, configurable: true });
    Object.defineProperty(window, "showSaveFilePicker", { value: jest.fn(), configurable: true });

    const result = await loadFromDisk();
    expect(result.success).toBe(true);
    expect(result.saveFile?.playerName).toBe("Rex");
    expect(result.saveFile?.version).toBe(SAVE_FILE_VERSION);
  });

  it("returns cancelled when user aborts file picker", async () => {
    const abortError = new DOMException("User cancelled", "AbortError");
    const mockShowOpen = jest.fn().mockRejectedValue(abortError);

    Object.defineProperty(window, "showOpenFilePicker", { value: mockShowOpen, configurable: true });
    Object.defineProperty(window, "showSaveFilePicker", { value: jest.fn(), configurable: true });

    const result = await loadFromDisk();
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it("returns error on invalid JSON in loaded file", async () => {
    const mockGetFile = jest.fn().mockResolvedValue({
      text: () => Promise.resolve("{not valid json}"),
    });
    const mockShowOpen = jest.fn().mockResolvedValue([{ getFile: mockGetFile }]);

    Object.defineProperty(window, "showOpenFilePicker", { value: mockShowOpen, configurable: true });
    Object.defineProperty(window, "showSaveFilePicker", { value: jest.fn(), configurable: true });

    const result = await loadFromDisk();
    expect(result.success).toBe(false);
    expect(result.error).toContain("valid JSON");
  });

  it("returns error on valid JSON that fails save file validation", async () => {
    const mockGetFile = jest.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ foo: "bar" })),
    });
    const mockShowOpen = jest.fn().mockResolvedValue([{ getFile: mockGetFile }]);

    Object.defineProperty(window, "showOpenFilePicker", { value: mockShowOpen, configurable: true });
    Object.defineProperty(window, "showSaveFilePicker", { value: jest.fn(), configurable: true });

    const result = await loadFromDisk();
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// loadFromFile (fallback)
// ---------------------------------------------------------------------------

describe("loadFromFile", () => {
  function mockFile(content: string, name: string): File {
    const file = new File([content], name, { type: "application/json" });
    // jsdom File may lack text(), so add it if missing
    if (typeof file.text !== "function") {
      file.text = () => Promise.resolve(content);
    }
    return file;
  }

  it("parses and validates a File object with valid save data", async () => {
    const saveData = makeValidSaveFileData();
    const file = mockFile(JSON.stringify(saveData), "rex-save.json");

    const result = await loadFromFile(file);
    expect(result.success).toBe(true);
    expect(result.saveFile?.playerName).toBe("Rex");
  });

  it("returns error for invalid JSON content", async () => {
    const file = mockFile("{bad json", "bad.json");

    const result = await loadFromFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toContain("valid JSON");
  });

  it("returns error for valid JSON that is not a save file", async () => {
    const file = mockFile('{"name": "not a save"}', "random.json");

    const result = await loadFromFile(file);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("preserves all fields from the parsed save file", async () => {
    const saveData = makeValidSaveFileData();
    const file = mockFile(JSON.stringify(saveData), "rex-save.json");

    const result = await loadFromFile(file);
    expect(result.saveFile).toEqual(saveData);
  });
});

// ---------------------------------------------------------------------------
// saveViaDownload (fallback)
// ---------------------------------------------------------------------------

describe("saveViaDownload", () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    // jsdom doesn't implement URL.createObjectURL/revokeObjectURL
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

  it("triggers a download with the correct filename", () => {
    const mockClick = jest.fn();

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") {
          el.click = mockClick;
        }
        return el;
      },
    );

    saveViaDownload(makeSession());

    expect(mockClick).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("uses the correct player-derived filename for download", () => {
    const links: HTMLAnchorElement[] = [];

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") {
          el.click = jest.fn();
          links.push(el as HTMLAnchorElement);
        }
        return el;
      },
    );

    saveViaDownload(makeSession({ playerName: "Dino King" }));

    expect(links).toHaveLength(1);
    expect(links[0].download).toBe("dino-king-save.json");
  });
});

// ---------------------------------------------------------------------------
// Round-trip: buildSaveFile → parseSaveFileText
// ---------------------------------------------------------------------------

describe("round-trip save/load", () => {
  it("buildSaveFile output passes validateSaveFile", () => {
    const save = buildSaveFile(makeSession());
    expect(validateSaveFile(save)).toBeNull();
  });

  it("buildSaveFile → JSON → parseSaveFileText round-trips correctly", () => {
    const save = buildSaveFile(makeSession());
    const json = JSON.stringify(save);
    const restored = parseSaveFileText(json);

    expect(restored.playerName).toBe("Rex");
    expect(restored.totalProblemsSolved).toBe(13);
    expect(restored.version).toBe(SAVE_FILE_VERSION);
    expect(restored.unlockedRewards).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Session history preservation across save/load cycles
// ---------------------------------------------------------------------------

describe("sessionHistory preservation", () => {
  const priorHistory: SessionRecord[] = [
    {
      startedAt: "2026-02-16T08:00:00.000Z",
      endedAt: "2026-02-16T08:30:00.000Z",
      problemsSolved: 5,
      problemsAttempted: 6,
    },
    {
      startedAt: "2026-02-16T14:00:00.000Z",
      endedAt: "2026-02-16T14:45:00.000Z",
      problemsSolved: 7,
      problemsAttempted: 8,
    },
  ];

  it("preserves prior session history entries in buildSaveFile output", () => {
    const session = makeSession({ priorSessionHistory: priorHistory });
    const save = buildSaveFile(session);

    // Prior entries + current session entry
    expect(save.sessionHistory).toHaveLength(3);
    expect(save.sessionHistory[0]).toEqual(priorHistory[0]);
    expect(save.sessionHistory[1]).toEqual(priorHistory[1]);
    expect(save.sessionHistory[2].problemsSolved).toBe(3);
    expect(save.sessionHistory[2].problemsAttempted).toBe(4);
  });

  it("appends current session as the last entry in sessionHistory", () => {
    const session = makeSession({ priorSessionHistory: priorHistory });
    const save = buildSaveFile(session);

    const lastEntry = save.sessionHistory[save.sessionHistory.length - 1];
    expect(lastEntry.startedAt).toBe("2026-02-17T10:00:00.000Z");
    expect(lastEntry.endedAt).not.toBeNull();
  });

  it("produces a single entry when priorSessionHistory is empty", () => {
    const session = makeSession({ priorSessionHistory: [] });
    const save = buildSaveFile(session);

    expect(save.sessionHistory).toHaveLength(1);
    expect(save.sessionHistory[0].problemsSolved).toBe(3);
  });

  it("preserves sessionHistory across a full save → load → save round-trip", () => {
    // Session 1: first save (no prior history)
    const session1 = makeSession({ priorSessionHistory: [] });
    const save1 = buildSaveFile(session1);
    expect(save1.sessionHistory).toHaveLength(1);

    // Restore from save1 → creates session2 with prior history
    const session2 = restoreSessionFromSave(save1);
    expect(session2.priorSessionHistory).toHaveLength(1);
    expect(session2.priorSessionHistory[0].problemsSolved).toBe(3);

    // Simulate playing in session2
    session2.progress.session.problemsSolved = 5;
    session2.progress.session.problemsAttempted = 7;

    // Save session2 → should have 2 history entries
    const save2 = buildSaveFile(session2);
    expect(save2.sessionHistory).toHaveLength(2);
    expect(save2.sessionHistory[0].problemsSolved).toBe(3); // from session 1
    expect(save2.sessionHistory[1].problemsSolved).toBe(5); // from session 2

    // Restore from save2 → creates session3
    const session3 = restoreSessionFromSave(save2);
    expect(session3.priorSessionHistory).toHaveLength(2);

    // Simulate playing in session3
    session3.progress.session.problemsSolved = 2;
    session3.progress.session.problemsAttempted = 3;

    // Save session3 → should have 3 history entries
    const save3 = buildSaveFile(session3);
    expect(save3.sessionHistory).toHaveLength(3);
    expect(save3.sessionHistory[0].problemsSolved).toBe(3); // session 1
    expect(save3.sessionHistory[1].problemsSolved).toBe(5); // session 2
    expect(save3.sessionHistory[2].problemsSolved).toBe(2); // session 3
  });

  it("does not share array references between session and save file", () => {
    const session = makeSession({ priorSessionHistory: [...priorHistory] });
    const save = buildSaveFile(session);

    expect(save.sessionHistory).not.toBe(session.priorSessionHistory);
  });
});
