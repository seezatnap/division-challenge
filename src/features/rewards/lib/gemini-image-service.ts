export const DEFAULT_GEMINI_IMAGE_MIME_TYPE = "image/png";

export type GeminiImageGenerationErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_DINOSAUR_NAME"
  | "GEMINI_CONFIG_ERROR"
  | "GEMINI_PROMPT_ERROR"
  | "GEMINI_REQUEST_FAILED"
  | "GEMINI_RESPONSE_INVALID"
  | "GEMINI_IMAGE_MISSING"
  | "GEMINI_IMAGE_DATA_INVALID";

export class GeminiImageGenerationError extends Error {
  readonly code: GeminiImageGenerationErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(
    code: GeminiImageGenerationErrorCode,
    message: string,
    statusCode: number,
    cause?: unknown,
  ) {
    super(message);
    this.name = "GeminiImageGenerationError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}

export interface GeminiImageGenerationRequest {
  dinosaurName: string;
}

export interface GeminiGeneratedImage {
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
  imageBase64: string;
}

export interface GeminiServiceRequestConfig {
  apiKey: string;
  model: string;
}

export interface GeminiGenerateContentRequestConfig {
  responseModalities: ["IMAGE"];
}

export interface GeminiGenerateContentRequest {
  model: string;
  config: GeminiGenerateContentRequestConfig;
  contents: [{ role: "user"; parts: [{ text: string }] }];
}

export interface GeminiApiClient {
  models: {
    generateContent(request: GeminiGenerateContentRequest): Promise<unknown>;
  };
}

export interface GeminiImageServiceDependencies {
  getRequestConfig: () => GeminiServiceRequestConfig;
  buildPrompt: (dinosaurName: string) => string;
  createClient: (apiKey: string) => GeminiApiClient;
}

export interface GeminiApiErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}

export interface GeminiApiErrorResponse {
  status: number;
  body: GeminiApiErrorResponseBody;
}

interface GeminiInlineImageData {
  imageBase64: string;
  mimeType: string;
}

type JsonObject = Record<string, unknown>;

const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;
const MAX_TEXT_PREVIEW_LENGTH = 120;
const IMAGE_RESPONSE_MODALITIES = ["IMAGE"] as const;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeBase64ImageData(value: string): string {
  const compactedValue = value.replace(/\s+/g, "");

  if (!BASE64_PATTERN.test(compactedValue)) {
    throw new GeminiImageGenerationError(
      "GEMINI_IMAGE_DATA_INVALID",
      "Gemini returned inline image data that was not valid base64.",
      502,
    );
  }

  return compactedValue;
}

function getResponseTextPreview(response: JsonObject): string | null {
  let textValue: unknown = response.text;

  if (typeof response.text === "function") {
    try {
      textValue = response.text();
    } catch {
      return null;
    }
  }

  const trimmedText = getTrimmedNonEmptyString(textValue);

  if (!trimmedText) {
    return null;
  }

  if (trimmedText.length <= MAX_TEXT_PREVIEW_LENGTH) {
    return trimmedText;
  }

  return `${trimmedText.slice(0, MAX_TEXT_PREVIEW_LENGTH - 3)}...`;
}

function getPromptFeedbackSummary(response: JsonObject): string {
  if (!isRecord(response.promptFeedback)) {
    return "";
  }

  const blockReason = getTrimmedNonEmptyString(response.promptFeedback.blockReason);
  const blockReasonMessage = getTrimmedNonEmptyString(response.promptFeedback.blockReasonMessage);
  const summaryParts: string[] = [];

  if (blockReason) {
    summaryParts.push(`Block reason: ${blockReason}.`);
  }

  if (blockReasonMessage) {
    summaryParts.push(`Block reason message: ${blockReasonMessage}.`);
  }

  return summaryParts.length > 0 ? ` ${summaryParts.join(" ")}` : "";
}

function extractInlineImageDataFromResponseData(response: JsonObject): GeminiInlineImageData | null {
  let dataValue: unknown = response.data;

  if (typeof response.data === "function") {
    try {
      dataValue = response.data();
    } catch {
      return null;
    }
  }

  const inlineImageData = getTrimmedNonEmptyString(dataValue);

  if (!inlineImageData) {
    return null;
  }

  return {
    imageBase64: normalizeBase64ImageData(inlineImageData),
    mimeType: DEFAULT_GEMINI_IMAGE_MIME_TYPE,
  };
}

function extractInlineImageDataFromPart(part: unknown): GeminiInlineImageData | null {
  if (!isRecord(part) || !isRecord(part.inlineData)) {
    return null;
  }

  const imageData = getTrimmedNonEmptyString(part.inlineData.data);

  if (!imageData) {
    throw new GeminiImageGenerationError(
      "GEMINI_IMAGE_DATA_INVALID",
      "Gemini returned an image part with empty image bytes.",
      502,
    );
  }

  const mimeType =
    getTrimmedNonEmptyString(part.inlineData.mimeType) ?? DEFAULT_GEMINI_IMAGE_MIME_TYPE;

  return {
    imageBase64: normalizeBase64ImageData(imageData),
    mimeType,
  };
}

export function parseGeminiImageGenerationRequest(payload: unknown): GeminiImageGenerationRequest {
  if (!isRecord(payload)) {
    throw new GeminiImageGenerationError(
      "INVALID_REQUEST",
      "Request body must be a JSON object.",
      400,
    );
  }

  const dinosaurName = getTrimmedNonEmptyString(payload.dinosaurName);

  if (!dinosaurName) {
    throw new GeminiImageGenerationError(
      "INVALID_DINOSAUR_NAME",
      "dinosaurName must be a non-empty string.",
      400,
    );
  }

  return { dinosaurName };
}

export function buildGeminiGenerateContentRequest(
  model: string,
  prompt: string,
): GeminiGenerateContentRequest {
  const normalizedPrompt = getTrimmedNonEmptyString(prompt);

  if (!normalizedPrompt) {
    throw new GeminiImageGenerationError(
      "GEMINI_PROMPT_ERROR",
      "Gemini prompt builder returned an empty prompt.",
      500,
    );
  }

  return {
    model,
    config: {
      responseModalities: [...IMAGE_RESPONSE_MODALITIES],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: normalizedPrompt }],
      },
    ],
  };
}

export function extractInlineImageDataFromGeminiResponse(response: unknown): GeminiInlineImageData {
  if (!isRecord(response)) {
    throw new GeminiImageGenerationError(
      "GEMINI_RESPONSE_INVALID",
      "Gemini response was not an object.",
      502,
    );
  }

  if (response.candidates !== undefined && !Array.isArray(response.candidates)) {
    throw new GeminiImageGenerationError(
      "GEMINI_RESPONSE_INVALID",
      "Gemini response candidates were not an array.",
      502,
    );
  }

  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const finishReasons = new Set<string>();

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const finishReason = getTrimmedNonEmptyString(candidate.finishReason);
    if (finishReason) {
      finishReasons.add(finishReason);
    }

    if (!isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue;
    }

    for (const part of candidate.content.parts) {
      const maybeImage = extractInlineImageDataFromPart(part);

      if (maybeImage) {
        return maybeImage;
      }
    }
  }

  const fallbackImageData = extractInlineImageDataFromResponseData(response);

  if (fallbackImageData) {
    return fallbackImageData;
  }

  const finishReasonSummary =
    finishReasons.size > 0 ? ` Finish reasons: ${Array.from(finishReasons).join(", ")}.` : "";
  const promptFeedbackSummary = getPromptFeedbackSummary(response);
  const responseTextPreview = getResponseTextPreview(response);
  const textSummary = responseTextPreview
    ? ` Response text preview: "${responseTextPreview}".`
    : "";

  throw new GeminiImageGenerationError(
    "GEMINI_IMAGE_MISSING",
    `Gemini response did not include inline image bytes.${finishReasonSummary}${promptFeedbackSummary}${textSummary}`,
    502,
  );
}

async function resolveGeminiResponsePayload(generateContentResult: unknown): Promise<unknown> {
  if (!isRecord(generateContentResult)) {
    throw new GeminiImageGenerationError(
      "GEMINI_RESPONSE_INVALID",
      "Gemini generateContent result was not an object.",
      502,
    );
  }

  if (!("response" in generateContentResult)) {
    return generateContentResult;
  }

  try {
    return await Promise.resolve(generateContentResult.response);
  } catch (cause) {
    throw new GeminiImageGenerationError(
      "GEMINI_RESPONSE_INVALID",
      "Gemini response promise rejected.",
      502,
      cause,
    );
  }
}

export async function generateGeminiDinosaurImage(
  payload: unknown,
  dependencies: GeminiImageServiceDependencies,
): Promise<GeminiGeneratedImage> {
  const request = parseGeminiImageGenerationRequest(payload);

  let config: GeminiServiceRequestConfig;
  try {
    config = dependencies.getRequestConfig();
  } catch (cause) {
    throw new GeminiImageGenerationError(
      "GEMINI_CONFIG_ERROR",
      "Gemini configuration is missing or invalid.",
      500,
      cause,
    );
  }

  const apiKey = getTrimmedNonEmptyString(config.apiKey);
  const model = getTrimmedNonEmptyString(config.model);

  if (!apiKey || !model) {
    throw new GeminiImageGenerationError(
      "GEMINI_CONFIG_ERROR",
      "Gemini configuration must include non-empty apiKey and model values.",
      500,
    );
  }

  let prompt: string;
  try {
    prompt = dependencies.buildPrompt(request.dinosaurName);
  } catch (cause) {
    throw new GeminiImageGenerationError(
      "GEMINI_PROMPT_ERROR",
      "Failed to build the Gemini image prompt.",
      500,
      cause,
    );
  }

  const generateContentRequest = buildGeminiGenerateContentRequest(model, prompt);
  const client = dependencies.createClient(apiKey);

  let generateContentResult: unknown;
  try {
    console.log("[rewards] submitting Gemini image request", {
      dinosaurName: request.dinosaurName,
      model,
    });
    generateContentResult = await client.models.generateContent(generateContentRequest);
  } catch (cause) {
    throw new GeminiImageGenerationError(
      "GEMINI_REQUEST_FAILED",
      "Gemini image generation request failed.",
      502,
      cause,
    );
  }

  const responsePayload = await resolveGeminiResponsePayload(generateContentResult);
  const parsedImage = extractInlineImageDataFromGeminiResponse(responsePayload);

  return {
    dinosaurName: request.dinosaurName,
    prompt: generateContentRequest.contents[0].parts[0].text,
    model,
    mimeType: parsedImage.mimeType,
    imageBase64: parsedImage.imageBase64,
  };
}

export function toGeminiImageApiErrorResponse(error: unknown): GeminiApiErrorResponse {
  if (error instanceof GeminiImageGenerationError) {
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
