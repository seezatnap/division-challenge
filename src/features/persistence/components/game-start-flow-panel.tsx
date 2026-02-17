"use client";

import { useMemo, useState } from "react";

import type { DinoDivisionSaveFile } from "@/features/contracts";
import {
  buildGameStartOptions,
  createInMemoryGameSession,
  type GameStartMode,
  type InMemoryGameSession,
} from "@/features/persistence/lib";

interface GameStartFlowPanelProps {
  loadableSave?: DinoDivisionSaveFile | null;
}

function formatStartModeLabel(mode: GameStartMode): string {
  return mode === "load-existing-save" ? "Loaded existing save" : "Started new expedition";
}

export function GameStartFlowPanel({
  loadableSave = null,
}: GameStartFlowPanelProps) {
  const [playerName, setPlayerName] = useState(loadableSave?.playerName ?? "");
  const [session, setSession] = useState<InMemoryGameSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startOptions = useMemo(
    () => buildGameStartOptions(loadableSave !== null),
    [loadableSave],
  );

  function handleStart(mode: GameStartMode): void {
    try {
      const initializedSession = createInMemoryGameSession({
        playerName,
        mode,
        saveFile: mode === "load-existing-save" ? loadableSave : null,
      });

      setSession(initializedSession);
      setErrorMessage(null);
    } catch (error) {
      setSession(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to initialize the game session.",
      );
    }
  }

  return (
    <div className="game-start-flow" data-ui-surface="game-start">
      <label className="game-start-label" htmlFor="game-start-player-name">
        Player Name
      </label>
      <input
        className="game-start-input"
        id="game-start-player-name"
        name="playerName"
        onChange={(event) => setPlayerName(event.target.value)}
        placeholder="Enter your dino wrangler name"
        type="text"
        value={playerName}
      />

      <p className="game-start-helper">
        Choose whether to start fresh or load an existing expedition save.
      </p>

      <div className="save-actions">
        {startOptions.map((option) => (
          <button
            aria-disabled={option.disabled}
            className={`jp-button${option.mode === "load-existing-save" ? " jp-button-secondary" : ""}`}
            disabled={option.disabled}
            key={option.mode}
            onClick={() => handleStart(option.mode)}
            title={option.description}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul className="game-start-options">
        {startOptions.map((option) => (
          <li className="game-start-option" key={`option-${option.mode}`}>
            <span className="game-start-option-title">{option.label}</span>
            <span className="game-start-option-copy">{option.description}</span>
          </li>
        ))}
      </ul>

      {errorMessage ? (
        <p className="game-start-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {session ? (
        <article className="game-start-session">
          <p className="game-start-session-title">Session initialized in memory</p>
          <p className="game-start-session-meta">{formatStartModeLabel(session.startMode)}</p>
          <p className="game-start-session-meta">Player: {session.playerName}</p>
          <p className="game-start-session-meta">
            Session ID: {session.gameState.progress.session.sessionId}
          </p>
          <p className="game-start-session-meta">
            Lifetime solved: {session.gameState.progress.lifetime.totalProblemsSolved}
          </p>
        </article>
      ) : null}
    </div>
  );
}
