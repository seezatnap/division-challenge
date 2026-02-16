"use client";

import { useState, useCallback } from "react";
import GameStartScreen from "@/components/GameStartScreen";
import type { GameStartResult } from "@/components/GameStartScreen";
import DivisionWorkspace from "@/components/DivisionWorkspace";
import type { GameState } from "@/lib/game-state";
import { initFromSave, initNewGame } from "@/lib/game-state";
import type { DivisionProblem } from "@/types";
import { generateProblem } from "@/lib/generate-problem";

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentProblem, setCurrentProblem] = useState<DivisionProblem | null>(
    null,
  );

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
      if (!gameState) return;

      // Update session counters
      const updatedState: GameState = {
        ...gameState,
        sessionProblemsSolved: gameState.sessionProblemsSolved + 1,
        sessionProblemsAttempted: gameState.sessionProblemsAttempted + 1,
        playerSave: {
          ...gameState.playerSave,
          totalProblemsSolved: gameState.playerSave.totalProblemsSolved + 1,
        },
      };

      setGameState(updatedState);

      // Generate next problem at current difficulty
      setCurrentProblem(
        generateProblem(updatedState.playerSave.currentDifficulty),
      );
    },
    [gameState],
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
          {gameState.playerSave.totalProblemsSolved}
        </p>
      </header>

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
