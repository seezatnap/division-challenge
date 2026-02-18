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

async function loadDinoDossiersModule() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const dossiersModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dino-dossiers.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
    },
  );

  return import(dossiersModuleUrl);
}

// ── Component structure tests ───────────────────────────────

test("gallery detail modal uses two-panel layout with detail-two-panel container", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes('className="detail-two-panel"'),
    "Expected detail-two-panel class for the two-panel layout container",
  );
  assert.ok(
    source.includes('data-ui-surface="detail-two-panel"'),
    "Expected data-ui-surface attribute on two-panel container",
  );
});

test("gallery detail view has image panel on the left and info panel on the right", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes('className="detail-panel-image"'),
    "Expected detail-panel-image class for the image panel",
  );
  assert.ok(
    source.includes('className="detail-panel-info"'),
    "Expected detail-panel-info class for the info panel",
  );

  const imagePanelIndex = source.indexOf('className="detail-panel-image"');
  const infoPanelIndex = source.indexOf('className="detail-panel-info"');
  assert.ok(
    imagePanelIndex < infoPanelIndex,
    "Expected image panel to appear before info panel (top-left / right layout)",
  );
});

test("gallery detail view renders info card with all JP3 Research Center data fields", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  const requiredFields = [
    "Pronounced:",
    "Diet:",
    "Name Means:",
    "Length:",
    "Height:",
    "Weight:",
    "Time:",
    "Location:",
    "Taxon:",
  ];

  for (const field of requiredFields) {
    assert.ok(
      source.includes(field),
      `Expected info card to include data field label: ${field}`,
    );
  }
});

test("gallery detail view renders dinosaur scientific name", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes('className="info-card-scientific"'),
    "Expected info-card-scientific class for scientific name display",
  );
  assert.ok(
    source.includes("selectedRewardDossier.infoCard.scientificName"),
    "Expected scientific name to be rendered from dossier infoCard",
  );
});

test("gallery detail view uses a data-sheet definition list for info card fields", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes('<dl className="info-card-fields"'),
    "Expected dl element with info-card-fields class for data-sheet layout",
  );
  assert.ok(
    source.includes('className="info-card-label"'),
    "Expected dt elements with info-card-label class",
  );
  assert.ok(
    source.includes('className="info-card-value"'),
    "Expected dd elements with info-card-value class",
  );
});

test("gallery detail view includes a description paragraph section below the two-panel area", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes('className="detail-description-section"'),
    "Expected detail-description-section class for description area below panels",
  );

  const twoPanelIndex = source.indexOf("detail-two-panel");
  const descIndex = source.indexOf("detail-description-section");
  assert.ok(
    twoPanelIndex < descIndex,
    "Expected description section to appear below the two-panel layout",
  );
});

test("gallery detail view renders dossier description text", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes("selectedRewardDossier.description"),
    "Expected dossier description to be rendered in the detail view",
  );
  assert.ok(
    source.includes('className="dino-dossier-description"'),
    "Expected dino-dossier-description class on description paragraph",
  );
});

// ── CSS layout tests ────────────────────────────────────────

test("detail-two-panel CSS uses grid layout for side-by-side panels", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".detail-two-panel") && source.includes("display: grid"),
    "Expected detail-two-panel to use CSS grid layout",
  );
});

test("detail-two-panel CSS uses two-column grid on desktop breakpoint", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".detail-two-panel") && source.includes("grid-template-columns:"),
    "Expected detail-two-panel to define grid-template-columns for two-column layout at desktop",
  );
});

test("info-card-fields CSS uses two-column grid for label-value pairs", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".info-card-fields") && source.includes("grid-template-columns: auto 1fr"),
    "Expected info-card-fields to use auto 1fr grid columns for label-value pairs",
  );
});

test("info-card-name uses serif display font matching Research Center heading style", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".info-card-name") && source.includes("font-jurassic-display"),
    "Expected info-card-name to use the serif display font family",
  );
});

test("info-card-label uses bold weight for data field labels matching comp style", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".info-card-label") && source.includes("font-weight: 700"),
    "Expected info-card-label to use bold (700) font weight",
  );
});

// ── Dossier info card data generation tests ─────────────────

const dossierModule = loadDinoDossiersModule();

test("buildPrimaryDinosaurDossier generates an infoCard with all required fields", async () => {
  const { buildPrimaryDinosaurDossier } = await dossierModule;

  const dossier = buildPrimaryDinosaurDossier("Brachiosaurus");

  assert.ok(dossier.infoCard !== null, "Expected infoCard to be non-null for primary dossier");
  assert.ok(typeof dossier.infoCard.scientificName === "string" && dossier.infoCard.scientificName.length > 0);
  assert.ok(typeof dossier.infoCard.pronunciation === "string" && dossier.infoCard.pronunciation.length > 0);
  assert.ok(typeof dossier.infoCard.diet === "string" && dossier.infoCard.diet.length > 0);
  assert.ok(typeof dossier.infoCard.nameMeaning === "string" && dossier.infoCard.nameMeaning.length > 0);
  assert.ok(typeof dossier.infoCard.weightKg === "number" && dossier.infoCard.weightKg > 0);
  assert.ok(typeof dossier.infoCard.timePeriod === "string" && dossier.infoCard.timePeriod.length > 0);
  assert.ok(typeof dossier.infoCard.location === "string" && dossier.infoCard.location.length > 0);
  assert.ok(typeof dossier.infoCard.taxon === "string" && dossier.infoCard.taxon.length > 0);
});

test("buildPrimaryDinosaurDossier infoCard is deterministic for the same dinosaur name", async () => {
  const { buildPrimaryDinosaurDossier } = await dossierModule;

  const dossier1 = buildPrimaryDinosaurDossier("Tyrannosaurus Rex");
  const dossier2 = buildPrimaryDinosaurDossier("Tyrannosaurus Rex");

  assert.deepStrictEqual(dossier1.infoCard, dossier2.infoCard);
});

test("buildPrimaryDinosaurDossier infoCard varies between different dinosaur names", async () => {
  const { buildPrimaryDinosaurDossier } = await dossierModule;

  const trexDossier = buildPrimaryDinosaurDossier("Tyrannosaurus Rex");
  const brachiDossier = buildPrimaryDinosaurDossier("Brachiosaurus");

  assert.ok(trexDossier.infoCard !== null);
  assert.ok(brachiDossier.infoCard !== null);
  assert.notDeepStrictEqual(trexDossier.infoCard, brachiDossier.infoCard);
});

test("hybrid dossier has null infoCard since hybrids are engineered species", async () => {
  const { buildHybridDinosaurDossier } = await dossierModule;

  const hybrid = buildHybridDinosaurDossier({
    firstDinosaurName: "Tyrannosaurus Rex",
    secondDinosaurName: "Velociraptor",
  });

  assert.strictEqual(hybrid.infoCard, null, "Expected hybrid dossier to have null infoCard");
});

test("formatWeightForDisplay formats kilograms with tons for large weights and lbs for small weights", async () => {
  const { formatWeightForDisplay } = await dossierModule;

  const heavyDisplay = formatWeightForDisplay(5000);
  assert.ok(heavyDisplay.includes("5"), "Expected heavy weight to include tonnage");
  assert.ok(heavyDisplay.includes("tons"), "Expected heavy weight to include 'tons'");
  assert.ok(heavyDisplay.includes("kg"), "Expected heavy weight to include kg");

  const lightDisplay = formatWeightForDisplay(500);
  assert.ok(lightDisplay.includes("500"), "Expected light weight to show kg value");
  assert.ok(lightDisplay.includes("lbs"), "Expected light weight to include lbs");
});

test("infoCard scientificName starts with genus from dinosaur name", async () => {
  const { buildPrimaryDinosaurDossier } = await dossierModule;

  const dossier = buildPrimaryDinosaurDossier("Brachiosaurus");
  assert.ok(
    dossier.infoCard?.scientificName.startsWith("Brachiosaurus"),
    "Expected scientific name to start with genus (Brachiosaurus)",
  );
});

test("gallery detail view imports formatWeightForDisplay for weight rendering", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes("formatWeightForDisplay"),
    "Expected gallery panel to import formatWeightForDisplay for weight display",
  );
});
