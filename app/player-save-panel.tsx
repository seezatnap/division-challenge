"use client";

import { useMemo, useState } from "react";

import { createNewPlayerSave, type PlayerSaveFile } from "@/lib/domain";
import {
  FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE,
  getPlayerSaveFileName,
  isFileSystemAccessSupported,
  loadPlayerSaveFile,
  savePlayerSaveFile,
} from "@/lib/save-file";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while accessing save files.";
}

export default function PlayerSavePanel() {
  const [saveFile, setSaveFile] = useState<PlayerSaveFile>(() =>
    createNewPlayerSave("Rex"),
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);

  const isSupported = useMemo(() => isFileSystemAccessSupported(), []);

  let suggestedName = "<player>-save.json";
  try {
    suggestedName = getPlayerSaveFileName(saveFile.playerName);
  } catch {
    suggestedName = "<player>-save.json";
  }

  async function handleSaveClick(): Promise<void> {
    setIsBusy(true);
    setStatusMessage("");

    try {
      const trimmedName = saveFile.playerName.trim();
      const payload: PlayerSaveFile = {
        ...saveFile,
        playerName: trimmedName,
      };
      const result = await savePlayerSaveFile(payload);
      setSaveFile(payload);
      setStatusMessage(`Saved progress to ${result.fileName}.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLoadClick(): Promise<void> {
    setIsBusy(true);
    setStatusMessage("");

    try {
      const loadedSaveFile = await loadPlayerSaveFile();
      setSaveFile(loadedSaveFile);
      setStatusMessage(`Loaded save for ${loadedSaveFile.playerName}.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-emerald-700 bg-emerald-950/40 p-6">
      <h2 className="text-xl font-semibold tracking-tight">Save Files</h2>
      <p className="mt-2 text-sm text-emerald-100">
        {isSupported
          ? `Saves use File System Access API and default to ${suggestedName}.`
          : FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE}
      </p>

      <label htmlFor="player-name" className="mt-5 block text-sm font-medium">
        Player Name
      </label>
      <input
        id="player-name"
        type="text"
        value={saveFile.playerName}
        onChange={(event) =>
          setSaveFile((currentSave) => ({
            ...currentSave,
            playerName: event.target.value,
          }))
        }
        className="mt-2 w-full rounded-md border border-emerald-600 bg-emerald-950 px-3 py-2 text-emerald-50 outline-none ring-emerald-400 transition focus:ring-2"
        placeholder="Enter player name"
      />

      <div className="mt-4 text-sm text-emerald-100">
        <p>Total Problems Solved: {saveFile.totalProblemsSolved}</p>
        <p>Current Difficulty: {saveFile.currentDifficulty}</p>
        <p>Unlocked Dinosaurs: {saveFile.unlockedDinosaurs.length}</p>
        <p>Session History Entries: {saveFile.sessionHistory.length}</p>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={!isSupported || isBusy}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:text-emerald-200"
        >
          {isBusy ? "Working..." : "Save to File"}
        </button>
        <button
          type="button"
          onClick={handleLoadClick}
          disabled={!isSupported || isBusy}
          className="rounded-md border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-800/60 disabled:cursor-not-allowed disabled:border-emerald-800 disabled:text-emerald-200"
        >
          {isBusy ? "Working..." : "Load from File"}
        </button>
      </div>

      {statusMessage ? (
        <p role="status" className="mt-4 text-sm text-emerald-100">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
