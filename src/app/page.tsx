"use client";

import { useState, useCallback, useRef } from "react";
import GameStartScreen from "@/components/GameStartScreen";
import type { GameStartResult } from "@/components/GameStartScreen";
import DivisionWorkspace from "@/components/DivisionWorkspace";
import DinoGallery from "@/components/DinoGallery";
import type { GameState } from "@/lib/game-state";
import { initFromSave, initNewGame } from "@/lib/game-state";
import type { DifficultyTier, DivisionProblem, UnlockedDinosaur } from "@/types";
import { generateProblem } from "@/lib/generate-problem";
import { recordSolve } from "@/lib/progression";
import { persistAfterSolve } from "@/lib/persistence";
import { MOTIFS, LEVEL_UP_MESSAGES, randomMessage } from "@/lib/theme";

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentProblem, setCurrentProblem] = useState<DivisionProblem | null>(
    null,
  );
  const [rewardDino, setRewardDino] = useState<UnlockedDinosaur | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [levelUpTier, setLevelUpTier] = useState<DifficultyTier | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Track whether we've already persisted once this session (to avoid
  // duplicating session history entries).
  const hasPersistedRef = useRef(false);

  // Cache the FileSystemFileHandle after the first save so subsequent
  // auto-saves reuse it instead of re-prompting showSaveFilePicker.
  const fileHandleRef = useRef<FileSystemFileHandle | undefined>(undefined);

  function handleStart(result: GameStartResult) {
    let newState: GameState;
    if (result.mode === "loaded" && result.playerSave) {
      newState = initFromSave(result.playerSave);
      // Reuse the handle from the loaded file for subsequent saves
      fileHandleRef.current = result.fileHandle;
    } else if (result.mode === "new" && result.playerName) {
      newState = initNewGame(result.playerName);
      fileHandleRef.current = undefined;
    } else {
      return;
    }
    hasPersistedRef.current = false;
    setGameState(newState);
    setCurrentProblem(generateProblem(newState.playerSave.currentDifficulty));
  }

  const handleProblemComplete = useCallback(
    (_problem: DivisionProblem) => {
      setGameState((prev) => {
        if (!prev) return prev;

        const { updatedState, didLevelUp, shouldReward } = recordSolve(prev);

        if (didLevelUp) {
          setLevelUpTier(updatedState.playerSave.currentDifficulty);
        }

        // Generate next problem at (possibly new) difficulty
        setCurrentProblem(
          generateProblem(updatedState.playerSave.currentDifficulty),
        );

        // Persist progress asynchronously (non-blocking).
        // Pass the cached file handle so subsequent saves skip the OS picker.
        const isFirstSave = !hasPersistedRef.current;
        persistAfterSolve(updatedState, shouldReward, isFirstSave, {
          cachedFileHandle: fileHandleRef.current,
        })
          .then((result) => {
            hasPersistedRef.current = true;

            // Cache the file handle for future saves
            if (result.fileHandle) {
              fileHandleRef.current = result.fileHandle;
            }

            if (result.rewardResult?.status === "success") {
              setRewardDino(result.rewardResult.unlocked);
              setRewardError(null);
            } else if (result.rewardResult?.status === "error") {
              setRewardError(result.rewardResult.message);
            }

            if (result.saveError) {
              setSaveError(result.saveError);
            } else if (result.saved) {
              setSaveError(null);
            }

            // Merge persisted save (which may include reward dino + session history)
            setGameState((current) => {
              if (!current) return current;
              return { ...current, playerSave: result.updatedState.playerSave };
            });
          })
          .catch((err: unknown) => {
            const message =
              err instanceof Error ? err.message : "Unknown persistence error";
            console.error("persistAfterSolve failed:", err);
            setSaveError(message);
          });

        return updatedState;
      });
    },
    [],
  );

  if (!gameState) {
    return <GameStartScreen onStart={handleStart} />;
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-start pt-8">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-jungle dark:text-leaf">
          {MOTIFS.trex} Dino Division {MOTIFS.dino}
        </h1>
        <p className="mt-1 text-sm text-fossil dark:text-earth">
          {MOTIFS.footprint} Player: {gameState.playerSave.playerName} | Tier{" "}
          {gameState.playerSave.currentDifficulty} | Solved:{" "}
          {gameState.playerSave.totalProblemsSolved} | Session:{" "}
          {gameState.sessionProblemsSolved}
        </p>
        <button
          type="button"
          onClick={() => setShowGallery((prev) => !prev)}
          className="mt-2 rounded-lg bg-amber-accent px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
          data-testid="gallery-toggle"
        >
          {showGallery ? "Back to Practice" : `${MOTIFS.bone} Dino Gallery`} ({gameState.playerSave.unlockedDinosaurs.length})
        </button>
      </header>

      {/* Level-up banner */}
      {levelUpTier !== null && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-leaf/30 bg-leaf/10 px-4 py-2 text-jungle dark:bg-fern/30 dark:text-leaf"
        >
          {MOTIFS.volcano} {randomMessage(LEVEL_UP_MESSAGES)} {levelUpTier}!
          <button
            className="ml-3 underline"
            onClick={() => setLevelUpTier(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Reward unlock banner */}
      {rewardDino && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-4 rounded-lg border border-amber-accent/30 bg-amber-accent/10 px-4 py-3 text-earth dark:bg-amber-accent/20 dark:text-sand"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rewardDino.imagePath}
            alt={rewardDino.name}
            className="h-16 w-16 rounded-md object-cover"
          />
          <div>
            <p className="font-semibold">
              {MOTIFS.trophy} You unlocked {rewardDino.name}!
            </p>
            <p className="text-sm">
              Added to your Dino Gallery.
            </p>
          </div>
          <button
            className="ml-auto underline"
            onClick={() => setRewardDino(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Reward error banner */}
      {rewardError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-accent/30 bg-amber-accent/10 px-4 py-2 text-earth dark:bg-amber-accent/20 dark:text-sand"
        >
          {MOTIFS.volcano} Reward generation failed: {rewardError}
          <button
            className="ml-3 underline"
            onClick={() => setRewardError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Save error banner */}
      {saveError && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-red-100 px-4 py-2 text-red-800 dark:bg-red-900 dark:text-red-200"
        >
          Save failed: {saveError}
          <button
            className="ml-3 underline"
            onClick={() => setSaveError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Gallery or Workspace */}
      {showGallery ? (
        <DinoGallery
          unlockedDinosaurs={gameState.playerSave.unlockedDinosaurs}
        />
      ) : (
        currentProblem && (
          <DivisionWorkspace
            key={currentProblem.id}
            problem={currentProblem}
            onProblemComplete={handleProblemComplete}
          />
        )
      )}
    </div>
  );
}
