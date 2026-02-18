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
const APP_SERVER_PROBE_PATH = "/visual-tests/workspace";
const APP_SERVER_PROBE_MARKERS = Object.freeze([
  'data-visual-snapshot="workspace-live"',
  'data-visual-snapshot="workspace-solved"',
]);
const ACTIVE_EDITABLE_SELECTOR =
  '[data-ui-component="bus-stop-renderer"] [data-entry-inline="true"][contenteditable="true"]';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const NEXT_DEV_LOCK_ERROR_FRAGMENT = "Unable to acquire lock";
const DINO_GALLERY_REWARDS_UPDATED_EVENT = "dino-gallery:rewards-updated";
const GALLERY_THUMBNAIL_IMAGE_PATH = "/window.svg";
const GALLERY_3_X_3_DINOSAUR_NAMES = Object.freeze([
  "Brachiosaurus",
  "Velociraptor",
  "Triceratops",
  "Stegosaurus",
  "Parasaurolophus",
  "Ankylosaurus",
  "Gallimimus",
  "Dilophosaurus",
  "Compsognathus",
]);

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

function toProbeUrl(candidateBaseUrl) {
  return `${candidateBaseUrl.replace(/\/+$/, "")}${APP_SERVER_PROBE_PATH}`;
}

async function isReachableAppServer(candidateBaseUrl) {
  try {
    const response = await fetch(toProbeUrl(candidateBaseUrl));
    if (!response.ok) {
      return false;
    }

    const serverRenderedMarkup = await response.text();
    return APP_SERVER_PROBE_MARKERS.every((marker) => serverRenderedMarkup.includes(marker));
  } catch {
    return false;
  }
}

async function waitForAppServer(timeoutMilliseconds = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMilliseconds) {
    if (await isReachableAppServer(appBaseUrl)) {
      return;
    }

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
    if (await isReachableAppServer(candidateUrl)) {
      return candidateUrl;
    }
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

async function seedGalleryWithVisualRewards(page, rewardCount = 9) {
  await page.evaluate(
    ({ eventName, imagePath, rewardNames, count }) => {
      const baseRewardTimestamp = Date.parse("2026-01-01T00:00:00.000Z");
      const unlockedRewards = Array.from({ length: count }, (_, index) => {
        const rewardNumber = index + 1;

        return {
          rewardId: `visual-reward-${rewardNumber}`,
          dinosaurName: rewardNames[index % rewardNames.length],
          imagePath,
          earnedAt: new Date(baseRewardTimestamp + index * 86_400_000).toISOString(),
          milestoneSolvedCount: rewardNumber * 5,
        };
      });

      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: { unlockedRewards },
        }),
      );
    },
    {
      eventName: DINO_GALLERY_REWARDS_UPDATED_EVENT,
      imagePath: GALLERY_THUMBNAIL_IMAGE_PATH,
      rewardNames: GALLERY_3_X_3_DINOSAUR_NAMES,
      count: rewardCount,
    },
  );

  await page.waitForFunction(
    (minimumCardCount) =>
      document.querySelectorAll('[data-ui-surface="gallery"] .gallery-shell-research-center .gallery-card')
        .length >= minimumCardCount,
    rewardCount,
  );
  await wait(150);
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

function clampRgbChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseCssColorToRgb(colorValue) {
  if (typeof colorValue !== "string") {
    return null;
  }

  const normalizedColorValue = colorValue.trim().toLowerCase();
  if (!normalizedColorValue) {
    return null;
  }

  const fullHexMatch = normalizedColorValue.match(/^#([0-9a-f]{6})$/i);
  if (fullHexMatch) {
    const hexValue = fullHexMatch[1];
    return {
      r: Number.parseInt(hexValue.slice(0, 2), 16),
      g: Number.parseInt(hexValue.slice(2, 4), 16),
      b: Number.parseInt(hexValue.slice(4, 6), 16),
    };
  }

  const shortHexMatch = normalizedColorValue.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const [rHex, gHex, bHex] = shortHexMatch[1].split("");
    return {
      r: Number.parseInt(`${rHex}${rHex}`, 16),
      g: Number.parseInt(`${gHex}${gHex}`, 16),
      b: Number.parseInt(`${bHex}${bHex}`, 16),
    };
  }

  const commaRgbMatch = normalizedColorValue.match(
    /^rgba?\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*,\s*(-?[0-9]+(?:\.[0-9]+)?)\s*,\s*(-?[0-9]+(?:\.[0-9]+)?)(?:\s*,\s*[0-9]+(?:\.[0-9]+)?\s*)?\)$/i,
  );
  if (commaRgbMatch) {
    return {
      r: clampRgbChannel(Number.parseFloat(commaRgbMatch[1])),
      g: clampRgbChannel(Number.parseFloat(commaRgbMatch[2])),
      b: clampRgbChannel(Number.parseFloat(commaRgbMatch[3])),
    };
  }

  const spaceRgbMatch = normalizedColorValue.match(
    /^rgba?\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s+(-?[0-9]+(?:\.[0-9]+)?)\s+(-?[0-9]+(?:\.[0-9]+)?)(?:\s*\/\s*[0-9]+(?:\.[0-9]+)?%?\s*)?\)$/i,
  );
  if (spaceRgbMatch) {
    return {
      r: clampRgbChannel(Number.parseFloat(spaceRgbMatch[1])),
      g: clampRgbChannel(Number.parseFloat(spaceRgbMatch[2])),
      b: clampRgbChannel(Number.parseFloat(spaceRgbMatch[3])),
    };
  }

  const srgbColorMatch = normalizedColorValue.match(
    /^color\(srgb\s+(-?[0-9]+(?:\.[0-9]+)?)\s+(-?[0-9]+(?:\.[0-9]+)?)\s+(-?[0-9]+(?:\.[0-9]+)?)(?:\s*\/\s*[0-9]+(?:\.[0-9]+)?)?\)$/i,
  );
  if (srgbColorMatch) {
    return {
      r: clampRgbChannel(Number.parseFloat(srgbColorMatch[1]) * 255),
      g: clampRgbChannel(Number.parseFloat(srgbColorMatch[2]) * 255),
      b: clampRgbChannel(Number.parseFloat(srgbColorMatch[3]) * 255),
    };
  }

  return null;
}

function extractRgbColorsFromCssValue(cssValue) {
  if (typeof cssValue !== "string") {
    return [];
  }

  const colorMatches =
    cssValue.match(/(?:rgba?\([^)]+\)|color\(srgb[^)]+\)|#[0-9a-f]{3,8})/gi) ?? [];
  const parsedColors = [];

  for (const colorMatch of colorMatches) {
    const parsedColor = parseCssColorToRgb(colorMatch);
    if (parsedColor) {
      parsedColors.push(parsedColor);
    }
  }

  return parsedColors;
}

function toLinearSrgbChannel(channel) {
  const normalizedChannel = channel / 255;
  if (normalizedChannel <= 0.04045) {
    return normalizedChannel / 12.92;
  }

  return ((normalizedChannel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color) {
  return (
    0.2126 * toLinearSrgbChannel(color.r) +
    0.7152 * toLinearSrgbChannel(color.g) +
    0.0722 * toLinearSrgbChannel(color.b)
  );
}

function contrastRatio(leftColor, rightColor) {
  const leftLuminance = relativeLuminance(leftColor);
  const rightLuminance = relativeLuminance(rightColor);
  const brighterLuminance = Math.max(leftLuminance, rightLuminance);
  const darkerLuminance = Math.min(leftLuminance, rightLuminance);
  return (brighterLuminance + 0.05) / (darkerLuminance + 0.05);
}

function normalizeFontFamily(fontFamilyValue) {
  return String(fontFamilyValue)
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolvePrimaryFontFamily(fontFamilyValue) {
  const [primaryFontFamily = ""] = String(fontFamilyValue).split(",");
  return normalizeFontFamily(primaryFontFamily);
}

function countDistinctCoordinateBands(values, tolerancePixels = 3) {
  const sortedValues = [...values].sort((leftValue, rightValue) => leftValue - rightValue);
  const bandAnchors = [];

  for (const value of sortedValues) {
    const hasExistingBand = bandAnchors.some(
      (anchor) => Math.abs(value - anchor) <= tolerancePixels,
    );
    if (!hasExistingBand) {
      bandAnchors.push(value);
    }
  }

  return bandAnchors.length;
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

test("JP3 gallery renders a comp-like 3x3 grid with dinosaur thumbnails on green tiles", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    await seedGalleryWithVisualRewards(page, 9);

    const galleryGridLocator = page.locator(
      '[data-ui-surface="gallery"] .gallery-shell-research-center .gallery-grid',
    );
    await galleryGridLocator.waitFor({ state: "visible" });

    const galleryGridSnapshot = await page.evaluate(() => {
      const grid = document.querySelector('[data-ui-surface="gallery"] .gallery-shell-research-center .gallery-grid');
      if (!grid) {
        return null;
      }

      const computedStyle = window.getComputedStyle(grid);
      const cards = Array.from(grid.querySelectorAll(".gallery-card"));
      const thumbs = Array.from(grid.querySelectorAll(".gallery-thumb"));
      const thumbnails = Array.from(grid.querySelectorAll(".gallery-image"));

      const sampleCards = cards.slice(0, 9);
      const sampleThumbs = thumbs.slice(0, 9);
      const sampleThumbnails = thumbnails.slice(0, 9);

      return {
        columnCountFromTemplate: computedStyle.gridTemplateColumns
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean).length,
        totalCardCount: cards.length,
        totalThumbCount: thumbs.length,
        sampleCardCoordinates: sampleCards.map((card) => {
          const rectangle = card.getBoundingClientRect();
          return {
            x: rectangle.left,
            y: rectangle.top,
          };
        }),
        sampleThumbBoxes: sampleThumbs.map((thumb) => {
          const rectangle = thumb.getBoundingClientRect();
          return {
            x: rectangle.left + window.scrollX,
            y: rectangle.top + window.scrollY,
            width: rectangle.width,
            height: rectangle.height,
          };
        }),
        sampleThumbnailAlts: sampleThumbnails.map((thumbnail) => thumbnail.getAttribute("alt") ?? ""),
      };
    });

    assert.ok(galleryGridSnapshot, "Expected to capture gallery grid metrics.");
    assert.ok(
      galleryGridSnapshot.totalCardCount >= 9,
      `Expected at least 9 gallery cards for 3x3 comp validation, received ${galleryGridSnapshot.totalCardCount}.`,
    );
    assert.ok(
      galleryGridSnapshot.totalThumbCount >= 9,
      `Expected at least 9 gallery thumbnails for 3x3 comp validation, received ${galleryGridSnapshot.totalThumbCount}.`,
    );
    assert.equal(
      galleryGridSnapshot.columnCountFromTemplate,
      3,
      `Expected JP3 gallery grid template to resolve to 3 columns, received ${galleryGridSnapshot.columnCountFromTemplate}.`,
    );

    const columnBands = countDistinctCoordinateBands(
      galleryGridSnapshot.sampleCardCoordinates.map((coordinate) => coordinate.x),
    );
    const rowBands = countDistinctCoordinateBands(
      galleryGridSnapshot.sampleCardCoordinates.map((coordinate) => coordinate.y),
    );

    assert.equal(columnBands, 3, `Expected a 3-column gallery card arrangement, received ${columnBands} columns.`);
    assert.equal(rowBands, 3, `Expected a 3-row gallery card arrangement for the first nine cards, received ${rowBands} rows.`);
    assert.ok(
      galleryGridSnapshot.sampleThumbnailAlts.every((altText) =>
        altText.toLowerCase().includes("unlocked reward image"),
      ),
      `Expected gallery thumbnails to render dinosaur reward images; received alt text samples ${JSON.stringify(galleryGridSnapshot.sampleThumbnailAlts)}.`,
    );

    const viewportPngBuffer = await page.screenshot({ fullPage: true, type: "png" });
    const screenshot = decodePngToRgba(viewportPngBuffer);
    const tileGreenSampleSummaries = galleryGridSnapshot.sampleThumbBoxes.map((thumbBox, index) => {
      const leftFlankSample = sampleAverageRgb(
        screenshot,
        thumbBox.x + thumbBox.width * 0.1,
        thumbBox.y + thumbBox.height * 0.5,
        2,
      );
      const rightFlankSample = sampleAverageRgb(
        screenshot,
        thumbBox.x + thumbBox.width * 0.9,
        thumbBox.y + thumbBox.height * 0.5,
        2,
      );
      const candidateSamples = [leftFlankSample, rightFlankSample];
      const hasGreenTileSample = candidateSamples.some(
        (sample) => sample.r < 80 && sample.g > 100 && sample.b < 80,
      );

      assert.ok(
        hasGreenTileSample,
        `Expected gallery tile ${index + 1} to include JP3 green background samples; received ${JSON.stringify(candidateSamples)}.`,
      );

      return candidateSamples;
    });

    assert.equal(
      tileGreenSampleSummaries.length,
      9,
      `Expected nine gallery tile sample summaries, received ${tileGreenSampleSummaries.length}.`,
    );
  } finally {
    await context.close();
  }
});

test("JP3 workspace text stays light on green panels with accessible contrast", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    const workspaceTypographySnapshot = await page.evaluate(() => {
      const workspaceRenderer = document.querySelector('[data-ui-component="bus-stop-renderer"]');
      const workspacePanel = workspaceRenderer?.closest(".workspace-paper") ?? null;
      const rootStyle = getComputedStyle(document.documentElement);
      const workspaceTextSelectors = [
        ".workspace-label",
        ".divisor-cell",
        ".dividend-digit",
        ".work-row-op",
        ".work-row-value",
      ];

      const textSamples = workspaceTextSelectors.map((selector) => {
        const element = workspaceRenderer?.querySelector(selector);
        if (!element) {
          return {
            selector,
            found: false,
            text: "",
            color: "",
          };
        }

        return {
          selector,
          found: true,
          text: (element.textContent ?? "").trim(),
          color: getComputedStyle(element).color,
        };
      });

      return {
        panelBackgroundToken: rootStyle.getPropertyValue("--jp-panel-bg").trim(),
        panelTextToken: rootStyle.getPropertyValue("--jp-panel-text").trim(),
        workspacePanelBackgroundColor: workspacePanel ? getComputedStyle(workspacePanel).backgroundColor : "",
        textSamples,
      };
    });

    const panelBackgroundColor = parseCssColorToRgb(workspaceTypographySnapshot.panelBackgroundToken);
    assert.ok(
      panelBackgroundColor,
      `Expected --jp-panel-bg to resolve to a parseable color; received ${workspaceTypographySnapshot.panelBackgroundToken}.`,
    );
    assert.ok(
      panelBackgroundColor.r < 80 && panelBackgroundColor.g > 100 && panelBackgroundColor.b < 80,
      `Expected --jp-panel-bg to remain JP3 green; received ${JSON.stringify(panelBackgroundColor)}.`,
    );

    const panelTextTokenColor = parseCssColorToRgb(workspaceTypographySnapshot.panelTextToken);
    assert.ok(
      panelTextTokenColor,
      `Expected --jp-panel-text to resolve to a parseable color; received ${workspaceTypographySnapshot.panelTextToken}.`,
    );
    assert.ok(
      panelTextTokenColor.r > 180 && panelTextTokenColor.g > 180 && panelTextTokenColor.b > 150,
      `Expected --jp-panel-text to remain light-colored for contrast; received ${JSON.stringify(panelTextTokenColor)}.`,
    );

    const discoveredSamples = workspaceTypographySnapshot.textSamples.filter((sample) => sample.found);
    assert.ok(
      discoveredSamples.length >= 4,
      `Expected at least four workspace text samples; received ${discoveredSamples.length}.`,
    );

    for (const sample of discoveredSamples) {
      const textColor = parseCssColorToRgb(sample.color);
      assert.ok(textColor, `Expected parseable color for ${sample.selector}; received ${sample.color}.`);

      const sampleContrastRatio = contrastRatio(textColor, panelBackgroundColor);
      assert.ok(
        textColor.r > 160 && textColor.g > 160 && textColor.b > 140,
        `Expected ${sample.selector} to render light-colored text; received ${JSON.stringify(textColor)}.`,
      );
      assert.ok(
        sampleContrastRatio >= 4.4,
        `Expected ${sample.selector} contrast against JP3 panel green to be at least 4.4:1; received ${sampleContrastRatio.toFixed(2)}.`,
      );
    }
  } finally {
    await context.close();
  }
});

test("JP3 active input cell glow stays amber/gold against the green workspace panel", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    await page.waitForSelector(ACTIVE_EDITABLE_SELECTOR, { state: "visible" });
    await wait(220);

    const activeGlowSnapshot = await page.evaluate((activeEditableSelector) => {
      const activeCell = document.querySelector(activeEditableSelector);
      const workspaceRenderer = document.querySelector('[data-ui-component="bus-stop-renderer"]');
      const workspacePanel = activeCell?.closest(".workspace-paper") ?? workspaceRenderer ?? null;
      const rootStyle = getComputedStyle(document.documentElement);
      const activeCellStyle = activeCell ? getComputedStyle(activeCell) : null;

      return {
        hasActiveCell: Boolean(activeCell),
        hasWorkspacePanel: Boolean(workspacePanel),
        hasGlowAmberClass: activeCell?.classList.contains("glow-amber") ?? false,
        dataEntryGlow: activeCell?.getAttribute("data-entry-glow") ?? "",
        dataGlowCadence: activeCell?.getAttribute("data-glow-cadence") ?? "",
        activeCellBorderColor: activeCellStyle?.borderColor ?? "",
        activeCellBoxShadow: activeCellStyle?.boxShadow ?? "",
        workspacePanelBackgroundColor: workspacePanel ? getComputedStyle(workspacePanel).backgroundColor : "",
        panelBackgroundToken: rootStyle.getPropertyValue("--jp-panel-bg").trim(),
        amberToken: rootStyle.getPropertyValue("--jp-amber").trim(),
        amberBrightToken: rootStyle.getPropertyValue("--jp-amber-bright").trim(),
      };
    }, ACTIVE_EDITABLE_SELECTOR);

    assert.equal(activeGlowSnapshot.hasActiveCell, true, "Expected one active editable workspace cell.");
    assert.equal(activeGlowSnapshot.hasWorkspacePanel, true, "Expected active cell to render within workspace panel.");
    assert.equal(
      activeGlowSnapshot.hasGlowAmberClass,
      true,
      "Expected active editable workspace cell to keep the glow-amber class.",
    );
    assert.equal(
      activeGlowSnapshot.dataEntryGlow,
      "amber",
      `Expected active editable workspace cell data-entry-glow=\"amber\", received ${activeGlowSnapshot.dataEntryGlow}.`,
    );
    assert.notEqual(
      activeGlowSnapshot.dataGlowCadence,
      "none",
      "Expected active editable workspace cell to expose a non-none glow cadence.",
    );

    const panelBackgroundColor =
      parseCssColorToRgb(activeGlowSnapshot.panelBackgroundToken) ??
      parseCssColorToRgb(activeGlowSnapshot.workspacePanelBackgroundColor);
    assert.ok(
      panelBackgroundColor,
      `Expected workspace panel background color to be parseable; received token ${activeGlowSnapshot.panelBackgroundToken} and computed color ${activeGlowSnapshot.workspacePanelBackgroundColor}.`,
    );
    assert.ok(
      panelBackgroundColor.r < 80 && panelBackgroundColor.g > 100 && panelBackgroundColor.b < 80,
      `Expected workspace panel to remain JP3 green-like; received ${JSON.stringify(panelBackgroundColor)}.`,
    );

    const amberTokenColor = parseCssColorToRgb(activeGlowSnapshot.amberToken);
    const amberBrightTokenColor = parseCssColorToRgb(activeGlowSnapshot.amberBrightToken);
    assert.ok(
      amberTokenColor,
      `Expected --jp-amber to resolve to a parseable color; received ${activeGlowSnapshot.amberToken}.`,
    );
    assert.ok(
      amberBrightTokenColor,
      `Expected --jp-amber-bright to resolve to a parseable color; received ${activeGlowSnapshot.amberBrightToken}.`,
    );

    const glowColors = [
      ...extractRgbColorsFromCssValue(activeGlowSnapshot.activeCellBorderColor),
      ...extractRgbColorsFromCssValue(activeGlowSnapshot.activeCellBoxShadow),
    ];
    assert.ok(
      glowColors.length > 0,
      `Expected parseable glow colors from active-cell styles; received border ${activeGlowSnapshot.activeCellBorderColor} and box-shadow ${activeGlowSnapshot.activeCellBoxShadow}.`,
    );

    const hasAmberLikeGlowColor = glowColors.some(
      (color) => color.r > color.b && color.g > color.b && color.r >= 120 && color.g >= 95,
    );
    assert.ok(
      hasAmberLikeGlowColor,
      `Expected active glow colors to stay amber/gold-like; received ${JSON.stringify(glowColors)}.`,
    );

    const closestAmberDistance = Math.min(
      ...glowColors.flatMap((color) => [
        colorDistance(color, amberTokenColor),
        colorDistance(color, amberBrightTokenColor),
      ]),
    );
    assert.ok(
      closestAmberDistance <= 210,
      `Expected active glow colors to stay close to amber token values; closest distance was ${closestAmberDistance} for ${JSON.stringify(glowColors)}.`,
    );

    const isGlowDistinctFromGreenPanel = glowColors.some(
      (color) => colorDistance(color, panelBackgroundColor) >= 80,
    );
    assert.ok(
      isGlowDistinctFromGreenPanel,
      `Expected active glow colors to visually separate from panel green; glow colors ${JSON.stringify(glowColors)}, panel ${JSON.stringify(panelBackgroundColor)}.`,
    );
  } finally {
    await context.close();
  }
});

test("JP3 typography keeps serif headings and sans-serif body copy", { concurrency: false }, async (t) => {
  if (shouldSkipVisualTest(t)) {
    return;
  }

  const { context, page } = await createStartedHomePage();

  try {
    const typographySnapshot = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = getComputedStyle(document.documentElement);
      const headingSelectors = [
        ".hero-title",
        '[data-ui-surface="game"] .surface-title',
        '[data-ui-surface="gallery"] .surface-title',
      ];
      const bodySelectors = [
        '[data-ui-surface="game"] .surface-kicker',
        ".hint-note",
        ".amber-actions-note",
      ];

      const readFontSample = (selector) => {
        const element = document.querySelector(selector);
        return {
          selector,
          found: Boolean(element),
          fontFamily: element ? getComputedStyle(element).fontFamily : "",
        };
      };

      return {
        displayFontVariable:
          bodyStyle.getPropertyValue("--font-jurassic-display").trim() ||
          rootStyle.getPropertyValue("--font-jurassic-display").trim(),
        bodyFontVariable:
          bodyStyle.getPropertyValue("--font-jurassic-body").trim() ||
          rootStyle.getPropertyValue("--font-jurassic-body").trim(),
        headingSamples: headingSelectors.map(readFontSample),
        bodySamples: bodySelectors.map(readFontSample),
      };
    });

    const displayPrimaryFamily = resolvePrimaryFontFamily(typographySnapshot.displayFontVariable);
    const bodyPrimaryFamily = resolvePrimaryFontFamily(typographySnapshot.bodyFontVariable);
    assert.ok(
      displayPrimaryFamily.length > 0,
      "Expected --font-jurassic-display to resolve to a non-empty font family.",
    );
    assert.ok(
      bodyPrimaryFamily.length > 0,
      "Expected --font-jurassic-body to resolve to a non-empty font family.",
    );

    for (const sample of typographySnapshot.headingSamples) {
      assert.ok(sample.found, `Expected heading selector to exist for typography check: ${sample.selector}.`);
      const normalizedHeadingFontFamily = normalizeFontFamily(sample.fontFamily);
      assert.ok(
        normalizedHeadingFontFamily.includes(displayPrimaryFamily),
        `Expected ${sample.selector} to use the display serif family (${displayPrimaryFamily}); received ${sample.fontFamily}.`,
      );
      assert.ok(
        normalizedHeadingFontFamily.includes("serif"),
        `Expected ${sample.selector} to include serif fallback; received ${sample.fontFamily}.`,
      );
    }

    for (const sample of typographySnapshot.bodySamples) {
      assert.ok(sample.found, `Expected body selector to exist for typography check: ${sample.selector}.`);
      const normalizedBodyFontFamily = normalizeFontFamily(sample.fontFamily);
      assert.ok(
        normalizedBodyFontFamily.includes(bodyPrimaryFamily),
        `Expected ${sample.selector} to use the body sans-serif family (${bodyPrimaryFamily}); received ${sample.fontFamily}.`,
      );
      assert.ok(
        normalizedBodyFontFamily.includes("sans-serif"),
        `Expected ${sample.selector} to include sans-serif fallback; received ${sample.fontFamily}.`,
      );
    }
  } finally {
    await context.close();
  }
});
