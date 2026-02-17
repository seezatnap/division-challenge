import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GameStartFlow } from "@/features/game-session/GameStartFlow";
import { DifficultyLevel, SAVE_FILE_VERSION } from "@/types";

describe("GameStartFlow", () => {
  const onSessionReady = jest.fn();

  beforeEach(() => {
    onSessionReady.mockClear();
  });

  // ── Name-entry phase ─────────────────────────────────────────────

  it("renders the name entry form initially", () => {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    expect(screen.getByText("Welcome, Explorer!")).toBeInTheDocument();
    expect(screen.getByLabelText("Player Name")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("shows validation error for empty name", () => {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows validation error for single character name", () => {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    fireEvent.change(screen.getByLabelText("Player Name"), {
      target: { value: "A" },
    });
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "at least 2 characters",
    );
  });

  it("clears validation error when user starts typing", () => {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Player Name"), {
      target: { value: "Rex" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("advances to load-or-new phase on valid name submission", () => {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    fireEvent.change(screen.getByLabelText("Player Name"), {
      target: { value: "Rex" },
    });
    fireEvent.click(screen.getByText("Continue"));

    expect(screen.getByText("Welcome, Rex!")).toBeInTheDocument();
    expect(screen.getByText("Start New Game")).toBeInTheDocument();
    expect(screen.getByText("Load Existing Save")).toBeInTheDocument();
  });

  it("submits form on Enter key press", () => {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    const input = screen.getByLabelText("Player Name");
    fireEvent.change(input, { target: { value: "Rex" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByText("Welcome, Rex!")).toBeInTheDocument();
  });

  // ── Load-or-new phase ────────────────────────────────────────────

  function advanceToLoadOrNew() {
    render(<GameStartFlow onSessionReady={onSessionReady} />);
    fireEvent.change(screen.getByLabelText("Player Name"), {
      target: { value: "Rex" },
    });
    fireEvent.click(screen.getByText("Continue"));
  }

  it("shows the expected save filename hint", () => {
    advanceToLoadOrNew();
    expect(screen.getByText("rex-save.json")).toBeInTheDocument();
  });

  it("creates a new session when 'Start New Game' is clicked", () => {
    advanceToLoadOrNew();
    fireEvent.click(screen.getByText("Start New Game"));

    expect(onSessionReady).toHaveBeenCalledTimes(1);
    const session = onSessionReady.mock.calls[0][0];
    expect(session.playerName).toBe("Rex");
    expect(session.loadedFromSave).toBe(false);
    expect(session.progress.lifetime.currentDifficulty).toBe(
      DifficultyLevel.Easy,
    );
  });

  it("navigates back to name entry when 'Change name' is clicked", () => {
    advanceToLoadOrNew();
    fireEvent.click(screen.getByText(/Change name/));
    expect(screen.getByText("Welcome, Explorer!")).toBeInTheDocument();
  });

  // ── Load save via fallback (file input) ──────────────────────────

  it("loads a save file via hidden file input when FSA is unavailable", async () => {
    advanceToLoadOrNew();

    const saveData = JSON.stringify({
      version: SAVE_FILE_VERSION,
      playerName: "Raptor",
      totalProblemsSolved: 10,
      totalProblemsAttempted: 12,
      currentDifficulty: DifficultyLevel.Medium,
      sessionsPlayed: 2,
      unlockedRewards: [],
      sessionHistory: [],
      lastSavedAt: "2025-01-01T00:00:00.000Z",
    });

    // Create a mock file object with a guaranteed text() method
    const mockFile = {
      name: "raptor-save.json",
      type: "application/json",
      text: () => Promise.resolve(saveData),
    };

    // Mock document.createElement to intercept the file input
    const originalCreateElement = document.createElement.bind(document);
    jest
      .spyOn(document, "createElement")
      .mockImplementation(
        (tagName: string, options?: ElementCreationOptions) => {
          const el = originalCreateElement(tagName, options);
          if (tagName === "input") {
            // Override click to simulate file selection
            el.click = () => {
              Object.defineProperty(el, "files", {
                value: [mockFile],
                writable: false,
              });
              // Fire onchange asynchronously like a real browser would
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

    fireEvent.click(screen.getByText("Load Existing Save"));

    await waitFor(() => {
      expect(onSessionReady).toHaveBeenCalledTimes(1);
    });

    const session = onSessionReady.mock.calls[0][0];
    expect(session.playerName).toBe("Raptor");
    expect(session.loadedFromSave).toBe(true);
    expect(session.progress.lifetime.totalProblemsSolved).toBe(10);

    jest.restoreAllMocks();
  });

  it("resolves with null and stays on load-or-new when file picker is cancelled", async () => {
    jest.useFakeTimers();
    advanceToLoadOrNew();

    // Mock document.createElement to intercept the file input
    const originalCreateElement = document.createElement.bind(document);
    jest
      .spyOn(document, "createElement")
      .mockImplementation(
        (tagName: string, options?: ElementCreationOptions) => {
          const el = originalCreateElement(tagName, options);
          if (tagName === "input") {
            // Override click to simulate cancellation: no file selected,
            // the window focus event fires instead of onchange.
            el.click = () => {
              // Simulate the focus event that fires when the dialog closes
              window.dispatchEvent(new Event("focus"));
            };
          }
          return el;
        },
      );

    fireEvent.click(screen.getByText("Load Existing Save"));

    // Advance past the 300ms delay in the focus handler
    jest.advanceTimersByTime(400);

    // Flush microtasks so React processes the resolved promise
    await jest.runAllTimersAsync();

    // The session should NOT have been initialized
    expect(onSessionReady).not.toHaveBeenCalled();

    // The UI should still show the load-or-new phase
    expect(screen.getByText("Start New Game")).toBeInTheDocument();
    expect(screen.getByText("Load Existing Save")).toBeInTheDocument();

    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // ── Rendering null when ready ────────────────────────────────────

  it("renders nothing when session is ready", () => {
    const { container } = render(
      <GameStartFlow onSessionReady={onSessionReady} />,
    );
    fireEvent.change(screen.getByLabelText("Player Name"), {
      target: { value: "Rex" },
    });
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.click(screen.getByText("Start New Game"));

    // Component returns null in ready phase
    expect(container.innerHTML).toBe("");
  });
});
