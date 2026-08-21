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

test("gallery grid CSS uses a fixed 3-column layout matching JP3 Research Center comp", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes("grid-template-columns: repeat(3, 1fr)"),
    "Expected gallery-grid to use a fixed 3-column grid (repeat(3, 1fr))",
  );
  assert.ok(
    source.includes(".gallery-card") && source.includes("aspect-ratio: 4 / 3"),
    "Expected gallery-card tiles to have a 4:3 landscape aspect-ratio (aspect-ratio: 4 / 3)",
  );
});

test("gallery card tiles have bright green backgrounds matching JP3 green panels", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".gallery-card") && source.includes("background: #2d8a2d"),
    "Expected gallery-card to have bright green background (#2d8a2d)",
  );
  assert.ok(
    source.includes(".gallery-card") && source.includes("border: 2px solid #145a22"),
    "Expected gallery-card to have dark green border (#145a22)",
  );
});

test("gallery thumbnail images use object-fit cover to fill tiles edge to edge", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".gallery-image") && source.includes("object-fit: cover"),
    "Expected gallery-image to use object-fit: cover so the dinosaur fills the tile",
  );
});

test("gallery name labels are uppercase with cream color matching JP3 comp style", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".gallery-name") && source.includes("text-transform: uppercase"),
    "Expected gallery-name to use uppercase text-transform",
  );
  assert.ok(
    source.includes(".gallery-name") && source.includes("color: #f0edd8"),
    "Expected gallery-name to use cream color (#f0edd8)",
  );
});

test("gallery name sits in a green bar at the bottom of the tile", async () => {
  const source = await readRepoFile("src/app/globals.css");
  const nameBlockStart = source.indexOf(".gallery-name {");
  const nameBlock = source.slice(nameBlockStart, source.indexOf("}", nameBlockStart));

  assert.ok(nameBlockStart >= 0, "Expected a .gallery-name rule");
  assert.ok(nameBlock.includes("width: 100%"), "Expected gallery-name bar to span the tile width");
  assert.ok(nameBlock.includes("background: #2d8a2d"), "Expected gallery-name bar to be JP3 green");
});

test("DinoGalleryPanel renders gallery-name with dinosaur name for each tile", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes('className="gallery-name"'),
    "Expected gallery-name class on dinosaur name label element",
  );
  assert.ok(
    source.includes("{reward.dinosaurName}"),
    "Expected dinosaur name to be rendered in each gallery tile",
  );
});

test("DinoGalleryPanel uses 4:3 image dimensions for thumbnail tiles", async () => {
  const source = await readRepoFile("src/features/gallery/components/dino-gallery-panel.tsx");

  assert.ok(
    source.includes("height={240}") && source.includes("width={320}"),
    "Expected gallery thumbnail images to use 4:3 dimensions (320x240)",
  );
});

test("gallery card trigger uses flex layout to center content within tile", async () => {
  const source = await readRepoFile("src/app/globals.css");

  assert.ok(
    source.includes(".gallery-card-trigger") && source.includes("display: flex"),
    "Expected gallery-card-trigger to use flex display",
  );
  assert.ok(
    source.includes(".gallery-card-trigger") && source.includes("justify-content: center"),
    "Expected gallery-card-trigger to center content",
  );
});
