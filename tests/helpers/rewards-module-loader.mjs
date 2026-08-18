import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(helpersDir, "..", "..");

export function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

/**
 * Transpiles one TypeScript module to a data: URL. Relative/aliased imports
 * must be redirected via `replacements` (specifier -> data URL) because the
 * data-URL module cannot resolve them itself.
 */
export async function transpileTypeScriptToDataUrl(relativePath, replacements = {}) {
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

/** Loads the rewards OpenAI/prompt modules with their real dependency graph. */
export async function loadRewardsOpenAiModuleUrls() {
  const dinosaursUrl = await transpileTypeScriptToDataUrl("src/features/rewards/lib/dinosaurs.ts");
  const dossiersUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dino-dossiers.ts",
    { "./dinosaurs": dinosaursUrl },
  );
  const openAiUrl = await transpileTypeScriptToDataUrl("src/features/rewards/lib/openai.ts");
  const rewardImageServiceUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/reward-image-service.ts",
  );
  const promptUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/reward-image-prompt.ts",
    { "./dino-dossiers": dossiersUrl },
  );
  const openAiImageServiceUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/openai-image-service.ts",
    { "./openai": openAiUrl, "./reward-image-service": rewardImageServiceUrl },
  );
  const visualDescriptionUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/openai-visual-description-service.ts",
    { "./dino-dossiers": dossiersUrl, "./openai": openAiUrl },
  );
  const dossierServiceUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/openai-dossier-service.ts",
    { "./dino-dossiers": dossiersUrl, "./openai": openAiUrl },
  );
  const fallbackImageUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/fallback-reward-image.ts",
    { "./reward-image-service": rewardImageServiceUrl },
  );

  return {
    dinosaursUrl,
    dossiersUrl,
    openAiUrl,
    rewardImageServiceUrl,
    promptUrl,
    openAiImageServiceUrl,
    visualDescriptionUrl,
    dossierServiceUrl,
    fallbackImageUrl,
  };
}

/** Minimal Response stand-in for injected fetch implementations. */
export function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}
