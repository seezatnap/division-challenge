"use client";

import { useState, useCallback } from "react";
import type { GameSession } from "@/types";
import { GameStartFlow } from "@/features/game-session";
import { SaveLoadControls } from "@/features/persistence";

export default function Home() {
  const [session, setSession] = useState<GameSession | null>(null);

  const handleSessionReady = useCallback((newSession: GameSession) => {
    setSession(newSession);
  }, []);

  // ── Active game session ────────────────────────────────────────────
  if (session) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="dino-fade-up">
          <h1 className="dino-heading text-4xl sm:text-5xl md:text-6xl">
            Dino Division
          </h1>
          <p className="mt-4 max-w-md text-base text-jungle-pale sm:text-lg md:text-xl">
            Long-division practice, Jurassic style.
          </p>
        </div>

        {/* Game area placeholder — workspace UI will render here */}
        <div className="dino-card mt-8 w-full max-w-2xl p-6 sm:mt-12 sm:p-8 md:p-10">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-semibold text-earth-dark sm:text-base">
              Ready to play, {session.playerName}!
            </p>
            <p className="text-xs text-earth-mid sm:text-sm">
              {session.loadedFromSave
                ? `Welcome back! You've solved ${session.progress.lifetime.totalProblemsSolved} problems so far.`
                : "The division workspace will appear here."}
            </p>
            <p className="text-xs text-earth-light sm:text-sm">
              Solve problems, earn dinosaurs!
            </p>
          </div>
        </div>

        {/* Save / Load controls — works with or without File System Access API */}
        <div className="mt-6 sm:mt-8">
          <SaveLoadControls
            session={session}
            onSessionRestored={handleSessionReady}
          />
        </div>
      </div>
    );
  }

  // ── Game-start flow (name entry → load/new) ────────────────────────
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="dino-fade-up mb-8 sm:mb-12">
        <h1 className="dino-heading text-4xl sm:text-5xl md:text-6xl">
          Dino Division
        </h1>
        <p className="mt-4 max-w-md text-base text-jungle-pale sm:text-lg md:text-xl">
          Long-division practice, Jurassic style.
        </p>
      </div>

      <GameStartFlow onSessionReady={handleSessionReady} />
    </div>
  );
}
