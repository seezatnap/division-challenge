import {
  createNewPlayerSave,
  isPlayerSaveFile,
  type PlayerSaveFile,
  type SessionHistoryEntry,
} from "./domain";

export const GAME_START_PLAYER_NAME_REQUIRED_MESSAGE =
  "Player name is required before starting the game.";
export const INVALID_RUNTIME_SAVE_FILE_MESSAGE =
  "Runtime state requires a valid player save file.";

export type GameStartMode = "new-game" | "loaded-save";

export interface GameRuntimeState {
  mode: GameStartMode;
  initializedAt: string;
  sessionId: string;
  playerSave: PlayerSaveFile;
}

export interface RuntimeProgressUpdate {
  difficulty: PlayerSaveFile["currentDifficulty"];
  solvedCount: number;
  lifetimeSolvedCount: number;
}

function normalizePlayerName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSessionIdSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeSolvedCount(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function buildRuntimeSessionId(playerName: string, initializedAt: string): string {
  const playerSegment = normalizeSessionIdSegment(playerName) || "player";
  const timestampSegment = initializedAt.replace(/[^0-9]+/g, "") || "session";

  return `${playerSegment}-${timestampSegment}`;
}

function createRuntimeSessionHistoryEntry(
  sessionId: string,
  startedAt: string,
): SessionHistoryEntry {
  return {
    sessionId,
    startedAt,
    endedAt: null,
    problemsSolved: 0,
  };
}

function closeOpenSessions(
  sessionHistory: readonly SessionHistoryEntry[],
  endedAt: string,
): SessionHistoryEntry[] {
  return sessionHistory.map((entry) => {
    if (entry.endedAt !== null) {
      return entry;
    }

    return {
      ...entry,
      endedAt,
    };
  });
}

function addRuntimeSessionToSave(
  playerSave: PlayerSaveFile,
  sessionId: string,
  startedAt: string,
  closeExistingOpenSessions: boolean,
): PlayerSaveFile {
  const sessionHistory = closeExistingOpenSessions
    ? closeOpenSessions(playerSave.sessionHistory, startedAt)
    : [...playerSave.sessionHistory];

  return {
    ...playerSave,
    sessionHistory: [
      ...sessionHistory,
      createRuntimeSessionHistoryEntry(sessionId, startedAt),
    ],
  };
}

function upsertRuntimeSessionProgress(
  sessionHistory: readonly SessionHistoryEntry[],
  sessionId: string,
  startedAt: string,
  solvedCount: number,
): readonly SessionHistoryEntry[] {
  let foundSession = false;
  let didChange = false;

  const nextSessionHistory = sessionHistory.map((entry) => {
    if (entry.sessionId !== sessionId) {
      return entry;
    }

    foundSession = true;
    const nextSolvedCount = Math.max(entry.problemsSolved, solvedCount);
    if (entry.problemsSolved === nextSolvedCount && entry.endedAt === null) {
      return entry;
    }

    didChange = true;
    return {
      ...entry,
      endedAt: null,
      problemsSolved: nextSolvedCount,
    };
  });

  if (foundSession) {
    return didChange ? nextSessionHistory : sessionHistory;
  }

  return [
    ...sessionHistory,
    {
      ...createRuntimeSessionHistoryEntry(sessionId, startedAt),
      problemsSolved: solvedCount,
    },
  ];
}

export function requirePlayerName(playerName: string): string {
  const trimmedName = playerName.trim();

  if (!trimmedName) {
    throw new Error(GAME_START_PLAYER_NAME_REQUIRED_MESSAGE);
  }

  return trimmedName;
}

export function initializeNewGameRuntimeState(
  playerName: string,
  initializedAt: string = new Date().toISOString(),
): GameRuntimeState {
  const validatedName = requirePlayerName(playerName);
  const sessionId = buildRuntimeSessionId(validatedName, initializedAt);
  const playerSave = addRuntimeSessionToSave(
    createNewPlayerSave(validatedName),
    sessionId,
    initializedAt,
    false,
  );

  return {
    mode: "new-game",
    initializedAt,
    sessionId,
    playerSave,
  };
}

export function initializeLoadedGameRuntimeState(
  playerSave: PlayerSaveFile,
  initializedAt: string = new Date().toISOString(),
): GameRuntimeState {
  if (!isPlayerSaveFile(playerSave)) {
    throw new Error(INVALID_RUNTIME_SAVE_FILE_MESSAGE);
  }

  const normalizedPlayerName = playerSave.playerName.trim();
  const sessionId = buildRuntimeSessionId(normalizedPlayerName, initializedAt);

  return {
    mode: "loaded-save",
    initializedAt,
    sessionId,
    playerSave: addRuntimeSessionToSave(
      {
        ...playerSave,
        playerName: normalizedPlayerName,
      },
      sessionId,
      initializedAt,
      true,
    ),
  };
}

export function applyRuntimeProgressUpdate(
  runtimeState: GameRuntimeState,
  progress: RuntimeProgressUpdate,
): GameRuntimeState {
  const solvedCount = normalizeSolvedCount(progress.solvedCount);
  const lifetimeSolvedCount = Math.max(
    solvedCount,
    normalizeSolvedCount(progress.lifetimeSolvedCount),
  );
  const totalProblemsSolved = Math.max(
    runtimeState.playerSave.totalProblemsSolved,
    lifetimeSolvedCount,
  );
  const sessionHistory = upsertRuntimeSessionProgress(
    runtimeState.playerSave.sessionHistory,
    runtimeState.sessionId,
    runtimeState.initializedAt,
    solvedCount,
  );
  const hasNoChanges =
    runtimeState.playerSave.totalProblemsSolved === totalProblemsSolved &&
    runtimeState.playerSave.currentDifficulty === progress.difficulty &&
    runtimeState.playerSave.sessionHistory === sessionHistory;

  if (hasNoChanges) {
    return runtimeState;
  }

  return {
    ...runtimeState,
    playerSave: {
      ...runtimeState.playerSave,
      totalProblemsSolved,
      currentDifficulty: progress.difficulty,
      sessionHistory: [...sessionHistory],
    },
  };
}

export function doesLoadedSaveMatchRequestedPlayerName(
  requestedPlayerName: string,
  loadedPlayerName: string,
): boolean {
  return (
    normalizePlayerName(requirePlayerName(requestedPlayerName)) ===
    normalizePlayerName(requirePlayerName(loadedPlayerName))
  );
}
