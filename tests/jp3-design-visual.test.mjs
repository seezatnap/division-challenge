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
