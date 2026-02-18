import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { chromium } from "playwright-core";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const TEST_SERVER_PORT = "4174";
const TEST_BASE_URL = `http://127.0.0.1:${TEST_SERVER_PORT}`;
const VISUAL_TEST_DIST_DIR = ".next-visual-tests";
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

let appBaseUrl = TEST_BASE_URL;
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

async function createHomePage() {
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

function findGreenSampleNearCenter(pngImage, centerX, centerY, maxOffset = 20) {
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
    if (isJp3GreenSample(sample)) {
      return { sample, offsetX, offsetY };
    }
  }

  return null;
}

test.before(async () => {
  serverStdoutBuffer = "";
  serverStderrBuffer = "";
  appBaseUrl = TEST_BASE_URL;
  const nextDevExecutablePath = resolveNextDevExecutablePath();
  assert.ok(
    await fileExists(nextDevExecutablePath),
    `Unable to find Next.js executable at ${nextDevExecutablePath}. Run npm ci first.`,
  );
  serverProcess = spawn(nextDevExecutablePath, ["dev", "--port", TEST_SERVER_PORT, "--hostname", "127.0.0.1"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXT_DIST_DIR: VISUAL_TEST_DIST_DIR,
      PORT: TEST_SERVER_PORT,
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
