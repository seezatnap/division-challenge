/**
 * Persistence
 *
 * Responsible for:
 * - File System Access API save/load flows
 * - Player-named JSON save files
 * - Graceful fallback (JSON export/import)
 * - Concurrency controls for save races
 */

export {
  SAVE_FILE_VERSION,
  type SessionRecord,
  type SaveFile,
} from "@/types";

export {
  isFileSystemAccessSupported,
  buildSaveFile,
  validateSaveFile,
  parseSaveFileText,
  saveToDisk,
  loadFromDisk,
  loadFromFile,
  saveViaDownload,
  saveGame,
  loadGame,
  loadViaFileInput,
  type SaveResult,
  type LoadResult,
} from "./save-load";

export { SaveLoadControls } from "./SaveLoadControls";
export type { SaveLoadControlsProps } from "./SaveLoadControls";
