"use client";

import { useState } from "react";
import GameStartScreen from "@/components/GameStartScreen";
import type { GameStartResult } from "@/components/GameStartScreen";
import type { GameState } from "@/lib/game-state";
import { initFromSave, initNewGame } from "@/lib/game-state";

export default function Home() {
  const [gameState, setGameState] = useState<GameState | null>(null);

  function handleStart(result: GameStartResult) {
    if (result.mode === "loaded" && result.playerSave) {
      setGameState(initFromSave(result.playerSave));
    } else if (result.mode === "new" && result.playerName) {
      setGameState(initNewGame(result.playerName));
    }
  }

  if (!gameState) {
    return <GameStartScreen onStart={handleStart} />;
  }

  // Playing phase — placeholder for future gameplay UI (tasks #5, #6, etc.)
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl font-bold">Dino Division</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Welcome, {gameState.playerSave.playerName}!
        </p>
        <p className="text-sm text-zinc-500">
          Difficulty: Tier {gameState.playerSave.currentDifficulty} | Problems
          Solved: {gameState.playerSave.totalProblemsSolved}
        </p>
      </main>
    </div>
  );
}
