import { DifficultyLevel, SAVE_FILE_VERSION } from "@/types";
import type { GameSession, SaveFile } from "@/types";
import { saveFileNameFromPlayer } from "@/features/game-session/session-init";

// ---------------------------------------------------------------------------
// File System Access API type augmentation
// ---------------------------------------------------------------------------

interface FilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  multiple?: boolean;
}

interface WindowWithFSA extends Window {
  showSaveFilePicker: (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  showOpenFilePicker: (opts?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

/** Returns true if the File System Access API is available. */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    "showOpenFilePicker" in window
  );
}

// ---------------------------------------------------------------------------
// Save-file construction
// ---------------------------------------------------------------------------

/**
 * Build a SaveFile payload from the current in-memory GameSession.
 *
 * This captures all required fields:
 * - version, playerName, totalProblemsSolved, totalProblemsAttempted,
 *   currentDifficulty, sessionsPlayed, unlockedRewards, sessionHistory,
 *   lastSavedAt
 */
export function buildSaveFile(session: GameSession): SaveFile {
  const now = new Date().toISOString();

  return {
    version: SAVE_FILE_VERSION,
    playerName: session.playerName,
    totalProblemsSolved:
      session.progress.lifetime.totalProblemsSolved +
      session.progress.session.problemsSolved,
    totalProblemsAttempted:
      session.progress.lifetime.totalProblemsAttempted +
      session.progress.session.problemsAttempted,
    currentDifficulty: session.progress.lifetime.currentDifficulty,
    sessionsPlayed: session.progress.lifetime.sessionsPlayed + 1,
    unlockedRewards: [...session.unlockedRewards],
    sessionHistory: [
      ...session.priorSessionHistory,
      {
        startedAt: session.progress.session.startedAt,
        endedAt: now,
        problemsSolved: session.progress.session.problemsSolved,
        problemsAttempted: session.progress.session.problemsAttempted,
      },
    ],
    lastSavedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Save-file validation
// ---------------------------------------------------------------------------

const VALID_DIFFICULTIES = new Set<string>(Object.values(DifficultyLevel));

/** Validate that a parsed object is a well-formed SaveFile. Returns null if valid, or an error message. */
export function validateSaveFile(data: unknown): string | null {
  if (data === null || typeof data !== "object") {
    return "Save file is not a valid JSON object.";
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== SAVE_FILE_VERSION) {
    return `Unsupported save file version: ${String(obj.version)}. Expected ${SAVE_FILE_VERSION}.`;
  }

  if (typeof obj.playerName !== "string" || obj.playerName.trim().length === 0) {
    return "Save file is missing a valid player name.";
  }

  if (typeof obj.totalProblemsSolved !== "number" || obj.totalProblemsSolved < 0) {
    return "Save file has invalid totalProblemsSolved.";
  }

  if (typeof obj.totalProblemsAttempted !== "number" || obj.totalProblemsAttempted < 0) {
    return "Save file has invalid totalProblemsAttempted.";
  }

  if (typeof obj.currentDifficulty !== "string" || !VALID_DIFFICULTIES.has(obj.currentDifficulty)) {
    return "Save file has invalid currentDifficulty.";
  }

  if (typeof obj.sessionsPlayed !== "number" || obj.sessionsPlayed < 0) {
    return "Save file has invalid sessionsPlayed.";
  }

  if (!Array.isArray(obj.unlockedRewards)) {
    return "Save file is missing unlockedRewards array.";
  }

  for (let i = 0; i < obj.unlockedRewards.length; i++) {
    const reward = obj.unlockedRewards[i] as Record<string, unknown>;
    if (
      typeof reward?.dinoName !== "string" ||
      typeof reward?.imagePath !== "string" ||
      typeof reward?.earnedAt !== "string" ||
      typeof reward?.milestoneNumber !== "number"
    ) {
      return `Invalid reward entry at index ${i}.`;
    }
  }

  if (!Array.isArray(obj.sessionHistory)) {
    return "Save file is missing sessionHistory array.";
  }

  if (typeof obj.lastSavedAt !== "string") {
    return "Save file is missing lastSavedAt timestamp.";
  }

  return null;
}

/**
 * Parse raw JSON text into a validated SaveFile.
 * Returns the SaveFile or throws an error with a descriptive message.
 */
export function parseSaveFileText(text: string): SaveFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("File does not contain valid JSON.");
  }

  const error = validateSaveFile(parsed);
  if (error) {
    throw new Error(error);
  }

  return parsed as SaveFile;
}

// ---------------------------------------------------------------------------
// File System Access API — Save
// ---------------------------------------------------------------------------

export interface SaveResult {
  success: boolean;
  /** Set when success is false and the cause was NOT a user cancellation. */
  error?: string;
  /** True if the user dismissed the file picker. */
  cancelled?: boolean;
}

/**
 * Save the current game session to disk using the File System Access API.
 *
 * Prompts the user for permission (via the native save-file picker) and
 * writes a player-named JSON file (e.g. `rex-save.json`).
 */
export async function saveToDisk(session: GameSession): Promise<SaveResult> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, error: "File System Access API is not supported in this browser." };
  }

  const saveFile = buildSaveFile(session);
  const suggestedName = saveFileNameFromPlayer(session.playerName);
  const json = JSON.stringify(saveFile, null, 2);

  try {
    const handle = await (window as unknown as WindowWithFSA).showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "Dino Division Save File",
          accept: { "application/json": [".json"] },
        },
      ],
    });

    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();

    return { success: true };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, cancelled: true };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error while saving.",
    };
  }
}

// ---------------------------------------------------------------------------
// File System Access API — Load
// ---------------------------------------------------------------------------

export interface LoadResult {
  success: boolean;
  saveFile?: SaveFile;
  /** Set when success is false and the cause was NOT a user cancellation. */
  error?: string;
  /** True if the user dismissed the file picker. */
  cancelled?: boolean;
}

/**
 * Load a save file from disk using the File System Access API.
 *
 * Prompts the user for permission (via the native open-file picker),
 * reads the selected JSON file, and validates it as a SaveFile.
 */
export async function loadFromDisk(): Promise<LoadResult> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, error: "File System Access API is not supported in this browser." };
  }

  try {
    const [handle] = await (window as unknown as WindowWithFSA).showOpenFilePicker({
      types: [
        {
          description: "Dino Division Save File",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    });

    const file = await handle.getFile();
    const text = await file.text();

    const saveFile = parseSaveFileText(text);
    return { success: true, saveFile };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, cancelled: true };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error while loading.",
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback — Load via file input (no FSA)
// ---------------------------------------------------------------------------

/**
 * Read a File object (e.g. from a `<input type="file">`) and parse it
 * as a validated SaveFile.
 */
export async function loadFromFile(file: File): Promise<LoadResult> {
  try {
    const text = await file.text();
    const saveFile = parseSaveFileText(text);
    return { success: true, saveFile };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error while reading file.",
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback — Save via download (no FSA)
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of the save file as a JSON blob.
 * Used when the File System Access API is not available.
 */
export function saveViaDownload(session: GameSession): void {
  const saveFile = buildSaveFile(session);
  const suggestedName = saveFileNameFromPlayer(session.playerName);
  const json = JSON.stringify(saveFile, null, 2);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();

  URL.revokeObjectURL(url);
}
