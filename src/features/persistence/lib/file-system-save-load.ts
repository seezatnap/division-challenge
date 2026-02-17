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

interface FileSystemWritableOptionsLike {
  keepExistingData?: boolean;
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
  createWritable: (
    options?: FileSystemWritableOptionsLike,
  ) => Promise<FileSystemWritableFileLike>;
}

export interface FileSystemAccessRuntime {
  showOpenFilePicker: (
    options?: OpenFilePickerOptionsLike,
  ) => Promise<readonly FileSystemSaveFileHandle[]>;
  showSaveFilePicker: (
    options?: SaveFilePickerOptionsLike,
  ) => Promise<FileSystemSaveFileHandle>;
}

interface JsonDownloadAnchorLike {
  href: string;
  download: string;
  click: () => void;
  remove?: () => void;
}

interface JsonBlobConstructorLike {
  new (parts: readonly string[], options?: { type?: string }): unknown;
}

interface JsonUrlRuntimeLike {
  createObjectURL: (blob: unknown) => string;
  revokeObjectURL?: (url: string) => void;
}

interface JsonDocumentRuntimeLike {
  createElement: (tagName: string) => unknown;
  body?: {
    appendChild: (node: unknown) => unknown;
  };
}

interface JsonFallbackRuntimeLike {
  Blob: JsonBlobConstructorLike;
  URL: JsonUrlRuntimeLike;
  document: JsonDocumentRuntimeLike;
}

export interface JsonSaveDownloadRuntime {
  downloadJson: (fileName: string, json: string) => Promise<void> | void;
}

export interface JsonSaveFileLike {
  name: string;
  text: () => Promise<string>;
}

export interface ExportSessionToJsonDownloadOptions {
  session: InMemoryGameSession;
  clock?: () => Date;
  downloader?: JsonSaveDownloadRuntime;
  fallbackRuntime?: unknown;
}

export interface ExportSessionToJsonDownloadResult {
  fileName: string;
  saveFile: DinoDivisionSaveFile;
  json: string;
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

export interface LoadSaveFromJsonFileResult {
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
const saveWriteQueueByHandle = new WeakMap<FileSystemSaveFileHandle, Promise<void>>();

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

function cloneSessionHistoryEntries(
  sessionHistoryEntries: readonly SessionHistoryEntry[],
): SessionHistoryEntry[] {
  return sessionHistoryEntries.map((entry) => ({ ...entry }));
}

function toIsoTimestamp(value: IsoDateString): number {
  return Date.parse(value);
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }

  return 0;
}

function sortUnlockedRewardsForSave(unlockedRewards: readonly UnlockedReward[]): UnlockedReward[] {
  return cloneUnlockedRewards(unlockedRewards).sort((leftReward, rightReward) => {
    if (leftReward.milestoneSolvedCount !== rightReward.milestoneSolvedCount) {
      return leftReward.milestoneSolvedCount - rightReward.milestoneSolvedCount;
    }

    const earnedAtTimestampDelta =
      toIsoTimestamp(leftReward.earnedAt) - toIsoTimestamp(rightReward.earnedAt);
    if (earnedAtTimestampDelta !== 0) {
      return earnedAtTimestampDelta;
    }

    return compareStrings(leftReward.rewardId, rightReward.rewardId);
  });
}

function mergeUnlockedReward(
  existingReward: UnlockedReward,
  incomingReward: UnlockedReward,
): UnlockedReward {
  if (incomingReward.milestoneSolvedCount > existingReward.milestoneSolvedCount) {
    return { ...incomingReward };
  }
  if (incomingReward.milestoneSolvedCount < existingReward.milestoneSolvedCount) {
    return { ...existingReward };
  }

  if (toIsoTimestamp(incomingReward.earnedAt) >= toIsoTimestamp(existingReward.earnedAt)) {
    return { ...incomingReward };
  }

  return { ...existingReward };
}

function mergeUnlockedRewards(
  existingRewards: readonly UnlockedReward[],
  incomingRewards: readonly UnlockedReward[],
): UnlockedReward[] {
  const rewardsById = new Map<string, UnlockedReward>();

  for (const reward of existingRewards) {
    rewardsById.set(reward.rewardId, { ...reward });
  }

  for (const reward of incomingRewards) {
    const existingReward = rewardsById.get(reward.rewardId);
    rewardsById.set(
      reward.rewardId,
      existingReward ? mergeUnlockedReward(existingReward, reward) : { ...reward },
    );
  }

  return sortUnlockedRewardsForSave(Array.from(rewardsById.values()));
}

function normalizeSessionProgress(sessionProgress: PlayerSessionProgress): PlayerSessionProgress {
  const solvedProblems = asNonNegativeInteger(
    sessionProgress.solvedProblems,
    "progress.session.solvedProblems",
  );

  return {
    sessionId: sessionProgress.sessionId,
    startedAt: sessionProgress.startedAt,
    solvedProblems,
    attemptedProblems: Math.max(
      solvedProblems,
      asNonNegativeInteger(
        sessionProgress.attemptedProblems,
        "progress.session.attemptedProblems",
      ),
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
  const normalizedSessionProgress = normalizeSessionProgress(sessionProgress);

  return {
    sessionId: normalizedSessionProgress.sessionId,
    startedAt: normalizedSessionProgress.startedAt,
    endedAt: null,
    solvedProblems: normalizedSessionProgress.solvedProblems,
    attemptedProblems: normalizedSessionProgress.attemptedProblems,
  };
}

function compareSessionProgress(
  leftProgress: PlayerSessionProgress,
  rightProgress: PlayerSessionProgress,
): number {
  if (leftProgress.solvedProblems !== rightProgress.solvedProblems) {
    return leftProgress.solvedProblems - rightProgress.solvedProblems;
  }
  if (leftProgress.attemptedProblems !== rightProgress.attemptedProblems) {
    return leftProgress.attemptedProblems - rightProgress.attemptedProblems;
  }

  return toIsoTimestamp(leftProgress.startedAt) - toIsoTimestamp(rightProgress.startedAt);
}

function mergeSessionProgress(
  existingSessionProgress: PlayerSessionProgress,
  incomingSessionProgress: PlayerSessionProgress,
): PlayerSessionProgress {
  const normalizedExistingProgress = normalizeSessionProgress(existingSessionProgress);
  const normalizedIncomingProgress = normalizeSessionProgress(incomingSessionProgress);

  if (normalizedExistingProgress.sessionId === normalizedIncomingProgress.sessionId) {
    const solvedProblems = Math.max(
      normalizedExistingProgress.solvedProblems,
      normalizedIncomingProgress.solvedProblems,
    );

    return {
      sessionId: normalizedIncomingProgress.sessionId,
      startedAt:
        toIsoTimestamp(normalizedExistingProgress.startedAt) <=
        toIsoTimestamp(normalizedIncomingProgress.startedAt)
          ? normalizedExistingProgress.startedAt
          : normalizedIncomingProgress.startedAt,
      solvedProblems,
      attemptedProblems: Math.max(
        solvedProblems,
        normalizedExistingProgress.attemptedProblems,
        normalizedIncomingProgress.attemptedProblems,
      ),
    };
  }

  return compareSessionProgress(
    normalizedExistingProgress,
    normalizedIncomingProgress,
  ) > 0
    ? { ...normalizedExistingProgress }
    : { ...normalizedIncomingProgress };
}

function mergeSessionHistoryEntry(
  existingEntry: SessionHistoryEntry,
  incomingEntry: SessionHistoryEntry,
): SessionHistoryEntry {
  const solvedProblems = Math.max(existingEntry.solvedProblems, incomingEntry.solvedProblems);
  const attemptedProblems = Math.max(
    solvedProblems,
    existingEntry.attemptedProblems,
    incomingEntry.attemptedProblems,
  );

  let endedAt: IsoDateString | null = null;
  if (existingEntry.endedAt === null) {
    endedAt = incomingEntry.endedAt;
  } else if (incomingEntry.endedAt === null) {
    endedAt = existingEntry.endedAt;
  } else {
    endedAt =
      toIsoTimestamp(existingEntry.endedAt) >= toIsoTimestamp(incomingEntry.endedAt)
        ? existingEntry.endedAt
        : incomingEntry.endedAt;
  }

  return {
    sessionId: incomingEntry.sessionId,
    startedAt:
      toIsoTimestamp(existingEntry.startedAt) <= toIsoTimestamp(incomingEntry.startedAt)
        ? existingEntry.startedAt
        : incomingEntry.startedAt,
    endedAt,
    solvedProblems,
    attemptedProblems,
  };
}

function sortSessionHistoryForSave(
  sessionHistoryEntries: readonly SessionHistoryEntry[],
): SessionHistoryEntry[] {
  return cloneSessionHistoryEntries(sessionHistoryEntries).sort(
    (leftEntry, rightEntry) => {
      const startedAtTimestampDelta =
        toIsoTimestamp(leftEntry.startedAt) - toIsoTimestamp(rightEntry.startedAt);
      if (startedAtTimestampDelta !== 0) {
        return startedAtTimestampDelta;
      }

      return compareStrings(leftEntry.sessionId, rightEntry.sessionId);
    },
  );
}

function mergeSessionHistoryEntries(
  existingHistory: readonly SessionHistoryEntry[],
  incomingHistory: readonly SessionHistoryEntry[],
): SessionHistoryEntry[] {
  const historyBySessionId = new Map<string, SessionHistoryEntry>();

  for (const entry of existingHistory) {
    historyBySessionId.set(entry.sessionId, { ...entry });
  }

  for (const entry of incomingHistory) {
    const existingEntry = historyBySessionId.get(entry.sessionId);
    historyBySessionId.set(
      entry.sessionId,
      existingEntry ? mergeSessionHistoryEntry(existingEntry, entry) : { ...entry },
    );
  }

  return sortSessionHistoryForSave(Array.from(historyBySessionId.values()));
}

function mergeSessionHistory(
  existingHistory: readonly SessionHistoryEntry[],
  activeSessionEntry: SessionHistoryEntry,
): SessionHistoryEntry[] {
  return mergeSessionHistoryEntries(existingHistory, [activeSessionEntry]);
}

function mergeLifetimeProgress(
  existingLifetimeProgress: PlayerLifetimeProgress,
  incomingLifetimeProgress: PlayerLifetimeProgress,
  unlockedCount: number,
): PlayerLifetimeProgress {
  return normalizeLifetimeProgress(
    {
      totalProblemsSolved: Math.max(
        existingLifetimeProgress.totalProblemsSolved,
        incomingLifetimeProgress.totalProblemsSolved,
      ),
      totalProblemsAttempted: Math.max(
        existingLifetimeProgress.totalProblemsAttempted,
        incomingLifetimeProgress.totalProblemsAttempted,
      ),
      currentDifficultyLevel: Math.max(
        existingLifetimeProgress.currentDifficultyLevel,
        incomingLifetimeProgress.currentDifficultyLevel,
      ),
      rewardsUnlocked: Math.max(
        existingLifetimeProgress.rewardsUnlocked,
        incomingLifetimeProgress.rewardsUnlocked,
      ),
    },
    unlockedCount,
  );
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

function createSaveJson(saveFile: DinoDivisionSaveFile): string {
  return `${JSON.stringify(saveFile, null, 2)}\n`;
}

function asJsonDownloadAnchor(value: unknown): JsonDownloadAnchorLike {
  if (!value || typeof value !== "object") {
    throw new Error("JSON export fallback could not create a download anchor element.");
  }

  const candidate = value as JsonDownloadAnchorLike;
  if (typeof candidate.click !== "function") {
    throw new Error("JSON export fallback download anchor is missing click() support.");
  }

  return candidate;
}

function asJsonFallbackRuntime(value: unknown): JsonFallbackRuntimeLike {
  if (
    !value ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    throw new Error("JSON save fallback is not available in this environment.");
  }

  const candidate = value as {
    Blob?: unknown;
    URL?: { createObjectURL?: unknown; revokeObjectURL?: unknown };
    document?: { createElement?: unknown; body?: { appendChild?: unknown } };
  };

  if (
    typeof candidate.Blob !== "function" ||
    !candidate.URL ||
    typeof candidate.URL.createObjectURL !== "function" ||
    !candidate.document ||
    typeof candidate.document.createElement !== "function"
  ) {
    throw new Error("JSON save fallback is not available in this environment.");
  }

  return {
    Blob: candidate.Blob as JsonBlobConstructorLike,
    URL: candidate.URL as JsonUrlRuntimeLike,
    document: candidate.document as JsonDocumentRuntimeLike,
  };
}

function createBrowserJsonSaveDownloader(value: unknown): JsonSaveDownloadRuntime {
  const runtime = asJsonFallbackRuntime(value);

  return {
    downloadJson(fileName: string, json: string): void {
      const blob = new runtime.Blob([json], { type: "application/json" });
      const objectUrl = runtime.URL.createObjectURL.call(runtime.URL, blob);
      const anchor = asJsonDownloadAnchor(
        runtime.document.createElement.call(runtime.document, "a"),
      );
      anchor.href = objectUrl;
      anchor.download = fileName;
      if (
        runtime.document.body &&
        typeof runtime.document.body.appendChild === "function"
      ) {
        runtime.document.body.appendChild.call(runtime.document.body, anchor);
      }

      try {
        anchor.click();
      } finally {
        if (typeof anchor.remove === "function") {
          anchor.remove();
        }
        runtime.URL.revokeObjectURL?.call(runtime.URL, objectUrl);
      }
    },
  };
}

function createSavePayloadAndJson(
  session: InMemoryGameSession,
  clock: () => Date = defaultClock,
): {
  saveFile: DinoDivisionSaveFile;
  json: string;
} {
  const saveFile = createDinoDivisionSavePayload(session, clock);

  return {
    saveFile,
    json: createSaveJson(saveFile),
  };
}

function mergeDinoDivisionSaveFiles(
  existingSaveFile: DinoDivisionSaveFile,
  incomingSaveFile: DinoDivisionSaveFile,
): DinoDivisionSaveFile {
  const unlockedDinosaurs = mergeUnlockedRewards(
    existingSaveFile.unlockedDinosaurs,
    incomingSaveFile.unlockedDinosaurs,
  );
  const sessionHistory = mergeSessionHistoryEntries(
    existingSaveFile.sessionHistory,
    incomingSaveFile.sessionHistory,
  );
  const mergedSessionProgress = mergeSessionProgress(
    existingSaveFile.progress.session,
    incomingSaveFile.progress.session,
  );
  const mergedLifetimeProgress = mergeLifetimeProgress(
    existingSaveFile.progress.lifetime,
    incomingSaveFile.progress.lifetime,
    unlockedDinosaurs.length,
  );
  const totalProblemsSolved = Math.max(
    mergedLifetimeProgress.totalProblemsSolved,
    existingSaveFile.totalProblemsSolved,
    incomingSaveFile.totalProblemsSolved,
  );
  const currentDifficultyLevel = Math.max(
    mergedLifetimeProgress.currentDifficultyLevel,
    existingSaveFile.currentDifficultyLevel,
    incomingSaveFile.currentDifficultyLevel,
  );

  return {
    schemaVersion: SAVE_FILE_SCHEMA_VERSION,
    playerName: incomingSaveFile.playerName,
    totalProblemsSolved,
    currentDifficultyLevel,
    progress: {
      session: mergedSessionProgress,
      lifetime: {
        ...mergedLifetimeProgress,
        totalProblemsSolved,
        currentDifficultyLevel,
      },
    },
    unlockedDinosaurs,
    sessionHistory,
    updatedAt:
      toIsoTimestamp(existingSaveFile.updatedAt) > toIsoTimestamp(incomingSaveFile.updatedAt)
        ? existingSaveFile.updatedAt
        : incomingSaveFile.updatedAt,
  };
}

function shouldMergeSaveFiles(
  existingSaveFile: DinoDivisionSaveFile,
  incomingSaveFile: DinoDivisionSaveFile,
): boolean {
  return existingSaveFile.playerName.toLowerCase() === incomingSaveFile.playerName.toLowerCase();
}

async function tryReadExistingSaveFile(
  handle: FileSystemSaveFileHandle,
): Promise<DinoDivisionSaveFile | null> {
  try {
    const rawJson = await (await handle.getFile()).text();

    if (rawJson.trim().length === 0) {
      return null;
    }

    return parseDinoDivisionSaveFile(rawJson);
  } catch {
    return null;
  }
}

function queueSaveWrite<T>(
  handle: FileSystemSaveFileHandle,
  operation: () => Promise<T>,
): Promise<T> {
  const previousWrite = saveWriteQueueByHandle.get(handle) ?? Promise.resolve();
  const queuedWrite = previousWrite.catch(() => undefined).then(() => operation());

  saveWriteQueueByHandle.set(
    handle,
    queuedWrite.then(
      () => undefined,
      () => undefined,
    ),
  );

  return queuedWrite;
}

async function writeSaveJsonAtomically(
  handle: FileSystemSaveFileHandle,
  json: string,
): Promise<void> {
  const writable = await handle.createWritable({ keepExistingData: false });

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
}

function asJsonSaveFile(value: unknown): JsonSaveFileLike {
  if (!value || typeof value !== "object") {
    throw new Error("A JSON save file is required for import.");
  }

  const candidate = value as { name?: unknown; text?: unknown };
  if (typeof candidate.name !== "string" || typeof candidate.text !== "function") {
    throw new Error("The selected JSON save file must provide name and text() values.");
  }

  return {
    name: candidate.name,
    text: () => (candidate.text as () => Promise<string>).call(value),
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

export function supportsJsonSaveImportExportFallback(
  value: unknown = globalThis,
): boolean {
  if (!value || (typeof value !== "object" && typeof value !== "function")) {
    return false;
  }

  const candidate = value as {
    Blob?: unknown;
    URL?: { createObjectURL?: unknown };
    document?: { createElement?: unknown };
  };

  return (
    typeof candidate.Blob === "function" &&
    typeof candidate.URL?.createObjectURL === "function" &&
    typeof candidate.document?.createElement === "function"
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

export async function exportSessionToJsonDownload(
  options: ExportSessionToJsonDownloadOptions,
): Promise<ExportSessionToJsonDownloadResult> {
  const saveClock = options.clock ?? defaultClock;
  const { saveFile, json } = createSavePayloadAndJson(options.session, saveClock);
  const fileName = buildPlayerSaveFileName(saveFile.playerName);
  const downloader =
    options.downloader ??
    createBrowserJsonSaveDownloader(options.fallbackRuntime ?? globalThis);

  await downloader.downloadJson(fileName, json);

  return {
    fileName,
    saveFile,
    json,
  };
}

export async function loadSaveFromJsonFile(
  file: JsonSaveFileLike | null | undefined,
): Promise<LoadSaveFromJsonFileResult | null> {
  if (file === null || file === undefined) {
    return null;
  }

  const saveFileInput = asJsonSaveFile(file);
  const rawJson = await saveFileInput.text();
  const saveFile = parseDinoDivisionSaveFile(rawJson);

  return {
    fileName: saveFileInput.name,
    saveFile,
    rawJson,
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

  const incomingSavePayload = createDinoDivisionSavePayload(
    options.session,
    options.clock ?? defaultClock,
  );

  return queueSaveWrite(handle, async () => {
    await ensurePermission(handle, "readwrite", "save game progress");

    const existingSaveFile = await tryReadExistingSaveFile(handle);
    const saveFile =
      existingSaveFile && shouldMergeSaveFiles(existingSaveFile, incomingSavePayload)
        ? mergeDinoDivisionSaveFiles(existingSaveFile, incomingSavePayload)
        : incomingSavePayload;
    const json = createSaveJson(saveFile);

    await writeSaveJsonAtomically(handle, json);

    return {
      handle,
      fileName: handle.name,
      saveFile,
      json,
    };
  });
}
