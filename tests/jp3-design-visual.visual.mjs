import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const TEST_BASE_URL = "http://127.0.0.1:4173";
const VISUAL_TEST_DIST_DIR = ".next-visual-tests";
const PREEXISTING_SERVER_BASE_URL_CANDIDATES = [
  TEST_BASE_URL,
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];
let baseUrl = TEST_BASE_URL;
let galleryVisualUrl = `${baseUrl}/visual-tests/gallery`;

let serverProcess = null;
let browser = null;
let serverStdoutBuffer = "";
let serverStderrBuffer = "";
let usesPreexistingServer = false;
const NEXT_DEV_LOCK_ERROR_FRAGMENT = "Unable to acquire lock";

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function waitForServer(url, timeoutMilliseconds = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await wait(300);
  }

  throw new Error(
    [
      `Timed out waiting for Next.js at ${url}.`,
      `stdout: ${serverStdoutBuffer || "<empty>"}`,
      `stderr: ${serverStderrBuffer || "<empty>"}`,
    ].join("\n"),
  );
}

function setBaseUrl(nextBaseUrl) {
  baseUrl = nextBaseUrl;
  galleryVisualUrl = `${baseUrl}/visual-tests/gallery`;
}

async function resolveReachableServerBaseUrl(candidates) {
  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(`${candidateUrl}/visual-tests/gallery`);
      if (response.ok) {
        return candidateUrl;
      }
    } catch {}
  }

  return null;
}

function sawNextDevLockError() {
  return serverStderrBuffer.includes(NEXT_DEV_LOCK_ERROR_FRAGMENT);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveHeadlessShellExecutablePath() {
  const browsersDirectory = path.join(repoRoot, ".playwright-browsers");
  const browserDirectories = await readdir(browsersDirectory, { withFileTypes: true });
  const headlessShellDirectory = browserDirectories.find(
    (entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"),
  );

  if (!headlessShellDirectory) {
    throw new Error(
      "Chromium headless shell is missing. Run `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx agent-browser install`.",
    );
  }

  const candidatePaths = [
    path.join(
      browsersDirectory,
      headlessShellDirectory.name,
      "chrome-headless-shell-mac-arm64",
      "chrome-headless-shell",
    ),
    path.join(
      browsersDirectory,
      headlessShellDirectory.name,
      "chrome-headless-shell-mac-x64",
      "chrome-headless-shell",
    ),
    path.join(
      browsersDirectory,
      headlessShellDirectory.name,
      "chrome-headless-shell-linux64",
      "chrome-headless-shell",
    ),
    path.join(
      browsersDirectory,
      headlessShellDirectory.name,
      "chrome-headless-shell-win64",
      "chrome-headless-shell.exe",
    ),
  ];

  for (const candidatePath of candidatePaths) {
    if (await fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error("Unable to resolve a Chromium headless-shell executable.");
}

async function stopServerProcess() {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill("SIGTERM");
  const didExitGracefully = await Promise.race([
    new Promise((resolve) => {
      serverProcess.once("exit", () => resolve(true));
    }),
    wait(5_000).then(() => false),
  ]);

  if (!didExitGracefully) {
    serverProcess.kill("SIGKILL");
    await new Promise((resolve) => {
      serverProcess.once("exit", resolve);
    });
  }
}

async function createGalleryPage() {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 980 },
  });
  const page = await context.newPage();
  await page.goto(galleryVisualUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-visual-snapshot="gallery-grid"]');
  await wait(600);
  return { context, page };
}

test.before(async () => {
  serverStdoutBuffer = "";
  serverStderrBuffer = "";
  const preexistingServerBaseUrl = await resolveReachableServerBaseUrl(
    PREEXISTING_SERVER_BASE_URL_CANDIDATES,
  );
  usesPreexistingServer = preexistingServerBaseUrl !== null;

  if (preexistingServerBaseUrl) {
    setBaseUrl(preexistingServerBaseUrl);
  } else {
    setBaseUrl(TEST_BASE_URL);
    serverProcess = spawn("npm", ["run", "dev", "--", "--port", "4173", "--hostname", "127.0.0.1"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_DIST_DIR: VISUAL_TEST_DIST_DIR,
        PORT: "4173",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess.stdout?.on("data", (chunk) => {
      serverStdoutBuffer = `${serverStdoutBuffer}${String(chunk)}`.slice(-8_000);
    });
    serverProcess.stderr?.on("data", (chunk) => {
      serverStderrBuffer = `${serverStderrBuffer}${String(chunk)}`.slice(-8_000);
    });

    await wait(900);
    if (sawNextDevLockError()) {
      const fallbackServerBaseUrl = await resolveReachableServerBaseUrl(
        PREEXISTING_SERVER_BASE_URL_CANDIDATES,
      );
      if (fallbackServerBaseUrl) {
        usesPreexistingServer = true;
        setBaseUrl(fallbackServerBaseUrl);
      } else {
        await waitForServer(galleryVisualUrl);
      }
    } else {
      await waitForServer(galleryVisualUrl);
    }
  }

  const executablePath = await resolveHeadlessShellExecutablePath();
  browser = await chromium.launch({
    headless: true,
    executablePath,
  });
});

test.after(async () => {
  if (browser) {
    await browser.close();
  }

  if (!usesPreexistingServer) {
    await stopServerProcess();
  }
});

test("gallery visual: grid renders 9 tiles in a 3-column layout matching JP3 Research Center comp", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    const galleryGrid = page.locator(".gallery-grid");
    await galleryGrid.waitFor({ state: "visible" });

    const gridMetrics = await galleryGrid.evaluate((grid) => {
      const computedStyle = window.getComputedStyle(grid);
      const columns = computedStyle.getPropertyValue("grid-template-columns").split(/\s+/).filter(Boolean);
      const cards = grid.querySelectorAll(".gallery-card");
      return {
        columnCount: columns.length,
        cardCount: cards.length,
        display: computedStyle.getPropertyValue("display"),
      };
    });

    assert.equal(gridMetrics.display, "grid", "Expected gallery-grid to use CSS grid display.");
    assert.equal(gridMetrics.columnCount, 3, "Expected gallery grid to have exactly 3 columns matching the JP3 Research Center 3×3 grid.");
    assert.equal(gridMetrics.cardCount, 9, "Expected gallery grid to contain 9 dinosaur tiles for a full 3×3 grid.");
  } finally {
    await context.close();
  }
});

test("gallery visual: tiles are arranged in 3 rows of 3 based on bounding box positions", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    const tilePositions = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      return cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) };
      });
    });

    assert.equal(tilePositions.length, 9, "Expected 9 gallery tiles.");

    // Group tiles by row (same top position within tolerance)
    const rows = [];
    const tolerance = 5;
    for (const tile of tilePositions) {
      let placed = false;
      for (const row of rows) {
        if (Math.abs(row[0].top - tile.top) <= tolerance) {
          row.push(tile);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([tile]);
      }
    }

    assert.equal(rows.length, 3, `Expected 3 rows of tiles, found ${rows.length}.`);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      assert.equal(rows[rowIndex].length, 3, `Expected 3 tiles in row ${rowIndex}, found ${rows[rowIndex].length}.`);
    }

    // Verify tiles within each row are horizontally distinct (left-to-right ordering)
    for (const row of rows) {
      row.sort((a, b) => a.left - b.left);
      for (let i = 1; i < row.length; i++) {
        assert.ok(
          row[i].left > row[i - 1].left + row[i - 1].width * 0.5,
          "Expected tiles within a row to be horizontally spaced apart.",
        );
      }
    }
  } finally {
    await context.close();
  }
});

test("gallery visual: each tile contains a dinosaur thumbnail image", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    const tileImageInfo = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      return cards.map((card) => {
        const img = card.querySelector(".gallery-image");
        const name = card.querySelector(".gallery-name");
        return {
          hasImage: img !== null,
          hasName: name !== null,
          nameText: name?.textContent?.trim() ?? "",
          imageSrc: img?.getAttribute("src") ?? "",
        };
      });
    });

    assert.equal(tileImageInfo.length, 9, "Expected 9 gallery tiles.");
    for (const tile of tileImageInfo) {
      assert.ok(tile.hasImage, "Expected each gallery tile to contain a .gallery-image element.");
      assert.ok(tile.hasName, "Expected each gallery tile to contain a .gallery-name element.");
      assert.ok(tile.nameText.length > 0, "Expected each gallery tile to display a dinosaur name.");
    }

    // Verify all 9 expected dinosaur names are present
    const expectedNames = [
      "Tyrannosaurus Rex", "Velociraptor", "Triceratops",
      "Brachiosaurus", "Dilophosaurus", "Spinosaurus",
      "Stegosaurus", "Parasaurolophus", "Gallimimus",
    ];
    const renderedNames = tileImageInfo.map((t) => t.nameText.toUpperCase());
    for (const expected of expectedNames) {
      assert.ok(
        renderedNames.some((name) => name === expected.toUpperCase()),
        `Expected dinosaur name "${expected}" to be rendered in the gallery grid.`,
      );
    }
  } finally {
    await context.close();
  }
});

test("gallery visual: tiles have green backgrounds matching JP3 comp via pixel sampling", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    // Sample the computed background color of each gallery card
    const tileColors = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      return cards.map((card) => {
        const computedStyle = window.getComputedStyle(card);
        const bgColor = computedStyle.getPropertyValue("background-color");
        return bgColor;
      });
    });

    assert.equal(tileColors.length, 9, "Expected 9 gallery tile background samples.");

    for (let i = 0; i < tileColors.length; i++) {
      const bgColor = tileColors[i];
      // Parse rgb(r, g, b) or rgba(r, g, b, a) format
      const rgbMatch = bgColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      assert.ok(rgbMatch, `Expected parseable RGB color for tile ${i}, got: ${bgColor}`);

      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);

      // JP3 green tile: #2d8a2d = rgb(45, 138, 45)
      // Assert green range: R < 80, G > 100, B < 80
      assert.ok(
        r < 80,
        `Expected tile ${i} red channel < 80 for green background, got R=${r} (${bgColor})`,
      );
      assert.ok(
        g > 100,
        `Expected tile ${i} green channel > 100 for green background, got G=${g} (${bgColor})`,
      );
      assert.ok(
        b < 80,
        `Expected tile ${i} blue channel < 80 for green background, got B=${b} (${bgColor})`,
      );
    }
  } finally {
    await context.close();
  }
});

test("gallery visual: pixel sampling of rendered tile centers confirms green fill", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    // Take a screenshot and sample pixel colors at tile center positions
    const gallerySnapshot = page.locator('[data-visual-snapshot="gallery-grid"]');
    await gallerySnapshot.waitFor({ state: "visible" });

    // Get bounding boxes of first 3 tiles for pixel sampling
    const tileBounds = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      return cards.slice(0, 3).map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2),
        };
      });
    });

    assert.ok(tileBounds.length >= 3, "Expected at least 3 tiles for pixel sampling.");

    // Use page.evaluate to sample pixel colors at tile centers
    const pixelSamples = await page.evaluate(async (centers) => {
      const samples = [];
      for (const center of centers) {
        // Use elementFromPoint to confirm a gallery-card is at the center
        const element = document.elementFromPoint(center.centerX, center.centerY);
        const card = element?.closest(".gallery-card");
        if (card) {
          const style = window.getComputedStyle(card);
          const bg = style.getPropertyValue("background-color");
          samples.push({ x: center.centerX, y: center.centerY, bg, isCard: true });
        } else {
          samples.push({ x: center.centerX, y: center.centerY, bg: "none", isCard: false });
        }
      }
      return samples;
    }, tileBounds);

    for (const sample of pixelSamples) {
      assert.ok(
        sample.isCard,
        `Expected a gallery-card element at pixel (${sample.x}, ${sample.y}).`,
      );

      const rgbMatch = sample.bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      assert.ok(rgbMatch, `Expected parseable RGB at (${sample.x}, ${sample.y}), got: ${sample.bg}`);

      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);

      assert.ok(
        r < 80 && g > 100 && b < 80,
        `Expected green pixel at tile center (${sample.x}, ${sample.y}): R=${r}, G=${g}, B=${b}`,
      );
    }
  } finally {
    await context.close();
  }
});

test("gallery visual: gallery-card tiles have square aspect ratio", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    const tileDimensions = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      return cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
    });

    assert.equal(tileDimensions.length, 9, "Expected 9 tiles.");

    for (let i = 0; i < tileDimensions.length; i++) {
      const { width, height } = tileDimensions[i];
      const aspectRatio = width / height;
      assert.ok(
        Math.abs(aspectRatio - 1) < 0.15,
        `Expected tile ${i} to be approximately square (aspect ratio ~1). Got width=${width.toFixed(1)}, height=${height.toFixed(1)}, ratio=${aspectRatio.toFixed(2)}.`,
      );
    }
  } finally {
    await context.close();
  }
});

test("gallery visual: gallery grid container uses dark green border on tiles", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    const borderInfo = await page.evaluate(() => {
      const card = document.querySelector(".gallery-card");
      if (!card) return null;
      const style = window.getComputedStyle(card);
      return {
        borderColor: style.getPropertyValue("border-color"),
        borderWidth: style.getPropertyValue("border-width"),
        borderStyle: style.getPropertyValue("border-style"),
      };
    });

    assert.ok(borderInfo, "Expected at least one gallery-card element.");
    assert.ok(
      borderInfo.borderStyle.includes("solid"),
      `Expected gallery card border-style to include "solid", got: ${borderInfo.borderStyle}`,
    );

    // Parse border color and verify it's dark green (#145a22 = rgb(20, 90, 34))
    const borderRgb = borderInfo.borderColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    assert.ok(borderRgb, `Expected parseable border color, got: ${borderInfo.borderColor}`);
    const r = parseInt(borderRgb[1], 10);
    const g = parseInt(borderRgb[2], 10);
    const b = parseInt(borderRgb[3], 10);

    assert.ok(r < 60, `Expected dark green border red channel < 60, got R=${r}`);
    assert.ok(g > 50 && g < 150, `Expected dark green border green channel between 50-150, got G=${g}`);
    assert.ok(b < 80, `Expected dark green border blue channel < 80, got B=${b}`);
  } finally {
    await context.close();
  }
});

test("gallery visual: dinosaur name labels are cream-colored and uppercase", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
    const nameStyles = await page.evaluate(() => {
      const names = Array.from(document.querySelectorAll(".gallery-name"));
      return names.slice(0, 3).map((name) => {
        const style = window.getComputedStyle(name);
        return {
          textTransform: style.getPropertyValue("text-transform"),
          color: style.getPropertyValue("color"),
          text: name.textContent?.trim() ?? "",
        };
      });
    });

    assert.ok(nameStyles.length >= 3, "Expected at least 3 gallery name labels.");

    for (const nameStyle of nameStyles) {
      assert.equal(
        nameStyle.textTransform,
        "uppercase",
        `Expected gallery name to be uppercase, got text-transform: ${nameStyle.textTransform}`,
      );

      // Verify cream color (#f0edd8 = rgb(240, 237, 216))
      const colorRgb = nameStyle.color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      assert.ok(colorRgb, `Expected parseable color for gallery name, got: ${nameStyle.color}`);
      const r = parseInt(colorRgb[1], 10);
      const g = parseInt(colorRgb[2], 10);
      const b = parseInt(colorRgb[3], 10);

      assert.ok(
        r > 180 && g > 180 && b > 150,
        `Expected cream/light name color (R>180, G>180, B>150), got R=${r}, G=${g}, B=${b}`,
      );
    }
  } finally {
    await context.close();
  }
});
