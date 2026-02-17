"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LongDivisionWorkbench from "./long-division-workbench";
import DinoGallery from "./dino-gallery";

import {
  applyRuntimeProgressUpdate,
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
  savePlayerSaveFile,
} from "@/lib/save-file";
import {
  buildRuntimeStateKey,
  doesRuntimeStateMatchKey,
  saveProgressAfterRewardMilestones,
} from "@/lib/save-progress";
import {
  getHighestRewardIndexForSolvedCount,
  processPendingRewardMilestones,
  type ProcessPendingRewardMilestonesResult,
} from "@/lib/reward-orchestration";
import { createSerialTaskQueue } from "@/lib/serial-task-queue";
import type { LongDivisionWorkbenchRewardTrigger } from "@/lib/long-division-workbench";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred while accessing save files.";
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
  const processQueuedRewardMilestonesRef = useRef<
    (runtimeStateKey: string) => Promise<void>
  >(async (): Promise<void> => {});
  const rewardHighestSeenIndexRef = useRef<number>(-1);

  const isSupported = useMemo(() => isFileSystemAccessSupported(), []);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(() => {
    if (!runtimeState) {
      return;
    }

    const highestRewardIndex = syncHighestSeenRewardIndex(
      runtimeState.playerSave.totalProblemsSolved,
    );
    if (runtimeState.playerSave.unlockedDinosaurs.length > highestRewardIndex) {
      return;
    }

    const runtimeStateKey = buildRuntimeStateKey(runtimeState);
    void rewardMilestoneQueue.enqueue(() =>
      processQueuedRewardMilestonesRef.current(runtimeStateKey)
    );
  }, [runtimeState, rewardMilestoneQueue]);

  function syncHighestSeenRewardIndex(totalProblemsSolved: number): number {
    rewardHighestSeenIndexRef.current = Math.max(
      rewardHighestSeenIndexRef.current,
      getHighestRewardIndexForSolvedCount(totalProblemsSolved),
    );

    return rewardHighestSeenIndexRef.current;
  }

  function resetRewardProcessingState(): void {
    rewardMilestoneQueue.clear();
    rewardHighestSeenIndexRef.current = -1;
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

      const nextState = applyRuntimeProgressUpdate(previousState, progress);
      runtimeStateRef.current = nextState;
      return nextState;
    });
  }

  async function processQueuedRewardMilestones(
    runtimeStateKey: string,
  ): Promise<void> {
    try {
      const queuedRuntimeState = runtimeStateRef.current;
      if (!doesRuntimeStateMatchKey(queuedRuntimeState, runtimeStateKey)) {
        return;
      }

      const highestRewardIndex = syncHighestSeenRewardIndex(
        queuedRuntimeState.playerSave.totalProblemsSolved,
      );
      if (queuedRuntimeState.playerSave.unlockedDinosaurs.length > highestRewardIndex) {
        return;
      }

      setRewardStatusMessage("Compys are sketching your next dinosaur reward...");

      const rewardResult = await processPendingRewardMilestones({
        playerSave: queuedRuntimeState.playerSave,
        highestRewardIndex,
      });

      await applyRewardMilestonesToRuntimeState(rewardResult, runtimeStateKey);
    } catch (error) {
      if (doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)) {
        setRewardStatusMessage(getErrorMessage(error));
      }
    }
  }
  processQueuedRewardMilestonesRef.current = processQueuedRewardMilestones;

  function handleRewardTrigger(
    rewardTrigger: LongDivisionWorkbenchRewardTrigger,
  ): void {
    rewardHighestSeenIndexRef.current = Math.max(
      rewardHighestSeenIndexRef.current,
      rewardTrigger.rewardIndex,
    );
  }

  async function applyRewardMilestonesToRuntimeState(
    rewardResult: ProcessPendingRewardMilestonesResult,
    runtimeStateKey: string,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      setRuntimeState((previousState) => {
        if (!previousState) {
          resolve();
          return previousState;
        }

        if (buildRuntimeStateKey(previousState) !== runtimeStateKey) {
          resolve();
          return previousState;
        }

        const totalProblemsSolved = Math.max(
          previousState.playerSave.totalProblemsSolved,
          rewardResult.playerSave.totalProblemsSolved,
        );
        const hasNewUnlocks =
          rewardResult.playerSave.unlockedDinosaurs.length >
          previousState.playerSave.unlockedDinosaurs.length;
        const unlockedDinosaurs = hasNewUnlocks
          ? [...rewardResult.playerSave.unlockedDinosaurs]
          : previousState.playerSave.unlockedDinosaurs;
        const hasNoChanges =
          totalProblemsSolved === previousState.playerSave.totalProblemsSolved &&
          unlockedDinosaurs === previousState.playerSave.unlockedDinosaurs;

        if (hasNoChanges) {
          resolve();
          return previousState;
        }

        const nextState: GameRuntimeState = {
          ...previousState,
          playerSave: {
            ...previousState.playerSave,
            totalProblemsSolved,
            unlockedDinosaurs,
          },
        };
        runtimeStateRef.current = nextState;
        resolve();
        return nextState;
      });
    });

    if (doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)) {
      if (rewardResult.errorMessage) {
        setRewardStatusMessage(rewardResult.errorMessage);
        return;
      }

      const latestUnlockedDinosaur =
        rewardResult.unlockedDinosaurs[rewardResult.unlockedDinosaurs.length - 1];
      if (latestUnlockedDinosaur) {
        setRewardStatusMessage(
          `${latestUnlockedDinosaur.name} stomped into your gallery!`,
        );
      }
    }
  }

  function handleStartNewGameClick(): void {
    setStatusMessage("");
    resetRewardProcessingState();

    try {
      const nextState = initializeNewGameRuntimeState(playerNameInput);
      runtimeStateRef.current = nextState;
      setRuntimeState(nextState);
      setPlayerNameInput(nextState.playerSave.playerName);
      setStatusMessage(
        `Expedition started for ${nextState.playerSave.playerName}.`,
      );
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

      runtimeStateRef.current = nextState;
      setRuntimeState(nextState);
      setPlayerNameInput(loadedPlayerName);

      if (
        doesLoadedSaveMatchRequestedPlayerName(
          requestedPlayerName,
          loadedPlayerName,
        )
      ) {
        setStatusMessage(`Welcome back, ${loadedPlayerName}. Save loaded.`);
      } else {
        setStatusMessage(
          `Loaded ${loadedPlayerName}'s save instead of ${requestedPlayerName}.`,
        );
      }
    } catch (error) {
      setStatusMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSaveProgressClick(): Promise<void> {
    const currentRuntimeState = runtimeStateRef.current;
    if (!currentRuntimeState) {
      return;
    }

    const runtimeStateKey = buildRuntimeStateKey(currentRuntimeState);
    setIsBusy(true);
    setStatusMessage("");

    try {
      const saveResult = await saveProgressAfterRewardMilestones({
        expectedRuntimeStateKey: runtimeStateKey,
        getRuntimeState: () => runtimeStateRef.current,
        rewardMilestoneQueue,
        persistPlayerSave: savePlayerSaveFile,
      });
      if (
        saveResult &&
        doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)
      ) {
        setStatusMessage(`Field notes secured in ${saveResult.fileName}.`);
      }
    } catch (error) {
      if (doesRuntimeStateMatchKey(runtimeStateRef.current, runtimeStateKey)) {
        setStatusMessage(getErrorMessage(error));
      }
    } finally {
      setIsBusy(false);
    }
  }

  function handleResetFlowClick(): void {
    runtimeStateRef.current = null;
    setRuntimeState(null);
    setStatusMessage("");
    resetRewardProcessingState();
  }

  const runtimeModeLabel =
    runtimeState?.mode === "loaded-save" ? "Loaded Existing Save" : "Started New Game";

  return (
    <section className="jurassic-card mt-8 p-6">
      <p className="fossil-label">Mission Control</p>
      <h2 className="jurassic-heading mt-2 text-xl font-semibold">Game Start</h2>
      {runtimeState ? (
        <>
          <div className="jurassic-card mt-4 p-4 text-sm">
            <p>
              <span className="font-semibold text-[var(--sandstone)]">Mode:</span>{" "}
              {runtimeModeLabel}
            </p>
            <p>
              <span className="font-semibold text-[var(--sandstone)]">Player:</span>{" "}
              {runtimeState.playerSave.playerName}
            </p>
            <p>
              <span className="font-semibold text-[var(--sandstone)]">
                Total Problems Solved:
              </span>{" "}
              {runtimeState.playerSave.totalProblemsSolved}
            </p>
            <p>
              <span className="font-semibold text-[var(--sandstone)]">
                Current Difficulty:
              </span>{" "}
              {runtimeState.playerSave.currentDifficulty}
            </p>
            <p>
              <span className="font-semibold text-[var(--sandstone)]">
                Unlocked Dinosaurs:
              </span>{" "}
              {runtimeState.playerSave.unlockedDinosaurs.length}
            </p>
            <p>
              <span className="font-semibold text-[var(--sandstone)]">
                Session History Entries:
              </span>{" "}
              {runtimeState.playerSave.sessionHistory.length}
            </p>
            <p>
              <span className="font-semibold text-[var(--sandstone)]">
                Initialized At:
              </span>{" "}
              {runtimeState.initializedAt}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveProgressClick}
                disabled={!isSupported || isBusy}
                className="dino-button-primary px-3 py-2"
              >
                {isBusy ? "Working..." : "Save Progress"}
              </button>
              <button
                type="button"
                onClick={handleResetFlowClick}
                disabled={isBusy}
                className="dino-button-secondary px-3 py-2"
              >
                Start With Different Player
              </button>
            </div>
            <p className="jurassic-copy mt-3 text-xs">
              {isSupported
                ? "Save your progress to keep difficulty, unlocked dinosaurs, and session history across sessions."
                : FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE}
            </p>
          </div>

          <LongDivisionWorkbench
            key={`${runtimeState.playerSave.playerName}-${runtimeState.initializedAt}-${runtimeState.playerSave.currentDifficulty}`}
            difficulty={runtimeState.playerSave.currentDifficulty}
            lifetimeSolvedCount={runtimeState.playerSave.totalProblemsSolved}
            onProgressChange={handleWorkbenchProgressChange}
            onRewardTrigger={handleRewardTrigger}
          />

          <DinoGallery
            unlockedDinosaurs={runtimeState.playerSave.unlockedDinosaurs}
          />
        </>
      ) : (
        <>
          <p className="jurassic-copy mt-2 text-sm">
            Enter a player name, then choose whether to load an existing save
            or start a new game.
          </p>

          <label
            htmlFor="player-name"
            className="mt-5 block text-sm font-medium text-[var(--sandstone)]"
          >
            Player Name
          </label>
          <input
            id="player-name"
            type="text"
            value={playerNameInput}
            onChange={(event) => setPlayerNameInput(event.target.value)}
            className="dino-input mt-2 w-full"
            placeholder="Enter player name"
          />

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStartNewGameClick}
              disabled={isBusy}
              className="dino-button-primary px-4 py-2 text-sm"
            >
              {isBusy ? "Working..." : "Start New Game"}
            </button>
            <button
              type="button"
              onClick={handleLoadExistingSaveClick}
              disabled={!isSupported || isBusy}
              className="dino-button-secondary px-4 py-2 text-sm"
            >
              {isBusy ? "Working..." : "Load Existing Save"}
            </button>
          </div>

          <p className="jurassic-copy mt-4 text-sm">
            {isSupported
              ? "Loading existing saves uses the File System Access API."
              : FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE}
          </p>
        </>
      )}

      {statusMessage ? (
        <p role="status" className="dino-status dino-status-idle mt-4">
          {statusMessage}
        </p>
      ) : null}
      {runtimeState && rewardStatusMessage ? (
        <p role="status" className="dino-status dino-status-success mt-2">
          {rewardStatusMessage}
        </p>
      ) : null}
    </section>
  );
}
