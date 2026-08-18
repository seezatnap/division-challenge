import assert from "node:assert/strict";
import test from "node:test";

import { loadRewardsOpenAiModuleUrls } from "./helpers/rewards-module-loader.mjs";

const promptModule = loadRewardsOpenAiModuleUrls().then((urls) => import(urls.promptUrl));

test("buildJurassicParkCinematicPrompt validates dinosaur input", async () => {
  const { buildJurassicParkCinematicPrompt } = await promptModule;

  assert.throws(
    () => buildJurassicParkCinematicPrompt("   "),
    /dinosaurName must be a non-empty string\./,
  );
});

test("buildJurassicParkCinematicPrompt includes reusable Jurassic cinematic guidance", async () => {
  const { buildJurassicParkCinematicPrompt } = await promptModule;

  const prompt = buildJurassicParkCinematicPrompt("Velociraptor");

  assert.match(prompt, /Velociraptor/);
  assert.match(prompt, /Jurassic Park inspired scene/);
  assert.match(prompt, /photorealistic cinematic still/);
  assert.match(prompt, /family-friendly/);
  assert.match(prompt, /no gore/);
});

test("buildRewardImagePrompt switches to amber-specific guidance for amber assets", async () => {
  const { buildRewardImagePrompt } = await promptModule;

  const prompt = buildRewardImagePrompt({
    assetName: "Amber Resonance Crystal",
    visualDescription: "should be ignored for amber",
  });

  assert.match(prompt, /Amber Resonance Crystal/);
  assert.match(prompt, /amber crystal/i);
  assert.match(prompt, /hero product still/i);
  assert.doesNotMatch(prompt, /should be ignored/);
});

test("buildRewardImagePrompt switches to hybrid-specific guidance for hybrid assets", async () => {
  const { buildRewardImagePrompt } = await promptModule;

  const prompt = buildRewardImagePrompt({ assetName: "Hybrid Tyrannosaurus Rex + Velociraptor" });

  assert.match(prompt, /Hybrid Tyrannosaurus Rex \+ Velociraptor/);
  assert.match(prompt, /dinosaur hybrid/i);
  assert.match(prompt, /family-friendly/i);
  assert.match(prompt, /Height: [\d.]+ m/);
  assert.match(prompt, /Length: [\d.]+ m/);
  assert.match(prompt, /Attributes:/);
  assert.match(prompt, /Description:/);
});

test("buildRewardImagePrompt includes dossier details for primary dinosaur assets", async () => {
  const { buildRewardImagePrompt } = await promptModule;

  const prompt = buildRewardImagePrompt({ assetName: "Brachiosaurus" });

  assert.match(prompt, /Field dossier for Brachiosaurus/);
  assert.match(prompt, /Height: [\d.]+ m/);
  assert.match(prompt, /Length: [\d.]+ m/);
  assert.match(prompt, /Attributes:/);
  assert.match(prompt, /Description:/);
});

test("buildRewardImagePrompt places the visual description ahead of the dossier as the exact reference", async () => {
  const { buildRewardImagePrompt, buildRewardImagePromptWithDossier } = await promptModule;

  const primaryPrompt = buildRewardImagePrompt({
    assetName: "Compsognathus",
    dossierPromptBlock: "Field dossier for Compsognathus: Height: 0.3 m.",
    visualDescription: "A turkey-sized, lightly built theropod with a long slender tail.",
  });

  assert.match(primaryPrompt, /Exact appearance reference — follow it precisely/);
  assert.match(primaryPrompt, /turkey-sized, lightly built theropod/);
  assert.ok(
    primaryPrompt.indexOf("turkey-sized") < primaryPrompt.indexOf("Field dossier for Compsognathus"),
    "visual description precedes the dossier block",
  );

  const hybridPrompt = buildRewardImagePrompt({
    assetName: "Hybrid Stegosaurus + Velociraptor",
    visualDescription: "Sickle claws beneath a double row of dorsal plates.",
  });
  assert.match(hybridPrompt, /Designed appearance of this hybrid/);
  assert.match(hybridPrompt, /Sickle claws beneath a double row of dorsal plates\./);

  // Positional wrapper stays available and identical.
  assert.equal(
    buildRewardImagePromptWithDossier("Compsognathus", null, "Tiny theropod."),
    buildRewardImagePrompt({ assetName: "Compsognathus", visualDescription: "Tiny theropod." }),
  );

  // Blank descriptions are dropped rather than leaving an empty reference block.
  const noDescriptionPrompt = buildRewardImagePrompt({
    assetName: "Compsognathus",
    visualDescription: "   ",
  });
  assert.doesNotMatch(noDescriptionPrompt, /Exact appearance reference/);
});
