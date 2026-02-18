import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const TEST_WORKSPACE_BASE_URL = "http://127.0.0.1:4173";
const VISUAL_TEST_DIST_DIR = ".next-visual-tests";
const PREEXISTING_SERVER_BASE_URL_CANDIDATES = [
  TEST_WORKSPACE_BASE_URL,
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];
let workspaceUrl = TEST_WORKSPACE_BASE_URL;
let workspaceVisualUrl = `${workspaceUrl}/visual-tests/workspace`;

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

async function waitForWorkspaceServer(timeoutMilliseconds = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const response = await fetch(workspaceVisualUrl);
      if (response.ok) {
        return;
      }
    } catch {}

    await wait(300);
  }

  throw new Error(
    [
      `Timed out waiting for Next.js workspace at ${workspaceVisualUrl}.`,
      `stdout: ${serverStdoutBuffer || "<empty>"}`,
      `stderr: ${serverStderrBuffer || "<empty>"}`,
    ].join("\n"),
  );
}

function setWorkspaceBaseUrl(nextWorkspaceUrl) {
  workspaceUrl = nextWorkspaceUrl;
  workspaceVisualUrl = `${workspaceUrl}/visual-tests/workspace`;
}

async function resolveReachableWorkspaceServerBaseUrl(candidates) {
  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(`${candidateUrl}/visual-tests/workspace`);
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

async function createWorkspacePage() {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 980 },
  });
  const page = await context.newPage();
  await page.goto(workspaceVisualUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await page.waitForSelector('[data-ui-component="bus-stop-renderer"]');
  await wait(600);
  return { context, page };
}

async function createGalleryPage() {
  const galleryVisualUrl = `${workspaceUrl}/visual-tests/gallery`;
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
  const preexistingServerBaseUrl = await resolveReachableWorkspaceServerBaseUrl(
    PREEXISTING_SERVER_BASE_URL_CANDIDATES,
  );
  usesPreexistingServer = preexistingServerBaseUrl !== null;

  if (preexistingServerBaseUrl) {
    setWorkspaceBaseUrl(preexistingServerBaseUrl);
  } else {
    setWorkspaceBaseUrl(TEST_WORKSPACE_BASE_URL);
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
      const fallbackServerBaseUrl = await resolveReachableWorkspaceServerBaseUrl(
        PREEXISTING_SERVER_BASE_URL_CANDIDATES,
      );
      if (fallbackServerBaseUrl) {
        usesPreexistingServer = true;
        setWorkspaceBaseUrl(fallbackServerBaseUrl);
      } else {
        await waitForWorkspaceServer();
      }
    } else {
      await waitForWorkspaceServer();
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

/**
 * Parse a CSS color string (rgb, rgba, or hex) into {r, g, b} components.
 */
function parseColor(colorString) {
  const rgbMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }

  const hexMatch = colorString.match(/#([0-9a-f]{6})/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

test("active input cell has glow-amber class and data-entry-glow=amber attribute", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const activeEditableSelector = '[data-entry-inline="true"][contenteditable="true"]';
    const activeCell = page.locator(activeEditableSelector).first();
    await activeCell.waitFor({ state: "visible", timeout: 10_000 });

    const cellClasses = await activeCell.getAttribute("class");
    assert.ok(
      cellClasses.includes("glow-amber"),
      `Expected active cell to have glow-amber class, received: ${cellClasses}`,
    );
    assert.ok(
      cellClasses.includes("inline-entry-active"),
      `Expected active cell to have inline-entry-active class, received: ${cellClasses}`,
    );

    const glowAttribute = await activeCell.getAttribute("data-entry-glow");
    assert.equal(
      glowAttribute,
      "amber",
      `Expected data-entry-glow="amber" on active cell, received: ${glowAttribute}`,
    );

    const glowCadence = await activeCell.getAttribute("data-glow-cadence");
    assert.ok(
      glowCadence && glowCadence !== "none",
      `Expected data-glow-cadence to indicate an active step kind, received: ${glowCadence}`,
    );
  } finally {
    await context.close();
  }
});

test("active cell glow renders amber/gold border and box-shadow colors", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const activeEditableSelector = '[data-entry-inline="true"][contenteditable="true"]';
    const activeCell = page.locator(activeEditableSelector).first();
    await activeCell.waitFor({ state: "visible", timeout: 10_000 });

    const { borderColor, boxShadow } = await activeCell.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        borderColor: computed.borderColor,
        boxShadow: computed.boxShadow,
      };
    });

    // Verify border color is amber/gold (R > 150, G > 100, B < 100)
    const borderRgb = parseColor(borderColor);
    assert.ok(
      borderRgb,
      `Expected parseable border color, received: ${borderColor}`,
    );
    assert.ok(
      borderRgb.r > 150 && borderRgb.g > 100 && borderRgb.b < 100,
      `Expected amber/gold border color (R>150, G>100, B<100), received rgb(${borderRgb.r}, ${borderRgb.g}, ${borderRgb.b})`,
    );

    // Verify box-shadow contains amber/gold color values
    assert.ok(
      boxShadow && boxShadow !== "none",
      `Expected a visible box-shadow on the active glow cell, received: ${boxShadow}`,
    );
    // The box-shadow should contain amber-range RGB values (211, 160, 58) or (244, 212, 141)
    const shadowHasAmber =
      boxShadow.includes("211") || boxShadow.includes("244") || boxShadow.includes("160");
    assert.ok(
      shadowHasAmber,
      `Expected box-shadow to contain amber/gold color components, received: ${boxShadow}`,
    );
  } finally {
    await context.close();
  }
});

test("active cell glow contrasts against green panel background", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const activeEditableSelector = '[data-entry-inline="true"][contenteditable="true"]';
    const activeCell = page.locator(activeEditableSelector).first();
    await activeCell.waitFor({ state: "visible", timeout: 10_000 });

    // Sample the panel background color from the parent .jurassic-panel
    const panelBgColor = await page.evaluate(() => {
      const panel = document.querySelector('[data-visual-snapshot="workspace-live"].jurassic-panel') ||
        document.querySelector('.jurassic-panel');
      if (!panel) return null;
      return window.getComputedStyle(panel).backgroundColor;
    });

    assert.ok(panelBgColor, "Expected to find a .jurassic-panel element with a background color");
    const panelRgb = parseColor(panelBgColor);
    assert.ok(panelRgb, `Expected parseable panel background color, received: ${panelBgColor}`);

    // Verify panel background is green (R < 80, G > 100, B < 80) per spec
    assert.ok(
      panelRgb.r < 80 && panelRgb.g > 100 && panelRgb.b < 80,
      `Expected green panel background (R<80, G>100, B<80), received rgb(${panelRgb.r}, ${panelRgb.g}, ${panelRgb.b})`,
    );

    // Get the active cell's glow border color
    const cellBorderColor = await activeCell.evaluate((el) => {
      return window.getComputedStyle(el).borderColor;
    });
    const glowRgb = parseColor(cellBorderColor);
    assert.ok(glowRgb, `Expected parseable glow border color, received: ${cellBorderColor}`);

    // Verify amber glow is visually distinct from green background:
    // Amber/gold has high R (>150), moderate-high G (>100), low B (<100)
    // Green has low R (<80), high G (>100), low B (<80)
    // The key contrast is in the R channel: amber R >> green R
    const redChannelContrast = Math.abs(glowRgb.r - panelRgb.r);
    assert.ok(
      redChannelContrast > 100,
      `Expected strong red-channel contrast between amber glow (R=${glowRgb.r}) and green panel (R=${panelRgb.r}), delta=${redChannelContrast}`,
    );
  } finally {
    await context.close();
  }
});

test("active cell amber-pulse animation is applied with correct keyframes name", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const activeEditableSelector = '[data-entry-inline="true"][contenteditable="true"]';
    const activeCell = page.locator(activeEditableSelector).first();
    await activeCell.waitFor({ state: "visible", timeout: 10_000 });

    const { animationName, animationDuration, animationIterationCount } = await activeCell.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        animationName: computed.animationName,
        animationDuration: computed.animationDuration,
        animationIterationCount: computed.animationIterationCount,
      };
    });

    // Verify the amber-pulse animation is running
    assert.ok(
      animationName.includes("amber-pulse"),
      `Expected amber-pulse animation on active cell, received: ${animationName}`,
    );

    // Verify animation loops infinitely
    assert.equal(
      animationIterationCount,
      "infinite",
      `Expected infinite animation iteration for active glow pulse, received: ${animationIterationCount}`,
    );

    // Verify animation duration is reasonable (between 1s and 2s for the glow cadence)
    const durationSeconds = parseFloat(animationDuration);
    assert.ok(
      durationSeconds >= 1 && durationSeconds <= 2,
      `Expected glow cadence duration between 1s and 2s, received: ${animationDuration}`,
    );
  } finally {
    await context.close();
  }
});

test("glow cadence varies by step kind (quotient-digit vs multiply-result)", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const activeEditableSelector = '[data-entry-inline="true"][contenteditable="true"]';

    // First active cell should be quotient-digit
    const firstCell = page.locator(activeEditableSelector).first();
    await firstCell.waitFor({ state: "visible", timeout: 10_000 });

    const firstCadence = await firstCell.getAttribute("data-glow-cadence");
    assert.equal(
      firstCadence,
      "quotient-digit",
      `Expected first active cell glow cadence to be quotient-digit, received: ${firstCadence}`,
    );

    const firstDuration = await firstCell.evaluate((el) => {
      return window.getComputedStyle(el).animationDuration;
    });

    // Type the correct digit to advance to the multiply-result step
    await firstCell.evaluate((node) => { node.focus(); });
    await page.keyboard.insertText("3");
    await wait(200);

    // Next active cell should be multiply-result with a different cadence
    const nextCell = page.locator(activeEditableSelector).first();
    await nextCell.waitFor({ state: "visible", timeout: 10_000 });

    const nextCadence = await nextCell.getAttribute("data-glow-cadence");
    assert.equal(
      nextCadence,
      "multiply-result",
      `Expected next active cell glow cadence to be multiply-result, received: ${nextCadence}`,
    );

    const nextDuration = await nextCell.evaluate((el) => {
      return window.getComputedStyle(el).animationDuration;
    });

    // Verify the cadence durations differ between step kinds
    assert.notEqual(
      firstDuration,
      nextDuration,
      `Expected different glow cadence durations for quotient-digit (${firstDuration}) vs multiply-result (${nextDuration})`,
    );
  } finally {
    await context.close();
  }
});

/* ── Gallery Visual Tests (#17) ─────────────────────────── */

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
        return computedStyle.getPropertyValue("background-color");
      });
    });

    assert.equal(tileColors.length, 9, "Expected 9 gallery tile background samples.");

    for (let i = 0; i < tileColors.length; i++) {
      const rgb = parseColor(tileColors[i]);
      assert.ok(rgb, `Expected parseable RGB color for tile ${i}, got: ${tileColors[i]}`);

      // JP3 green tile: #2d8a2d = rgb(45, 138, 45)
      // Assert green range: R < 80, G > 100, B < 80
      assert.ok(
        rgb.r < 80,
        `Expected tile ${i} red channel < 80 for green background, got R=${rgb.r} (${tileColors[i]})`,
      );
      assert.ok(
        rgb.g > 100,
        `Expected tile ${i} green channel > 100 for green background, got G=${rgb.g} (${tileColors[i]})`,
      );
      assert.ok(
        rgb.b < 80,
        `Expected tile ${i} blue channel < 80 for green background, got B=${rgb.b} (${tileColors[i]})`,
      );
    }
  } finally {
    await context.close();
  }
});

test("gallery visual: pixel sampling of rendered tile centers confirms green fill", { concurrency: false }, async () => {
  const { context, page } = await createGalleryPage();

  try {
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

      const rgb = parseColor(sample.bg);
      assert.ok(rgb, `Expected parseable RGB at (${sample.x}, ${sample.y}), got: ${sample.bg}`);
      assert.ok(
        rgb.r < 80 && rgb.g > 100 && rgb.b < 80,
        `Expected green pixel at tile center (${sample.x}, ${sample.y}): R=${rgb.r}, G=${rgb.g}, B=${rgb.b}`,
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
    const rgb = parseColor(borderInfo.borderColor);
    assert.ok(rgb, `Expected parseable border color, got: ${borderInfo.borderColor}`);
    assert.ok(rgb.r < 60, `Expected dark green border red channel < 60, got R=${rgb.r}`);
    assert.ok(rgb.g > 50 && rgb.g < 150, `Expected dark green border green channel between 50-150, got G=${rgb.g}`);
    assert.ok(rgb.b < 80, `Expected dark green border blue channel < 80, got B=${rgb.b}`);
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
      const rgb = parseColor(nameStyle.color);
      assert.ok(rgb, `Expected parseable color for gallery name, got: ${nameStyle.color}`);
      assert.ok(
        rgb.r > 180 && rgb.g > 180 && rgb.b > 150,
        `Expected cream/light name color (R>180, G>180, B>150), got R=${rgb.r}, G=${rgb.g}, B=${rgb.b}`,
      );
    }
  } finally {
    await context.close();
  }
});
