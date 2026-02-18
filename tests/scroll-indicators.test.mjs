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

// ── Component structure tests ───────────────────────────────

test("ScrollIndicators component exists and exports ScrollIndicators", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes("export function ScrollIndicators"),
    "Expected ScrollIndicators to be a named export",
  );
});

test("ScrollIndicators component accepts a scrollRef prop", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes("scrollRef"),
    "Expected ScrollIndicators to accept a scrollRef prop",
  );
});

test("ScrollIndicators renders up and down arrow buttons", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes("scroll-indicator-up"),
    "Expected scroll-indicator-up class for the up arrow button",
  );
  assert.ok(
    source.includes("scroll-indicator-down"),
    "Expected scroll-indicator-down class for the down arrow button",
  );
});

test("ScrollIndicators uses SVG triangles for arrow shapes", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes("<polygon"),
    "Expected SVG polygon elements for triangular arrow shapes",
  );
  assert.ok(
    source.includes("scroll-indicator-svg"),
    "Expected scroll-indicator-svg class on SVG elements",
  );
});

test("ScrollIndicators uses aria-hidden to exclude from accessibility tree", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes('aria-hidden="true"'),
    "Expected aria-hidden on the scroll indicators container",
  );
});

test("ScrollIndicators tracks scroll position to show/hide arrows", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes("canScrollUp"),
    "Expected canScrollUp state for managing up arrow visibility",
  );
  assert.ok(
    source.includes("canScrollDown"),
    "Expected canScrollDown state for managing down arrow visibility",
  );
  assert.ok(
    source.includes("scrollTop"),
    "Expected scrollTop usage for determining scroll position",
  );
  assert.ok(
    source.includes("scrollHeight"),
    "Expected scrollHeight usage for determining if content overflows",
  );
});

test("ScrollIndicators hides arrows with scroll-indicator-hidden class when not scrollable", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes("scroll-indicator-hidden"),
    "Expected scroll-indicator-hidden class for hiding non-applicable arrows",
  );
});

test("ScrollIndicators has data-testid attributes for test targeting", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/scroll-indicators.tsx",
  );

  assert.ok(
    source.includes('data-testid="scroll-indicators"'),
    "Expected data-testid on the scroll indicators container",
  );
  assert.ok(
    source.includes('data-testid="scroll-indicator-up"'),
    "Expected data-testid on the up arrow",
  );
  assert.ok(
    source.includes('data-testid="scroll-indicator-down"'),
    "Expected data-testid on the down arrow",
  );
});

// ── Integration tests ───────────────────────────────────────

test("DinoGalleryPanel imports and renders ScrollIndicators in the detail modal", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/dino-gallery-panel.tsx",
  );

  assert.ok(
    source.includes('import { ScrollIndicators } from "./scroll-indicators"'),
    "Expected DinoGalleryPanel to import ScrollIndicators",
  );
  assert.ok(
    source.includes("<ScrollIndicators"),
    "Expected DinoGalleryPanel to render ScrollIndicators in the modal",
  );
});

test("DinoGalleryPanel gallery detail modal has scroll-indicator-container class", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/dino-gallery-panel.tsx",
  );

  assert.ok(
    source.includes("scroll-indicator-container"),
    "Expected gallery detail modal to include scroll-indicator-container class for positioning",
  );
});

test("DinoGalleryPanel uses a ref for the scrollable modal element", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/dino-gallery-panel.tsx",
  );

  assert.ok(
    source.includes("modalScrollRef"),
    "Expected modalScrollRef for tracking the scrollable element",
  );
  assert.ok(
    source.includes("ref={modalScrollRef}"),
    "Expected ref to be attached to the modal section element",
  );
});

test("page.tsx renders ScrollIndicators in the hybrid detail modal", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  assert.ok(
    source.includes('import { ScrollIndicators } from "@/features/gallery/components/scroll-indicators"'),
    "Expected page.tsx to import ScrollIndicators",
  );
  assert.ok(
    source.includes("hybridDetailScrollRef"),
    "Expected hybridDetailScrollRef for the hybrid detail modal",
  );
});

// ── CSS tests ───────────────────────────────────────────────

test("globals.css defines scroll-indicators positioning styles", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".scroll-indicators"),
    "Expected .scroll-indicators class in globals.css",
  );
  assert.ok(
    source.includes(".scroll-indicator"),
    "Expected .scroll-indicator class for individual arrow buttons",
  );
});

test("scroll indicators use the JP3 accent red color variable", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".scroll-indicator") &&
      source.includes("--jp-accent-red"),
    "Expected scroll indicator to use --jp-accent-red color variable",
  );
});

test("scroll-indicator-hidden class has opacity 0 for hiding arrows", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".scroll-indicator-hidden") &&
      source.includes("opacity: 0"),
    "Expected scroll-indicator-hidden to use opacity: 0",
  );
});

test("scroll-indicator-container class provides relative positioning context", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".scroll-indicator-container") &&
      source.includes("position: relative"),
    "Expected scroll-indicator-container to set position: relative",
  );
});

test("scroll indicators are exported from gallery components index", async () => {
  const source = await readRepoFile(
    "src/features/gallery/components/index.ts",
  );

  assert.ok(
    source.includes("scroll-indicators"),
    "Expected gallery components index to export scroll-indicators",
  );
});
