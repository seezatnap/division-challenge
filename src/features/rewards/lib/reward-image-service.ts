/**
 * Provider-neutral contracts for reward image generation: the request shape
 * accepted by the API route, the generated image envelope stored in the cache,
 * and the error type mapped onto HTTP responses.
 */

export const DEFAULT_REWARD_IMAGE_MIME_TYPE = "image/png";

export type RewardImageGenerationErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_DINOSAUR_NAME"
  | "IMAGE_CONFIG_ERROR"
  | "IMAGE_PROMPT_ERROR"
  | "IMAGE_REQUEST_FAILED"
  | "IMAGE_RESPONSE_INVALID"
  | "IMAGE_MISSING"
  | "IMAGE_DATA_INVALID";

export class RewardImageGenerationError extends Error {
  readonly code: RewardImageGenerationErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(
    code: RewardImageGenerationErrorCode,
    message: string,
    statusCode: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = "RewardImageGenerationError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

export interface RewardImageGenerationRequest {
  dinosaurName: string;
  modelOverride?: string;
  dossierPromptBlock?: string;
}

/** Where an image came from; recorded alongside every stored image. */
export type RewardImageSource = "openai" | "fallback-svg" | "filesystem-migration" | "unknown";

export interface GeneratedRewardImage {
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
  imageBase64: string;
  source?: RewardImageSource;
}

export interface RewardImageApiErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}

export interface RewardImageApiErrorResponse {
  status: number;
  body: RewardImageApiErrorResponseBody;
}

const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function normalizeBase64ImageData(value: string): string {
  const compactedValue = value.replace(/\s+/g, "");

  if (!BASE64_PATTERN.test(compactedValue)) {
    throw new RewardImageGenerationError(
      "IMAGE_DATA_INVALID",
      "The image provider returned image data that was not valid base64.",
      502,
    );
  }

  return compactedValue;
}

export function parseRewardImageGenerationRequest(payload: unknown): RewardImageGenerationRequest {
  if (!isRecord(payload)) {
    throw new RewardImageGenerationError(
      "INVALID_REQUEST",
      "Request body must be a JSON object.",
      400,
    );
  }

  const dinosaurName = getTrimmedNonEmptyString(payload.dinosaurName);

  if (!dinosaurName) {
    throw new RewardImageGenerationError(
      "INVALID_DINOSAUR_NAME",
      "dinosaurName must be a non-empty string.",
      400,
    );
  }

  const modelOverride = getTrimmedNonEmptyString(payload.modelOverride);
  const dossierPromptBlock = getTrimmedNonEmptyString(payload.dossierPromptBlock);

  if (!modelOverride && !dossierPromptBlock) {
    return { dinosaurName };
  }

  return {
    dinosaurName,
    ...(modelOverride ? { modelOverride } : {}),
    ...(dossierPromptBlock ? { dossierPromptBlock } : {}),
  };
}

export function toRewardImageApiErrorResponse(error: unknown): RewardImageApiErrorResponse {
  if (error instanceof RewardImageGenerationError) {
    return {
      status: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error while generating dinosaur image.",
      },
    },
  };
}
