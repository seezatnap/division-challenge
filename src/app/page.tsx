"use client";

import { useState, useCallback } from "react";
import GameStartScreen from "@/components/GameStartScreen";
import type { GameStartResult } from "@/components/GameStartScreen";
import DivisionWorkspace from "@/components/DivisionWorkspace";
import type { GameState } from "@/lib/game-state";
import { initFromSave, initNewGame } from "@/lib/game-state";
import type { DivisionProblem } from "@/types";
import { generateProblem } from "@/lib/generate-problem";
import { recordSolve } from "@/lib/progression";

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentProblem, setCurrentProblem] = useState<DivisionProblem | null>(
    null,
  );
  const [rewardPending, setRewardPending] = useState(false);

  function handleStart(result: GameStartResult) {
    let newState: GameState;
    if (result.mode === "loaded" && result.playerSave) {
      newState = initFromSave(result.playerSave);
    } else if (result.mode === "new" && result.playerName) {
      newState = initNewGame(result.playerName);
    } else {
      return;
    }
    setGameState(newState);
    setCurrentProblem(generateProblem(newState.playerSave.currentDifficulty));
  }

  const handleProblemComplete = useCallback(
    (_problem: DivisionProblem) => {
      setGameState((prev) => {
        if (!prev) return prev;

        const { updatedState, shouldReward } = recordSolve(prev);

        if (shouldReward) {
          setRewardPending(true);
        }

        // Generate next problem at (possibly new) difficulty
        setCurrentProblem(
          generateProblem(updatedState.playerSave.currentDifficulty),
        );

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

      {/* Reward trigger banner */}
      {rewardPending && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        >
          You earned a dinosaur reward! 🦕
          <button
            className="ml-3 underline"
            onClick={() => setRewardPending(false)}
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
