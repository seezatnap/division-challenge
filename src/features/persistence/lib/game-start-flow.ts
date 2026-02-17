import type {
  DinoDivisionSaveFile,
  DivisionGameState,
  IsoDateString,
  PlayerLifetimeProgress,
  PlayerProgressState,
  PlayerSessionProgress,
  SessionHistoryEntry,
  UnlockedReward,
} from "@/features/contracts";

export type GameStartMode = "start-new" | "load-existing-save";

export interface GameStartOption {
  mode: GameStartMode;
  label: string;
  description: string;
  disabled: boolean;
}

export interface GameStartRequest {
  playerName: string;
  mode: GameStartMode;
  saveFile?: DinoDivisionSaveFile | null;
  clock?: () => Date;
  createSessionId?: () => string;
}

export interface InMemoryGameSession {
  playerName: string;
  startedAt: IsoDateString;
  startMode: GameStartMode;
  sourceSaveUpdatedAt: IsoDateString | null;
  sessionHistory: SessionHistoryEntry[];
  gameState: DivisionGameState;
}

const INITIAL_DIFFICULTY_LEVEL = 1;
const SESSION_ID_RANDOM_SEGMENT_LENGTH = 8;

const GAME_START_OPTIONS = [
  {
    mode: "start-new",
    label: "Start New",
    description: "Begin a fresh expedition with a new session while keeping your player identity.",
  },
  {
    mode: "load-existing-save",
    label: "Load Existing Save",
    description: "Resume from a saved JSON profile and carry forward lifetime progress.",
  },
] as const satisfies readonly Omit<GameStartOption, "disabled">[];

function asNonNegativeInteger(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalizedValue = Math.floor(value);
  return normalizedValue >= 0 ? normalizedValue : fallback;
}

function asPositiveInteger(value: number, fallback = INITIAL_DIFFICULTY_LEVEL): number {
  const normalizedValue = asNonNegativeInteger(value, fallback);
  return normalizedValue >= 1 ? normalizedValue : fallback;
}

function defaultClock(): Date {
  return new Date();
}

function resolveIsoTimestamp(clock: () => Date): IsoDateString {
  const timestamp = clock();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new Error("clock must return a valid Date instance.");
  }

  return timestamp.toISOString();
}

function defaultSessionIdFactory(): string {
  const randomSegment = Math.random()
    .toString(36)
    .slice(2, 2 + SESSION_ID_RANDOM_SEGMENT_LENGTH)
    .padEnd(SESSION_ID_RANDOM_SEGMENT_LENGTH, "0");

  return `session-${Date.now().toString(36)}-${randomSegment}`;
}

function resolveSessionId(createSessionId: () => string): string {
  const rawSessionId = createSessionId();

  if (typeof rawSessionId !== "string") {
    throw new Error("createSessionId must return a string.");
  }

  const normalizedSessionId = rawSessionId.trim();
  if (normalizedSessionId.length === 0) {
    throw new Error("createSessionId must return a non-empty string.");
  }

  return normalizedSessionId;
}

function cloneUnlockedRewards(unlockedRewards: readonly UnlockedReward[]): UnlockedReward[] {
  return unlockedRewards.map((reward) => ({ ...reward }));
}

function cloneSessionHistoryEntries(entries: readonly SessionHistoryEntry[]): SessionHistoryEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function createSessionProgress(
  sessionId: string,
  startedAt: IsoDateString,
): PlayerSessionProgress {
  return {
    sessionId,
    startedAt,
    solvedProblems: 0,
    attemptedProblems: 0,
  };
}

function createInitialLifetimeProgress(): PlayerLifetimeProgress {
  return {
    totalProblemsSolved: 0,
    totalProblemsAttempted: 0,
    currentDifficultyLevel: INITIAL_DIFFICULTY_LEVEL,
    rewardsUnlocked: 0,
  };
}

function normalizeLoadedLifetimeProgress(saveFile: DinoDivisionSaveFile): PlayerLifetimeProgress {
  const lifetime = saveFile.progress.lifetime;
  const totalProblemsSolved = Math.max(
    asNonNegativeInteger(saveFile.totalProblemsSolved),
    asNonNegativeInteger(lifetime.totalProblemsSolved),
  );
  const totalProblemsAttempted = Math.max(
    totalProblemsSolved,
    asNonNegativeInteger(lifetime.totalProblemsAttempted),
  );
  const currentDifficultyLevel = Math.max(
    asPositiveInteger(saveFile.currentDifficultyLevel),
    asPositiveInteger(lifetime.currentDifficultyLevel),
  );
  const rewardsUnlocked = Math.max(
    asNonNegativeInteger(lifetime.rewardsUnlocked),
    saveFile.unlockedDinosaurs.length,
  );

  return {
    totalProblemsSolved,
    totalProblemsAttempted,
    currentDifficultyLevel,
    rewardsUnlocked,
  };
}

function createGameState(
  progress: PlayerProgressState,
  unlockedRewards: UnlockedReward[],
): DivisionGameState {
  return {
    activeProblem: null,
    steps: [],
    activeInputTarget: null,
    progress,
    unlockedRewards,
  };
}

export function normalizePlayerName(playerName: string): string {
  if (typeof playerName !== "string") {
    throw new TypeError("playerName must be a string.");
  }

  const normalizedName = playerName.trim().replace(/\s+/g, " ");
  if (normalizedName.length === 0) {
    throw new Error("playerName must include at least one non-space character.");
  }

  return normalizedName;
}

export function buildGameStartOptions(hasLoadableSave: boolean): readonly GameStartOption[] {
  return GAME_START_OPTIONS.map((option) => ({
    ...option,
    disabled: option.mode === "load-existing-save" ? !hasLoadableSave : false,
  }));
}

export function createInMemoryGameSession(request: GameStartRequest): InMemoryGameSession {
  const normalizedPlayerName = normalizePlayerName(request.playerName);
  const clock = request.clock ?? defaultClock;
  const createSessionId = request.createSessionId ?? defaultSessionIdFactory;
  const startedAt = resolveIsoTimestamp(clock);
  const sessionProgress = createSessionProgress(resolveSessionId(createSessionId), startedAt);

  if (request.mode === "start-new") {
    const progress: PlayerProgressState = {
      session: sessionProgress,
      lifetime: createInitialLifetimeProgress(),
    };

    return {
      playerName: normalizedPlayerName,
      startedAt,
      startMode: request.mode,
      sourceSaveUpdatedAt: null,
      sessionHistory: [],
      gameState: createGameState(progress, []),
    };
  }

  if (request.mode !== "load-existing-save") {
    throw new Error('mode must be either "start-new" or "load-existing-save".');
  }

  if (!request.saveFile) {
    throw new Error('saveFile is required when mode is "load-existing-save".');
  }

  const normalizedSavePlayerName = normalizePlayerName(request.saveFile.playerName);
  if (normalizedSavePlayerName.toLowerCase() !== normalizedPlayerName.toLowerCase()) {
    throw new Error("playerName must match the selected save file when loading an existing save.");
  }

  const unlockedRewards = cloneUnlockedRewards(request.saveFile.unlockedDinosaurs);
  const progress: PlayerProgressState = {
    session: sessionProgress,
    lifetime: normalizeLoadedLifetimeProgress(request.saveFile),
  };

  return {
    playerName: normalizedSavePlayerName,
    startedAt,
    startMode: request.mode,
    sourceSaveUpdatedAt: request.saveFile.updatedAt,
    sessionHistory: cloneSessionHistoryEntries(request.saveFile.sessionHistory),
    gameState: createGameState(progress, unlockedRewards),
  };
}
