import { NextResponse } from "next/server";

import { ensureRewardDossierArtifacts } from "@/features/rewards/lib/dossier-artifacts";
import { getGeminiRewardImageGenerationStatus } from "@/features/rewards/lib/gemini-image-cache";
import { generateGeminiRewardImage } from "@/features/rewards/lib/gemini-image-runtime";
import {
  GeminiImageGenerationError,
  parseGeminiImageGenerationRequest,
  toGeminiImageApiErrorResponse,
} from "@/features/rewards/lib/gemini-image-service";

export const runtime = "nodejs";

async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    throw new GeminiImageGenerationError(
      "INVALID_REQUEST",
      "Request body must be valid JSON.",
      400,
      cause,
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await parseJsonRequest(request);
    const parsedRequest = parseGeminiImageGenerationRequest(payload);

    const dossierResolution = await ensureRewardDossierArtifacts(parsedRequest.dinosaurName);
    const generatedImage = await generateGeminiRewardImage({
      ...parsedRequest,
      ...(dossierResolution?.promptBlock
        ? { dossierPromptBlock: dossierResolution.promptBlock }
        : {}),
    });
    const imageStatus = await getGeminiRewardImageGenerationStatus(generatedImage.dinosaurName);

    return NextResponse.json(
      {
        data: {
          ...generatedImage,
          imagePath: imageStatus.status === "ready" ? imageStatus.imagePath : null,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const { status, body } = toGeminiImageApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
