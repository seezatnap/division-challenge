import { NextResponse } from "next/server";

import { ensureRewardDossierArtifacts } from "@/features/rewards/lib/dossier-artifacts";
import { getRewardImageGenerationStatus } from "@/features/rewards/lib/reward-image-cache";
import { generateRewardImage } from "@/features/rewards/lib/reward-image-runtime";
import {
  RewardImageGenerationError,
  parseRewardImageGenerationRequest,
  toRewardImageApiErrorResponse,
} from "@/features/rewards/lib/reward-image-service";

export const runtime = "nodejs";

async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    throw new RewardImageGenerationError(
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
    const parsedRequest = parseRewardImageGenerationRequest(payload);

    const dossierResolution = await ensureRewardDossierArtifacts(parsedRequest.dinosaurName);
    const generatedImage = await generateRewardImage({
      ...parsedRequest,
      ...(dossierResolution?.promptBlock
        ? { dossierPromptBlock: dossierResolution.promptBlock }
        : {}),
    });
    const imageStatus = await getRewardImageGenerationStatus(generatedImage.dinosaurName);

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
    const { status, body } = toRewardImageApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
