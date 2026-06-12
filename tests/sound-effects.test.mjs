import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadTypeScriptModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const soundEffectsModule = loadTypeScriptModule(
  "src/features/workspace-ui/lib/sound-effects.ts",
);

test("playWorkspaceSoundEffect is a no-op outside the browser", async () => {
  const { playWorkspaceSoundEffect } = await soundEffectsModule;

  for (const effect of [
    "digit-correct",
    "digit-error",
    "step-lock-in",
    "problem-complete",
    "ui-click",
  ]) {
    assert.doesNotThrow(() => playWorkspaceSoundEffect(effect));
  }
});
