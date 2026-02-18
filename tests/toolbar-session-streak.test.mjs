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

  return import(toDataUrl(compiled));
}

const sessionStreakModule = loadTypeScriptModule("src/features/toolbar/lib/session-streak.ts");

test("session streak resets on incorrect attempts and can diverge from solved totals", async () => {
  const {
    resolveCurrentStreakAfterValidationOutcome,
    resolveSolvedProgressAfterCompletedProblem,
  } = await sessionStreakModule;

  const afterFirstSolve = resolveSolvedProgressAfterCompletedProblem({
    sessionSolvedProblems: 0,
    currentStreak: 0,
  });
  assert.deepEqual(afterFirstSolve, {
    sessionSolvedProblems: 1,
    currentStreak: 1,
  });

  const afterIncorrectAttempt = {
    sessionSolvedProblems: afterFirstSolve.sessionSolvedProblems,
    currentStreak: resolveCurrentStreakAfterValidationOutcome({
      currentStreak: afterFirstSolve.currentStreak,
      outcome: "incorrect",
    }),
  };
  assert.equal(afterIncorrectAttempt.sessionSolvedProblems, 1);
  assert.equal(afterIncorrectAttempt.currentStreak, 0);
  assert.notEqual(afterIncorrectAttempt.currentStreak, afterIncorrectAttempt.sessionSolvedProblems);

  const afterRecoverySolve = resolveSolvedProgressAfterCompletedProblem(afterIncorrectAttempt);
  assert.deepEqual(afterRecoverySolve, {
    sessionSolvedProblems: 2,
    currentStreak: 1,
  });
});
