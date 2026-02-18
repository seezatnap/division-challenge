import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

// ——— (#23) currentStreak tracks consecutive error-free problems ———

test("LiveGameSessionState includes a currentStreak field", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // The interface should declare currentStreak as a number
  const interfaceMatch = source.match(
    /interface\s+LiveGameSessionState\s*\{[^}]+\}/s,
  );
  assert.ok(interfaceMatch, "Expected LiveGameSessionState interface");
  assert.ok(
    interfaceMatch[0].includes("currentStreak: number"),
    "Expected currentStreak: number field in LiveGameSessionState",
  );
});

test("toolbar stats use gameSession.currentStreak, not sessionSolvedProblems for streak", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // Find the IslaSornaToolbar stats prop and check currentStreak binding
  assert.ok(
    source.includes("currentStreak: gameSession.currentStreak"),
    "Expected currentStreak to be sourced from gameSession.currentStreak",
  );
  assert.ok(
    !source.includes("currentStreak: gameSession.sessionSolvedProblems"),
    "currentStreak must NOT reuse gameSession.sessionSolvedProblems",
  );
});

test("initial game session state sets currentStreak to 0", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // Check the initialLiveGameSessionState
  const initialStateMatch = source.match(
    /const\s+initialLiveGameSessionState[^{]*\{[^}]+\}/s,
  );
  assert.ok(initialStateMatch, "Expected initialLiveGameSessionState declaration");
  assert.ok(
    initialStateMatch[0].includes("currentStreak: 0"),
    "Expected currentStreak: 0 in initial state",
  );
});

test("fresh game session state sets currentStreak to 0", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // Check createFreshLiveGameSessionState
  const freshStateMatch = source.match(
    /function\s+createFreshLiveGameSessionState[\s\S]*?return\s*\{[^}]+\}/s,
  );
  assert.ok(freshStateMatch, "Expected createFreshLiveGameSessionState function");
  assert.ok(
    freshStateMatch[0].includes("currentStreak: 0"),
    "Expected currentStreak: 0 in fresh game session state",
  );
});

test("handleWorkspaceStepValidation marks errors on incorrect outcome", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // The handler should check for incorrect outcome and set the error ref
  assert.ok(
    source.includes('validation.outcome === "incorrect"'),
    "Expected handler to check for incorrect outcome",
  );
  assert.ok(
    source.includes("hadErrorInCurrentProblemRef.current = true"),
    "Expected handler to set hadErrorInCurrentProblemRef on incorrect step",
  );
});

test("advanceToNextProblem resets streak to 0 when errors occurred", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // The advance function should reference hadErrorInCurrentProblemRef
  assert.ok(
    source.includes("advanceToNextProblem"),
    "Expected advanceToNextProblem function",
  );

  // Find the advanceToNextProblem block by locating the function and its setGameSession call
  const advanceStart = source.indexOf("const advanceToNextProblem");
  assert.ok(advanceStart !== -1, "Expected advanceToNextProblem declaration");

  // Extract a generous chunk from that point
  const advanceChunk = source.slice(advanceStart, advanceStart + 800);

  assert.ok(
    advanceChunk.includes("hadErrorInCurrentProblemRef.current"),
    "Expected advanceToNextProblem to check hadErrorInCurrentProblemRef",
  );
  assert.ok(
    advanceChunk.includes("currentState.currentStreak + 1"),
    "Expected streak increment when no errors",
  );
  // Streak should reset to 0 on errors (ternary: solvedWithoutErrors ? streak+1 : 0)
  assert.ok(
    advanceChunk.includes("currentStreak: solvedWithoutErrors"),
    "Expected currentStreak conditional on solvedWithoutErrors",
  );
});

test("hadErrorInCurrentProblemRef resets when problem changes", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  // There should be a useEffect that resets hadErrorInCurrentProblemRef when activeProblem.id changes
  assert.ok(
    source.includes("hadErrorInCurrentProblemRef.current = false"),
    "Expected hadErrorInCurrentProblemRef to be reset to false",
  );
});

test("hydrateLiveGameSessionState handles currentStreak from persistence", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  const hydrateMatch = source.match(
    /function\s+hydrateLiveGameSessionState[\s\S]*?return\s*\{[\s\S]*?\};/,
  );
  assert.ok(hydrateMatch, "Expected hydrateLiveGameSessionState function");

  const hydrateBody = hydrateMatch[0];
  assert.ok(
    hydrateBody.includes("currentStreak"),
    "Expected hydrate function to handle currentStreak field",
  );
});
