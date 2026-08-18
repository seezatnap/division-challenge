import { isAmberRewardAssetName } from "./dino-dossiers";
import { createFallbackRewardImage } from "./fallback-reward-image";
import { resolveRewardImageWithFilesystemCache } from "./reward-image-cache";
import { createOpenAiImageRequestConfig, createOpenAiTextRequestConfig } from "./openai";
import {
  generateOpenAiDinosaurImage,
  type OpenAiImageServiceDependencies,
} from "./openai-image-service";
import {
  generateOpenAiVisualDescription,
  type OpenAiVisualDescriptionDependencies,
} from "./openai-visual-description-service";
import { buildRewardImagePrompt } from "./reward-image-prompt";
import {
  RewardImageGenerationError,
  parseRewardImageGenerationRequest,
  type GeneratedRewardImage,
  type RewardImageGenerationRequest,
} from "./reward-image-service";

export interface RewardImageRuntimeDependencies {
  readonly image: OpenAiImageServiceDependencies;
  readonly description: OpenAiVisualDescriptionDependencies;
}

const passthroughFetch = (input: string, init: RequestInit) => fetch(input, init);

const defaultRewardImageRuntimeDependencies: RewardImageRuntimeDependencies = {
  image: {
    getRequestConfig: () => createOpenAiImageRequestConfig(process.env),
    buildPrompt: (assetName, dossierPromptBlock, visualDescription) =>
      buildRewardImagePrompt({ assetName, dossierPromptBlock, visualDescription }),
    fetch: passthroughFetch,
  },
  description: {
    getRequestConfig: () => createOpenAiTextRequestConfig(process.env),
    fetch: passthroughFetch,
  },
};

function shouldUseFallbackRewardImage(error: unknown): boolean {
  if (!(error instanceof RewardImageGenerationError)) {
    return false;
  }

  return (
    error.code === "IMAGE_CONFIG_ERROR" ||
    error.code === "IMAGE_PROMPT_ERROR" ||
    error.code === "IMAGE_REQUEST_FAILED" ||
    error.code === "IMAGE_RESPONSE_INVALID" ||
    error.code === "IMAGE_MISSING" ||
    error.code === "IMAGE_DATA_INVALID"
  );
}

/**
 * Asks the text model for an exact appearance brief. Amber assets skip this
 * step, and any failure degrades to "no brief" so the render still proceeds
 * on the dossier alone rather than blocking the reward.
 */
async function resolveVisualDescription(
  request: RewardImageGenerationRequest,
  dependencies: OpenAiVisualDescriptionDependencies,
): Promise<string | null> {
  if (isAmberRewardAssetName(request.dinosaurName)) {
    return null;
  }

  try {
    const result = await generateOpenAiVisualDescription(
      request.dinosaurName,
      request.dossierPromptBlock ?? null,
      dependencies,
    );
    return result.description;
  } catch (error) {
    console.warn("[rewards] visual description unavailable; rendering from dossier only", {
      dinosaurName: request.dinosaurName,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Two-stage generation: the text model describes the exact animal (or the
 * hypothetical hybrid), then the image model renders it from that brief.
 */
export async function generateRewardImageFromDescription(
  request: RewardImageGenerationRequest,
  dependencies: RewardImageRuntimeDependencies = defaultRewardImageRuntimeDependencies,
): Promise<GeneratedRewardImage> {
  const visualDescription = await resolveVisualDescription(request, dependencies.description);

  return generateOpenAiDinosaurImage(
    {
      ...request,
      ...(visualDescription ? { visualDescription } : {}),
    },
    dependencies.image,
  );
}

export async function generateRewardImage(
  payload: unknown,
  dependencies: RewardImageRuntimeDependencies = defaultRewardImageRuntimeDependencies,
): Promise<GeneratedRewardImage> {
  const request = parseRewardImageGenerationRequest(payload);

  return resolveRewardImageWithFilesystemCache(request, async (parsedRequest) => {
    try {
      return await generateRewardImageFromDescription(parsedRequest, dependencies);
    } catch (error) {
      if (!shouldUseFallbackRewardImage(error)) {
        throw error;
      }

      return createFallbackRewardImage(parsedRequest.dinosaurName);
    }
  });
}
