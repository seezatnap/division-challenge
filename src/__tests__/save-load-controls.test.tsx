/**
 * Tests for SaveLoadControls component (task #24).
 *
 * Verifies the in-game save/load UI works in both FSA and non-FSA environments.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DifficultyLevel, SAVE_FILE_VERSION } from "@/types";
import type { GameSession, SaveFile } from "@/types";
import { SaveLoadControls } from "@/features/persistence/SaveLoadControls";

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
    unlockedRewards: [],
    ...overrides,
  };
}

function makeValidSaveFileData(): SaveFile {
  return {
    version: SAVE_FILE_VERSION,
    playerName: "Raptor",
    totalProblemsSolved: 20,
    totalProblemsAttempted: 25,
    currentDifficulty: DifficultyLevel.Hard,
    sessionsPlayed: 5,
    unlockedRewards: [],
    sessionHistory: [],
    lastSavedAt: "2026-02-17T12:00:00.000Z",
  };
}

function ensureNoFSA() {
  delete (window as unknown as Record<string, unknown>)["showSaveFilePicker"];
  delete (window as unknown as Record<string, unknown>)["showOpenFilePicker"];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SaveLoadControls", () => {
  const onSessionRestored = jest.fn();

  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(() => {
    onSessionRestored.mockClear();
    ensureNoFSA();
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

  it("renders Save Game and Load Game buttons", () => {
    render(
      <SaveLoadControls
        session={makeSession()}
        onSessionRestored={onSessionRestored}
      />,
    );
    expect(screen.getByText("Save Game")).toBeInTheDocument();
    expect(screen.getByText("Load Game")).toBeInTheDocument();
  });

  it("shows fallback hint when FSA is not supported", () => {
    render(
      <SaveLoadControls
        session={makeSession()}
        onSessionRestored={onSessionRestored}
      />,
    );
    expect(
      screen.getByText(/download\/upload save files as JSON/),
    ).toBeInTheDocument();
  });

  it("triggers download fallback save on Save Game click (no FSA)", async () => {
    const mockClick = jest.fn();
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "a") el.click = mockClick;
        return el;
      },
    );

    render(
      <SaveLoadControls
        session={makeSession()}
        onSessionRestored={onSessionRestored}
      />,
    );

    fireEvent.click(screen.getByText("Save Game"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Save file downloaded!",
      );
    });

    expect(mockClick).toHaveBeenCalled();
  });

  it("loads a save file via file input on Load Game click (no FSA)", async () => {
    const saveData = makeValidSaveFileData();
    const mockFile = {
      name: "raptor-save.json",
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

    render(
      <SaveLoadControls
        session={makeSession()}
        onSessionRestored={onSessionRestored}
      />,
    );

    fireEvent.click(screen.getByText("Load Game"));

    await waitFor(() => {
      expect(onSessionRestored).toHaveBeenCalledTimes(1);
    });

    const restored = onSessionRestored.mock.calls[0][0];
    expect(restored.playerName).toBe("Raptor");
    expect(restored.loadedFromSave).toBe(true);
    expect(restored.progress.lifetime.totalProblemsSolved).toBe(20);
  });

  it("shows error when loading an invalid file", async () => {
    const mockFile = {
      name: "bad.json",
      type: "application/json",
      text: () => Promise.resolve('{"not": "a save file"}'),
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

    render(
      <SaveLoadControls
        session={makeSession()}
        onSessionRestored={onSessionRestored}
      />,
    );

    fireEvent.click(screen.getByText("Load Game"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(onSessionRestored).not.toHaveBeenCalled();
  });

  it("does not call onSessionRestored when file picker is cancelled", async () => {
    jest.useFakeTimers();

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) => {
        const el = originalCreateElement(tagName, options);
        if (tagName === "input") {
          el.click = () => {
            window.dispatchEvent(new Event("focus"));
          };
        }
        return el;
      },
    );

    render(
      <SaveLoadControls
        session={makeSession()}
        onSessionRestored={onSessionRestored}
      />,
    );

    fireEvent.click(screen.getByText("Load Game"));
    jest.advanceTimersByTime(400);
    await jest.runAllTimersAsync();

    expect(onSessionRestored).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
