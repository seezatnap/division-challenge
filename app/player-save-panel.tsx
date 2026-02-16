"use client";

import { useMemo, useState } from "react";
import LongDivisionWorkbench from "./long-division-workbench";

import {
  doesLoadedSaveMatchRequestedPlayerName,
  initializeLoadedGameRuntimeState,
  initializeNewGameRuntimeState,
  requirePlayerName,
  type GameRuntimeState,
} from "@/lib/game-start";
import {
  FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE,
  isFileSystemAccessSupported,
  loadPlayerSaveFile,
} from "@/lib/save-file";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while accessing save files.";
}

export default function PlayerSavePanel() {
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [runtimeState, setRuntimeState] = useState<GameRuntimeState | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);

  const isSupported = useMemo(() => isFileSystemAccessSupported(), []);

  function handleStartNewGameClick(): void {
    setStatusMessage("");

    try {
      const nextState = initializeNewGameRuntimeState(playerNameInput);
      setRuntimeState(nextState);
      setPlayerNameInput(nextState.playerSave.playerName);
      setStatusMessage(`Started a new game for ${nextState.playerSave.playerName}.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function handleLoadExistingSaveClick(): Promise<void> {
    setIsBusy(true);
    setStatusMessage("");

    try {
      const requestedPlayerName = requirePlayerName(playerNameInput);
      const loadedSaveFile = await loadPlayerSaveFile();
      const nextState = initializeLoadedGameRuntimeState(loadedSaveFile);
      const loadedPlayerName = nextState.playerSave.playerName;

      setRuntimeState(nextState);
      setPlayerNameInput(loadedPlayerName);

      if (
        doesLoadedSaveMatchRequestedPlayerName(
          requestedPlayerName,
          loadedPlayerName,
        )
      ) {
        setStatusMessage(`Loaded existing save for ${loadedPlayerName}.`);
      } else {
        setStatusMessage(
          `Loaded save for ${loadedPlayerName} instead of ${requestedPlayerName}.`,
        );
      }
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function handleResetFlowClick(): void {
    setRuntimeState(null);
    setStatusMessage("");
  }

  const runtimeModeLabel =
    runtimeState?.mode === "loaded-save" ? "Loaded Existing Save" : "Started New Game";

  return (
    <section className="mt-8 rounded-xl border border-emerald-700 bg-emerald-950/40 p-6">
      <h2 className="text-xl font-semibold tracking-tight">Game Start</h2>
      {runtimeState ? (
        <>
          <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-900/40 p-4 text-sm text-emerald-100">
            <p>
              <span className="font-semibold text-emerald-50">Mode:</span>{" "}
              {runtimeModeLabel}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">Player:</span>{" "}
              {runtimeState.playerSave.playerName}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Total Problems Solved:
              </span>{" "}
              {runtimeState.playerSave.totalProblemsSolved}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Current Difficulty:
              </span>{" "}
              {runtimeState.playerSave.currentDifficulty}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Unlocked Dinosaurs:
              </span>{" "}
              {runtimeState.playerSave.unlockedDinosaurs.length}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Session History Entries:
              </span>{" "}
              {runtimeState.playerSave.sessionHistory.length}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Initialized At:
              </span>{" "}
              {runtimeState.initializedAt}
            </p>
            <button
              type="button"
              onClick={handleResetFlowClick}
              className="mt-4 rounded-md border border-emerald-500 px-3 py-2 font-semibold text-emerald-50 transition hover:bg-emerald-800/60"
            >
              Start With Different Player
            </button>
          </div>

          <LongDivisionWorkbench
            key={`${runtimeState.playerSave.playerName}-${runtimeState.initializedAt}-${runtimeState.playerSave.currentDifficulty}`}
            difficulty={runtimeState.playerSave.currentDifficulty}
          />
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-emerald-100">
            Enter a player name, then choose whether to load an existing save
            or start a new game.
          </p>

          <label htmlFor="player-name" className="mt-5 block text-sm font-medium">
            Player Name
          </label>
          <input
            id="player-name"
            type="text"
            value={playerNameInput}
            onChange={(event) => setPlayerNameInput(event.target.value)}
            className="mt-2 w-full rounded-md border border-emerald-600 bg-emerald-950 px-3 py-2 text-emerald-50 outline-none ring-emerald-400 transition focus:ring-2"
            placeholder="Enter player name"
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStartNewGameClick}
              disabled={isBusy}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:text-emerald-200"
            >
              {isBusy ? "Working..." : "Start New Game"}
            </button>
            <button
              type="button"
              onClick={handleLoadExistingSaveClick}
              disabled={!isSupported || isBusy}
              className="rounded-md border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-800/60 disabled:cursor-not-allowed disabled:border-emerald-800 disabled:text-emerald-200"
            >
              {isBusy ? "Working..." : "Load Existing Save"}
            </button>
          </div>

          <p className="mt-4 text-sm text-emerald-100">
            {isSupported
              ? "Loading existing saves uses the File System Access API."
              : FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE}
          </p>
        </>
      )}

      {statusMessage ? (
        <p role="status" className="mt-4 text-sm text-emerald-100">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
