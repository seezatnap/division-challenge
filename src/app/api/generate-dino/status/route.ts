/**
 * GET /api/generate-dino/status
 *
 * Health-check endpoint for the Gemini image generation service.
 * Reports whether the service is configured and ready to generate images.
 *
 * Response:
 *   { configured: boolean; model: string; error?: string }
 */

import { NextResponse } from "next/server";
import { getGeminiConfig, GEMINI_MODEL } from "@/features/rewards/gemini-config";

export async function GET() {
  try {
    getGeminiConfig();
    return NextResponse.json({
      configured: true,
      model: GEMINI_MODEL,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown configuration error";
    return NextResponse.json(
      {
        configured: false,
        model: GEMINI_MODEL,
        error: message,
      },
      { status: 503 },
    );
  }
}
