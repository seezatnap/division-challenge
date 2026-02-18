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

async function loadGeminiDossierModule() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const dossiersModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dino-dossiers.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
    },
  );
  const geminiStubModuleUrl = toDataUrl(`
    export function getGeminiApiKey(env) {
      const apiKey = env?.GEMINI_API_KEY?.trim?.() ?? "";
      if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY.");
      }
      return apiKey;
    }
  `);
  const genaiStubModuleUrl = toDataUrl(`
    export class GoogleGenAI {
      constructor() {}
    }
  `);
  const geminiDossierServiceUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/gemini-dossier-service.ts",
    {
      "@google/genai": genaiStubModuleUrl,
      "./dino-dossiers": dossiersModuleUrl,
      "./gemini": geminiStubModuleUrl,
    },
  );

  return import(geminiDossierServiceUrl);
}

const geminiDossierServiceModule = loadGeminiDossierModule();

test("createGeminiDossierRequestConfig defaults to gemini-3-flash-preview", async () => {
  const {
    GEMINI_DOSSIER_MODEL_DEFAULT,
    createGeminiDossierRequestConfig,
  } = await geminiDossierServiceModule;

  const config = createGeminiDossierRequestConfig({
    GEMINI_API_KEY: "  test-key  ",
  });

  assert.equal(config.apiKey, "test-key");
  assert.equal(config.model, GEMINI_DOSSIER_MODEL_DEFAULT);
});

test("generateGeminiRewardDossier requests JSON schema output and normalizes payload", async () => {
  const { generateGeminiRewardDossier } = await geminiDossierServiceModule;
  const seenRequests = [];

  const generated = await generateGeminiRewardDossier("Hybrid Tyrannosaurus Rex + Velociraptor", {
    getRequestConfig: () => ({ apiKey: "test-key", model: "gemini-3-flash-preview" }),
    createClient: (apiKey) => {
      assert.equal(apiKey, "test-key");
      return {
        models: {
          async generateContent(request) {
            seenRequests.push(request);
            return {
              text: JSON.stringify({
                subjectName: "Hybrid Tyrannosaurus Rex + Velociraptor",
                heightMeters: 8.4,
                lengthMeters: 13.9,
                attributes: [
                  "adaptive gait balancing",
                  "cross-species sensory fusion",
                  "reinforced cartilage weave",
                ],
                description: "A balanced hybrid apex profile tuned for pursuit and ambush.",
                sourceDinosaurs: ["Tyrannosaurus Rex", "Velociraptor"],
              }),
            };
          },
        },
      };
    },
  });

  assert.equal(generated.model, "gemini-3-flash-preview");
  assert.equal(generated.dossier.kind, "hybrid");
  assert.equal(generated.dossier.heightMeters, 8.4);
  assert.equal(generated.dossier.lengthMeters, 13.9);
  assert.deepEqual(generated.dossier.sourceDinosaurs, ["Tyrannosaurus Rex", "Velociraptor"]);
  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0]?.config.responseMimeType, "application/json");
  assert.ok(Array.isArray(seenRequests[0]?.config.tools));
});
