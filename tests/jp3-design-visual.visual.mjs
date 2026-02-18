import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { chromium } from "playwright-core";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const DEFAULT_TEST_SERVER_PORT = 4174;
const VISUAL_TEST_DIST_DIR = ".next-visual-tests-jp3";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const GALLERY_TILE_TARGET_COUNT = 9;
const JP3_GALLERY_DINOSAUR_NAMES = [
  "Brachiosaurus",
  "Tyrannosaurus Rex",
  "Velociraptor",
  "Triceratops",
  "Stegosaurus",
  "Parasaurolophus",
  "Ankylosaurus",
  "Spinosaurus",
  "Compsognathus",
];
const activeAmberGlowCellSelector =
  '[data-entry-inline="true"][data-entry-active="true"][data-entry-glow="amber"]';

let testServerPort = DEFAULT_TEST_SERVER_PORT;
let appBaseUrl = `http://127.0.0.1:${testServerPort}`;
let serverProcess = null;
let browser = null;
let serverStdoutBuffer = "";
let serverStderrBuffer = "";
const NEXT_DEV_LOCK_ERROR_FRAGMENT = "Unable to acquire lock";

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

function sawNextDevLockError() {
  return serverStderrBuffer.includes(NEXT_DEV_LOCK_ERROR_FRAGMENT);
}

function resolveNextDevExecutablePath() {
  if (process.platform === "win32") {
    return path.join(repoRoot, "node_modules", ".bin", "next.cmd");
  }

  return path.join(repoRoot, "node_modules", ".bin", "next");
}

async function claimServerPort(preferredPort) {
  const claimPort = (candidatePort) =>
    new Promise((resolve) => {
      const probeServer = createServer();
      probeServer.unref();
      probeServer.on("error", () => {
        resolve(null);
      });
      probeServer.listen(candidatePort, "127.0.0.1", () => {
        const activeAddress = probeServer.address();
        const resolvedPort =
          typeof activeAddress === "object" && activeAddress ? activeAddress.port : candidatePort;
        probeServer.close(() => {
          resolve(resolvedPort);
        });
      });
    });

  const preferredClaim = await claimPort(preferredPort);
  if (preferredClaim !== null) {
    return preferredClaim;
  }

  const ephemeralClaim = await claimPort(0);
  if (ephemeralClaim !== null) {
    return ephemeralClaim;
  }

  throw new Error("Unable to claim a port for JP3 visual tests.");
}

async function gotoAppWithRetry(page, relativePath = "/", maxAttempts = 3) {
  let lastError = null;
  const destination = `${appBaseUrl}${relativePath}`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 120_000 });
      return;
    } catch (error) {
      lastError = error;
      const errorMessage = String(error?.message ?? error);
      const shouldRetry =
        errorMessage.includes("ERR_CONNECTION_REFUSED") ||
        errorMessage.includes("ERR_CONNECTION_RESET");
      if (!shouldRetry || attempt === maxAttempts - 1) {
        throw error;
      }

      await waitForAppServer();
      await wait(300 * (attempt + 1));
    }
  }

  if (lastError) {
    throw lastError;
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveHeadlessShellExecutablePathFromDirectory(browsersDirectory) {
  if (!(await fileExists(browsersDirectory))) {
    return null;
  }

  const browserDirectories = await readdir(browsersDirectory, { withFileTypes: true });
  const headlessShellDirectory = browserDirectories.find(
    (entry) => entry.isDirectory() && entry.name.startsWith("chromium_headless_shell-"),
  );

  if (!headlessShellDirectory) {
    return null;
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

  return null;
}

async function resolveHeadlessShellExecutablePath() {
  const localHeadlessShellPath = await resolveHeadlessShellExecutablePathFromDirectory(
    path.join(repoRoot, ".playwright-browsers"),
  );
  if (localHeadlessShellPath) {
    return localHeadlessShellPath;
  }

  const playwrightManagedExecutablePath = (() => {
    try {
      return chromium.executablePath();
    } catch {
      return null;
    }
  })();

  if (
    playwrightManagedExecutablePath &&
    (await fileExists(playwrightManagedExecutablePath))
  ) {
    return playwrightManagedExecutablePath;
  }

  throw new Error(
    "Chromium executable is missing. Run `npx playwright install chromium` or `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx agent-browser install`.",
  );
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

async function createHomePage() {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 980 },
  });
  const page = await context.newPage();
  await gotoAppWithRetry(page, "/");
  await page.waitForLoadState("networkidle", { timeout: 120_000 });

  const playerStartSurface = page.locator('[data-ui-surface="player-start"]');
  if ((await playerStartSurface.count()) > 0) {
    const uniqueVisualPlayerName = `jp3-visual-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    await page.fill("#game-start-player-name", uniqueVisualPlayerName);
    await page.click('[data-ui-action="start-session"]');
    await page.waitForSelector('[data-ui-surface="game"]');
  }

  await page.waitForSelector('[data-ui-surface="surveillance-toolbar"]');
  await wait(700);
  return { context, page };
}

function buildGalleryRewardFixtures(rewardCount = GALLERY_TILE_TARGET_COUNT) {
  return Array.from({ length: rewardCount }, (_, index) => {
    const rewardNumber = index + 1;
    const dinosaurName = JP3_GALLERY_DINOSAUR_NAMES[index] ?? `Dinosaur ${rewardNumber}`;

    return {
      rewardId: `reward-${rewardNumber}`,
      dinosaurName,
      imagePath: "/window.svg",
      earnedAt: new Date(Date.UTC(2026, 0, rewardNumber)).toISOString(),
      milestoneSolvedCount: rewardNumber * 5,
    };
  });
}

async function seedGalleryRewards(page, rewardCount = GALLERY_TILE_TARGET_COUNT) {
  const seededRewards = buildGalleryRewardFixtures(rewardCount);
  await page.waitForSelector('[data-ui-surface="gallery"]');
  await page.evaluate((rewards) => {
    window.dispatchEvent(
      new CustomEvent("dino-gallery:rewards-updated", {
        detail: { unlockedRewards: rewards },
      }),
    );
  }, seededRewards);
  await page.waitForSelector(".gallery-grid-jp3");
  await page.waitForFunction(
    (expectedTileCount) =>
      document.querySelectorAll(".gallery-thumb-jp3").length >= expectedTileCount &&
      document.querySelectorAll(".gallery-thumb-jp3 .gallery-image-jp3").length >= expectedTileCount,
    rewardCount,
  );
  await wait(220);
}

function countDistinctTrackValues(values, tolerance = 8) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  let trackCount = 0;
  let lastTrackValue = Number.NEGATIVE_INFINITY;

  for (const value of sortedValues) {
    if (trackCount === 0 || Math.abs(value - lastTrackValue) > tolerance) {
      trackCount += 1;
      lastTrackValue = value;
    }
  }

  return trackCount;
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const deltaLeft = Math.abs(estimate - left);
  const deltaUp = Math.abs(estimate - up);
  const deltaUpLeft = Math.abs(estimate - upLeft);

  if (deltaLeft <= deltaUp && deltaLeft <= deltaUpLeft) {
    return left;
  }

  if (deltaUp <= deltaUpLeft) {
    return up;
  }

  return upLeft;
}

function decodePngRgba(pngBytes) {
  assert.ok(
    pngBytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    "Expected screenshot bytes to be PNG encoded.",
  );

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks = [];

  while (offset + 8 <= pngBytes.length) {
    const chunkLength = pngBytes.readUInt32BE(offset);
    offset += 4;
    const chunkType = pngBytes.toString("ascii", offset, offset + 4);
    offset += 4;
    const chunkDataEnd = offset + chunkLength;
    const chunkData = pngBytes.subarray(offset, chunkDataEnd);
    offset = chunkDataEnd;
    offset += 4;

    if (chunkType === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlaceMethod = chunkData[12];
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
  }

  assert.ok(width > 0 && height > 0, "PNG screenshot is missing IHDR dimensions.");
  assert.equal(bitDepth, 8, `PNG bit depth ${bitDepth} is unsupported; expected 8.`);
  assert.ok(
    colorType === 2 || colorType === 6,
    `PNG color type ${colorType} is unsupported; expected RGB (2) or RGBA (6).`,
  );
  assert.equal(interlaceMethod, 0, `PNG interlace method ${interlaceMethod} is unsupported.`);
  assert.ok(idatChunks.length > 0, "PNG screenshot did not include IDAT pixel data.");

  const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
  const sourceStride = width * sourceBytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const expectedInflatedLength = (sourceStride + 1) * height;
  assert.ok(
    inflated.length >= expectedInflatedLength,
    `PNG pixel payload is shorter than expected. Expected at least ${expectedInflatedLength}, got ${inflated.length}.`,
  );

  const unfiltered = Buffer.alloc(sourceStride * height);
  for (let y = 0; y < height; y += 1) {
    const sourceRowStart = y * (sourceStride + 1);
    const filterType = inflated[sourceRowStart];
    const rowBytes = inflated.subarray(sourceRowStart + 1, sourceRowStart + 1 + sourceStride);
    const outputRowStart = y * sourceStride;
    const priorRowStart = (y - 1) * sourceStride;

    for (let channel = 0; channel < sourceStride; channel += 1) {
      const sourceValue = rowBytes[channel];
      const left =
        channel >= sourceBytesPerPixel ? unfiltered[outputRowStart + channel - sourceBytesPerPixel] : 0;
      const up = y > 0 ? unfiltered[priorRowStart + channel] : 0;
      const upLeft =
        y > 0 && channel >= sourceBytesPerPixel
          ? unfiltered[priorRowStart + channel - sourceBytesPerPixel]
          : 0;

      let reconstructed = sourceValue;
      if (filterType === 1) {
        reconstructed = (sourceValue + left) & 0xff;
      } else if (filterType === 2) {
        reconstructed = (sourceValue + up) & 0xff;
      } else if (filterType === 3) {
        reconstructed = (sourceValue + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        reconstructed = (sourceValue + paethPredictor(left, up, upLeft)) & 0xff;
      }

      unfiltered[outputRowStart + channel] = reconstructed;
    }
  }

  if (colorType === 6) {
    return { width, height, pixels: unfiltered };
  }

  const rgbaPixels = Buffer.alloc(width * height * 4);
  for (let sourceOffset = 0, outputOffset = 0; sourceOffset < unfiltered.length; sourceOffset += 3, outputOffset += 4) {
    rgbaPixels[outputOffset] = unfiltered[sourceOffset];
    rgbaPixels[outputOffset + 1] = unfiltered[sourceOffset + 1];
    rgbaPixels[outputOffset + 2] = unfiltered[sourceOffset + 2];
    rgbaPixels[outputOffset + 3] = 255;
  }

  return { width, height, pixels: rgbaPixels };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function samplePixel(pngImage, x, y) {
  const normalizedX = clamp(Math.round(x), 0, pngImage.width - 1);
  const normalizedY = clamp(Math.round(y), 0, pngImage.height - 1);
  const pixelOffset = (normalizedY * pngImage.width + normalizedX) * 4;
  return {
    r: pngImage.pixels[pixelOffset],
    g: pngImage.pixels[pixelOffset + 1],
    b: pngImage.pixels[pixelOffset + 2],
    a: pngImage.pixels[pixelOffset + 3],
  };
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  return sortedValues[Math.floor(sortedValues.length / 2)];
}

function sampleNeighborhoodMedian(pngImage, centerX, centerY, radius = 8, step = 2) {
  const redSamples = [];
  const greenSamples = [];
  const blueSamples = [];
  const alphaSamples = [];

  for (let y = centerY - radius; y <= centerY + radius; y += step) {
    for (let x = centerX - radius; x <= centerX + radius; x += step) {
      const pixel = samplePixel(pngImage, x, y);
      redSamples.push(pixel.r);
      greenSamples.push(pixel.g);
      blueSamples.push(pixel.b);
      alphaSamples.push(pixel.a);
    }
  }

  return {
    r: median(redSamples),
    g: median(greenSamples),
    b: median(blueSamples),
    a: median(alphaSamples),
  };
}

function isJp3GreenSample(sample) {
  return sample.r < 80 && sample.g > 100 && sample.b < 80;
}

function isDarkToolbarSample(sample) {
  return sample.r < 95 && sample.g < 95 && sample.b < 95;
}

function looksWoodFrameSample(sample) {
  return sample.r >= 35 && sample.g >= 20 && sample.b <= 130 && sample.r >= sample.b + 8 && sample.g >= sample.b;
}

function isWorkspaceGreenSample(sample) {
  return (
    sample.g >= 70 &&
    sample.g > sample.r + 10 &&
    sample.g > sample.b + 8 &&
    sample.r < 120 &&
    sample.b < 110
  );
}

function isAmberGoldSample(sample) {
  return (
    sample.r >= 120 &&
    sample.g >= 85 &&
    sample.b <= 150 &&
    sample.r >= sample.g - 8 &&
    sample.r >= sample.b + 40 &&
    sample.g >= sample.b + 20
  );
}

function findGreenSampleNearCenter(
  pngImage,
  centerX,
  centerY,
  maxOffset = 20,
  sampleMatcher = isJp3GreenSample,
) {
  const candidateOffsets = [
    [0, 0],
    [-8, 0],
    [8, 0],
    [0, -8],
    [0, 8],
    [-12, -12],
    [12, -12],
    [-12, 12],
    [12, 12],
    [-16, 0],
    [16, 0],
    [0, -16],
    [0, 16],
    [-20, -20],
    [20, 20],
    [-20, 20],
    [20, -20],
  ];

  for (const [offsetX, offsetY] of candidateOffsets) {
    if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) > maxOffset) {
      continue;
    }

    const sample = sampleNeighborhoodMedian(pngImage, centerX + offsetX, centerY + offsetY, 8, 2);
    if (sampleMatcher(sample)) {
      return { sample, offsetX, offsetY };
    }
  }

  return null;
}

function findGreenSampleInRect(pngImage, rect, sampleMatcher = isJp3GreenSample) {
  const candidateRatios = [
    [0.5, 0.5],
    [0.22, 0.24],
    [0.78, 0.24],
    [0.24, 0.76],
    [0.76, 0.76],
    [0.5, 0.26],
    [0.5, 0.74],
  ];

  for (const [xRatio, yRatio] of candidateRatios) {
    const sampleCenterX = rect.left + rect.width * xRatio;
    const sampleCenterY = rect.top + rect.height * yRatio;
    const matchedSample = findGreenSampleNearCenter(
      pngImage,
      sampleCenterX,
      sampleCenterY,
      28,
      sampleMatcher,
    );
    if (matchedSample) {
      return matchedSample;
    }
  }

  return null;
}

function parseCssColor(cssColorValue) {
  const normalizedColorValue = String(cssColorValue ?? "").trim();
  assert.ok(normalizedColorValue.length > 0, "Expected a non-empty CSS color value.");
  const parseAlphaChannel = (componentValue) => {
    if (!componentValue) {
      return 1;
    }
    if (componentValue.endsWith("%")) {
      return clamp(Number.parseFloat(componentValue) / 100, 0, 1);
    }
    return clamp(Number.parseFloat(componentValue), 0, 1);
  };

  if (normalizedColorValue.startsWith("rgb")) {
    const components = normalizedColorValue.match(/[\d.]+%?/g);
    assert.ok(
      components && components.length >= 3,
      `Expected at least three RGB components, got "${normalizedColorValue}".`,
    );

    const parseColorChannel = (componentValue) => {
      if (componentValue.endsWith("%")) {
        return clamp((Number.parseFloat(componentValue) / 100) * 255, 0, 255);
      }
      return clamp(Number.parseFloat(componentValue), 0, 255);
    };

    return {
      r: Math.round(parseColorChannel(components[0])),
      g: Math.round(parseColorChannel(components[1])),
      b: Math.round(parseColorChannel(components[2])),
      a: parseAlphaChannel(components[3] ?? "1"),
    };
  }

  if (normalizedColorValue.startsWith("color(")) {
    const srgbMatch = normalizedColorValue.match(/^color\(\s*srgb\s+(.+)\)$/i);
    assert.ok(
      srgbMatch,
      `Expected color() value to use srgb, got "${normalizedColorValue}".`,
    );

    const [rawChannels, rawAlpha = "1"] = srgbMatch[1]
      .split("/")
      .map((component) => component.trim());
    const channelParts = rawChannels.split(/\s+/).filter((component) => component.length > 0);
    assert.ok(
      channelParts.length >= 3,
      `Expected at least three color(srgb) components, got "${normalizedColorValue}".`,
    );

    const parseSrgbChannel = (componentValue) => {
      if (componentValue.endsWith("%")) {
        return clamp((Number.parseFloat(componentValue) / 100) * 255, 0, 255);
      }

      const numericComponent = Number.parseFloat(componentValue);
      if (numericComponent <= 1) {
        return clamp(numericComponent * 255, 0, 255);
      }
      return clamp(numericComponent, 0, 255);
    };

    return {
      r: Math.round(parseSrgbChannel(channelParts[0])),
      g: Math.round(parseSrgbChannel(channelParts[1])),
      b: Math.round(parseSrgbChannel(channelParts[2])),
      a: parseAlphaChannel(rawAlpha),
    };
  }

  assert.fail(`Unsupported CSS color format "${normalizedColorValue}".`);
}

function compositeColorOverBackground(foregroundColor, backgroundColor) {
  const alpha = clamp(Number.isFinite(foregroundColor.a) ? foregroundColor.a : 1, 0, 1);
  if (alpha >= 0.999) {
    return {
      r: foregroundColor.r,
      g: foregroundColor.g,
      b: foregroundColor.b,
      a: 1,
    };
  }

  const inverseAlpha = 1 - alpha;
  return {
    r: Math.round(foregroundColor.r * alpha + backgroundColor.r * inverseAlpha),
    g: Math.round(foregroundColor.g * alpha + backgroundColor.g * inverseAlpha),
    b: Math.round(foregroundColor.b * alpha + backgroundColor.b * inverseAlpha),
    a: 1,
  };
}

function toRelativeLuminance(color) {
  const linearizeChannel = (channel) => {
    const normalized = clamp(channel, 0, 255) / 255;
    if (normalized <= 0.04045) {
      return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const red = linearizeChannel(color.r);
  const green = linearizeChannel(color.g);
  const blue = linearizeChannel(color.b);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function calculateContrastRatio(foregroundColor, backgroundColor) {
  const foregroundLuminance = toRelativeLuminance(foregroundColor);
  const backgroundLuminance = toRelativeLuminance(backgroundColor);
  const brighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (brighter + 0.05) / (darker + 0.05);
}

function calculateColorDistance(leftColor, rightColor) {
  const redDelta = leftColor.r - rightColor.r;
  const greenDelta = leftColor.g - rightColor.g;
  const blueDelta = leftColor.b - rightColor.b;
  return Math.sqrt(redDelta ** 2 + greenDelta ** 2 + blueDelta ** 2);
}

function splitFontFamilyTokens(fontFamilyValue) {
  return String(fontFamilyValue ?? "")
    .split(",")
    .map((token) => token.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter((token) => token.length > 0);
}

test.before(async () => {
  serverStdoutBuffer = "";
  serverStderrBuffer = "";
  testServerPort = await claimServerPort(DEFAULT_TEST_SERVER_PORT);
  appBaseUrl = `http://127.0.0.1:${testServerPort}`;
  const nextDevExecutablePath = resolveNextDevExecutablePath();
  assert.ok(
    await fileExists(nextDevExecutablePath),
    `Unable to find Next.js executable at ${nextDevExecutablePath}. Run npm ci first.`,
  );
  serverProcess = spawn(
    nextDevExecutablePath,
    ["dev", "--port", String(testServerPort), "--hostname", "127.0.0.1"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NEXT_DIST_DIR: VISUAL_TEST_DIST_DIR,
        PORT: String(testServerPort),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  serverProcess.stdout?.on("data", (chunk) => {
    serverStdoutBuffer = `${serverStdoutBuffer}${String(chunk)}`.slice(-8_000);
  });
  serverProcess.stderr?.on("data", (chunk) => {
    serverStderrBuffer = `${serverStderrBuffer}${String(chunk)}`.slice(-8_000);
  });

  await wait(900);
  if (sawNextDevLockError()) {
    throw new Error(
      [
        `Next.js lock collision detected for ${VISUAL_TEST_DIST_DIR}.`,
        `stdout: ${serverStdoutBuffer || "<empty>"}`,
        `stderr: ${serverStderrBuffer || "<empty>"}`,
      ].join("\n"),
    );
  }

  await waitForAppServer();

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

  await stopServerProcess();
});

test(
  "JP3 visual: full-page screenshot keeps wood frame border visible on all four sides",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await page.waitForSelector('[data-ui-decoration="viewport-frame"]', { state: "attached" });
      const frameMetrics = await page.evaluate(() => {
        const frameElement = document.querySelector('[data-ui-decoration="viewport-frame"]');
        if (!frameElement) {
          return null;
        }

        const frameBeforeStyle = getComputedStyle(frameElement, "::before");
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          frameWidth: Number.parseFloat(frameBeforeStyle.paddingTop || "0"),
        };
      });

      assert.ok(frameMetrics, "Expected viewport frame decoration to be present.");
      const fullPageScreenshot = await page.screenshot({ fullPage: true, type: "png" });
      const decodedScreenshot = decodePngRgba(fullPageScreenshot);
      assert.ok(
        decodedScreenshot.width >= Math.round(frameMetrics.viewportWidth) - 1,
        `Expected screenshot width >= viewport width (${frameMetrics.viewportWidth}), got ${decodedScreenshot.width}.`,
      );
      assert.ok(
        decodedScreenshot.height >= Math.round(frameMetrics.viewportHeight) - 1,
        `Expected screenshot height >= viewport height (${frameMetrics.viewportHeight}), got ${decodedScreenshot.height}.`,
      );

      const frameInset = Math.max(2, Math.min(24, Math.round((frameMetrics.frameWidth || 0) / 2) || 6));
      const viewportCenterY = clamp(
        Math.round(frameMetrics.viewportHeight / 2),
        frameInset + 1,
        decodedScreenshot.height - frameInset - 2,
      );
      const viewportBottomY = clamp(
        Math.round(frameMetrics.viewportHeight - frameInset - 1),
        frameInset + 1,
        decodedScreenshot.height - frameInset - 2,
      );
      const borderSamples = {
        top: sampleNeighborhoodMedian(decodedScreenshot, decodedScreenshot.width / 2, frameInset),
        bottom: sampleNeighborhoodMedian(decodedScreenshot, decodedScreenshot.width / 2, viewportBottomY),
        left: sampleNeighborhoodMedian(decodedScreenshot, frameInset, viewportCenterY),
        right: sampleNeighborhoodMedian(
          decodedScreenshot,
          decodedScreenshot.width - frameInset - 1,
          viewportCenterY,
        ),
      };

      for (const [side, sample] of Object.entries(borderSamples)) {
        assert.ok(
          looksWoodFrameSample(sample),
          `Expected ${side} frame sample to look wood-toned, got rgba(${sample.r}, ${sample.g}, ${sample.b}, ${sample.a}).`,
        );
      }

      const viewportCenterSample = sampleNeighborhoodMedian(
        decodedScreenshot,
        decodedScreenshot.width / 2,
        frameMetrics.viewportHeight / 2,
      );
      assert.equal(
        looksWoodFrameSample(viewportCenterSample),
        false,
        `Expected viewport center sample to differ from wood border, got rgba(${viewportCenterSample.r}, ${viewportCenterSample.g}, ${viewportCenterSample.b}, ${viewportCenterSample.a}).`,
      );
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: panel center pixels remain in JP3 green range",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await page.addStyleTag({
        content: `
          .jurassic-panel::before { opacity: 0 !important; }
          .jurassic-panel > * { visibility: hidden !important; }
        `,
      });
      await wait(120);

      const panelSelectors = [
        '[data-ui-surface="game"]',
        '[data-ui-surface="gallery"]',
        '[data-ui-surface="hybrid-gallery"]',
      ];
      for (const selector of panelSelectors) {
        await page.waitForSelector(selector);
      }

      const panelCenters = await page.evaluate((selectors) => {
        return selectors
          .map((selector) => {
            const panelElement = document.querySelector(selector);
            if (!panelElement) {
              return null;
            }

            const panelBox = panelElement.getBoundingClientRect();
            return {
              selector,
              centerX: panelBox.left + panelBox.width / 2 + window.scrollX,
              centerY: panelBox.top + panelBox.height / 2 + window.scrollY,
            };
          })
          .filter(Boolean);
      }, panelSelectors);

      assert.equal(
        panelCenters.length,
        panelSelectors.length,
        `Expected center coordinates for ${panelSelectors.length} panels, got ${panelCenters.length}.`,
      );

      const fullPageScreenshot = await page.screenshot({ fullPage: true, type: "png" });
      const decodedScreenshot = decodePngRgba(fullPageScreenshot);

      for (const panelCenter of panelCenters) {
        const centeredSample = sampleNeighborhoodMedian(
          decodedScreenshot,
          panelCenter.centerX,
          panelCenter.centerY,
          8,
          2,
        );
        const greenSampleMatch = isJp3GreenSample(centeredSample)
          ? { sample: centeredSample, offsetX: 0, offsetY: 0 }
          : findGreenSampleNearCenter(decodedScreenshot, panelCenter.centerX, panelCenter.centerY, 20);

        assert.ok(greenSampleMatch, `Expected ${panelCenter.selector} center sample to stay within JP3 green range.`);
        assert.ok(
          isJp3GreenSample(greenSampleMatch.sample),
          `Expected ${panelCenter.selector} center sample to match JP3 green range, got rgba(${greenSampleMatch.sample.r}, ${greenSampleMatch.sample.g}, ${greenSampleMatch.sample.b}, ${greenSampleMatch.sample.a}).`,
        );
      }
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: surveillance toolbar uses dark bar styling and expected label text",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await page.waitForSelector('[data-ui-surface="surveillance-toolbar"]');
      const toolbarLabelText = await page.locator(".jp-surveillance-toolbar-label").innerText();
      assert.ok(
        toolbarLabelText.toUpperCase().includes("SURVEILLANCE DEVICE"),
        `Expected toolbar label to include SURVEILLANCE DEVICE, got: ${toolbarLabelText}`,
      );

      const toolbarMetrics = await page.evaluate(() => {
        const toolbarElement = document.querySelector('[data-ui-surface="surveillance-toolbar"]');
        if (!toolbarElement) {
          return null;
        }

        const toolbarBox = toolbarElement.getBoundingClientRect();
        return {
          left: toolbarBox.left,
          top: toolbarBox.top,
          width: toolbarBox.width,
          height: toolbarBox.height,
          viewportHeight: window.innerHeight,
        };
      });

      assert.ok(toolbarMetrics, "Expected surveillance toolbar to be measurable.");
      assert.ok(
        toolbarMetrics.top > toolbarMetrics.viewportHeight * 0.62,
        `Expected toolbar to remain anchored near the bottom of viewport, top=${toolbarMetrics.top}, viewportHeight=${toolbarMetrics.viewportHeight}.`,
      );

      const viewportScreenshot = await page.screenshot({ type: "png" });
      const decodedScreenshot = decodePngRgba(viewportScreenshot);
      const toolbarSamples = [
        sampleNeighborhoodMedian(
          decodedScreenshot,
          toolbarMetrics.left + toolbarMetrics.width * 0.34,
          toolbarMetrics.top + toolbarMetrics.height * 0.86,
          7,
          2,
        ),
        sampleNeighborhoodMedian(
          decodedScreenshot,
          toolbarMetrics.left + toolbarMetrics.width * 0.68,
          toolbarMetrics.top + toolbarMetrics.height * 0.86,
          7,
          2,
        ),
      ];

      for (const [sampleIndex, sample] of toolbarSamples.entries()) {
        assert.ok(
          isDarkToolbarSample(sample),
          `Expected toolbar sample ${sampleIndex + 1} to be dark-colored, got rgba(${sample.r}, ${sample.g}, ${sample.b}, ${sample.a}).`,
        );
      }
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: gallery matches comp-style 3x3 thumbnail grid with dinosaur tiles",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      const compPath = path.join(repoRoot, "test-comp-targets", "Jp3websitebrachi.webp");
      assert.ok(
        await fileExists(compPath),
        `Expected gallery comp reference at ${compPath}.`,
      );

      await seedGalleryRewards(page, GALLERY_TILE_TARGET_COUNT);

      const gridMetrics = await page.evaluate((tileTargetCount) => {
        const gridElement = document.querySelector(".gallery-grid-jp3");
        if (!gridElement) {
          return null;
        }

        const tileElements = Array.from(
          gridElement.querySelectorAll(".gallery-thumb-jp3"),
        );
        const imageElements = Array.from(
          gridElement.querySelectorAll(".gallery-thumb-jp3 .gallery-image-jp3"),
        );
        const columnTrackValues = getComputedStyle(gridElement).gridTemplateColumns
          .trim()
          .split(/\s+/)
          .filter((value) => value.length > 0 && value !== "none");
        const sampledTiles = tileElements.slice(0, tileTargetCount).map((tileElement) => {
          const tileBox = tileElement.getBoundingClientRect();
          return {
            centerX: tileBox.left + tileBox.width / 2,
            centerY: tileBox.top + tileBox.height / 2,
            width: tileBox.width,
            height: tileBox.height,
          };
        });

        return {
          columnCount: columnTrackValues.length,
          tileCount: tileElements.length,
          imageCount: imageElements.length,
          sampledTiles,
        };
      }, GALLERY_TILE_TARGET_COUNT);

      assert.ok(gridMetrics, "Expected JP3 gallery grid to render.");
      assert.equal(
        gridMetrics.columnCount,
        3,
        `Expected gallery grid to render 3 columns, got ${gridMetrics.columnCount}.`,
      );
      assert.ok(
        gridMetrics.tileCount >= GALLERY_TILE_TARGET_COUNT,
        `Expected at least ${GALLERY_TILE_TARGET_COUNT} gallery tiles, got ${gridMetrics.tileCount}.`,
      );
      assert.ok(
        gridMetrics.imageCount >= GALLERY_TILE_TARGET_COUNT,
        `Expected at least ${GALLERY_TILE_TARGET_COUNT} gallery thumbnail images, got ${gridMetrics.imageCount}.`,
      );
      assert.equal(
        gridMetrics.sampledTiles.length,
        GALLERY_TILE_TARGET_COUNT,
        `Expected to sample ${GALLERY_TILE_TARGET_COUNT} gallery tiles, got ${gridMetrics.sampledTiles.length}.`,
      );

      const distinctColumnCount = countDistinctTrackValues(
        gridMetrics.sampledTiles.map((tile) => tile.centerX),
        10,
      );
      const distinctRowCount = countDistinctTrackValues(
        gridMetrics.sampledTiles.map((tile) => tile.centerY),
        10,
      );
      assert.equal(
        distinctColumnCount,
        3,
        `Expected sampled gallery tiles to occupy 3 visual columns, got ${distinctColumnCount}.`,
      );
      assert.equal(
        distinctRowCount,
        3,
        `Expected sampled gallery tiles to occupy 3 visual rows, got ${distinctRowCount}.`,
      );

      for (const [index, tile] of gridMetrics.sampledTiles.entries()) {
        assert.ok(
          tile.width > 24 && tile.height > 24,
          `Expected gallery tile ${index + 1} to render non-trivial dimensions, got ${tile.width}x${tile.height}.`,
        );
      }
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: gallery tile backgrounds stay within JP3 green range via pixel sampling",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await seedGalleryRewards(page, GALLERY_TILE_TARGET_COUNT);

      await page.addStyleTag({
        content: `
          .gallery-thumb-jp3 > * { visibility: hidden !important; }
        `,
      });
      await wait(120);

      const tileCenters = await page.evaluate((tileTargetCount) => {
        return Array.from(document.querySelectorAll(".gallery-thumb-jp3"))
          .slice(0, tileTargetCount)
          .map((tileElement, index) => {
            const tileBox = tileElement.getBoundingClientRect();
            return {
              index: index + 1,
              centerX: tileBox.left + tileBox.width / 2,
              centerY: tileBox.top + tileBox.height / 2,
            };
          });
      }, GALLERY_TILE_TARGET_COUNT);

      assert.equal(
        tileCenters.length,
        GALLERY_TILE_TARGET_COUNT,
        `Expected ${GALLERY_TILE_TARGET_COUNT} gallery tile centers, got ${tileCenters.length}.`,
      );

      const viewportScreenshot = await page.screenshot({ type: "png" });
      const decodedScreenshot = decodePngRgba(viewportScreenshot);

      for (const tileCenter of tileCenters) {
        const centeredSample = sampleNeighborhoodMedian(
          decodedScreenshot,
          tileCenter.centerX,
          tileCenter.centerY,
          7,
          2,
        );
        const greenSampleMatch = isJp3GreenSample(centeredSample)
          ? { sample: centeredSample, offsetX: 0, offsetY: 0 }
          : findGreenSampleNearCenter(decodedScreenshot, tileCenter.centerX, tileCenter.centerY, 18);

        assert.ok(
          greenSampleMatch,
          `Expected gallery tile ${tileCenter.index} to include a JP3 green sample near its center.`,
        );
        assert.ok(
          isJp3GreenSample(greenSampleMatch.sample),
          `Expected gallery tile ${tileCenter.index} color sample to stay JP3 green, got rgba(${greenSampleMatch.sample.r}, ${greenSampleMatch.sample.g}, ${greenSampleMatch.sample.b}, ${greenSampleMatch.sample.a}).`,
        );
      }
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: workspace notation text stays light with sufficient contrast on green workspace panel",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await page.waitForSelector('[data-ui-component="bus-stop-renderer"]');
      const workspaceSnapshot = await page.evaluate(() => {
        const workspaceElement = document.querySelector('[data-ui-component="bus-stop-renderer"]');
        if (!workspaceElement) {
          return null;
        }

        const workspaceBounds = workspaceElement.getBoundingClientRect();
        const trackedTextSelectors = [
          ".divisor-cell",
          ".dividend-line",
          ".work-row-op",
          ".work-row-value",
        ];
        const textStyles = trackedTextSelectors.map((selector) => {
          const textElement = workspaceElement.querySelector(selector);
          if (!textElement) {
            return null;
          }

          const computedStyle = getComputedStyle(textElement);
          return {
            selector,
            color: computedStyle.color,
          };
        });

        return {
          workspaceBounds: {
            left: workspaceBounds.left,
            top: workspaceBounds.top,
            width: workspaceBounds.width,
            height: workspaceBounds.height,
          },
          textStyles,
        };
      });

      assert.ok(workspaceSnapshot, "Expected workspace snapshot to resolve.");
      assert.ok(
        workspaceSnapshot.workspaceBounds.width > 0 && workspaceSnapshot.workspaceBounds.height > 0,
        "Expected workspace bounds to have measurable dimensions.",
      );
      assert.equal(
        workspaceSnapshot.textStyles.filter(Boolean).length,
        workspaceSnapshot.textStyles.length,
        "Expected all tracked workspace text selectors to resolve.",
      );

      const viewportScreenshot = await page.screenshot({ type: "png" });
      const decodedScreenshot = decodePngRgba(viewportScreenshot);
      const workspaceBackgroundMatch = findGreenSampleInRect(
        decodedScreenshot,
        workspaceSnapshot.workspaceBounds,
        isWorkspaceGreenSample,
      );
      assert.ok(workspaceBackgroundMatch, "Expected to find a green workspace background sample.");
      assert.ok(
        isWorkspaceGreenSample(workspaceBackgroundMatch.sample),
        `Expected workspace background sample to remain green-dominant, got rgba(${workspaceBackgroundMatch.sample.r}, ${workspaceBackgroundMatch.sample.g}, ${workspaceBackgroundMatch.sample.b}, ${workspaceBackgroundMatch.sample.a}).`,
      );

      for (const textStyle of workspaceSnapshot.textStyles) {
        const foregroundColor = parseCssColor(textStyle.color);
        const compositedForegroundColor = compositeColorOverBackground(
          foregroundColor,
          workspaceBackgroundMatch.sample,
        );
        const contrastRatio = calculateContrastRatio(
          compositedForegroundColor,
          workspaceBackgroundMatch.sample,
        );
        const textLuminance = toRelativeLuminance(compositedForegroundColor);
        assert.ok(
          textLuminance >= 0.48,
          `Expected ${textStyle.selector} text color to stay light on green workspace background, got rgba(${compositedForegroundColor.r}, ${compositedForegroundColor.g}, ${compositedForegroundColor.b}, ${compositedForegroundColor.a}) with luminance=${textLuminance.toFixed(3)}.`,
        );
        assert.ok(
          contrastRatio >= 4.5,
          `Expected ${textStyle.selector} to keep at least 4.5:1 contrast on green workspace background, got ${contrastRatio.toFixed(2)}:1.`,
        );
      }
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: heading typography resolves serif while body copy resolves sans-serif",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await page.waitForSelector(".hero-title");
      await page.waitForSelector(".surface-title");
      await page.waitForSelector(".hint-status");
      const typographySnapshot = await page.evaluate(() => {
        const captureFontFamily = (selector) => {
          const element = document.querySelector(selector);
          if (!element) {
            return null;
          }
          return {
            selector,
            fontFamily: getComputedStyle(element).fontFamily,
          };
        };

        return {
          headingSamples: [
            captureFontFamily(".hero-title"),
            captureFontFamily('[data-ui-surface="game"] .surface-title'),
            captureFontFamily('[data-ui-surface="gallery"] .surface-title'),
          ],
          bodySamples: [
            captureFontFamily("body"),
            captureFontFamily(".hint-status"),
            captureFontFamily(".amber-actions-note"),
          ],
        };
      });

      assert.ok(typographySnapshot, "Expected typography snapshot to resolve.");
      assert.equal(
        typographySnapshot.headingSamples.filter(Boolean).length,
        typographySnapshot.headingSamples.length,
        "Expected heading typography samples to resolve.",
      );
      assert.equal(
        typographySnapshot.bodySamples.filter(Boolean).length,
        typographySnapshot.bodySamples.length,
        "Expected body typography samples to resolve.",
      );

      for (const headingSample of typographySnapshot.headingSamples) {
        const headingTokens = splitFontFamilyTokens(headingSample.fontFamily);
        assert.ok(
          headingTokens.includes("serif"),
          `Expected ${headingSample.selector} heading font stack to include serif, got "${headingSample.fontFamily}".`,
        );
        assert.equal(
          headingTokens.includes("sans-serif"),
          false,
          `Expected ${headingSample.selector} heading font stack to avoid sans-serif fallback, got "${headingSample.fontFamily}".`,
        );
      }

      for (const bodySample of typographySnapshot.bodySamples) {
        const bodyTokens = splitFontFamilyTokens(bodySample.fontFamily);
        assert.ok(
          bodyTokens.includes("sans-serif"),
          `Expected ${bodySample.selector} body font stack to include sans-serif, got "${bodySample.fontFamily}".`,
        );
        assert.equal(
          bodyTokens.includes("serif"),
          false,
          `Expected ${bodySample.selector} body font stack to avoid serif fallback, got "${bodySample.fontFamily}".`,
        );
      }
    } finally {
      await context.close();
    }
  },
);

test(
  "JP3 visual: active input cell keeps amber/gold glow against green workspace panel",
  { concurrency: false },
  async () => {
    const { context, page } = await createHomePage();

    try {
      await page.waitForSelector('[data-ui-component="bus-stop-renderer"]');
      await page.waitForSelector(activeAmberGlowCellSelector);

      const glowSnapshot = await page.evaluate((selector) => {
        const workspaceElement = document.querySelector('[data-ui-component="bus-stop-renderer"]');
        if (!workspaceElement) {
          return null;
        }

        const activeGlowCells = workspaceElement.querySelectorAll(selector);
        const activeGlowCell = activeGlowCells[0];
        if (!activeGlowCell) {
          return {
            activeGlowCellCount: activeGlowCells.length,
            workspaceBounds: null,
            activeCellBounds: null,
            hasGlowAmberClass: false,
            borderColor: null,
            boxShadow: null,
            animationName: null,
            animationDuration: null,
          };
        }

        const activeCellStyle = getComputedStyle(activeGlowCell);
        const workspaceBounds = workspaceElement.getBoundingClientRect();
        const activeCellBounds = activeGlowCell.getBoundingClientRect();

        return {
          activeGlowCellCount: activeGlowCells.length,
          workspaceBounds: {
            left: workspaceBounds.left,
            top: workspaceBounds.top,
            width: workspaceBounds.width,
            height: workspaceBounds.height,
          },
          activeCellBounds: {
            left: activeCellBounds.left,
            top: activeCellBounds.top,
            width: activeCellBounds.width,
            height: activeCellBounds.height,
          },
          hasGlowAmberClass: activeGlowCell.classList.contains("glow-amber"),
          borderColor: activeCellStyle.borderTopColor,
          boxShadow: activeCellStyle.boxShadow,
          animationName: activeCellStyle.animationName,
          animationDuration: activeCellStyle.animationDuration,
        };
      }, activeAmberGlowCellSelector);

      assert.ok(glowSnapshot, "Expected active glow snapshot to resolve.");
      assert.equal(
        glowSnapshot.activeGlowCellCount,
        1,
        `Expected exactly one active amber glow input cell, got ${glowSnapshot.activeGlowCellCount}.`,
      );
      assert.ok(glowSnapshot.hasGlowAmberClass, "Expected active input cell to include glow-amber class.");
      assert.notEqual(glowSnapshot.boxShadow, "none", "Expected active input cell glow to render box-shadow.");
      assert.match(
        String(glowSnapshot.animationName),
        /amber-pulse/i,
        `Expected active input glow animation to use amber pulse, got "${glowSnapshot.animationName}".`,
      );
      assert.notEqual(
        String(glowSnapshot.animationDuration).trim(),
        "0s",
        "Expected active input glow animation duration to be non-zero.",
      );
      assert.ok(
        glowSnapshot.workspaceBounds &&
          glowSnapshot.workspaceBounds.width > 0 &&
          glowSnapshot.workspaceBounds.height > 0,
        "Expected workspace bounds to resolve for glow contrast checks.",
      );
      assert.ok(
        glowSnapshot.activeCellBounds &&
          glowSnapshot.activeCellBounds.width > 0 &&
          glowSnapshot.activeCellBounds.height > 0,
        "Expected active input cell bounds to resolve for glow checks.",
      );

      const borderColor = parseCssColor(glowSnapshot.borderColor);
      const viewportScreenshot = await page.screenshot({ type: "png" });
      const decodedScreenshot = decodePngRgba(viewportScreenshot);
      const workspaceBackgroundMatch = findGreenSampleInRect(
        decodedScreenshot,
        glowSnapshot.workspaceBounds,
        isWorkspaceGreenSample,
      );
      assert.ok(
        workspaceBackgroundMatch,
        "Expected to find a green workspace sample behind the active input glow cell.",
      );
      assert.ok(
        isWorkspaceGreenSample(workspaceBackgroundMatch.sample),
        `Expected workspace sample to remain green-dominant, got rgba(${workspaceBackgroundMatch.sample.r}, ${workspaceBackgroundMatch.sample.g}, ${workspaceBackgroundMatch.sample.b}, ${workspaceBackgroundMatch.sample.a}).`,
      );

      const compositedGlowColor = compositeColorOverBackground(
        borderColor,
        workspaceBackgroundMatch.sample,
      );
      assert.ok(
        isAmberGoldSample(compositedGlowColor),
        `Expected active glow color to resolve amber/gold over the green panel background, got rgba(${compositedGlowColor.r}, ${compositedGlowColor.g}, ${compositedGlowColor.b}, ${compositedGlowColor.a}).`,
      );

      const glowDistanceFromPanel = calculateColorDistance(
        compositedGlowColor,
        workspaceBackgroundMatch.sample,
      );
      assert.ok(
        glowDistanceFromPanel >= 60,
        `Expected active amber glow to stand out against the green workspace panel, got color distance ${glowDistanceFromPanel.toFixed(2)}.`,
      );
    } finally {
      await context.close();
    }
  },
);
