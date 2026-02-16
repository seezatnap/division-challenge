import {
  createNewPlayerSave,
  isPlayerSaveFile,
  type PlayerSaveFile,
} from "./domain";

export const GAME_START_PLAYER_NAME_REQUIRED_MESSAGE =
  "Player name is required before starting the game.";
export const INVALID_RUNTIME_SAVE_FILE_MESSAGE =
  "Runtime state requires a valid player save file.";

export type GameStartMode = "new-game" | "loaded-save";

export interface GameRuntimeState {
  mode: GameStartMode;
  initializedAt: string;
  playerSave: PlayerSaveFile;
}

function normalizePlayerName(value: string): string {
  return value.trim().toLowerCase();
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

  return {
    mode: "new-game",
    initializedAt,
    playerSave: createNewPlayerSave(validatedName),
  };
}

export function initializeLoadedGameRuntimeState(
  playerSave: PlayerSaveFile,
  initializedAt: string = new Date().toISOString(),
): GameRuntimeState {
  if (!isPlayerSaveFile(playerSave)) {
    throw new Error(INVALID_RUNTIME_SAVE_FILE_MESSAGE);
  }

  return {
    mode: "loaded-save",
    initializedAt,
    playerSave: {
      ...playerSave,
      playerName: playerSave.playerName.trim(),
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
