import {
  describeOpenAiErrorPayload,
  postOpenAiJson,
  type OpenAiFetch,
  type OpenAiImageRequestConfig,
} from "./openai";
import {
  DEFAULT_REWARD_IMAGE_MIME_TYPE,
  RewardImageGenerationError,
  normalizeBase64ImageData,
  type GeneratedRewardImage,
  type RewardImageGenerationRequest,
} from "./reward-image-service";

const OPENAI_IMAGE_GENERATIONS_PATH = "/images/generations";
const OPENAI_IMAGE_OUTPUT_FORMAT = "png";

export interface OpenAiImageGenerationRequest extends RewardImageGenerationRequest {
  /** Exact appearance brief from the text model, folded into the prompt. */
  visualDescription?: string;
}

export interface OpenAiImageGenerationRequestBody {
  model: string;
  prompt: string;
  n: 1;
  size: string;
  quality: string;
  output_format: typeof OPENAI_IMAGE_OUTPUT_FORMAT;
}

export interface OpenAiImageServiceDependencies {
  getRequestConfig: () => OpenAiImageRequestConfig;
  buildPrompt: (
    dinosaurName: string,
    dossierPromptBlock: string | null,
    visualDescription: string | null,
  ) => string;
  fetch: OpenAiFetch;
}

interface OpenAiInlineImageData {
  imageBase64: string;
  mimeType: string;
}

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

function toMimeType(outputFormat: unknown): string {
  switch (getTrimmedNonEmptyString(outputFormat)?.toLowerCase()) {
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return DEFAULT_REWARD_IMAGE_MIME_TYPE;
  }
}

export function buildOpenAiImageGenerationRequestBody(
  config: Pick<OpenAiImageRequestConfig, "model" | "size" | "quality">,
  prompt: string,
): OpenAiImageGenerationRequestBody {
  const normalizedPrompt = getTrimmedNonEmptyString(prompt);

  if (!normalizedPrompt) {
    throw new RewardImageGenerationError(
      "IMAGE_PROMPT_ERROR",
      "Image prompt builder returned an empty prompt.",
      500,
    );
  }

  return {
    model: config.model,
    prompt: normalizedPrompt,
    n: 1,
    size: config.size,
    quality: config.quality,
    output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
  };
}

/** Reads `data[0].b64_json` from an Images API payload. */
export function extractImageDataFromOpenAiResponse(payload: unknown): OpenAiInlineImageData {
  if (!isRecord(payload)) {
    throw new RewardImageGenerationError(
      "IMAGE_RESPONSE_INVALID",
      "OpenAI image response was not an object.",
      502,
    );
  }

  if (!Array.isArray(payload.data)) {
    throw new RewardImageGenerationError(
      "IMAGE_RESPONSE_INVALID",
      "OpenAI image response did not include a data array.",
      502,
    );
  }

  for (const entry of payload.data) {
    if (!isRecord(entry)) {
      continue;
    }

    const imageBase64 = getTrimmedNonEmptyString(entry.b64_json);
    if (imageBase64) {
      return {
        imageBase64: normalizeBase64ImageData(imageBase64),
        mimeType: toMimeType(payload.output_format),
      };
    }
  }

  throw new RewardImageGenerationError(
    "IMAGE_MISSING",
    "OpenAI image response did not include base64 image bytes.",
    502,
  );
}

export async function generateOpenAiDinosaurImage(
  request: OpenAiImageGenerationRequest,
  dependencies: OpenAiImageServiceDependencies,
): Promise<GeneratedRewardImage> {
  let config: OpenAiImageRequestConfig;
  try {
    config = dependencies.getRequestConfig();
  } catch (cause) {
    throw new RewardImageGenerationError(
      "IMAGE_CONFIG_ERROR",
      "OpenAI configuration is missing or invalid.",
      500,
      cause,
    );
  }

  const apiKey = getTrimmedNonEmptyString(config.apiKey);
  const model = getTrimmedNonEmptyString(request.modelOverride) ?? getTrimmedNonEmptyString(config.model);

  if (!apiKey || !model) {
    throw new RewardImageGenerationError(
      "IMAGE_CONFIG_ERROR",
      "OpenAI configuration must include non-empty apiKey and model values.",
      500,
    );
  }

  let prompt: string;
  try {
    prompt = dependencies.buildPrompt(
      request.dinosaurName,
      request.dossierPromptBlock ?? null,
      request.visualDescription ?? null,
    );
  } catch (cause) {
    throw new RewardImageGenerationError(
      "IMAGE_PROMPT_ERROR",
      "Failed to build the reward image prompt.",
      500,
      cause,
    );
  }

  const requestBody = buildOpenAiImageGenerationRequestBody({ ...config, model }, prompt);

  let response;
  try {
    console.log("[rewards] submitting OpenAI image request", {
      dinosaurName: request.dinosaurName,
      model,
      size: config.size,
      quality: config.quality,
    });
    response = await postOpenAiJson(
      dependencies.fetch,
      { apiKey, baseUrl: config.baseUrl },
      OPENAI_IMAGE_GENERATIONS_PATH,
      requestBody,
    );
  } catch (cause) {
    throw new RewardImageGenerationError(
      "IMAGE_REQUEST_FAILED",
      "OpenAI image generation request failed.",
      502,
      cause,
    );
  }

  if (!response.ok) {
    throw new RewardImageGenerationError(
      "IMAGE_REQUEST_FAILED",
      `OpenAI image generation request failed: ${describeOpenAiErrorPayload(response.payload, response.status)}`,
      502,
    );
  }

  const parsedImage = extractImageDataFromOpenAiResponse(response.payload);

  return {
    dinosaurName: request.dinosaurName,
    prompt: requestBody.prompt,
    model,
    mimeType: parsedImage.mimeType,
    imageBase64: parsedImage.imageBase64,
  };
}
