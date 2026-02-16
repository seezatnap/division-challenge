import type { PlayerSave } from "@/types";
import { validatePlayerSave } from "@/lib/validate-save";

// ─── Browser Support ────────────────────────────────────────

/** Returns true when the File System Access API is available. */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    "showOpenFilePicker" in window
  );
}

/** User-facing message when the browser does not support save/load. */
export const UNSUPPORTED_BROWSER_MESSAGE =
  "Your browser does not support the File System Access API. " +
  "Please use a recent version of Chrome, Edge, or Opera to save and load game files.";

// ─── Result Types ───────────────────────────────────────────

export type SaveResult =
  | { ok: true; handle: FileSystemFileHandle }
  | { ok: false; error: string };

export type LoadResult =
  | { ok: true; data: PlayerSave; handle: FileSystemFileHandle }
  | { ok: false; error: string };

// ─── File Naming ────────────────────────────────────────────

/**
 * Derive the suggested file name for a player's save file.
 * Lowercases the name and replaces non-alphanumeric characters with hyphens.
 */
export function saveFileName(playerName: string): string {
  const slug = playerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "player"}-save.json`;
}

// ─── Save ───────────────────────────────────────────────────

/**
 * Write the PlayerSave as JSON using the File System Access API.
 *
 * When a cached `FileSystemFileHandle` is provided, the file is written
 * directly without re-prompting the user. On the first save (or when no
 * handle is supplied), `showSaveFilePicker` triggers an OS permission dialog.
 *
 * The returned `SaveResult` includes the handle so the caller can cache it
 * for subsequent auto-saves.
 */
export async function saveGame(
  playerSave: PlayerSave,
  cachedHandle?: FileSystemFileHandle,
): Promise<SaveResult> {
  if (!isFileSystemAccessSupported()) {
    return { ok: false, error: UNSUPPORTED_BROWSER_MESSAGE };
  }

  try {
    const handle =
      cachedHandle ??
      (await window.showSaveFilePicker({
        suggestedName: saveFileName(playerSave.playerName),
        types: [
          {
            description: "Dino Division Save File",
            accept: { "application/json": [".json"] },
          },
        ],
      }));

    const writable = await handle.createWritable();
    const json = JSON.stringify(playerSave, null, 2);
    await writable.write(json);
    await writable.close();

    return { ok: true, handle };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Save cancelled by user." };
    }
    const message =
      err instanceof Error ? err.message : "Unknown error while saving.";
    return { ok: false, error: message };
  }
}

// ─── Load ───────────────────────────────────────────────────

/**
 * Prompt the user to pick a save file, read it, parse as JSON, and validate
 * against the PlayerSave schema.
 *
 * Uses `window.showOpenFilePicker` which triggers an explicit OS permission
 * dialog — the user must approve file access before any data is read.
 */
export async function loadGame(): Promise<LoadResult> {
  if (!isFileSystemAccessSupported()) {
    return { ok: false, error: UNSUPPORTED_BROWSER_MESSAGE };
  }

  try {
    const [handle] = await window.showOpenFilePicker({
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "The selected file is not valid JSON." };
    }

    const result = validatePlayerSave(parsed);
    if (!result.valid) {
      return {
        ok: false,
        error: `Invalid save file: ${result.errors.join(" ")}`,
      };
    }

    return { ok: true, data: result.data, handle };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Load cancelled by user." };
    }
    const message =
      err instanceof Error ? err.message : "Unknown error while loading.";
    return { ok: false, error: message };
  }
}
