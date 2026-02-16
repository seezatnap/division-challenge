"use client";

import { useState, useCallback, useRef } from "react";
import GameStartScreen from "@/components/GameStartScreen";
import type { GameStartResult } from "@/components/GameStartScreen";
import DivisionWorkspace from "@/components/DivisionWorkspace";
import type { GameState } from "@/lib/game-state";
import { initFromSave, initNewGame } from "@/lib/game-state";
import type { DifficultyTier, DivisionProblem, UnlockedDinosaur } from "@/types";
import { generateProblem } from "@/lib/generate-problem";
import { recordSolve } from "@/lib/progression";
import { persistAfterSolve } from "@/lib/persistence";

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentProblem, setCurrentProblem] = useState<DivisionProblem | null>(
    null,
  );
  const [rewardDino, setRewardDino] = useState<UnlockedDinosaur | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [levelUpTier, setLevelUpTier] = useState<DifficultyTier | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    <div className="flex min-h-screen flex-col items-center justify-start pt-8">
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold">Dino Division</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Player: {gameState.playerSave.playerName} | Tier{" "}
          {gameState.playerSave.currentDifficulty} | Solved:{" "}
          {gameState.playerSave.totalProblemsSolved} | Session:{" "}
          {gameState.sessionProblemsSolved}
        </p>
      </header>

      {/* Level-up banner */}
      {levelUpTier !== null && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-green-100 px-4 py-2 text-green-800 dark:bg-green-900 dark:text-green-200"
        >
          Roarsome! You leveled up to Tier {levelUpTier}!
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
          className="mb-4 flex items-center gap-4 rounded-lg bg-amber-100 px-4 py-3 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={rewardDino.imagePath}
            alt={rewardDino.name}
            className="h-16 w-16 rounded-md object-cover"
          />
          <div>
            <p className="font-semibold">
              You unlocked {rewardDino.name}!
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
          className="mb-4 rounded-lg bg-orange-100 px-4 py-2 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
        >
          Reward generation failed: {rewardError}
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

      {/* Workspace */}
      {currentProblem && (
        <DivisionWorkspace
          key={currentProblem.id}
          problem={currentProblem}
          onProblemComplete={handleProblemComplete}
        />
      )}
    </div>
  );
}
