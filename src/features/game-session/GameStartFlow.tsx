"use client";

import React, { useState, useCallback } from "react";
import type { GameSession, GameStartPhase } from "@/types";
import {
  createNewSession,
  restoreSessionFromSave,
  validatePlayerName,
  saveFileNameFromPlayer,
} from "./session-init";
import {
  isFileSystemAccessSupported,
  loadFromDisk,
  loadFromFile,
} from "@/features/persistence/save-load";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GameStartFlowProps {
  /** Called when the session is fully initialized and play can begin. */
  onSessionReady: (session: GameSession) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open a file via a hidden `<input type="file">` element (fallback for
 * browsers without the File System Access API).
 */
function openFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    let settled = false;

    input.onchange = () => {
      if (!settled) {
        settled = true;
        resolve(input.files?.[0] ?? null);
      }
    };

    // If the user cancels the file picker, no change event fires.
    // Listen for window re-focus (which fires when the dialog closes)
    // and resolve with null after a short delay to let onchange fire first.
    const onFocus = () => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 300);
      window.removeEventListener("focus", onFocus);
    };
    window.addEventListener("focus", onFocus);

    input.click();
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GameStartFlow({ onSessionReady }: GameStartFlowProps) {
  const [phase, setPhase] = useState<GameStartPhase>("name-entry");
  const [playerName, setPlayerName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Name submission ────────────────────────────────────────────────
  const handleNameSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const error = validatePlayerName(playerName);
      if (error) {
        setNameError(error);
        return;
      }
      setNameError(null);
      setPhase("load-or-new");
    },
    [playerName],
  );

  // ── Start new game ─────────────────────────────────────────────────
  const handleStartNew = useCallback(() => {
    const session = createNewSession(playerName.trim());
    setPhase("ready");
    onSessionReady(session);
  }, [playerName, onSessionReady]);

  // ── Load save file ─────────────────────────────────────────────────
  const handleLoadSave = useCallback(async () => {
    setLoadError(null);

    if (isFileSystemAccessSupported()) {
      // Use File System Access API — prompts for permission via native picker
      const result = await loadFromDisk();

      if (result.cancelled) return;
      if (!result.success || !result.saveFile) {
        setLoadError(result.error ?? "Could not load save file. Please try again.");
        return;
      }

      const session = restoreSessionFromSave(result.saveFile);
      setPlayerName(result.saveFile.playerName);
      setPhase("ready");
      onSessionReady(session);
    } else {
      // Fallback: hidden file input
      const file = await openFileViaInput();
      if (!file) return;

      const result = await loadFromFile(file);
      if (!result.success || !result.saveFile) {
        setLoadError(result.error ?? "This file doesn't look like a valid save file.");
        return;
      }

      const session = restoreSessionFromSave(result.saveFile);
      setPlayerName(result.saveFile.playerName);
      setPhase("ready");
      onSessionReady(session);
    }
  }, [onSessionReady]);

  // ── Back to name entry ─────────────────────────────────────────────
  const handleBack = useCallback(() => {
    setPhase("name-entry");
    setLoadError(null);
  }, []);

  // ── Phase: name-entry ──────────────────────────────────────────────
  if (phase === "name-entry") {
    return (
      <div className="dino-fade-up flex flex-col items-center">
        <div className="dino-card w-full max-w-md p-6 sm:p-8">
          <h2 className="dino-heading mb-2 text-center text-2xl sm:text-3xl">
            Welcome, Explorer!
          </h2>
          <p className="mb-6 text-center text-sm text-earth-mid">
            Enter your name to begin your dinosaur division adventure.
          </p>

          <form onSubmit={handleNameSubmit} noValidate>
            <label
              htmlFor="player-name"
              className="mb-1 block text-sm font-medium text-earth-dark"
            >
              Player Name
            </label>
            <input
              id="player-name"
              type="text"
              autoFocus
              autoComplete="off"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Rex"
              className="mb-1 w-full rounded-lg border border-earth-pale bg-bone px-4 py-2.5 text-earth-dark placeholder:text-earth-light focus:border-amber-glow focus:outline-none focus:ring-2 focus:ring-amber-glow/50"
              aria-describedby={nameError ? "name-error" : undefined}
              aria-invalid={nameError ? "true" : undefined}
            />
            {nameError && (
              <p
                id="name-error"
                className="mb-3 text-sm text-volcanic-red"
                role="alert"
              >
                {nameError}
              </p>
            )}

            <button
              type="submit"
              className="dino-btn dino-btn-primary mt-4 w-full"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Phase: load-or-new ─────────────────────────────────────────────
  if (phase === "load-or-new") {
    const expectedFileName = saveFileNameFromPlayer(playerName);

    return (
      <div className="dino-fade-up flex flex-col items-center">
        <div className="dino-card w-full max-w-md p-6 sm:p-8">
          <h2 className="dino-heading mb-2 text-center text-2xl sm:text-3xl">
            Welcome, {playerName.trim()}!
          </h2>
          <p className="mb-6 text-center text-sm text-earth-mid">
            Start a new adventure or continue where you left off.
          </p>

          <div className="flex flex-col gap-3">
            <button
              className="dino-btn dino-btn-primary w-full"
              onClick={handleStartNew}
            >
              Start New Game
            </button>

            <button
              className="dino-btn dino-btn-secondary w-full"
              onClick={handleLoadSave}
            >
              Load Existing Save
            </button>
          </div>

          {loadError && (
            <p
              className="mt-3 text-center text-sm text-volcanic-red"
              role="alert"
            >
              {loadError}
            </p>
          )}

          <p className="mt-4 text-center text-xs text-earth-light">
            Looking for{" "}
            <span className="font-mono">{expectedFileName}</span>
          </p>

          <button
            className="mt-4 w-full text-center text-sm text-jungle-light underline-offset-2 hover:underline"
            onClick={handleBack}
          >
            &larr; Change name
          </button>
        </div>
      </div>
    );
  }

  // ── Phase: ready (session initialized — parent takes over) ─────────
  return null;
}
