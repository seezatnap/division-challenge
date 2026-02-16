import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_DINOSAUR_PUBLIC_SUBDIRECTORY,
  buildGeneratedDinosaurFileName,
  persistGeminiGeneratedImage,
} from "../lib/gemini-image-storage";

test("buildGeneratedDinosaurFileName is deterministic and includes slug + hash", () => {
  const options = {
    dinosaurName: "  Tyrannosaurus Rex ",
    mimeType: "image/png",
    data: Buffer.from("same-image-data").toString("base64"),
  };

  const first = buildGeneratedDinosaurFileName(options);
  const second = buildGeneratedDinosaurFileName(options);

  assert.equal(first, second);
  assert.match(first, /^tyrannosaurus-rex-[a-f0-9]{16}\.png$/);
});

test("buildGeneratedDinosaurFileName changes when image content changes", () => {
  const first = buildGeneratedDinosaurFileName({
    dinosaurName: "Velociraptor",
    mimeType: "image/webp",
    data: Buffer.from("first-image").toString("base64"),
  });
  const second = buildGeneratedDinosaurFileName({
    dinosaurName: "Velociraptor",
    mimeType: "image/webp",
    data: Buffer.from("second-image").toString("base64"),
  });

  assert.notEqual(first, second);
});

test("persistGeminiGeneratedImage saves decoded bytes into public directory", async () => {
  const projectRootDir = await mkdtemp(path.join(tmpdir(), "dino-division-image-"));
  const imageBuffer = Buffer.from("mock-image-data");

  try {
    const persisted = await persistGeminiGeneratedImage({
      dinosaurName: "Triceratops",
      mimeType: "image/webp",
      data: imageBuffer.toString("base64"),
      projectRootDir,
    });

    assert.match(
      persisted.imagePath,
      new RegExp(
        `^/${GENERATED_DINOSAUR_PUBLIC_SUBDIRECTORY}/triceratops-[a-f0-9]{16}\\.webp$`,
      ),
    );

    const absoluteImagePath = path.join(
      projectRootDir,
      "public",
      persisted.imagePath.slice(1),
    );
    const storedBytes = await readFile(absoluteImagePath);

    assert.deepEqual(storedBytes, imageBuffer);
  } finally {
    await rm(projectRootDir, { recursive: true, force: true });
  }
});

test("persistGeminiGeneratedImage rejects unsupported MIME types", async () => {
  await assert.rejects(
    () =>
      persistGeminiGeneratedImage({
        dinosaurName: "Stegosaurus",
        mimeType: "text/plain",
        data: Buffer.from("not-an-image").toString("base64"),
      }),
    /Unsupported image MIME type/,
  );
});
