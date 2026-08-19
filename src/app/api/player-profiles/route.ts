import { NextResponse } from "next/server";

import { normalizePlayerProfileName } from "@/features/persistence/lib/local-player-profiles";
import {
  getPlayerProfilesDatabaseLocation,
  readPlayerProfileSnapshotFromSqlite,
  writePlayerProfileSnapshotToSqlite,
} from "@/features/persistence/lib/sqlite-player-profiles";

export const runtime = "nodejs";

interface PlayerProfileWriteRequestBody {
  playerName?: unknown;
  snapshot?: unknown;
  updatedAtMs?: unknown;
}

interface SanitizedUnlockedReward {
  rewardId: string;
  dinosaurName: string;
  imagePath: string;
  earnedAt: string;
  milestoneSolvedCount: number;
}

interface SanitizedUnlockedHybridReward {
  hybridId: string;
  hybridName: string;
  pairKey: string;
  firstDinosaurName: string;
  secondDinosaurName: string;
  generationAssetName: string;
  imagePath: string;
  createdAt: string;
}

interface SanitizedActiveRewardReveal {
  dinosaurName: string;
  milestoneSolvedCount: number;
  initialStatus: "ready" | "generating" | "missing";
  initialImagePath: string | null;
}

interface SanitizedSolvedCountByMode {
  division: number;
  multiplication: number;
  fractions: number;
}

interface SanitizedPlayerProfileSnapshot {
  gameSession: {
    totalProblemsSolved: number;
    totalProblemsAttempted: number;
    currentStreak: number;
    amberBalance: number;
    amberImagePath: string | null;
    solvedByMode: SanitizedSolvedCountByMode;
    preferredGameMode: "division" | "multiplication" | "fractions";
    preferredDifficulty: "easy" | "medium" | "hard";
    unlockedRewards: readonly SanitizedUnlockedReward[];
    unlockedHybrids: readonly SanitizedUnlockedHybridReward[];
  };
  activeRewardReveal: SanitizedActiveRewardReveal;
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function toTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeSolvedByMode(value: unknown): SanitizedSolvedCountByMode {
  const record = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    division: toNonNegativeInteger(record.division) ?? 0,
    multiplication: toNonNegativeInteger(record.multiplication) ?? 0,
    fractions: toNonNegativeInteger(record.fractions) ?? 0,
  };
}

function normalizePreferredGameMode(
  value: unknown,
): SanitizedPlayerProfileSnapshot["gameSession"]["preferredGameMode"] {
  return value === "multiplication" || value === "fractions" ? value : "division";
}

function normalizePreferredDifficulty(
  value: unknown,
): SanitizedPlayerProfileSnapshot["gameSession"]["preferredDifficulty"] {
  return value === "medium" || value === "hard" ? value : "easy";
}

function normalizeUnlockedRewards(
  unlockedRewards: unknown,
): SanitizedUnlockedReward[] {
  if (!Array.isArray(unlockedRewards)) {
    return [];
  }

  const rewardById = new Map<string, SanitizedUnlockedReward>();
  for (const unlockedReward of unlockedRewards) {
    if (!unlockedReward || typeof unlockedReward !== "object") {
      continue;
    }

    const parsedReward = unlockedReward as Partial<SanitizedUnlockedReward>;
    const rewardId = toTrimmedNonEmptyString(parsedReward.rewardId);
    const dinosaurName = toTrimmedNonEmptyString(parsedReward.dinosaurName);
    const imagePath = toTrimmedNonEmptyString(parsedReward.imagePath);
    const earnedAt = toTrimmedNonEmptyString(parsedReward.earnedAt);
    const milestoneSolvedCount = toNonNegativeInteger(parsedReward.milestoneSolvedCount);
    if (
      !rewardId ||
      !dinosaurName ||
      !imagePath ||
      !earnedAt ||
      milestoneSolvedCount === null
    ) {
      continue;
    }

    rewardById.set(rewardId, {
      rewardId,
      dinosaurName,
      imagePath,
      earnedAt,
      milestoneSolvedCount,
    });
  }

  return Array.from(rewardById.values()).sort((leftReward, rightReward) => {
    const milestoneDelta =
      leftReward.milestoneSolvedCount - rightReward.milestoneSolvedCount;
    if (milestoneDelta !== 0) {
      return milestoneDelta;
    }

    const earnedAtDelta =
      Date.parse(leftReward.earnedAt) - Date.parse(rightReward.earnedAt);
    if (!Number.isNaN(earnedAtDelta) && earnedAtDelta !== 0) {
      return earnedAtDelta;
    }

    return leftReward.rewardId.localeCompare(rightReward.rewardId);
  });
}

function normalizeUnlockedHybrids(
  unlockedHybrids: unknown,
): SanitizedUnlockedHybridReward[] {
  if (!Array.isArray(unlockedHybrids)) {
    return [];
  }

  const hybridByPairKey = new Map<string, SanitizedUnlockedHybridReward>();
  for (const unlockedHybrid of unlockedHybrids) {
    if (!unlockedHybrid || typeof unlockedHybrid !== "object") {
      continue;
    }

    const parsedHybrid = unlockedHybrid as Partial<SanitizedUnlockedHybridReward>;
    const pairKey = toTrimmedNonEmptyString(parsedHybrid.pairKey);
    const hybridId = toTrimmedNonEmptyString(parsedHybrid.hybridId);
    const hybridName = toTrimmedNonEmptyString(parsedHybrid.hybridName);
    const firstDinosaurName = toTrimmedNonEmptyString(parsedHybrid.firstDinosaurName);
    const secondDinosaurName = toTrimmedNonEmptyString(parsedHybrid.secondDinosaurName);
    const generationAssetName = toTrimmedNonEmptyString(parsedHybrid.generationAssetName);
    const imagePath = toTrimmedNonEmptyString(parsedHybrid.imagePath);
    const createdAt = toTrimmedNonEmptyString(parsedHybrid.createdAt);
    if (
      !pairKey ||
      !hybridId ||
      !hybridName ||
      !firstDinosaurName ||
      !secondDinosaurName ||
      !generationAssetName ||
      !imagePath ||
      !createdAt
    ) {
      continue;
    }

    hybridByPairKey.set(pairKey.toLowerCase(), {
      pairKey,
      hybridId,
      hybridName,
      firstDinosaurName,
      secondDinosaurName,
      generationAssetName,
      imagePath,
      createdAt,
    });
  }

  return Array.from(hybridByPairKey.values()).sort((leftHybrid, rightHybrid) => {
    const createdAtDelta = Date.parse(rightHybrid.createdAt) - Date.parse(leftHybrid.createdAt);
    if (!Number.isNaN(createdAtDelta) && createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return leftHybrid.hybridName.localeCompare(rightHybrid.hybridName, "en", {
      sensitivity: "base",
    });
  });
}

function normalizeActiveRewardReveal(
  value: unknown,
): SanitizedActiveRewardReveal {
  if (!value || typeof value !== "object") {
    return {
      dinosaurName: "",
      milestoneSolvedCount: 0,
      initialStatus: "missing",
      initialImagePath: null,
    };
  }

  const parsedValue = value as Partial<SanitizedActiveRewardReveal>;
  const dinosaurName = toTrimmedNonEmptyString(parsedValue.dinosaurName) ?? "";
  const milestoneSolvedCount = toNonNegativeInteger(parsedValue.milestoneSolvedCount) ?? 0;
  const initialStatus =
    parsedValue.initialStatus === "ready" ||
    parsedValue.initialStatus === "generating" ||
    parsedValue.initialStatus === "missing"
      ? parsedValue.initialStatus
      : "missing";
  const initialImagePath =
    parsedValue.initialImagePath === null
      ? null
      : toTrimmedNonEmptyString(parsedValue.initialImagePath);

  return {
    dinosaurName,
    milestoneSolvedCount,
    initialStatus,
    initialImagePath,
  };
}

function sanitizePlayerProfileSnapshot(
  snapshot: unknown,
): SanitizedPlayerProfileSnapshot {
  const parsedSnapshot =
    snapshot && typeof snapshot === "object"
      ? (snapshot as {
          gameSession?: unknown;
          activeRewardReveal?: unknown;
        })
      : {};
  const parsedGameSession =
    parsedSnapshot.gameSession && typeof parsedSnapshot.gameSession === "object"
      ? (parsedSnapshot.gameSession as {
          totalProblemsSolved?: unknown;
          totalProblemsAttempted?: unknown;
          currentStreak?: unknown;
          amberBalance?: unknown;
          amberImagePath?: unknown;
          solvedByMode?: unknown;
          preferredGameMode?: unknown;
          preferredDifficulty?: unknown;
          unlockedRewards?: unknown;
          unlockedHybrids?: unknown;
        })
      : {};

  const totalProblemsSolved = toNonNegativeInteger(parsedGameSession.totalProblemsSolved) ?? 0;
  const totalProblemsAttempted = Math.max(
    totalProblemsSolved,
    toNonNegativeInteger(parsedGameSession.totalProblemsAttempted) ?? totalProblemsSolved,
  );
  const currentStreak = toNonNegativeInteger(parsedGameSession.currentStreak) ?? 0;
  const amberBalance =
    toNonNegativeInteger(parsedGameSession.amberBalance) ?? totalProblemsSolved;
  const amberImagePath =
    parsedGameSession.amberImagePath === null
      ? null
      : toTrimmedNonEmptyString(parsedGameSession.amberImagePath);
  const unlockedRewards = normalizeUnlockedRewards(parsedGameSession.unlockedRewards);

  return {
    gameSession: {
      totalProblemsSolved,
      totalProblemsAttempted,
      currentStreak,
      amberBalance,
      amberImagePath,
      solvedByMode: normalizeSolvedByMode(parsedGameSession.solvedByMode),
      preferredGameMode: normalizePreferredGameMode(parsedGameSession.preferredGameMode),
      preferredDifficulty: normalizePreferredDifficulty(parsedGameSession.preferredDifficulty),
      unlockedRewards,
      unlockedHybrids: normalizeUnlockedHybrids(parsedGameSession.unlockedHybrids),
    },
    activeRewardReveal: normalizeActiveRewardReveal(parsedSnapshot.activeRewardReveal),
  };
}

function toErrorResponse(message: string, status = 400): Response {
  return NextResponse.json(
    {
      error: {
        message,
      },
    },
    { status },
  );
}

function parsePlayerNameFromQuery(request: Request): string {
  const requestUrl = new URL(request.url);
  const rawPlayerName = requestUrl.searchParams.get("playerName");
  return normalizePlayerProfileName(rawPlayerName ?? "");
}

async function parseJsonBody(request: Request): Promise<PlayerProfileWriteRequestBody> {
  try {
    return (await request.json()) as PlayerProfileWriteRequestBody;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function parseWriteRequestBody(body: PlayerProfileWriteRequestBody): {
  playerName: string;
  snapshot: SanitizedPlayerProfileSnapshot;
  updatedAtMs?: number;
} {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object.");
  }

  const playerName = normalizePlayerProfileName(String(body.playerName ?? ""));
  if (!("snapshot" in body)) {
    throw new Error("snapshot is required.");
  }

  const updatedAtMs = toNonNegativeInteger(body.updatedAtMs);
  return {
    playerName,
    snapshot: sanitizePlayerProfileSnapshot(body.snapshot),
    ...(updatedAtMs !== null ? { updatedAtMs } : {}),
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const playerName = parsePlayerNameFromQuery(request);
    const profile = await readPlayerProfileSnapshotFromSqlite<unknown>(playerName);

    return NextResponse.json(
      {
        data: {
          database: getPlayerProfilesDatabaseLocation(),
          profile,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read player profile.";
    return toErrorResponse(message, 400);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const body = await parseJsonBody(request);
    const parsedBody = parseWriteRequestBody(body);
    const profile = await writePlayerProfileSnapshotToSqlite({
      playerName: parsedBody.playerName,
      snapshot: parsedBody.snapshot,
      ...(typeof parsedBody.updatedAtMs === "number"
        ? { updatedAtMs: parsedBody.updatedAtMs }
        : {}),
    });

    return NextResponse.json(
      {
        data: {
          database: getPlayerProfilesDatabaseLocation(),
          profile,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to write player profile.";
    return toErrorResponse(message, 400);
  }
}
