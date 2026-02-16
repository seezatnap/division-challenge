import { isPlayerSaveFile, type PlayerSaveFile } from "./domain";

export const FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE =
  "This browser does not support the File System Access API. Use Chrome, Edge, or another Chromium-based browser to save or load progress files.";
export const INVALID_PLAYER_NAME_FOR_FILE_MESSAGE =
  "Player name is required to build a save file name.";
export const INVALID_PLAYER_SAVE_DATA_MESSAGE =
  "Player save data does not match the expected schema.";
export const INVALID_SAVE_FILE_JSON_MESSAGE =
  "Selected file is not valid JSON.";
export const INVALID_SAVE_FILE_SCHEMA_MESSAGE =
  "Selected file does not match the Dino Division save schema.";
export const SAVE_PERMISSION_CONFIRM_MESSAGE =
  "Allow Dino Division to create or update your save file?";
export const SAVE_PERMISSION_DENIED_MESSAGE = "Save permission was denied.";
export const LOAD_PERMISSION_CONFIRM_MESSAGE =
  "Allow Dino Division to read a save file from your device?";
export const LOAD_PERMISSION_DENIED_MESSAGE = "Load permission was denied.";
export const SAVE_CANCELLED_MESSAGE = "Save was cancelled before a file was chosen.";
export const LOAD_CANCELLED_MESSAGE = "Load was cancelled before a file was chosen.";
export const NO_SAVE_FILE_SELECTED_MESSAGE = "No save file was selected.";
export const INVALID_SAVE_FILE_HANDLE_MESSAGE =
  "The browser returned an invalid file handle.";

export type FilePermissionMode = "read" | "readwrite";
export type FilePermissionState = "granted" | "denied" | "prompt";

export interface FilePermissionDescriptorLike {
  mode?: FilePermissionMode;
}

export interface FileSystemWritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface FileLike {
  text(): Promise<string>;
}

export interface FileSystemFileHandleLike {
  name?: string;
  queryPermission?(
    descriptor: FilePermissionDescriptorLike,
  ): Promise<FilePermissionState>;
  requestPermission?(
    descriptor: FilePermissionDescriptorLike,
  ): Promise<FilePermissionState>;
  createWritable?(): Promise<FileSystemWritableLike>;
  getFile?(): Promise<FileLike>;
}

interface FileTypeLike {
  description: string;
  accept: Record<string, readonly string[]>;
}

interface SaveFilePickerOptionsLike {
  suggestedName: string;
  types: readonly FileTypeLike[];
  excludeAcceptAllOption: boolean;
}

interface OpenFilePickerOptionsLike {
  multiple: boolean;
  types: readonly FileTypeLike[];
  excludeAcceptAllOption: boolean;
}

export interface FileSystemAccessHost {
  showSaveFilePicker?(
    options: SaveFilePickerOptionsLike,
  ): Promise<FileSystemFileHandleLike>;
  showOpenFilePicker?(
    options: OpenFilePickerOptionsLike,
  ): Promise<FileSystemFileHandleLike[]>;
  confirm?(message: string): boolean;
}

interface SupportedFileSystemAccessHost extends FileSystemAccessHost {
  showSaveFilePicker: NonNullable<FileSystemAccessHost["showSaveFilePicker"]>;
  showOpenFilePicker: NonNullable<FileSystemAccessHost["showOpenFilePicker"]>;
}

const JSON_FILE_TYPES: readonly FileTypeLike[] = [
  {
    description: "Dino Division Save File (JSON)",
    accept: {
      "application/json": [".json"],
    },
  },
];

function getDefaultFileSystemHost(): FileSystemAccessHost | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as unknown as FileSystemAccessHost;
}

export function isFileSystemAccessSupported(
  host: FileSystemAccessHost | null = getDefaultFileSystemHost(),
): boolean {
  return (
    typeof host?.showSaveFilePicker === "function" &&
    typeof host?.showOpenFilePicker === "function"
  );
}

function requireSupportedFileSystemHost(
  host: FileSystemAccessHost | null,
): SupportedFileSystemAccessHost {
  if (
    !host ||
    typeof host.showSaveFilePicker !== "function" ||
    typeof host.showOpenFilePicker !== "function"
  ) {
    throw new Error(FILE_SYSTEM_ACCESS_UNSUPPORTED_MESSAGE);
  }

  return {
    ...host,
    showSaveFilePicker: host.showSaveFilePicker,
    showOpenFilePicker: host.showOpenFilePicker,
  };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function mapPickerError(error: unknown, cancelledMessage: string): Error {
  if (isAbortError(error)) {
    return new Error(cancelledMessage);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(cancelledMessage);
}

function confirmPermissionPrompt(
  host: FileSystemAccessHost,
  confirmMessage: string,
  deniedMessage: string,
): void {
  if (typeof host.confirm !== "function") {
    return;
  }

  if (!host.confirm(confirmMessage)) {
    throw new Error(deniedMessage);
  }
}

async function ensureHandlePermission(
  handle: FileSystemFileHandleLike,
  mode: FilePermissionMode,
  deniedMessage: string,
): Promise<void> {
  if (typeof handle.queryPermission === "function") {
    const currentPermission = await handle.queryPermission({ mode });
    if (currentPermission === "granted") {
      return;
    }
  }

  if (typeof handle.requestPermission === "function") {
    const requestedPermission = await handle.requestPermission({ mode });
    if (requestedPermission === "granted") {
      return;
    }

    throw new Error(deniedMessage);
  }

  if (typeof handle.queryPermission === "function") {
    throw new Error(deniedMessage);
  }
}

export function getPlayerSaveFileName(playerName: string): string {
  const normalizedPlayerName = playerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalizedPlayerName) {
    throw new Error(INVALID_PLAYER_NAME_FOR_FILE_MESSAGE);
  }

  return `${normalizedPlayerName}-save.json`;
}

export async function savePlayerSaveFile(
  saveFile: PlayerSaveFile,
  host: FileSystemAccessHost | null = getDefaultFileSystemHost(),
): Promise<{
  fileName: string;
  json: string;
}> {
  if (!isPlayerSaveFile(saveFile)) {
    throw new Error(INVALID_PLAYER_SAVE_DATA_MESSAGE);
  }

  const supportedHost = requireSupportedFileSystemHost(host);
  confirmPermissionPrompt(
    supportedHost,
    SAVE_PERMISSION_CONFIRM_MESSAGE,
    SAVE_PERMISSION_DENIED_MESSAGE,
  );

  const suggestedName = getPlayerSaveFileName(saveFile.playerName);

  let fileHandle: FileSystemFileHandleLike;
  try {
    fileHandle = await supportedHost.showSaveFilePicker({
      suggestedName,
      types: JSON_FILE_TYPES,
      excludeAcceptAllOption: true,
    });
  } catch (error) {
    throw mapPickerError(error, SAVE_CANCELLED_MESSAGE);
  }

  if (typeof fileHandle.createWritable !== "function") {
    throw new Error(INVALID_SAVE_FILE_HANDLE_MESSAGE);
  }

  await ensureHandlePermission(
    fileHandle,
    "readwrite",
    SAVE_PERMISSION_DENIED_MESSAGE,
  );

  const writableStream = await fileHandle.createWritable();
  const serializedSave = JSON.stringify(saveFile, null, 2);

  await writableStream.write(`${serializedSave}\n`);
  await writableStream.close();

  return {
    fileName: fileHandle.name ?? suggestedName,
    json: serializedSave,
  };
}

export async function loadPlayerSaveFile(
  host: FileSystemAccessHost | null = getDefaultFileSystemHost(),
): Promise<PlayerSaveFile> {
  const supportedHost = requireSupportedFileSystemHost(host);
  confirmPermissionPrompt(
    supportedHost,
    LOAD_PERMISSION_CONFIRM_MESSAGE,
    LOAD_PERMISSION_DENIED_MESSAGE,
  );

  let fileHandles: FileSystemFileHandleLike[];
  try {
    fileHandles = await supportedHost.showOpenFilePicker({
      multiple: false,
      types: JSON_FILE_TYPES,
      excludeAcceptAllOption: true,
    });
  } catch (error) {
    throw mapPickerError(error, LOAD_CANCELLED_MESSAGE);
  }

  const selectedFileHandle = fileHandles[0];
  if (!selectedFileHandle || typeof selectedFileHandle.getFile !== "function") {
    throw new Error(NO_SAVE_FILE_SELECTED_MESSAGE);
  }

  await ensureHandlePermission(
    selectedFileHandle,
    "read",
    LOAD_PERMISSION_DENIED_MESSAGE,
  );

  const file = await selectedFileHandle.getFile();
  const fileContents = await file.text();

  let parsedFileContents: unknown;
  try {
    parsedFileContents = JSON.parse(fileContents) as unknown;
  } catch {
    throw new Error(INVALID_SAVE_FILE_JSON_MESSAGE);
  }

  if (!isPlayerSaveFile(parsedFileContents)) {
    throw new Error(INVALID_SAVE_FILE_SCHEMA_MESSAGE);
  }

  return parsedFileContents;
}
