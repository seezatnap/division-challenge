"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LongDivisionWorkbench from "./long-division-workbench";

import {
  doesLoadedSaveMatchRequestedPlayerName,
  initializeLoadedGameRuntimeState,
  initializeNewGameRuntimeState,
  requirePlayerName,
  type GameRuntimeState,
} from "@/lib/game-start";
import {
  FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE,
  isFileSystemAccessSupported,
  loadPlayerSaveFile,
} from "@/lib/save-file";
import {
  orchestrateRewardUnlock,
  type OrchestratedRewardUnlock,
} from "@/lib/reward-orchestration";
import { createSerialTaskQueue } from "@/lib/serial-task-queue";
import type { LongDivisionWorkbenchRewardTrigger } from "@/lib/long-division-workbench";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while accessing save files.";
}

function buildRuntimeStateKey(runtimeState: GameRuntimeState): string {
  return `${runtimeState.playerSave.playerName}:${runtimeState.initializedAt}`;
}

function doesRuntimeStateMatchKey(
  runtimeState: GameRuntimeState | null,
  runtimeStateKey: string,
): runtimeState is GameRuntimeState {
  return runtimeState !== null && buildRuntimeStateKey(runtimeState) === runtimeStateKey;
}

export default function PlayerSavePanel() {
  const [playerNameInput, setPlayerNameInput] = useState("");
  const [runtimeState, setRuntimeState] = useState<GameRuntimeState | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [rewardStatusMessage, setRewardStatusMessage] = useState<string>("");
  const [isBusy, setIsBusy] = useState(false);
  const rewardMilestoneQueue = useMemo(() => createSerialTaskQueue(), []);
  const runtimeStateRef = useRef<GameRuntimeState | null>(runtimeState);
  const rewardProcessingKeysRef = useRef<Set<string>>(new Set());
  const rewardCompletedKeysRef = useRef<Set<string>>(new Set());

  const isSupported = useMemo(() => isFileSystemAccessSupported(), []);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  function resetRewardProcessingState(): void {
    rewardMilestoneQueue.clear();
    rewardProcessingKeysRef.current.clear();
    rewardCompletedKeysRef.current.clear();
    setRewardStatusMessage("");
  }

  function handleWorkbenchProgressChange(progress: {
    difficulty: GameRuntimeState["playerSave"]["currentDifficulty"];
    solvedCount: number;
    lifetimeSolvedCount: number;
  }): void {
    setRuntimeState((previousState) => {
      if (!previousState) {
        return previousState;
      }

      if (
        previousState.playerSave.totalProblemsSolved ===
          progress.lifetimeSolvedCount &&
        previousState.playerSave.currentDifficulty === progress.difficulty
      ) {
        return previousState;
      }

      return {
        ...previousState,
        playerSave: {
          ...previousState.playerSave,
          totalProblemsSolved: progress.lifetimeSolvedCount,
          currentDifficulty: progress.difficulty,
        },
      };
    });
  }

  async function processQueuedRewardTrigger(
    rewardTrigger: LongDivisionWorkbenchRewardTrigger,
    runtimeStateKey: string,
    rewardKey: string,
  ): Promise<void> {
    try {
      const queuedRuntimeState = runtimeStateRef.current;
      if (!doesRuntimeStateMatchKey(queuedRuntimeState, runtimeStateKey)) {
        return;
      }

      setRewardStatusMessage("Generating your dinosaur reward...");

      const orchestrationResult = await orchestrateRewardUnlock({
        playerSave: queuedRuntimeState.playerSave,
        rewardTrigger,
      });

      rewardCompletedKeysRef.current.add(rewardKey);

      if (orchestrationResult.skipped || !orchestrationResult.unlockedDinosaur) {
        if (doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)) {
          setRewardStatusMessage(
            `${orchestrationResult.dinosaurName} was already unlocked for this milestone.`,
          );
        }
        return;
      }

      applyUnlockedDinosaurToRuntimeState(
        orchestrationResult,
        rewardTrigger,
        runtimeStateKey,
      );
    } catch (error) {
      if (doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)) {
        setRewardStatusMessage(getErrorMessage(error));
      }
    } finally {
      rewardProcessingKeysRef.current.delete(rewardKey);
    }
  }

  async function handleRewardTrigger(
    rewardTrigger: LongDivisionWorkbenchRewardTrigger,
  ): Promise<void> {
    const currentRuntimeState = runtimeStateRef.current;
    if (!currentRuntimeState) {
      return;
    }

    const runtimeStateKey = buildRuntimeStateKey(currentRuntimeState);
    const rewardKey =
      `${runtimeStateKey}:${rewardTrigger.rewardIndex}:${rewardTrigger.lifetimeSolvedCount}`;
    if (
      rewardProcessingKeysRef.current.has(rewardKey) ||
      rewardCompletedKeysRef.current.has(rewardKey)
    ) {
      return;
    }

    rewardProcessingKeysRef.current.add(rewardKey);
    await rewardMilestoneQueue.enqueue(() =>
      processQueuedRewardTrigger(rewardTrigger, runtimeStateKey, rewardKey)
    );
  }

  function applyUnlockedDinosaurToRuntimeState(
    orchestrationResult: OrchestratedRewardUnlock,
    rewardTrigger: LongDivisionWorkbenchRewardTrigger,
    runtimeStateKey: string,
  ): void {
    if (!orchestrationResult.unlockedDinosaur) {
      return;
    }
    const unlockedDinosaur = orchestrationResult.unlockedDinosaur;

    setRuntimeState((previousState) => {
      if (!previousState) {
        return previousState;
      }

      if (buildRuntimeStateKey(previousState) !== runtimeStateKey) {
        return previousState;
      }

      const unlockedCount = previousState.playerSave.unlockedDinosaurs.length;
      if (rewardTrigger.rewardIndex < unlockedCount) {
        return previousState;
      }

      return {
        ...previousState,
        playerSave: {
          ...previousState.playerSave,
          totalProblemsSolved: Math.max(
            previousState.playerSave.totalProblemsSolved,
            rewardTrigger.lifetimeSolvedCount,
          ),
          unlockedDinosaurs: [
            ...previousState.playerSave.unlockedDinosaurs,
            unlockedDinosaur,
          ],
        },
      };
    });

    if (doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)) {
      setRewardStatusMessage(
        `Unlocked ${unlockedDinosaur.name}!`,
      );
    }
  }

  function handleStartNewGameClick(): void {
    setStatusMessage("");
    resetRewardProcessingState();

    try {
      const nextState = initializeNewGameRuntimeState(playerNameInput);
      setRuntimeState(nextState);
      setPlayerNameInput(nextState.playerSave.playerName);
      setStatusMessage(`Started a new game for ${nextState.playerSave.playerName}.`);
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    }
  }

  async function handleLoadExistingSaveClick(): Promise<void> {
    setIsBusy(true);
    setStatusMessage("");
    resetRewardProcessingState();

    try {
      const requestedPlayerName = requirePlayerName(playerNameInput);
      const loadedSaveFile = await loadPlayerSaveFile();
      const nextState = initializeLoadedGameRuntimeState(loadedSaveFile);
      const loadedPlayerName = nextState.playerSave.playerName;

      setRuntimeState(nextState);
      setPlayerNameInput(loadedPlayerName);

      if (
        doesLoadedSaveMatchRequestedPlayerName(
          requestedPlayerName,
          loadedPlayerName,
        )
      ) {
        setStatusMessage(`Loaded existing save for ${loadedPlayerName}.`);
      } else {
        setStatusMessage(
          `Loaded save for ${loadedPlayerName} instead of ${requestedPlayerName}.`,
        );
      }
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function handleResetFlowClick(): void {
    setRuntimeState(null);
    setStatusMessage("");
    resetRewardProcessingState();
  }

  const runtimeModeLabel =
    runtimeState?.mode === "loaded-save" ? "Loaded Existing Save" : "Started New Game";

  return (
    <section className="mt-8 rounded-xl border border-emerald-700 bg-emerald-950/40 p-6">
      <h2 className="text-xl font-semibold tracking-tight">Game Start</h2>
      {runtimeState ? (
        <>
          <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-900/40 p-4 text-sm text-emerald-100">
            <p>
              <span className="font-semibold text-emerald-50">Mode:</span>{" "}
              {runtimeModeLabel}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">Player:</span>{" "}
              {runtimeState.playerSave.playerName}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Total Problems Solved:
              </span>{" "}
              {runtimeState.playerSave.totalProblemsSolved}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Current Difficulty:
              </span>{" "}
              {runtimeState.playerSave.currentDifficulty}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Unlocked Dinosaurs:
              </span>{" "}
              {runtimeState.playerSave.unlockedDinosaurs.length}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Session History Entries:
              </span>{" "}
              {runtimeState.playerSave.sessionHistory.length}
            </p>
            <p>
              <span className="font-semibold text-emerald-50">
                Initialized At:
              </span>{" "}
              {runtimeState.initializedAt}
            </p>
            <button
              type="button"
              onClick={handleResetFlowClick}
              className="mt-4 rounded-md border border-emerald-500 px-3 py-2 font-semibold text-emerald-50 transition hover:bg-emerald-800/60"
            >
              Start With Different Player
            </button>
          </div>

          <LongDivisionWorkbench
            key={`${runtimeState.playerSave.playerName}-${runtimeState.initializedAt}-${runtimeState.playerSave.currentDifficulty}`}
            difficulty={runtimeState.playerSave.currentDifficulty}
            lifetimeSolvedCount={runtimeState.playerSave.totalProblemsSolved}
            onProgressChange={handleWorkbenchProgressChange}
            onRewardTrigger={handleRewardTrigger}
          />
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-emerald-100">
            Enter a player name, then choose whether to load an existing save
            or start a new game.
          </p>

          <label htmlFor="player-name" className="mt-5 block text-sm font-medium">
            Player Name
          </label>
          <input
            id="player-name"
            type="text"
            value={playerNameInput}
            onChange={(event) => setPlayerNameInput(event.target.value)}
            className="mt-2 w-full rounded-md border border-emerald-600 bg-emerald-950 px-3 py-2 text-emerald-50 outline-none ring-emerald-400 transition focus:ring-2"
            placeholder="Enter player name"
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStartNewGameClick}
              disabled={isBusy}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:text-emerald-200"
            >
              {isBusy ? "Working..." : "Start New Game"}
            </button>
            <button
              type="button"
              onClick={handleLoadExistingSaveClick}
              disabled={!isSupported || isBusy}
              className="rounded-md border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-800/60 disabled:cursor-not-allowed disabled:border-emerald-800 disabled:text-emerald-200"
            >
              {isBusy ? "Working..." : "Load Existing Save"}
            </button>
          </div>

          <p className="mt-4 text-sm text-emerald-100">
            {isSupported
              ? "Loading existing saves uses the File System Access API."
              : FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE}
          </p>
        </>
      )}

      {statusMessage ? (
        <p role="status" className="mt-4 text-sm text-emerald-100">
          {statusMessage}
        </p>
      ) : null}
      {runtimeState && rewardStatusMessage ? (
        <p role="status" className="mt-2 text-sm text-lime-100">
          {rewardStatusMessage}
        </p>
      ) : null}
    </section>
  );
}
