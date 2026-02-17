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
