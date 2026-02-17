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

const rewardRevealModule = loadTypeScriptModule("src/features/rewards/lib/earned-reward-reveal.ts");

test("pollEarnedRewardImageUntilReady polls in-flight generation until a ready image is returned", async () => {
  const { pollEarnedRewardImageUntilReady } = await rewardRevealModule;
  const seenAttempts = [];
  const waitedDurations = [];
  const statusQueue = [
    { dinosaurName: "Stegosaurus", status: "generating", imagePath: null },
    { dinosaurName: "Stegosaurus", status: "generating", imagePath: null },
    {
      dinosaurName: "Stegosaurus",
      status: "ready",
      imagePath: "/rewards/stegosaurus.png",
    },
  ];

  const result = await pollEarnedRewardImageUntilReady({
    dinosaurName: " Stegosaurus ",
    pollIntervalMs: 15,
    maxPollAttempts: 5,
    pollStatus: async () => statusQueue.shift(),
    onPollStatus: (_snapshot, attempt) => {
      seenAttempts.push(attempt);
    },
    wait: async (durationMs) => {
      waitedDurations.push(durationMs);
    },
  });

  assert.equal(result.outcome, "revealed");
  assert.equal(result.attempts, 3);
  assert.equal(result.snapshot.status, "ready");
  assert.equal(result.snapshot.imagePath, "/rewards/stegosaurus.png");
  assert.deepEqual(seenAttempts, [1, 2, 3]);
  assert.deepEqual(waitedDurations, [15, 15]);
});

test("pollEarnedRewardImageUntilReady exits immediately when generation is missing", async () => {
  const { pollEarnedRewardImageUntilReady } = await rewardRevealModule;
  let waitCalls = 0;

  const result = await pollEarnedRewardImageUntilReady({
    dinosaurName: "Velociraptor",
    pollIntervalMs: 10,
    maxPollAttempts: 4,
    pollStatus: async () => ({
      dinosaurName: "Velociraptor",
      status: "missing",
      imagePath: null,
    }),
    wait: async () => {
      waitCalls += 1;
    },
  });

  assert.equal(result.outcome, "missing");
  assert.equal(result.attempts, 1);
  assert.equal(waitCalls, 0);
});

test("pollEarnedRewardImageUntilReady reports timeout after max attempts while still generating", async () => {
  const { pollEarnedRewardImageUntilReady } = await rewardRevealModule;
  let pollCount = 0;
  let waitCount = 0;

  const result = await pollEarnedRewardImageUntilReady({
    dinosaurName: "Triceratops",
    pollIntervalMs: 25,
    maxPollAttempts: 3,
    pollStatus: async () => {
      pollCount += 1;
      return {
        dinosaurName: "Triceratops",
        status: "generating",
        imagePath: null,
      };
    },
    wait: async () => {
      waitCount += 1;
    },
  });

  assert.equal(result.outcome, "timed-out");
  assert.equal(result.attempts, 3);
  assert.equal(result.snapshot.status, "generating");
  assert.equal(pollCount, 3);
  assert.equal(waitCount, 2);
});

test("fetchEarnedRewardImageStatus calls the status endpoint and parses the data envelope", async () => {
  const { fetchEarnedRewardImageStatus } = await rewardRevealModule;
  let seenUrl = "";
  let seenMethod = "";

  const snapshot = await fetchEarnedRewardImageStatus({
    dinosaurName: " Stegosaurus ",
    endpoint: "/api/rewards/image-status",
    fetchFn: async (input, init = {}) => {
      seenUrl = String(input);
      seenMethod = init.method;
      return new Response(
        JSON.stringify({
          data: {
            dinosaurName: "Stegosaurus",
            status: "ready",
            imagePath: "/rewards/stegosaurus.jpg",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.equal(snapshot.status, "ready");
  assert.equal(snapshot.dinosaurName, "Stegosaurus");
  assert.equal(snapshot.imagePath, "/rewards/stegosaurus.jpg");
  assert.equal(seenMethod, "GET");
  assert.ok(
    seenUrl.includes("/api/rewards/image-status?dinosaurName=Stegosaurus"),
    `Expected request URL to include encoded dinosaurName, got: ${seenUrl}`,
  );
});

test("fetchEarnedRewardImageStatus surfaces API error messages", async () => {
  const { fetchEarnedRewardImageStatus } = await rewardRevealModule;

  await assert.rejects(
    () =>
      fetchEarnedRewardImageStatus({
        dinosaurName: "Brachiosaurus",
        fetchFn: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "INVALID_DINOSAUR_NAME",
                message: "dinosaurName query parameter must be a non-empty string.",
              },
            }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          ),
      }),
    /dinosaurName query parameter must be a non-empty string/,
  );
});
