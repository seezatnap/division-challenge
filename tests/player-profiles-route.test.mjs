import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function transpileTypeScriptToDataUrl(relativePath, replacements = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  for (const [specifier, replacement] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
    compiled = compiled.replaceAll(`from '${specifier}'`, `from "${replacement}"`);
  }

  return toDataUrl(compiled);
}

async function loadPlayerProfilesRoute({
  normalizePlayerProfileNameImpl = (playerName) => {
    const normalizedName = String(playerName ?? "").trim();
    if (!normalizedName) {
      throw new Error("Player name is required.");
    }

    return normalizedName;
  },
  readPlayerProfileSnapshotFromSqliteImpl = async () => null,
  writePlayerProfileSnapshotToSqliteImpl = async (payload) => ({
    schemaVersion: 1,
    playerName: payload.playerName,
    playerNameKey: payload.playerName.toLowerCase(),
    snapshot: payload.snapshot,
    updatedAtMs: payload.updatedAtMs ?? Date.now(),
  }),
  getPlayerProfilesDatabaseLocationImpl = () => ({
    projectRoot: "/repo",
    sqliteDirectory: "/repo/.sqlite",
    databaseFile: "division-challenge.sqlite3",
    databasePath: "/repo/.sqlite/division-challenge.sqlite3",
  }),
} = {}) {
  const normalizeCallbackName = `__normalizePlayerName_${Math.random().toString(16).slice(2)}`;
  const readCallbackName = `__readPlayerProfile_${Math.random().toString(16).slice(2)}`;
  const writeCallbackName = `__writePlayerProfile_${Math.random().toString(16).slice(2)}`;
  const locationCallbackName = `__profilesDbLocation_${Math.random().toString(16).slice(2)}`;
  globalThis[normalizeCallbackName] = normalizePlayerProfileNameImpl;
  globalThis[readCallbackName] = readPlayerProfileSnapshotFromSqliteImpl;
  globalThis[writeCallbackName] = writePlayerProfileSnapshotToSqliteImpl;
  globalThis[locationCallbackName] = getPlayerProfilesDatabaseLocationImpl;

  const nextServerModuleUrl = toDataUrl(`
    export const NextResponse = {
      json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    };
  `);

  const localProfilesModuleUrl = toDataUrl(`
    export function normalizePlayerProfileName(playerName) {
      return globalThis.${normalizeCallbackName}(playerName);
    }
  `);

  const sqliteProfilesModuleUrl = toDataUrl(`
    export async function readPlayerProfileSnapshotFromSqlite(playerName) {
      return await globalThis.${readCallbackName}(playerName);
    }

    export async function writePlayerProfileSnapshotToSqlite(payload) {
      return await globalThis.${writeCallbackName}(payload);
    }

    export function getPlayerProfilesDatabaseLocation() {
      return globalThis.${locationCallbackName}();
    }
  `);

  const routeModuleUrl = await transpileTypeScriptToDataUrl(
    "src/app/api/player-profiles/route.ts",
    {
      "next/server": nextServerModuleUrl,
      "@/features/persistence/lib/local-player-profiles": localProfilesModuleUrl,
      "@/features/persistence/lib/sqlite-player-profiles": sqliteProfilesModuleUrl,
    },
  );
  const routeModule = await import(routeModuleUrl);

  return {
    routeModule,
    cleanup: () => {
      delete globalThis[normalizeCallbackName];
      delete globalThis[readCallbackName];
      delete globalThis[writeCallbackName];
      delete globalThis[locationCallbackName];
    },
  };
}

test("GET /api/player-profiles validates playerName query parameter", async () => {
  const { routeModule, cleanup } = await loadPlayerProfilesRoute();

  try {
    const request = new Request("https://example.test/api/player-profiles");
    const response = await routeModule.GET(request);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error.message, /player name is required/i);
  } finally {
    cleanup();
  }
});

test("GET /api/player-profiles returns shared sqlite-backed profile when present", async () => {
  let seenPlayerName;
  const expectedProfile = {
    schemaVersion: 1,
    playerName: "Gus",
    playerNameKey: "gus",
    snapshot: {
      gameSession: {
        amberBalance: 42,
      },
    },
    updatedAtMs: 1234,
  };
  const { routeModule, cleanup } = await loadPlayerProfilesRoute({
    readPlayerProfileSnapshotFromSqliteImpl: async (playerName) => {
      seenPlayerName = playerName;
      return expectedProfile;
    },
  });

  try {
    const request = new Request(
      "https://example.test/api/player-profiles?playerName=Gus",
    );
    const response = await routeModule.GET(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(seenPlayerName, "Gus");
    assert.deepEqual(body.data.profile, expectedProfile);
    assert.equal(body.data.database.databaseFile, "division-challenge.sqlite3");
  } finally {
    cleanup();
  }
});

test("PUT /api/player-profiles validates JSON payload", async () => {
  const { routeModule, cleanup } = await loadPlayerProfilesRoute();

  try {
    const request = new Request("https://example.test/api/player-profiles", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: '{"playerName":"Gus"',
    });

    const response = await routeModule.PUT(request);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error.message, /valid JSON/i);
  } finally {
    cleanup();
  }
});

test("PUT /api/player-profiles persists profile snapshots via sqlite writer", async () => {
  let seenPayload;
  const { routeModule, cleanup } = await loadPlayerProfilesRoute({
    writePlayerProfileSnapshotToSqliteImpl: async (payload) => {
      seenPayload = payload;
      return {
        schemaVersion: 1,
        playerName: payload.playerName,
        playerNameKey: payload.playerName.toLowerCase(),
        snapshot: payload.snapshot,
        updatedAtMs: payload.updatedAtMs ?? 999,
      };
    },
  });

  try {
    const request = new Request("https://example.test/api/player-profiles", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        playerName: "Gus",
        snapshot: {
          gameSession: {
            amberBalance: 55,
          },
        },
        updatedAtMs: 999,
      }),
    });

    const response = await routeModule.PUT(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(seenPayload, {
      playerName: "Gus",
      snapshot: {
        gameSession: {
          totalProblemsSolved: 0,
          totalProblemsAttempted: 0,
          currentStreak: 0,
          amberBalance: 55,
          amberImagePath: null,
          // Per-mode counts and the player's mode/difficulty choice are kept so
          // they survive loading the profile on another device.
          solvedByMode: { division: 0, multiplication: 0, fractions: 0 },
          preferredGameMode: "division",
          preferredDifficulty: "easy",
          unlockedRewards: [],
          unlockedHybrids: [],
        },
        activeRewardReveal: {
          dinosaurName: "",
          milestoneSolvedCount: 0,
          initialStatus: "missing",
          initialImagePath: null,
        },
      },
      updatedAtMs: 999,
    });
    assert.equal(body.data.profile.playerName, "Gus");
    assert.equal(body.data.profile.updatedAtMs, 999);
  } finally {
    cleanup();
  }
});

test("PUT /api/player-profiles keeps per-mode progress and the chosen mode", async () => {
  let seenPayload;
  const { routeModule, cleanup } = await loadPlayerProfilesRoute({
    writePlayerProfileSnapshotToSqliteImpl: async (payload) => {
      seenPayload = payload;
      return {
        schemaVersion: 1,
        playerName: payload.playerName,
        playerNameKey: payload.playerName.toLowerCase(),
        snapshot: payload.snapshot,
        updatedAtMs: payload.updatedAtMs ?? 1,
      };
    },
  });

  try {
    const request = new Request("https://example.test/api/player-profiles", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerName: "Gus",
        snapshot: {
          gameSession: {
            solvedByMode: { division: 4, multiplication: 2, fractions: 7, bogus: 9 },
            preferredGameMode: "fractions",
            preferredDifficulty: "hard",
          },
        },
      }),
    });

    await routeModule.PUT(request);

    assert.deepEqual(seenPayload.snapshot.gameSession.solvedByMode, {
      division: 4,
      multiplication: 2,
      fractions: 7,
    });
    assert.equal(seenPayload.snapshot.gameSession.preferredGameMode, "fractions");
    assert.equal(seenPayload.snapshot.gameSession.preferredDifficulty, "hard");
  } finally {
    cleanup();
  }
});

test("PUT /api/player-profiles falls back for unknown mode and difficulty values", async () => {
  let seenPayload;
  const { routeModule, cleanup } = await loadPlayerProfilesRoute({
    writePlayerProfileSnapshotToSqliteImpl: async (payload) => {
      seenPayload = payload;
      return {
        schemaVersion: 1,
        playerName: payload.playerName,
        playerNameKey: payload.playerName.toLowerCase(),
        snapshot: payload.snapshot,
        updatedAtMs: 1,
      };
    },
  });

  try {
    const request = new Request("https://example.test/api/player-profiles", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerName: "Gus",
        // "mixed" is the retired mode; it must degrade rather than persist.
        snapshot: { gameSession: { preferredGameMode: "mixed", preferredDifficulty: "extreme" } },
      }),
    });

    await routeModule.PUT(request);

    assert.equal(seenPayload.snapshot.gameSession.preferredGameMode, "division");
    assert.equal(seenPayload.snapshot.gameSession.preferredDifficulty, "easy");
  } finally {
    cleanup();
  }
});
