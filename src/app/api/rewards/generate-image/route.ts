import { NextResponse } from "next/server";

import { ensureRewardDossierArtifacts } from "@/features/rewards/lib/dossier-artifacts";
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

    await ensureRewardDossierArtifacts(parsedRequest.dinosaurName);
    const generatedImage = await generateGeminiRewardImage(payload);

    return NextResponse.json({ data: generatedImage }, { status: 200 });
  } catch (error) {
    const { status, body } = toGeminiImageApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
