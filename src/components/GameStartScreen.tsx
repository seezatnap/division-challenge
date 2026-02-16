"use client";

import { useState } from "react";
import type { PlayerSave } from "@/types";
import {
  isFileSystemAccessSupported,
  UNSUPPORTED_BROWSER_MESSAGE,
  loadGame,
} from "@/lib/save-file";
import { MOTIFS } from "@/lib/theme";

export interface GameStartResult {
  mode: "new" | "loaded";
  playerSave?: PlayerSave;
  playerName?: string;
  /** Cached FileSystemFileHandle from loading a save, reusable for subsequent saves. */
  fileHandle?: FileSystemFileHandle;
}

interface GameStartScreenProps {
  onStart: (result: GameStartResult) => void;
}

type Screen = "name-entry" | "choice";

export default function GameStartScreen({ onStart }: GameStartScreenProps) {
  const [screen, setScreen] = useState<Screen>("name-entry");
  const [playerName, setPlayerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const trimmedName = playerName.trim();
  const nameValid = trimmedName.length > 0;

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameValid) return;
    setError(null);
    setScreen("choice");
  }

  function handleStartNew() {
    onStart({ mode: "new", playerName: trimmedName });
  }

  async function handleLoadSave() {
    if (!isFileSystemAccessSupported()) {
      setError(UNSUPPORTED_BROWSER_MESSAGE);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await loadGame();

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onStart({ mode: "loaded", playerSave: result.data, fileHandle: result.handle });
  }

  function handleBack() {
    setScreen("name-entry");
    setError(null);
  }

  if (screen === "name-entry") {
    return (
      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md rounded-lg border border-earth/20 bg-ivory p-8 shadow-lg dark:border-earth/30 dark:bg-sand">
          <h1 className="mb-2 text-center text-4xl font-extrabold tracking-tight text-jungle dark:text-leaf">
            {MOTIFS.trex} Dino Division {MOTIFS.dino}
          </h1>
          <p className="mb-6 text-center text-fossil">
            {MOTIFS.leaf} Enter your name to get started
          </p>

          <form onSubmit={handleNameSubmit}>
            <label
              htmlFor="player-name"
              className="mb-2 block text-sm font-medium text-earth dark:text-fossil"
            >
              Player Name
            </label>
            <input
              id="player-name"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="e.g. Dr. Malcolm"
              maxLength={50}
              autoFocus
              className="mb-4 w-full rounded border border-earth/30 bg-background px-3 py-2 text-base focus:border-jungle focus:outline-none focus:ring-1 focus:ring-jungle dark:border-earth/40 dark:bg-background"
            />
            <button
              type="submit"
              disabled={!nameValid}
              className="w-full rounded bg-jungle px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-jungle-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {MOTIFS.footprint} Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // choice screen
  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-earth/20 bg-ivory p-8 shadow-lg dark:border-earth/30 dark:bg-sand">
        <h1 className="mb-2 text-center text-4xl font-extrabold tracking-tight text-jungle dark:text-leaf">
          {MOTIFS.trex} Dino Division {MOTIFS.dino}
        </h1>
        <p className="mb-6 text-center text-fossil">
          Welcome, <strong className="text-jungle dark:text-leaf">{trimmedName}</strong>!
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleStartNew}
            className="w-full rounded bg-jungle px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-jungle-light"
          >
            {MOTIFS.egg} Start New Game
          </button>
          <button
            type="button"
            onClick={handleLoadSave}
            disabled={loading}
            className="w-full rounded border border-jungle px-4 py-3 text-base font-semibold text-jungle transition-colors hover:bg-leaf/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-leaf dark:hover:bg-fern/20"
          >
            {loading ? "Loading…" : `${MOTIFS.bone} Load Existing Save`}
          </button>
          <button
            type="button"
            onClick={handleBack}
            className="mt-1 text-sm text-fossil underline hover:text-earth"
          >
            Back
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
