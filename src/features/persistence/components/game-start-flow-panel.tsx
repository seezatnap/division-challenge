"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import type { DinoDivisionSaveFile } from "@/features/contracts";
import {
  buildGameStartOptions,
  createInMemoryGameSession,
  exportSessionToJsonDownload,
  loadSaveFromJsonFile,
  loadSaveFromFileSystem,
  saveSessionToFileSystem,
  supportsFileSystemAccessApi,
  supportsJsonSaveImportExportFallback,
  type FileSystemSaveFileHandle,
  type GameStartMode,
  type InMemoryGameSession,
} from "@/features/persistence/lib";

interface GameStartFlowPanelProps {
  loadableSave?: DinoDivisionSaveFile | null;
}

interface RuntimeFeatureSupport {
  hasFileSystemAccessApi: boolean;
  hasJsonSaveFallback: boolean;
}

function formatStartModeLabel(mode: GameStartMode): string {
  return mode === "load-existing-save" ? "Loaded existing save" : "Started new expedition";
}

export function GameStartFlowPanel({
  loadableSave = null,
}: GameStartFlowPanelProps) {
  const jsonImportInputRef = useRef<HTMLInputElement | null>(null);
  const [playerName, setPlayerName] = useState(loadableSave?.playerName ?? "");
  const [session, setSession] = useState<InMemoryGameSession | null>(null);
  const [saveHandle, setSaveHandle] = useState<FileSystemSaveFileHandle | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [runtimeFeatureSupport, setRuntimeFeatureSupport] = useState<RuntimeFeatureSupport>({
    hasFileSystemAccessApi: false,
    hasJsonSaveFallback: false,
  });

  useEffect(() => {
    setRuntimeFeatureSupport({
      hasFileSystemAccessApi: supportsFileSystemAccessApi(window),
      hasJsonSaveFallback: supportsJsonSaveImportExportFallback(window),
    });
  }, []);

  const { hasFileSystemAccessApi, hasJsonSaveFallback } = runtimeFeatureSupport;
  const hasLoadableSave =
    loadableSave !== null || hasFileSystemAccessApi || hasJsonSaveFallback;

  const startOptions = useMemo(
    () => buildGameStartOptions(hasLoadableSave),
    [hasLoadableSave],
  );

  function openJsonImportPicker(): void {
    const input = jsonImportInputRef.current;
    if (!input) {
      throw new Error("JSON save import input is unavailable.");
    }

    input.value = "";
    input.click();
  }

  async function handleJsonImportChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const [selectedFile] = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!selectedFile) {
      setStatusMessage("Load canceled before selecting a save file.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const loadedSave = await loadSaveFromJsonFile(selectedFile);
      if (!loadedSave) {
        setStatusMessage("Load canceled before selecting a save file.");
        return;
      }

      const initializedSession = createInMemoryGameSession({
        playerName: loadedSave.saveFile.playerName,
        mode: "load-existing-save",
        saveFile: loadedSave.saveFile,
      });

      setPlayerName(initializedSession.playerName);
      setSession(initializedSession);
      setSaveHandle(null);
      setStatusMessage(`Imported ${loadedSave.fileName}.`);
    } catch (error) {
      setSession(null);
      setSaveHandle(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to import the selected JSON save file.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStart(mode: GameStartMode): Promise<void> {
    setIsBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      if (mode === "load-existing-save" && hasFileSystemAccessApi) {
        const loadedSave = await loadSaveFromFileSystem();
        if (!loadedSave) {
          setStatusMessage("Load canceled before selecting a save file.");
          return;
        }

        const initializedSession = createInMemoryGameSession({
          playerName: loadedSave.saveFile.playerName,
          mode,
          saveFile: loadedSave.saveFile,
        });

        setPlayerName(initializedSession.playerName);
        setSession(initializedSession);
        setSaveHandle(loadedSave.handle);
        setStatusMessage(`Loaded ${loadedSave.fileName}.`);
        return;
      }

      if (mode === "load-existing-save" && hasJsonSaveFallback) {
        openJsonImportPicker();
        setStatusMessage("Choose a JSON save file to import.");
        return;
      }

      const initializedSession = createInMemoryGameSession({
        playerName,
        mode,
        saveFile: mode === "load-existing-save" ? loadableSave : null,
      });

      setSession(initializedSession);
      setSaveHandle(null);
      setStatusMessage(
        mode === "start-new"
          ? "Started a new expedition session."
          : "Loaded bundled preview save data.",
      );
    } catch (error) {
      setSession(null);
      setSaveHandle(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to initialize the game session.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveSession(): Promise<void> {
    if (!session) {
      return;
    }

    const shouldUseFileSystemAccess = hasFileSystemAccessApi || saveHandle !== null;

    if (!shouldUseFileSystemAccess && !hasJsonSaveFallback) {
      setErrorMessage(
        "This environment cannot access save files directly or via JSON fallback export.",
      );
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      if (shouldUseFileSystemAccess) {
        const savedResult = await saveSessionToFileSystem({
          session,
          handle: saveHandle,
        });

        if (!savedResult) {
          setStatusMessage("Save canceled before writing a file.");
          return;
        }

        setSaveHandle(savedResult.handle);
        setStatusMessage(`Saved ${savedResult.fileName}.`);
        return;
      }

      const exportedResult = await exportSessionToJsonDownload({
        session,
        fallbackRuntime: window,
      });

      setSaveHandle(null);
      setStatusMessage(`Exported ${exportedResult.fileName}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save this session.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="game-start-flow" data-ui-surface="game-start">
      <label className="game-start-label" htmlFor="game-start-player-name">
        Player Name
      </label>
      <input
        className="game-start-input"
        id="game-start-player-name"
        name="playerName"
        onChange={(event) => setPlayerName(event.target.value)}
        placeholder="Enter your dino wrangler name"
        type="text"
        value={playerName}
      />

      <p className="game-start-helper">
        Choose whether to start fresh or load an existing expedition save.
      </p>

      {!hasFileSystemAccessApi && hasJsonSaveFallback ? (
        <p className="game-start-helper">
          File System Access API is unavailable, so save/load uses JSON import/export fallback.
        </p>
      ) : null}

      <input
        accept=".json,application/json"
        className="sr-only"
        disabled={isBusy || !hasJsonSaveFallback}
        onChange={(event) => {
          void handleJsonImportChange(event);
        }}
        ref={jsonImportInputRef}
        tabIndex={-1}
        type="file"
      />

      <div className="save-actions">
        {startOptions.map((option) => (
          <button
            aria-disabled={option.disabled || isBusy}
            className={`jp-button${option.mode === "load-existing-save" ? " jp-button-secondary" : ""}`}
            disabled={option.disabled || isBusy}
            key={option.mode}
            onClick={() => {
              void handleStart(option.mode);
            }}
            title={option.description}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="game-start-options">
        {startOptions.map((option) => (
          <li className="game-start-option" key={`option-${option.mode}`}>
            <span className="game-start-option-title">{option.label}</span>
            <span className="game-start-option-copy">{option.description}</span>
          </li>
        ))}
      </ul>

      {errorMessage ? (
        <p className="game-start-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {statusMessage ? (
        <p className="game-start-helper" role="status">
          {statusMessage}
        </p>
      ) : null}

      {session ? (
        <article className="game-start-session">
          <p className="game-start-session-title">Session initialized in memory</p>
          <p className="game-start-session-meta">{formatStartModeLabel(session.startMode)}</p>
          <p className="game-start-session-meta">Player: {session.playerName}</p>
          <p className="game-start-session-meta">
            Session ID: {session.gameState.progress.session.sessionId}
          </p>
          <p className="game-start-session-meta">
            Lifetime solved: {session.gameState.progress.lifetime.totalProblemsSolved}
          </p>
          <div className="save-actions">
            <button
              className="jp-button jp-button-secondary"
              disabled={isBusy}
              onClick={() => {
                void handleSaveSession();
              }}
              type="button"
            >
              Save Session JSON
            </button>
          </div>
        </article>
      ) : null}
    </div>
  );
}
