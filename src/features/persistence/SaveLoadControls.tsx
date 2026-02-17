"use client";

import React, { useState, useCallback } from "react";
import type { GameSession } from "@/types";
import {
  isFileSystemAccessSupported,
  saveGame,
  loadGame,
} from "./save-load";
import { restoreSessionFromSave } from "@/features/game-session/session-init";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SaveLoadControlsProps {
  /** The current in-memory game session. */
  session: GameSession;
  /** Called when a save file has been loaded and a new session created. */
  onSessionRestored: (session: GameSession) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * In-game save / load controls.
 *
 * Automatically uses the File System Access API when available and falls
 * back to browser download (save) / file input (load) otherwise. Both
 * paths use the identical save-file schema and validation pipeline.
 */
export function SaveLoadControls({
  session,
  onSessionRestored,
}: SaveLoadControlsProps) {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fsaSupported = typeof window !== "undefined" && isFileSystemAccessSupported();

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveStatus(null);
    setLoadError(null);
    setIsSaving(true);

    try {
      const result = await saveGame(session);

      if (result.cancelled) {
        setSaveStatus(null);
        return;
      }

      if (result.success) {
        setSaveStatus(
          fsaSupported
            ? "Game saved successfully!"
            : "Save file downloaded!",
        );
      } else {
        setSaveStatus(result.error ?? "Could not save. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [session, fsaSupported]);

  // ── Load ──────────────────────────────────────────────────────────
  const handleLoad = useCallback(async () => {
    setSaveStatus(null);
    setLoadError(null);
    setIsLoading(true);

    try {
      const result = await loadGame();

      if (result.cancelled) return;

      if (!result.success || !result.saveFile) {
        setLoadError(
          result.error ?? "Could not load save file. Please try again.",
        );
        return;
      }

      const restored = restoreSessionFromSave(result.saveFile);
      onSessionRestored(restored);
    } finally {
      setIsLoading(false);
    }
  }, [onSessionRestored]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-3">
        <button
          className="dino-btn dino-btn-secondary"
          onClick={handleSave}
          disabled={isSaving || isLoading}
        >
          {isSaving ? "Saving\u2026" : "Save Game"}
        </button>

        <button
          className="dino-btn dino-btn-secondary"
          onClick={handleLoad}
          disabled={isSaving || isLoading}
        >
          {isLoading ? "Loading\u2026" : "Load Game"}
        </button>
      </div>

      {!fsaSupported && (
        <p className="text-xs text-earth-light">
          Your browser will download/upload save files as JSON.
        </p>
      )}

      {saveStatus && (
        <p
          className="text-center text-sm text-jungle-light"
          role="status"
        >
          {saveStatus}
        </p>
      )}

      {loadError && (
        <p
          className="text-center text-sm text-volcanic-red"
          role="alert"
        >
          {loadError}
        </p>
      )}
    </div>
  );
}
