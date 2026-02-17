export const PLAYER_PROFILE_STORAGE_SCHEMA_VERSION = 1;
export const PLAYER_PROFILE_STORAGE_KEY_PREFIX = "dna-division-sequencer:player:";

export interface PlayerProfileEnvelope<TProfileSnapshot> {
  schemaVersion: typeof PLAYER_PROFILE_STORAGE_SCHEMA_VERSION;
  playerName: string;
  snapshot: TProfileSnapshot;
}

export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function normalizePlayerProfileName(playerName: string): string {
  if (typeof playerName !== "string") {
    throw new TypeError("playerName must be a string.");
  }

  const normalizedPlayerName = playerName.trim().replace(/\s+/g, " ");
  if (normalizedPlayerName.length === 0) {
    throw new Error("Player name is required.");
  }

  return normalizedPlayerName;
}

export function toPlayerProfileStorageKey(playerName: string): string {
  return `${PLAYER_PROFILE_STORAGE_KEY_PREFIX}${normalizePlayerProfileName(playerName).toLowerCase()}`;
}

export function parsePlayerProfileEnvelope<TProfileSnapshot>(
  rawValue: string | null,
): PlayerProfileEnvelope<TProfileSnapshot> | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as
      | Partial<PlayerProfileEnvelope<TProfileSnapshot>>
      | null;
    if (!parsedValue || typeof parsedValue !== "object") {
      return null;
    }
    if (parsedValue.schemaVersion !== PLAYER_PROFILE_STORAGE_SCHEMA_VERSION) {
      return null;
    }
    if (typeof parsedValue.playerName !== "string") {
      return null;
    }
    if (!("snapshot" in parsedValue)) {
      return null;
    }

    return {
      schemaVersion: PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
      playerName: parsedValue.playerName,
      snapshot: parsedValue.snapshot as TProfileSnapshot,
    };
  } catch {
    return null;
  }
}

export function readPlayerProfileSnapshot<TProfileSnapshot>(
  storage: KeyValueStorage,
  playerName: string,
): PlayerProfileEnvelope<TProfileSnapshot> | null {
  return parsePlayerProfileEnvelope<TProfileSnapshot>(
    storage.getItem(toPlayerProfileStorageKey(playerName)),
  );
}

export function writePlayerProfileSnapshot<TProfileSnapshot>(
  storage: KeyValueStorage,
  playerName: string,
  snapshot: TProfileSnapshot,
): PlayerProfileEnvelope<TProfileSnapshot> {
  const normalizedPlayerName = normalizePlayerProfileName(playerName);
  const envelope: PlayerProfileEnvelope<TProfileSnapshot> = {
    schemaVersion: PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
    playerName: normalizedPlayerName,
    snapshot,
  };

  storage.setItem(
    toPlayerProfileStorageKey(normalizedPlayerName),
    JSON.stringify(envelope),
  );

  return envelope;
}
