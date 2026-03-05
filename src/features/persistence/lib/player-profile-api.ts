import type { PlayerProfileEnvelope } from "./local-player-profiles";

export const DEFAULT_PLAYER_PROFILE_API_ENDPOINT = "/api/player-profiles";

export interface PlayerProfileApiSnapshot<TProfileSnapshot>
  extends PlayerProfileEnvelope<TProfileSnapshot> {
  updatedAtMs: number;
}

interface PlayerProfileApiDataEnvelope<TProfileSnapshot> {
  data?: {
    profile?: PlayerProfileApiSnapshot<TProfileSnapshot> | null;
  };
  error?: {
    message?: string;
  };
}

export interface FetchPlayerProfileSnapshotRequest {
  playerName: string;
  endpoint?: string;
  fetchFn?: typeof fetch;
}

export interface SavePlayerProfileSnapshotRequest<TProfileSnapshot> {
  playerName: string;
  snapshot: TProfileSnapshot;
  updatedAtMs?: number;
  endpoint?: string;
  fetchFn?: typeof fetch;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizePlayerName(playerName: string): string {
  const normalizedPlayerName = getTrimmedNonEmptyString(playerName);
  if (!normalizedPlayerName) {
    throw new Error("playerName must be a non-empty string.");
  }

  return normalizedPlayerName;
}

function resolveEndpoint(endpoint: string): string {
  const trimmedEndpoint = getTrimmedNonEmptyString(endpoint);
  if (!trimmedEndpoint) {
    return DEFAULT_PLAYER_PROFILE_API_ENDPOINT;
  }

  if (/^https?:\/\//i.test(trimmedEndpoint)) {
    return trimmedEndpoint;
  }

  return trimmedEndpoint.startsWith("/") ? trimmedEndpoint : `/${trimmedEndpoint}`;
}

function toPlayerProfileRequestUrl(endpoint: string, playerName: string): string {
  const resolvedEndpoint = resolveEndpoint(endpoint);
  if (/^https?:\/\//i.test(resolvedEndpoint)) {
    const endpointUrl = new URL(resolvedEndpoint);
    endpointUrl.searchParams.set("playerName", playerName);
    return endpointUrl.toString();
  }

  const baseOrigin =
    getTrimmedNonEmptyString(globalThis.location?.origin) ?? "http://localhost";
  const endpointUrl = new URL(resolvedEndpoint, baseOrigin);
  endpointUrl.searchParams.set("playerName", playerName);

  if (baseOrigin === "http://localhost" && !/^https?:\/\//i.test(resolveEndpoint(endpoint))) {
    return `${endpointUrl.pathname}${endpointUrl.search}${endpointUrl.hash}`;
  }

  return endpointUrl.toString();
}

function readErrorMessageFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const parsedPayload = payload as PlayerProfileApiDataEnvelope<unknown>;
  return getTrimmedNonEmptyString(parsedPayload.error?.message);
}

function isPlayerProfileApiSnapshot<TProfileSnapshot>(
  value: unknown,
): value is PlayerProfileApiSnapshot<TProfileSnapshot> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsedValue = value as Partial<PlayerProfileApiSnapshot<TProfileSnapshot>>;
  return (
    parsedValue.schemaVersion === 1 &&
    typeof parsedValue.playerName === "string" &&
    "snapshot" in parsedValue &&
    typeof parsedValue.updatedAtMs === "number" &&
    Number.isFinite(parsedValue.updatedAtMs)
  );
}

export async function fetchPlayerProfileSnapshot<TProfileSnapshot>(
  request: FetchPlayerProfileSnapshotRequest,
): Promise<PlayerProfileApiSnapshot<TProfileSnapshot> | null> {
  const playerName = normalizePlayerName(request.playerName);
  const fetchFn = request.fetchFn ?? fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetchFn must be available to load player profiles.");
  }

  const response = await fetchFn(
    toPlayerProfileRequestUrl(
      request.endpoint ?? DEFAULT_PLAYER_PROFILE_API_ENDPOINT,
      playerName,
    ),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    },
  );
  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      readErrorMessageFromPayload(payload) ??
        `Failed to load player profile (status ${response.status}).`,
    );
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const parsedPayload = payload as PlayerProfileApiDataEnvelope<TProfileSnapshot>;
  if (!("data" in parsedPayload) || !parsedPayload.data) {
    return null;
  }

  const profile = parsedPayload.data.profile;
  if (profile === null || profile === undefined) {
    return null;
  }

  if (!isPlayerProfileApiSnapshot<TProfileSnapshot>(profile)) {
    return null;
  }

  return profile;
}

export async function savePlayerProfileSnapshot<TProfileSnapshot>(
  request: SavePlayerProfileSnapshotRequest<TProfileSnapshot>,
): Promise<PlayerProfileApiSnapshot<TProfileSnapshot>> {
  const playerName = normalizePlayerName(request.playerName);
  const fetchFn = request.fetchFn ?? fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetchFn must be available to save player profiles.");
  }

  const response = await fetchFn(
    resolveEndpoint(request.endpoint ?? DEFAULT_PLAYER_PROFILE_API_ENDPOINT),
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        playerName,
        snapshot: request.snapshot,
        ...(typeof request.updatedAtMs === "number"
          ? { updatedAtMs: request.updatedAtMs }
          : {}),
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(
      readErrorMessageFromPayload(payload) ??
        `Failed to save player profile (status ${response.status}).`,
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Player profile save response was not a JSON object.");
  }

  const parsedPayload = payload as PlayerProfileApiDataEnvelope<TProfileSnapshot>;
  const profile = parsedPayload.data?.profile;
  if (!isPlayerProfileApiSnapshot<TProfileSnapshot>(profile)) {
    throw new Error("Player profile save response did not include a valid profile.");
  }

  return profile;
}
