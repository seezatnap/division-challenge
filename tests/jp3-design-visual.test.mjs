import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const COMP_TARGET_PATH = path.join(repoRoot, "test-comp-targets", "Jp3websitebrachi.webp");
const TEST_BASE_URL = "http://127.0.0.1:4173";
const VISUAL_TEST_DIST_DIR = ".next-visual-tests";
const PREEXISTING_SERVER_BASE_URL_CANDIDATES = [
  TEST_BASE_URL,
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const NEXT_DEV_LOCK_ERROR_FRAGMENT = "Unable to acquire lock";

let appBaseUrl = TEST_BASE_URL;
let serverProcess = null;
let browser = null;
let serverStdoutBuffer = "";
let serverStderrBuffer = "";
let usesPreexistingServer = false;
let visualTestsSkipReason = null;
let resolvedHeadlessShellExecutablePath = null;

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function setAppBaseUrl(nextAppBaseUrl) {
  appBaseUrl = nextAppBaseUrl;
}

async function waitForAppServer(timeoutMilliseconds = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const response = await fetch(appBaseUrl);
      if (response.ok) {
        return;
      }
    } catch {}

    await wait(300);
  }

  throw new Error(
    [
      `Timed out waiting for Next.js app at ${appBaseUrl}.`,
      `stdout: ${serverStdoutBuffer || "<empty>"}`,
      `stderr: ${serverStderrBuffer || "<empty>"}`,
    ].join("\n"),
  );
}

async function resolveReachableServerBaseUrl(candidates) {
  for (const candidateUrl of candidates) {
    try {
      const response = await fetch(candidateUrl);
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

async function waitForChildExit(childProcess, timeoutMilliseconds) {
  if (childProcess.exitCode !== null) {
    return true;
  }

  return Promise.race([
    new Promise((resolve) => {
      childProcess.once("exit", () => resolve(true));
    }),
    wait(timeoutMilliseconds).then(() => childProcess.exitCode !== null),
  ]);
}

async function stopServerProcess() {
  if (!serverProcess || serverProcess.exitCode !== null) {
    return;
  }

  serverProcess.kill("SIGTERM");
  const didExitGracefully = await waitForChildExit(serverProcess, 5_000);

  if (!didExitGracefully) {
    serverProcess.kill("SIGKILL");
    await waitForChildExit(serverProcess, 5_000);
  }
}

async function createStartedHomePage() {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 980 },
  });
  const page = await context.newPage();
  await page.goto(`${appBaseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const playerStartSurface = page.locator('[data-ui-surface="player-start"]');
  if ((await playerStartSurface.count()) > 0) {
    const uniqueVisualPlayerName = `jp3-visual-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    await page.fill("#game-start-player-name", uniqueVisualPlayerName);
    await page.click('[data-ui-action="start-session"]');
  }

  await page.waitForSelector('[data-ui-surface="game"]');
  await page.waitForSelector('[data-ui-surface="gallery"]');
  await page.waitForSelector('[data-ui-surface="hybrid-gallery"]');
  await page.waitForSelector('[data-ui-surface="surveillance-toolbar"]');
  await wait(650);

  return { context, page };
}

function paethPredictor(left, up, upLeft) {
  const p = left + up - upLeft;
  const distanceToLeft = Math.abs(p - left);
  const distanceToUp = Math.abs(p - up);
  const distanceToUpLeft = Math.abs(p - upLeft);

  if (distanceToLeft <= distanceToUp && distanceToLeft <= distanceToUpLeft) {
    return left;
  }
  if (distanceToUp <= distanceToUpLeft) {
    return up;
  }
  return upLeft;
}

function decodePngToRgba(pngBuffer) {
  assert.equal(
    pngBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    true,
    "Expected screenshot data to be a PNG buffer.",
  );

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compressionMethod = 0;
  let filterMethod = 0;
  let interlaceMethod = 0;
  const idatChunks = [];

  while (offset < pngBuffer.length) {
    const chunkLength = pngBuffer.readUInt32BE(offset);
    offset += 4;
    const chunkType = pngBuffer.toString("ascii", offset, offset + 4);
    offset += 4;
    const chunkData = pngBuffer.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    offset += 4;

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData.readUInt8(8);
      colorType = chunkData.readUInt8(9);
      compressionMethod = chunkData.readUInt8(10);
      filterMethod = chunkData.readUInt8(11);
      interlaceMethod = chunkData.readUInt8(12);
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  assert.ok(width > 0 && height > 0, "Expected PNG dimensions to be available.");
  assert.equal(bitDepth, 8, `Expected 8-bit PNG screenshots, received bit depth ${bitDepth}.`);
  assert.ok(
    colorType === 2 || colorType === 6,
    `Expected RGB/RGBA PNG screenshots, received color type ${colorType}.`,
  );
  assert.equal(compressionMethod, 0, "Expected PNG compression method 0.");
  assert.equal(filterMethod, 0, "Expected PNG filter method 0.");
  assert.equal(interlaceMethod, 0, "Expected PNG screenshots to be non-interlaced.");

  const compressedImageData = Buffer.concat(idatChunks);
  const scanlineData = inflateSync(compressedImageData);
  const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
  const sourceStride = width * sourceBytesPerPixel;
  const expectedLength = (sourceStride + 1) * height;
  assert.equal(
    scanlineData.length,
    expectedLength,
    `Unexpected PNG scanline length. Expected ${expectedLength}, received ${scanlineData.length}.`,
  );

  const sourceData = Buffer.alloc(sourceStride * height);
  let scanlineOffset = 0;

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filterType = scanlineData.readUInt8(scanlineOffset);
    scanlineOffset += 1;

    for (let byteIndex = 0; byteIndex < sourceStride; byteIndex += 1) {
      const rawByte = scanlineData.readUInt8(scanlineOffset);
      scanlineOffset += 1;

      const currentOffset = rowIndex * sourceStride + byteIndex;
      const left = byteIndex >= sourceBytesPerPixel ? sourceData[currentOffset - sourceBytesPerPixel] : 0;
      const up = rowIndex > 0 ? sourceData[currentOffset - sourceStride] : 0;
      const upLeft =
        rowIndex > 0 && byteIndex >= sourceBytesPerPixel
          ? sourceData[currentOffset - sourceStride - sourceBytesPerPixel]
          : 0;

      if (filterType === 0) {
        sourceData[currentOffset] = rawByte;
      } else if (filterType === 1) {
        sourceData[currentOffset] = (rawByte + left) & 0xff;
      } else if (filterType === 2) {
        sourceData[currentOffset] = (rawByte + up) & 0xff;
      } else if (filterType === 3) {
        sourceData[currentOffset] = (rawByte + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        sourceData[currentOffset] = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
    }
  }

  const rgbaData = Buffer.alloc(width * height * 4);
  if (colorType === 6) {
    sourceData.copy(rgbaData);
  } else {
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const sourceOffset = pixelIndex * 3;
      const rgbaOffset = pixelIndex * 4;
      rgbaData[rgbaOffset] = sourceData[sourceOffset];
      rgbaData[rgbaOffset + 1] = sourceData[sourceOffset + 1];
      rgbaData[rgbaOffset + 2] = sourceData[sourceOffset + 2];
      rgbaData[rgbaOffset + 3] = 255;
    }
  }

  return { width, height, rgbaData };
}

function clampPixelCoordinate(value, maxInclusive) {
  return Math.max(0, Math.min(maxInclusive, Math.round(value)));
}

function readPixel(image, x, y) {
  const clampedX = clampPixelCoordinate(x, image.width - 1);
  const clampedY = clampPixelCoordinate(y, image.height - 1);
  const pixelOffset = (clampedY * image.width + clampedX) * 4;
  return {
    r: image.rgbaData[pixelOffset],
    g: image.rgbaData[pixelOffset + 1],
    b: image.rgbaData[pixelOffset + 2],
    a: image.rgbaData[pixelOffset + 3],
  };
}

function sampleAverageRgb(image, x, y, radius = 2) {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let sampleCount = 0;
  const centerX = Math.round(x);
  const centerY = Math.round(y);

  for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
    for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
      const sample = readPixel(image, centerX + xOffset, centerY + yOffset);
      redTotal += sample.r;
      greenTotal += sample.g;
      blueTotal += sample.b;
      sampleCount += 1;
    }
  }

  return {
    r: Math.round(redTotal / sampleCount),
    g: Math.round(greenTotal / sampleCount),
    b: Math.round(blueTotal / sampleCount),
  };
}

function colorDistance(leftColor, rightColor) {
  return (
    Math.abs(leftColor.r - rightColor.r) +
    Math.abs(leftColor.g - rightColor.g) +
    Math.abs(leftColor.b - rightColor.b)
  );
}

function shouldSkipVisualTest(t) {
  if (!visualTestsSkipReason) {
    return false;
  }

  t.skip(visualTestsSkipReason);
  return true;
}

test.before(async () => {
  serverStdoutBuffer = "";
  serverStderrBuffer = "";
  visualTestsSkipReason = null;
  resolvedHeadlessShellExecutablePath = null;

  if (!(await fileExists(COMP_TARGET_PATH))) {
    visualTestsSkipReason = "JP3 visual tests skipped: missing test-comp-targets/Jp3websitebrachi.webp.";
    return;
  }

  try {
    resolvedHeadlessShellExecutablePath = await resolveHeadlessShellExecutablePath();
  } catch (error) {
    visualTestsSkipReason =
      error instanceof Error
        ? `JP3 visual tests skipped: ${error.message}`
        : "JP3 visual tests skipped: Chromium headless shell is unavailable.";
    return;
  }

  const preexistingServerBaseUrl = await resolveReachableServerBaseUrl(
    PREEXISTING_SERVER_BASE_URL_CANDIDATES,
  );
  usesPreexistingServer = preexistingServerBaseUrl !== null;

  if (preexistingServerBaseUrl) {
    setAppBaseUrl(preexistingServerBaseUrl);
  } else {
    setAppBaseUrl(TEST_BASE_URL);
    const nextDevExecutable = path.join(repoRoot, "node_modules", ".bin", "next");
    serverProcess = spawn(nextDevExecutable, ["dev", "--port", "4173", "--hostname", "127.0.0.1"], {
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
        setAppBaseUrl(fallbackServerBaseUrl);
      } else {
        await waitForAppServer();
      }
    } else {
      await waitForAppServer();
    }
  }

  browser = await chromium.launch({
    headless: true,
    executablePath: resolvedHeadlessShellExecutablePath,
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

test("JP3 frame border remains visible on all four sides in full-page screenshot", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    const frameThicknessPixels = await page.evaluate(() => {
      const frameProbe = document.createElement("div");
      frameProbe.style.position = "fixed";
      frameProbe.style.left = "-1000px";
      frameProbe.style.top = "-1000px";
      frameProbe.style.width = "var(--jp-frame-thickness)";
      frameProbe.style.height = "1px";
      frameProbe.style.pointerEvents = "none";
      document.body.append(frameProbe);
      const resolvedWidth = frameProbe.getBoundingClientRect().width;
      frameProbe.remove();
      return resolvedWidth;
    });

    const fullPagePngBuffer = await page.screenshot({ fullPage: true, type: "png" });
    assert.ok(fullPagePngBuffer.length > 0, "Expected a non-empty full-page screenshot for frame verification.");
    const screenshot = decodePngToRgba(fullPagePngBuffer);
    const frameSampleOffset = Math.max(3, Math.floor(frameThicknessPixels * 0.45));
    const interiorCenterColor = sampleAverageRgb(
      screenshot,
      screenshot.width / 2,
      screenshot.height * 0.45,
      8,
    );

    const sideSamplePlan = [
      {
        side: "top",
        frameX: screenshot.width / 2,
        frameY: frameSampleOffset,
      },
      {
        side: "bottom",
        frameX: screenshot.width / 2,
        frameY: screenshot.height - 1 - frameSampleOffset,
      },
      {
        side: "left",
        frameX: frameSampleOffset,
        frameY: screenshot.height / 2,
      },
      {
        side: "right",
        frameX: screenshot.width - 1 - frameSampleOffset,
        frameY: screenshot.height / 2,
      },
    ];

    for (const samplePlan of sideSamplePlan) {
      const frameColor = sampleAverageRgb(
        screenshot,
        samplePlan.frameX,
        samplePlan.frameY,
        3,
      );

      assert.ok(
        colorDistance(frameColor, interiorCenterColor) > 20,
        `Expected visible ${samplePlan.side} frame edge in screenshot; frame sample ${JSON.stringify(frameColor)} center sample ${JSON.stringify(interiorCenterColor)}.`,
      );
      assert.ok(
        !(frameColor.r < 80 && frameColor.g > 100 && frameColor.b < 80),
        `Expected ${samplePlan.side} frame sample to differ from JP3 panel-green tones; received ${JSON.stringify(frameColor)}.`,
      );
    }
  } finally {
    await context.close();
  }
});

test("JP3 panel centers sample to the comp's green range", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    const fullPagePngBuffer = await page.screenshot({ fullPage: true, type: "png" });
    const screenshot = decodePngToRgba(fullPagePngBuffer);
    const panelCenters = await page.evaluate(() => {
      const panelSelectors = [
        '[data-ui-surface="game"]',
        '[data-ui-surface="gallery"]',
        '[data-ui-surface="hybrid-gallery"]',
      ];

      return panelSelectors.map((selector) => {
        const panel = document.querySelector(selector);
        if (!panel) {
          return {
            selector,
            centerX: null,
            centerY: null,
            width: null,
            height: null,
          };
        }

        const panelRect = panel.getBoundingClientRect();
        return {
          selector,
          centerX: panelRect.left + window.scrollX + panelRect.width / 2,
          centerY: panelRect.top + window.scrollY + panelRect.height / 2,
          width: panelRect.width,
          height: panelRect.height,
        };
      });
    });

    for (const panelCenter of panelCenters) {
      assert.notEqual(panelCenter.centerX, null, `Missing panel center for selector ${panelCenter.selector}.`);
      assert.notEqual(panelCenter.centerY, null, `Missing panel center for selector ${panelCenter.selector}.`);
      assert.notEqual(panelCenter.width, null, `Missing panel width for selector ${panelCenter.selector}.`);
      assert.notEqual(panelCenter.height, null, `Missing panel height for selector ${panelCenter.selector}.`);

      const candidateOffsets = [
        { x: 0, y: 0 },
        { x: panelCenter.width * 0.14, y: panelCenter.height * 0.14 },
        { x: -panelCenter.width * 0.14, y: panelCenter.height * 0.14 },
        { x: 0, y: panelCenter.height * 0.22 },
      ];
      const centerRegionSamples = candidateOffsets.map((offset) =>
        sampleAverageRgb(
          screenshot,
          panelCenter.centerX + offset.x,
          panelCenter.centerY + offset.y,
          10,
        ),
      );
      const hasGreenCenterRegionSample = centerRegionSamples.some(
        (sample) => sample.r < 80 && sample.g > 100 && sample.b < 80,
      );
      assert.ok(
        hasGreenCenterRegionSample,
        `Expected panel center region color for ${panelCenter.selector} to be JP3 green-like; received ${JSON.stringify(centerRegionSamples)}.`,
      );
    }
  } finally {
    await context.close();
  }
});

test("JP3 bottom toolbar is dark and includes SURVEILLANCE DEVICE label", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    const toolbarLocator = page.locator('[data-ui-surface="surveillance-toolbar"]');
    await toolbarLocator.waitFor({ state: "visible" });

    const toolbarLabelText = await toolbarLocator.locator(".surveillance-toolbar-label").innerText();
    assert.ok(
      toolbarLabelText.toUpperCase().includes("SURVEILLANCE DEVICE"),
      `Expected surveillance toolbar label to include \"SURVEILLANCE DEVICE\", received: ${toolbarLabelText}`,
    );

    const toolbarBox = await toolbarLocator.boundingBox();
    assert.ok(toolbarBox, "Expected surveillance toolbar to have a measurable bounding box.");

    const viewportPngBuffer = await page.screenshot({ type: "png" });
    const screenshot = decodePngToRgba(viewportPngBuffer);
    const toolbarColorSample = sampleAverageRgb(
      screenshot,
      toolbarBox.x + toolbarBox.width * 0.5,
      toolbarBox.y + toolbarBox.height * 0.22,
      6,
    );
    assert.ok(
      toolbarColorSample.r < 95 && toolbarColorSample.g < 95 && toolbarColorSample.b < 95,
      `Expected surveillance toolbar to be dark-colored; sampled ${JSON.stringify(toolbarColorSample)}.`,
    );
  } finally {
    await context.close();
  }
});
