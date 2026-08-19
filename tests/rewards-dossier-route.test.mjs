import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

/**
 * Loads `/api/rewards/dossier` with the store stubbed, so the route contract is
 * tested without touching a database.
 */
async function loadDossierRoute(getRewardDossierImpl) {
  const callbackName = `__dossierRouteGet_${Math.random().toString(16).slice(2)}`;
  globalThis[callbackName] = getRewardDossierImpl;

  const nextServerModuleUrl = `data:text/javascript;base64,${Buffer.from(`
    export const NextResponse = {
      json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    };
  `).toString("base64")}`;

  const storeModuleUrl = `data:text/javascript;base64,${Buffer.from(`
    export async function getRewardDossier(assetName) {
      return await globalThis.${callbackName}(assetName);
    }
  `).toString("base64")}`;

  const routeModule = await loadTypeScriptModule("src/app/api/rewards/dossier/route.ts", {
    replacements: {
      "next/server": nextServerModuleUrl,
      "@/features/rewards/lib/dossier-store": storeModuleUrl,
    },
  });

  return {
    routeModule,
    cleanup: () => {
      delete globalThis[callbackName];
    },
  };
}

const sampleDossier = {
  kind: "primary",
  subjectName: "Brachiosaurus",
  heightMeters: 12,
  lengthMeters: 21,
  attributes: ["front legs longer than back legs"],
  description: "A very tall sauropod.",
  sourceDinosaurs: null,
  infoCard: {
    scientificName: "Brachiosaurus altithorax",
    pronunciation: "BRAK-ee-oh-SOR-us",
    diet: "Herbivore (Plant-Eater)",
    nameMeaning: '"arm lizard"',
    weightKg: 35000,
    timePeriod: "Late Jurassic — 154 to 150 million years ago",
    location: "Western United States",
    taxon: "Sauropodomorpha, Sauropoda, Brachiosauridae",
  },
};

test("GET /api/rewards/dossier returns the dossier with its facts and source", async () => {
  let seenAssetName;
  const { routeModule, cleanup } = await loadDossierRoute(async (assetName) => {
    seenAssetName = assetName;
    return { dossier: sampleDossier, promptBlock: "…", source: "gemini", wasRegenerated: false };
  });

  try {
    const response = await routeModule.GET(
      new Request("https://example.test/api/rewards/dossier?assetName=Brachiosaurus"),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(seenAssetName, "Brachiosaurus");
    assert.equal(body.data.source, "gemini");
    assert.equal(body.data.dossier.subjectName, "Brachiosaurus");
    assert.deepEqual(body.data.dossier.dimensions, { heightMeters: 12, lengthMeters: 21 });
    assert.equal(body.data.dossier.infoCard.diet, "Herbivore (Plant-Eater)");
    assert.equal(body.data.dossier.description, "A very tall sauropod.");
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/dossier validates input and reports missing dossiers", async () => {
  const { routeModule, cleanup } = await loadDossierRoute(async () => null);

  try {
    const missingParam = await routeModule.GET(
      new Request("https://example.test/api/rewards/dossier"),
    );
    assert.equal(missingParam.status, 400);
    assert.match((await missingParam.json()).error.message, /assetName query parameter/);

    const blankParam = await routeModule.GET(
      new Request("https://example.test/api/rewards/dossier?assetName=%20%20"),
    );
    assert.equal(blankParam.status, 400);

    const noDossier = await routeModule.GET(
      new Request("https://example.test/api/rewards/dossier?assetName=Amber%20Resonance%20Crystal"),
    );
    assert.equal(noDossier.status, 404);
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/dossier surfaces store failures as a 500", async () => {
  const { routeModule, cleanup } = await loadDossierRoute(async () => {
    throw new Error("database unreachable");
  });

  try {
    const response = await routeModule.GET(
      new Request("https://example.test/api/rewards/dossier?assetName=Triceratops"),
    );
    assert.equal(response.status, 500);
    assert.match((await response.json()).error.message, /database unreachable/);
  } finally {
    cleanup();
  }
});
