import { NextResponse } from "next/server";

import {
  generateGeminiDinosaurImage,
  type GeminiGeneratedImage,
} from "@/lib/gemini-image-service";

export const runtime = "nodejs";

interface GeminiImageRequestBody {
  dinosaurName?: unknown;
}

type GenerateImageFn = (options: {
  dinosaurName: string;
}) => Promise<GeminiGeneratedImage>;

function parseDinosaurName(body: GeminiImageRequestBody): string | null {
  if (typeof body.dinosaurName !== "string") {
    return null;
  }

  const dinosaurName = body.dinosaurName.trim();
  return dinosaurName.length > 0 ? dinosaurName : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createGeminiImagePostHandler(
  generateImage: GenerateImageFn = generateGeminiDinosaurImage,
) {
  return async function POST(request: Request): Promise<Response> {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    if (!isObject(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    const dinosaurName = parseDinosaurName(body);

    if (!dinosaurName) {
      return NextResponse.json(
        { error: "dinosaurName must be a non-empty string." },
        { status: 400 },
      );
    }

    try {
      const generatedImage = await generateImage({ dinosaurName });

      return NextResponse.json({
        dinosaurName: generatedImage.dinosaurName,
        model: generatedImage.model,
        prompt: generatedImage.prompt,
        image: {
          mimeType: generatedImage.mimeType,
          data: generatedImage.data,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Failed to generate dinosaur image.";

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  };
}

export const POST = createGeminiImagePostHandler();
