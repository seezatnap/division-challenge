export const DEFAULT_REWARD_STATUS_POLL_INTERVAL_MS = 1_200;
export const DEFAULT_REWARD_STATUS_MAX_POLL_ATTEMPTS = 20;
export const DEFAULT_REWARD_STATUS_ENDPOINT = "/api/rewards/image-status";

export type EarnedRewardImageStatus = "ready" | "generating" | "missing";

export interface EarnedRewardImageStatusSnapshot {
  dinosaurName: string;
  status: EarnedRewardImageStatus;
  imagePath: string | null;
}

export interface EarnedRewardStatusApiResponse {
  data: EarnedRewardImageStatusSnapshot;
}

export type EarnedRewardRevealPollOutcome = "revealed" | "timed-out" | "missing";

export interface PollEarnedRewardImageUntilReadyResult {
  outcome: EarnedRewardRevealPollOutcome;
  attempts: number;
  snapshot: EarnedRewardImageStatusSnapshot;
}

export interface PollEarnedRewardImageUntilReadyRequest {
  dinosaurName: string;
  pollStatus: (dinosaurName: string) => Promise<EarnedRewardImageStatusSnapshot>;
  onPollStatus?: (snapshot: EarnedRewardImageStatusSnapshot, attempt: number) => void;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  wait?: (durationMs: number) => Promise<void>;
}

export interface FetchEarnedRewardImageStatusRequest {
  dinosaurName: string;
  endpoint?: string;
  fetchFn?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

function normalizeDinosaurName(dinosaurName: string): string {
  const normalizedDinosaurName = getTrimmedNonEmptyString(dinosaurName);

  if (!normalizedDinosaurName) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  return normalizedDinosaurName;
}

function normalizeImagePath(value: unknown): string | null {
  const imagePath = getTrimmedNonEmptyString(value);
  return imagePath ?? null;
}

function parseEarnedRewardImageStatus(value: unknown): EarnedRewardImageStatus {
  if (value === "ready" || value === "generating" || value === "missing") {
    return value;
  }

  throw new Error("status must be one of: ready, generating, missing.");
}

function normalizeEarnedRewardImageStatusSnapshot(
  value: unknown,
  fallbackDinosaurName: string,
): EarnedRewardImageStatusSnapshot {
  if (!isRecord(value)) {
    throw new TypeError("Reward status response must be a JSON object.");
  }

  const dinosaurName =
    getTrimmedNonEmptyString(value.dinosaurName) ?? fallbackDinosaurName;

  return {
    dinosaurName,
    status: parseEarnedRewardImageStatus(value.status),
    imagePath: normalizeImagePath(value.imagePath),
  };
}

function defaultWait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function resolveStatusEndpoint(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `https://dino-division.local${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

export async function fetchEarnedRewardImageStatus(
  request: FetchEarnedRewardImageStatusRequest,
): Promise<EarnedRewardImageStatusSnapshot> {
  const dinosaurName = normalizeDinosaurName(request.dinosaurName);
  const endpoint = getTrimmedNonEmptyString(request.endpoint) ?? DEFAULT_REWARD_STATUS_ENDPOINT;
  const fetchFn = request.fetchFn ?? fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetchFn must be available to request reward image status.");
  }

  const endpointUrl = new URL(resolveStatusEndpoint(endpoint));
  endpointUrl.searchParams.set("dinosaurName", dinosaurName);

  const response = await fetchFn(endpointUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const parsedBody = (await response.json()) as unknown;

  if (!response.ok) {
    if (isRecord(parsedBody) && isRecord(parsedBody.error)) {
      const errorMessage = getTrimmedNonEmptyString(parsedBody.error.message);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    }

    throw new Error(`Reward status request failed with status ${response.status}.`);
  }

  if (!isRecord(parsedBody) || !("data" in parsedBody)) {
    return normalizeEarnedRewardImageStatusSnapshot(parsedBody, dinosaurName);
  }

  return normalizeEarnedRewardImageStatusSnapshot(parsedBody.data, dinosaurName);
}

export async function pollEarnedRewardImageUntilReady(
  request: PollEarnedRewardImageUntilReadyRequest,
): Promise<PollEarnedRewardImageUntilReadyResult> {
  const dinosaurName = normalizeDinosaurName(request.dinosaurName);
  const pollIntervalMs = request.pollIntervalMs ?? DEFAULT_REWARD_STATUS_POLL_INTERVAL_MS;
  const maxPollAttempts =
    request.maxPollAttempts ?? DEFAULT_REWARD_STATUS_MAX_POLL_ATTEMPTS;
  assertPositiveInteger(pollIntervalMs, "pollIntervalMs");
  assertPositiveInteger(maxPollAttempts, "maxPollAttempts");

  const wait = request.wait ?? defaultWait;
  let latestSnapshot: EarnedRewardImageStatusSnapshot = {
    dinosaurName,
    status: "generating",
    imagePath: null,
  };

  for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
    latestSnapshot = await request.pollStatus(dinosaurName);
    request.onPollStatus?.(latestSnapshot, attempt);

    if (latestSnapshot.status === "ready") {
      return {
        outcome: "revealed",
        attempts: attempt,
        snapshot: latestSnapshot,
      };
    }

    if (latestSnapshot.status === "missing") {
      return {
        outcome: "missing",
        attempts: attempt,
        snapshot: latestSnapshot,
      };
    }

    if (attempt < maxPollAttempts) {
      await wait(pollIntervalMs);
    }
  }

  return {
    outcome: "timed-out",
    attempts: maxPollAttempts,
    snapshot: latestSnapshot,
  };
}
