import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
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

  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const galleryLibModule = loadTypeScriptModule("src/features/gallery/lib/dino-gallery.ts");

test("gallery panel includes reward image, earned date output, empty-state copy, and live refresh listener", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  for (const fragment of [
    "No dinos unlocked yet.",
    "Solve your first 5 division problems",
    "<Image",
    "<time dateTime={reward.earnedAt}>",
    'aria-haspopup="dialog"',
    'data-ui-surface="gallery-detail-modal"',
    "setSelectedReward",
    "DINO_GALLERY_REWARDS_UPDATED_EVENT",
    "window.addEventListener(",
    "readUnlockedRewardsFromGalleryEvent",
    "mergeUnlockedRewardsForGallery",
    'data-ui-surface="dino-dossier"',
    "dino-dossier-attributes",
    "gallery-shell gallery-shell-jp3",
    "gallery-grid gallery-grid-jp3",
    "gallery-card gallery-card-jp3",
    "gallery-card-trigger gallery-card-trigger-jp3",
    "gallery-thumb gallery-thumb-jp3",
    "gallery-image gallery-image-jp3",
    "gallery-name gallery-name-jp3",
    "gallery-meta gallery-meta-jp3",
  ]) {
    assert.ok(source.includes(fragment), `Expected gallery panel fragment: ${fragment}`);
  }
});

test("JP3 gallery styles define a bright 3x3 thumbnail grid with centered dino images and labels below", async () => {
  const source = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".gallery-grid-jp3 {",
    "grid-template-columns: repeat(3, minmax(0, 1fr));",
    ".gallery-thumb-jp3 {",
    "aspect-ratio: 1 / 0.78;",
    "background: linear-gradient(180deg, #27b533 0%, #1f9f2f 56%, #178826 100%);",
    ".gallery-image-jp3 {",
    "object-fit: contain;",
    "object-position: center;",
    ".gallery-name-jp3 {",
    "text-transform: uppercase;",
  ]) {
    assert.ok(source.includes(fragment), `Expected JP3 gallery style fragment: ${fragment}`);
  }
});

test("gallery helpers merge unlock batches, dedupe by reward id, and sort by milestone descending", async () => {
  const { mergeUnlockedRewardsForGallery } = await galleryLibModule;
  const existingRewards = [
    {
      rewardId: "reward-1",
      dinosaurName: "Tyrannosaurus Rex",
      imagePath: "/rewards/tyrannosaurus-rex.png",
      earnedAt: "2026-02-12T09:15:00.000Z",
      milestoneSolvedCount: 5,
    },
    {
      rewardId: "reward-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor-old.png",
      earnedAt: "2026-02-14T12:40:00.000Z",
      milestoneSolvedCount: 10,
    },
  ];
  const incomingRewards = [
    {
      rewardId: "reward-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor.png",
      earnedAt: "2026-02-14T12:40:00.000Z",
      milestoneSolvedCount: 10,
    },
    {
      rewardId: "reward-3",
      dinosaurName: "Stegosaurus",
      imagePath: "/rewards/stegosaurus.png",
      earnedAt: "2026-02-17T18:00:00.000Z",
      milestoneSolvedCount: 15,
    },
  ];

  const mergedRewards = mergeUnlockedRewardsForGallery(existingRewards, incomingRewards);

  assert.deepEqual(
    mergedRewards.map((reward) => reward.rewardId),
    ["reward-3", "reward-2", "reward-1"],
  );
  assert.equal(mergedRewards.length, 3);
  assert.equal(mergedRewards[1]?.imagePath, "/rewards/velociraptor.png");
});

test("gallery helpers format earned dates and read custom-event reward payloads", async () => {
  const {
    createDinoGalleryRewardsUpdatedEventDetail,
    createGalleryRewardFromUnlock,
    formatGalleryEarnedDate,
    readUnlockedRewardsFromGalleryEvent,
  } = await galleryLibModule;
  const unlockedReward = createGalleryRewardFromUnlock({
    dinosaurName: "Stegosaurus",
    imagePath: "/rewards/stegosaurus.png",
    milestoneSolvedCount: 15,
    earnedAt: "2026-02-17T18:00:00.000Z",
  });
  const detail = createDinoGalleryRewardsUpdatedEventDetail([unlockedReward]);

  assert.equal(unlockedReward.rewardId, "reward-3");
  assert.match(formatGalleryEarnedDate(unlockedReward.earnedAt), /2026/);
  assert.equal(formatGalleryEarnedDate("not-a-date"), "Unknown date");
  assert.deepEqual(readUnlockedRewardsFromGalleryEvent({ detail }), [unlockedReward]);
});

test("home page uses the reusable DinoGalleryPanel with unlocked reward data", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  assert.ok(
    source.includes("<DinoGalleryPanel unlockedRewards={gameSession.unlockedRewards} />"),
    "Expected home page to render DinoGalleryPanel with unlocked reward data",
  );
  assert.ok(
    source.includes('data-ui-surface="hybrid-gallery"'),
    "Expected home page to render a dedicated hybrid gallery surface",
  );
  assert.ok(
    source.includes("gameSession.unlockedHybrids"),
    "Expected home page to wire hybrid gallery data from session state",
  );
  assert.ok(
    source.includes('data-ui-surface="hybrid-dossier"'),
    "Expected home page to render hybrid dossier content in hybrid detail modal",
  );
});

test("earned reward reveal panel dispatches gallery refresh updates after reveal", async () => {
  const source = await readRepoFile("src/features/rewards/components/earned-reward-reveal-panel.tsx");

  for (const fragment of [
    "createGalleryRewardFromUnlock",
    "dispatchDinoGalleryRewardsUpdatedEvent",
    "revealedRewardBroadcastKeyRef",
  ]) {
    assert.ok(source.includes(fragment), `Expected reward reveal refresh fragment: ${fragment}`);
  }
});
