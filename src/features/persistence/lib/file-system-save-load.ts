import type {
  DinoDivisionSaveFile,
  IsoDateString,
  PlayerLifetimeProgress,
  PlayerSessionProgress,
  SessionHistoryEntry,
  UnlockedReward,
} from "@/features/contracts";
import type { InMemoryGameSession } from "@/features/persistence/lib/game-start-flow";

type FileSystemPermissionMode = "read" | "readwrite";
type FileSystemPermissionState = "granted" | "denied" | "prompt";

interface FileSystemPermissionDescriptorLike {
  mode: FileSystemPermissionMode;
}

interface FilePickerAcceptTypeLike {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptionsLike {
  id?: string;
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: readonly FilePickerAcceptTypeLike[];
}

interface SaveFilePickerOptionsLike {
  id?: string;
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  types?: readonly FilePickerAcceptTypeLike[];
}

interface FileSystemReadableFileLike {
  text: () => Promise<string>;
}

interface FileSystemWritableFileLike {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
}

export interface FileSystemSaveFileHandle {
  name: string;
  queryPermission?: (
    descriptor: FileSystemPermissionDescriptorLike,
  ) => Promise<FileSystemPermissionState>;
  requestPermission?: (
    descriptor: FileSystemPermissionDescriptorLike,
  ) => Promise<FileSystemPermissionState>;
  getFile: () => Promise<FileSystemReadableFileLike>;
  createWritable: () => Promise<FileSystemWritableFileLike>;
}

export interface FileSystemAccessRuntime {
  showOpenFilePicker: (
    options?: OpenFilePickerOptionsLike,
  ) => Promise<readonly FileSystemSaveFileHandle[]>;
  showSaveFilePicker: (
    options?: SaveFilePickerOptionsLike,
  ) => Promise<FileSystemSaveFileHandle>;
}

export interface SaveSessionToFileSystemOptions {
  session: InMemoryGameSession;
  handle?: FileSystemSaveFileHandle | null;
  fileSystem?: unknown;
  clock?: () => Date;
}

export interface SaveSessionToFileSystemResult {
  handle: FileSystemSaveFileHandle;
  fileName: string;
  saveFile: DinoDivisionSaveFile;
  json: string;
}

export interface LoadSaveFromFileSystemOptions {
  fileSystem?: unknown;
}

export interface LoadSaveFromFileSystemResult {
  handle: FileSystemSaveFileHandle;
  fileName: string;
  saveFile: DinoDivisionSaveFile;
  rawJson: string;
}

export const REQUIRED_SAVE_FILE_FIELDS = [
  "schemaVersion",
  "playerName",
  "totalProblemsSolved",
  "currentDifficultyLevel",
  "progress",
  "unlockedDinosaurs",
  "sessionHistory",
  "updatedAt",
] as const;

const SAVE_FILE_SCHEMA_VERSION = 1;
const SAVE_FILE_PICKER_ID = "dino-division-save";
const JSON_SAVE_FILE_TYPE = {
  description: "Dino Division save file",
  accept: {
    "application/json": [".json"],
  },
} as const satisfies FilePickerAcceptTypeLike;

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

function asRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }

  return value;
}

function asIsoDateString(value: unknown, fieldName: string): IsoDateString {
  const stringValue = asString(value, fieldName);
  if (Number.isNaN(Date.parse(stringValue))) {
    throw new Error(`${fieldName} must be a valid ISO timestamp.`);
  }

  return stringValue;
}

function asNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number.`);
  }

  const normalized = Math.floor(value);
  if (normalized < 0) {
    throw new Error(`${fieldName} must be zero or greater.`);
  }

  return normalized;
}

function asPositiveInteger(value: unknown, fieldName: string): number {
  const normalized = asNonNegativeInteger(value, fieldName);
  if (normalized < 1) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return normalized;
}

function normalizePlayerName(playerName: string): string {
  const normalizedPlayerName = playerName.trim().replace(/\s+/g, " ");
  if (normalizedPlayerName.length === 0) {
    throw new Error("playerName must include at least one non-space character.");
  }

  return normalizedPlayerName;
}

function toPlayerSlug(playerName: string): string {
  const slug = normalizePlayerName(playerName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "player";
}

function cloneUnlockedRewards(unlockedRewards: readonly UnlockedReward[]): UnlockedReward[] {
  return unlockedRewards.map((reward) => ({ ...reward }));
}

function normalizeSessionProgress(sessionProgress: PlayerSessionProgress): PlayerSessionProgress {
  return {
    sessionId: sessionProgress.sessionId,
    startedAt: sessionProgress.startedAt,
    solvedProblems: asNonNegativeInteger(
      sessionProgress.solvedProblems,
      "progress.session.solvedProblems",
    ),
    attemptedProblems: asNonNegativeInteger(
      sessionProgress.attemptedProblems,
      "progress.session.attemptedProblems",
    ),
  };
}

function normalizeLifetimeProgress(
  lifetimeProgress: PlayerLifetimeProgress,
  unlockedCount: number,
): PlayerLifetimeProgress {
  const totalProblemsSolved = asNonNegativeInteger(
    lifetimeProgress.totalProblemsSolved,
    "progress.lifetime.totalProblemsSolved",
  );
  const totalProblemsAttempted = Math.max(
    totalProblemsSolved,
    asNonNegativeInteger(
      lifetimeProgress.totalProblemsAttempted,
      "progress.lifetime.totalProblemsAttempted",
    ),
  );
  const currentDifficultyLevel = asPositiveInteger(
    lifetimeProgress.currentDifficultyLevel,
    "progress.lifetime.currentDifficultyLevel",
  );
  const rewardsUnlocked = Math.max(
    unlockedCount,
    asNonNegativeInteger(lifetimeProgress.rewardsUnlocked, "progress.lifetime.rewardsUnlocked"),
  );

  return {
    totalProblemsSolved,
    totalProblemsAttempted,
    currentDifficultyLevel,
    rewardsUnlocked,
  };
}

function buildActiveSessionHistoryEntry(
  sessionProgress: PlayerSessionProgress,
): SessionHistoryEntry {
  return {
    sessionId: sessionProgress.sessionId,
    startedAt: sessionProgress.startedAt,
    endedAt: null,
    solvedProblems: sessionProgress.solvedProblems,
    attemptedProblems: sessionProgress.attemptedProblems,
  };
}

function mergeSessionHistory(
  existingHistory: readonly SessionHistoryEntry[],
  activeSessionEntry: SessionHistoryEntry,
): SessionHistoryEntry[] {
  const history = existingHistory.map((entry) => ({ ...entry }));
  const existingIndex = history.findIndex(
    (entry) => entry.sessionId === activeSessionEntry.sessionId,
  );

  if (existingIndex >= 0) {
    history[existingIndex] = { ...activeSessionEntry };
    return history;
  }

  history.push({ ...activeSessionEntry });
  return history;
}

function parseUnlockedReward(value: unknown, index: number): UnlockedReward {
  const reward = asRecord(value, `unlockedDinosaurs[${index}]`);

  return {
    rewardId: asString(reward.rewardId, `unlockedDinosaurs[${index}].rewardId`),
    dinosaurName: asString(reward.dinosaurName, `unlockedDinosaurs[${index}].dinosaurName`),
    imagePath: asString(reward.imagePath, `unlockedDinosaurs[${index}].imagePath`),
    earnedAt: asIsoDateString(reward.earnedAt, `unlockedDinosaurs[${index}].earnedAt`),
    milestoneSolvedCount: asNonNegativeInteger(
      reward.milestoneSolvedCount,
      `unlockedDinosaurs[${index}].milestoneSolvedCount`,
    ),
  };
}

function parseSessionHistoryEntry(
  value: unknown,
  index: number,
): SessionHistoryEntry {
  const entry = asRecord(value, `sessionHistory[${index}]`);
  const endedAtValue = entry.endedAt;

  return {
    sessionId: asString(entry.sessionId, `sessionHistory[${index}].sessionId`),
    startedAt: asIsoDateString(entry.startedAt, `sessionHistory[${index}].startedAt`),
    endedAt:
      endedAtValue === null
        ? null
        : asIsoDateString(endedAtValue, `sessionHistory[${index}].endedAt`),
    solvedProblems: asNonNegativeInteger(
      entry.solvedProblems,
      `sessionHistory[${index}].solvedProblems`,
    ),
    attemptedProblems: asNonNegativeInteger(
      entry.attemptedProblems,
      `sessionHistory[${index}].attemptedProblems`,
    ),
  };
}

function parseSessionProgress(value: unknown): PlayerSessionProgress {
  const session = asRecord(value, "progress.session");

  return {
    sessionId: asString(session.sessionId, "progress.session.sessionId"),
    startedAt: asIsoDateString(session.startedAt, "progress.session.startedAt"),
    solvedProblems: asNonNegativeInteger(
      session.solvedProblems,
      "progress.session.solvedProblems",
    ),
    attemptedProblems: asNonNegativeInteger(
      session.attemptedProblems,
      "progress.session.attemptedProblems",
    ),
  };
}

function parseLifetimeProgress(value: unknown): PlayerLifetimeProgress {
  const lifetime = asRecord(value, "progress.lifetime");

  return {
    totalProblemsSolved: asNonNegativeInteger(
      lifetime.totalProblemsSolved,
      "progress.lifetime.totalProblemsSolved",
    ),
    totalProblemsAttempted: asNonNegativeInteger(
      lifetime.totalProblemsAttempted,
      "progress.lifetime.totalProblemsAttempted",
    ),
    currentDifficultyLevel: asPositiveInteger(
      lifetime.currentDifficultyLevel,
      "progress.lifetime.currentDifficultyLevel",
    ),
    rewardsUnlocked: asNonNegativeInteger(
      lifetime.rewardsUnlocked,
      "progress.lifetime.rewardsUnlocked",
    ),
  };
}

function parseProgress(value: unknown): {
  session: PlayerSessionProgress;
  lifetime: PlayerLifetimeProgress;
} {
  const progress = asRecord(value, "progress");

  return {
    session: parseSessionProgress(progress.session),
    lifetime: parseLifetimeProgress(progress.lifetime),
  };
}

function createOpenFilePickerOptions(): OpenFilePickerOptionsLike {
  return {
    id: SAVE_FILE_PICKER_ID,
    multiple: false,
    excludeAcceptAllOption: true,
    types: [JSON_SAVE_FILE_TYPE],
  };
}

function createSaveFilePickerOptions(playerName: string): SaveFilePickerOptionsLike {
  return {
    id: SAVE_FILE_PICKER_ID,
    suggestedName: buildPlayerSaveFileName(playerName),
    excludeAcceptAllOption: true,
    types: [JSON_SAVE_FILE_TYPE],
  };
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (error as { name?: unknown }).name === "AbortError";
}

function asFileSystemAccessRuntime(value: unknown): FileSystemAccessRuntime {
  if (supportsFileSystemAccessApi(value)) {
    return value;
  }

  throw new Error("File System Access API is not available in this environment.");
}

async function ensurePermission(
  handle: FileSystemSaveFileHandle,
  mode: FileSystemPermissionMode,
  actionLabel: string,
): Promise<void> {
  const descriptor: FileSystemPermissionDescriptorLike = { mode };
  const queriedPermission = handle.queryPermission
    ? await handle.queryPermission(descriptor)
    : "prompt";

  if (queriedPermission === "granted") {
    return;
  }

  const requestedPermission = handle.requestPermission
    ? await handle.requestPermission(descriptor)
    : queriedPermission;

  if (requestedPermission !== "granted") {
    throw new Error(`Permission denied: unable to ${actionLabel}.`);
  }
}

export function supportsFileSystemAccessApi(
  value: unknown = globalThis,
): value is FileSystemAccessRuntime {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  const candidate = value as {
    showOpenFilePicker?: unknown;
    showSaveFilePicker?: unknown;
  };

  return (
    typeof candidate.showOpenFilePicker === "function" &&
    typeof candidate.showSaveFilePicker === "function"
  );
}

export function buildPlayerSaveFileName(playerName: string): string {
  return `${toPlayerSlug(playerName)}-save.json`;
}

export function createDinoDivisionSavePayload(
  session: InMemoryGameSession,
  clock: () => Date = defaultClock,
): DinoDivisionSaveFile {
  const normalizedPlayerName = normalizePlayerName(session.playerName);
  const unlockedDinosaurs = cloneUnlockedRewards(session.gameState.unlockedRewards);
  const normalizedSessionProgress = normalizeSessionProgress(
    session.gameState.progress.session,
  );
  const normalizedLifetimeProgress = normalizeLifetimeProgress(
    session.gameState.progress.lifetime,
    unlockedDinosaurs.length,
  );
  const activeSessionHistoryEntry = buildActiveSessionHistoryEntry(normalizedSessionProgress);
  const sessionHistory = mergeSessionHistory(session.sessionHistory, activeSessionHistoryEntry);

  return {
    schemaVersion: SAVE_FILE_SCHEMA_VERSION,
    playerName: normalizedPlayerName,
    totalProblemsSolved: normalizedLifetimeProgress.totalProblemsSolved,
    currentDifficultyLevel: normalizedLifetimeProgress.currentDifficultyLevel,
    progress: {
      session: normalizedSessionProgress,
      lifetime: normalizedLifetimeProgress,
    },
    unlockedDinosaurs,
    sessionHistory,
    updatedAt: resolveIsoTimestamp(clock),
  };
}

export function parseDinoDivisionSaveFile(rawJson: string): DinoDivisionSaveFile {
  if (typeof rawJson !== "string") {
    throw new Error("Save payload must be a JSON string.");
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(rawJson);
  } catch {
    throw new Error("Save payload is not valid JSON.");
  }

  const saveFileRecord = asRecord(parsedValue, "saveFile");

  for (const requiredField of REQUIRED_SAVE_FILE_FIELDS) {
    if (!(requiredField in saveFileRecord)) {
      throw new Error(`Missing required save field "${requiredField}".`);
    }
  }

  const schemaVersion = asNonNegativeInteger(
    saveFileRecord.schemaVersion,
    "schemaVersion",
  );

  if (schemaVersion !== SAVE_FILE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schemaVersion ${schemaVersion}. Expected ${SAVE_FILE_SCHEMA_VERSION}.`,
    );
  }

  const playerName = normalizePlayerName(asString(saveFileRecord.playerName, "playerName"));
  const progress = parseProgress(saveFileRecord.progress);
  const unlockedDinosaursRaw = saveFileRecord.unlockedDinosaurs;
  const sessionHistoryRaw = saveFileRecord.sessionHistory;

  if (!Array.isArray(unlockedDinosaursRaw)) {
    throw new Error("unlockedDinosaurs must be an array.");
  }

  if (!Array.isArray(sessionHistoryRaw)) {
    throw new Error("sessionHistory must be an array.");
  }

  const unlockedDinosaurs = unlockedDinosaursRaw.map(parseUnlockedReward);
  const sessionHistory = sessionHistoryRaw.map(parseSessionHistoryEntry);
  const lifetime = normalizeLifetimeProgress(progress.lifetime, unlockedDinosaurs.length);
  const totalProblemsSolved = Math.max(
    asNonNegativeInteger(saveFileRecord.totalProblemsSolved, "totalProblemsSolved"),
    lifetime.totalProblemsSolved,
  );
  const currentDifficultyLevel = Math.max(
    asPositiveInteger(saveFileRecord.currentDifficultyLevel, "currentDifficultyLevel"),
    lifetime.currentDifficultyLevel,
  );

  return {
    schemaVersion: SAVE_FILE_SCHEMA_VERSION,
    playerName,
    totalProblemsSolved,
    currentDifficultyLevel,
    progress: {
      session: progress.session,
      lifetime: {
        ...lifetime,
        totalProblemsSolved,
        currentDifficultyLevel,
      },
    },
    unlockedDinosaurs,
    sessionHistory,
    updatedAt: asIsoDateString(saveFileRecord.updatedAt, "updatedAt"),
  };
}

export async function loadSaveFromFileSystem(
  options: LoadSaveFromFileSystemOptions = {},
): Promise<LoadSaveFromFileSystemResult | null> {
  const fileSystemRuntime = asFileSystemAccessRuntime(options.fileSystem ?? globalThis);
  let handles: readonly FileSystemSaveFileHandle[];

  try {
    handles = await fileSystemRuntime.showOpenFilePicker(createOpenFilePickerOptions());
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }

  const [handle] = handles;
  if (!handle) {
    return null;
  }

  await ensurePermission(handle, "read", "load a save file");
  const rawJson = await (await handle.getFile()).text();
  const saveFile = parseDinoDivisionSaveFile(rawJson);

  return {
    handle,
    fileName: handle.name,
    saveFile,
    rawJson,
  };
}

export async function saveSessionToFileSystem(
  options: SaveSessionToFileSystemOptions,
): Promise<SaveSessionToFileSystemResult | null> {
  const handleFromOptions = options.handle ?? null;
  let handle = handleFromOptions;

  if (!handle) {
    const fileSystemRuntime = asFileSystemAccessRuntime(options.fileSystem ?? globalThis);
    try {
      handle = await fileSystemRuntime.showSaveFilePicker(
        createSaveFilePickerOptions(options.session.playerName),
      );
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      throw error;
    }
  }

  await ensurePermission(handle, "readwrite", "save game progress");
  const saveFile = createDinoDivisionSavePayload(options.session, options.clock);
  const json = `${JSON.stringify(saveFile, null, 2)}\n`;

  const writable = await handle.createWritable();

  try {
    await writable.write(json);
    await writable.close();
  } catch (error) {
    if (writable.abort) {
      try {
        await writable.abort();
      } catch {
        // Preserve the original write error when abort cleanup fails.
      }
    }

    throw error;
  }

  return {
    handle,
    fileName: handle.name,
    saveFile,
    json,
  };
}
