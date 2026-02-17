export type {
  DinoDivisionSaveFile,
  PlayerProgressState,
  SAVE_FILE_SCHEMA_VERSION,
  SessionHistoryEntry,
  UnlockedReward,
} from "@/features/contracts";

export interface PersistenceBootstrapState {
  hasFileSystemAccessApi: boolean;
}
