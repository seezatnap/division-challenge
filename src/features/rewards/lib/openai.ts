/**
 * OpenAI configuration and low-level HTTP helpers shared by the reward
 * generation services. Everything here is dependency-free so it can be unit
 * tested without network access: callers inject `fetch`.
 */

export const OPENAI_API_KEY_ENV_VAR = "OPENAI_API_KEY";
export const OPENAI_BASE_URL_ENV_VAR = "OPENAI_BASE_URL";
export const OPENAI_BASE_URL_DEFAULT = "https://api.openai.com/v1";

/** Text model used for dossiers and exact visual descriptions. */
export const OPENAI_TEXT_MODEL_ENV_VAR = "OPENAI_TEXT_MODEL";
export const OPENAI_TEXT_MODEL_DEFAULT = "gpt-5.6-luna";

/** Image model used for the reward renders. */
export const OPENAI_IMAGE_MODEL_ENV_VAR = "OPENAI_IMAGE_MODEL";
export const OPENAI_IMAGE_MODEL_DEFAULT = "gpt-image-2";
export const OPENAI_IMAGE_SIZE_ENV_VAR = "OPENAI_IMAGE_SIZE";
export const OPENAI_IMAGE_SIZE_DEFAULT = "1536x1024";
export const OPENAI_IMAGE_QUALITY_ENV_VAR = "OPENAI_IMAGE_QUALITY";
export const OPENAI_IMAGE_QUALITY_DEFAULT = "medium";

const OPENAI_API_KEY_ERROR =
  "Missing OPENAI_API_KEY. Set OPENAI_API_KEY in .env.local before requesting reward generation.";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface OpenAiRequestConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
}

export interface OpenAiTextRequestConfig extends OpenAiRequestConfig {
  readonly model: string;
}

export interface OpenAiImageRequestConfig extends OpenAiRequestConfig {
  readonly model: string;
  readonly size: string;
  readonly quality: string;
}

export type OpenAiFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface OpenAiJsonResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly payload: unknown;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getOpenAiApiKey(env: RuntimeEnvironment = process.env): string {
  const apiKey = getTrimmedNonEmptyString(env[OPENAI_API_KEY_ENV_VAR]);

  if (!apiKey) {
    throw new Error(OPENAI_API_KEY_ERROR);
  }

  return apiKey;
}

function resolveBaseUrl(env: RuntimeEnvironment): string {
  const configuredBaseUrl = getTrimmedNonEmptyString(env[OPENAI_BASE_URL_ENV_VAR]);
  return (configuredBaseUrl ?? OPENAI_BASE_URL_DEFAULT).replace(/\/+$/, "");
}

export function createOpenAiTextRequestConfig(
  env: RuntimeEnvironment = process.env,
): OpenAiTextRequestConfig {
  return {
    apiKey: getOpenAiApiKey(env),
    baseUrl: resolveBaseUrl(env),
    model: getTrimmedNonEmptyString(env[OPENAI_TEXT_MODEL_ENV_VAR]) ?? OPENAI_TEXT_MODEL_DEFAULT,
  };
}

export function createOpenAiImageRequestConfig(
  env: RuntimeEnvironment = process.env,
): OpenAiImageRequestConfig {
  return {
    apiKey: getOpenAiApiKey(env),
    baseUrl: resolveBaseUrl(env),
    model: getTrimmedNonEmptyString(env[OPENAI_IMAGE_MODEL_ENV_VAR]) ?? OPENAI_IMAGE_MODEL_DEFAULT,
    size: getTrimmedNonEmptyString(env[OPENAI_IMAGE_SIZE_ENV_VAR]) ?? OPENAI_IMAGE_SIZE_DEFAULT,
    quality:
      getTrimmedNonEmptyString(env[OPENAI_IMAGE_QUALITY_ENV_VAR]) ?? OPENAI_IMAGE_QUALITY_DEFAULT,
  };
}

/**
 * POSTs a JSON body to an OpenAI endpoint and returns the parsed JSON payload
 * together with the HTTP status. Network failures propagate as thrown errors;
 * non-2xx responses are returned with `ok: false` so callers can map them to
 * their own error codes.
 */
export async function postOpenAiJson(
  fetchImpl: OpenAiFetch,
  config: OpenAiRequestConfig,
  endpointPath: string,
  body: unknown,
): Promise<OpenAiJsonResponse> {
  const response = await fetchImpl(`${config.baseUrl}${endpointPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

/** Best-effort extraction of OpenAI's `{ error: { message } }` envelope. */
export function describeOpenAiErrorPayload(payload: unknown, status: number): string {
  if (isRecord(payload) && isRecord(payload.error)) {
    const message = getTrimmedNonEmptyString(payload.error.message);
    const code = getTrimmedNonEmptyString(payload.error.code);
    if (message) {
      return code ? `${message} (code: ${code}, HTTP ${status})` : `${message} (HTTP ${status})`;
    }
  }

  return `OpenAI request failed with HTTP ${status}.`;
}

/**
 * Concatenates the assistant text from a Responses API payload
 * (`output[] -> message -> content[] -> output_text`). Returns null when the
 * response carries no text; a refusal is reported through the thrown error.
 */
export function extractOpenAiResponsesOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  // Convenience field some SDK-shaped payloads expose directly.
  const directText = getTrimmedNonEmptyString(payload.output_text);
  if (directText) {
    return directText;
  }

  if (!Array.isArray(payload.output)) {
    return null;
  }

  const textChunks: string[] = [];
  for (const outputItem of payload.output) {
    if (!isRecord(outputItem) || outputItem.type !== "message" || !Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      if (contentItem.type === "refusal") {
        const refusal = getTrimmedNonEmptyString(contentItem.refusal) ?? "The model refused the request.";
        throw new Error(`OpenAI refused the request: ${refusal}`);
      }

      if (contentItem.type === "output_text") {
        const text = getTrimmedNonEmptyString(contentItem.text);
        if (text) {
          textChunks.push(text);
        }
      }
    }
  }

  return textChunks.length > 0 ? textChunks.join("\n").trim() : null;
}
