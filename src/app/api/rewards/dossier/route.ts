import { NextResponse } from "next/server";

import { toRewardDossierArtifactPayload } from "@/features/rewards/lib/dino-dossiers";
import { getRewardDossier } from "@/features/rewards/lib/dossier-store";

export const runtime = "nodejs";

/**
 * Returns the dossier for a reward asset: curated facts plus any stored
 * model-written prose. Read-only — dossier generation happens in the image
 * pipeline, so browsing the gallery never calls a language model.
 */
export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const assetName = requestUrl.searchParams.get("assetName")?.trim() ?? "";

  if (assetName.length === 0) {
    return NextResponse.json(
      { error: { message: "assetName query parameter must be a non-empty string." } },
      { status: 400 },
    );
  }

  try {
    const resolution = await getRewardDossier(assetName);
    if (!resolution) {
      return NextResponse.json(
        { error: { message: `No dossier is available for "${assetName}".` } },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        data: {
          dossier: toRewardDossierArtifactPayload(resolution.dossier),
          source: resolution.source,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read reward dossier.";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
