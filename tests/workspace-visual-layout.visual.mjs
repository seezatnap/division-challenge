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
const activeEditableSelector = '[data-entry-inline="true"][contenteditable="true"]';
const manualSolvePlan = [
  { digit: "3", stepId: "workspace-preview-problem:step:0:quotient-digit", digitIndex: "0" },
  { digit: "3", stepId: "workspace-preview-problem:step:1:multiply-result", digitIndex: "0" },
  { digit: "6", stepId: "workspace-preview-problem:step:1:multiply-result", digitIndex: "1" },
  { digit: "7", stepId: "workspace-preview-problem:step:2:subtraction-result", digitIndex: "0" },
  { digit: "6", stepId: "workspace-preview-problem:step:4:quotient-digit", digitIndex: "0" },
  { digit: "7", stepId: "workspace-preview-problem:step:5:multiply-result", digitIndex: "0" },
  { digit: "2", stepId: "workspace-preview-problem:step:5:multiply-result", digitIndex: "1" },
  { digit: "0", stepId: "workspace-preview-problem:step:6:subtraction-result", digitIndex: "0" },
  { digit: "0", stepId: "workspace-preview-problem:step:8:quotient-digit", digitIndex: "0" },
  { digit: "0", stepId: "workspace-preview-problem:step:9:multiply-result", digitIndex: "0" },
  { digit: "0", stepId: "workspace-preview-problem:step:10:subtraction-result", digitIndex: "0" },
];

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

async function createHomePage() {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 980 },
  });
  const page = await context.newPage();
  await page.goto(`${workspaceUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  const playerStartSurface = page.locator('[data-ui-surface="player-start"]');
  if ((await playerStartSurface.count()) > 0) {
    const uniqueVisualPlayerName = `visual-test-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    await page.fill("#game-start-player-name", uniqueVisualPlayerName);
    await page.click('[data-ui-action="start-session"]');
  }

  await page.waitForSelector('[data-ui-component="bus-stop-renderer"]');
  await wait(600);
  return { context, page };
}

async function typeDigitIntoActiveCell(page, nextDigit) {
  const editableCell = page.locator(activeEditableSelector).first();
  await editableCell.waitFor({ state: "visible", timeout: 10_000 });
  await editableCell.evaluate((node) => {
    node.focus();
  });
  await page.keyboard.insertText(nextDigit);
}

async function typeDigitsFollowingPlan(
  page,
  solvePlan,
  maxStepCount = solvePlan.length,
  expectNoEditableAfterFinalStep = true,
) {
  for (let stepIndex = 0; stepIndex < maxStepCount; stepIndex += 1) {
    const step = solvePlan[stepIndex];
    await expectActiveEditableCell(page, {
      stepId: step.stepId,
      digitIndex: Number.parseInt(step.digitIndex, 10),
    });

    const nextStep = solvePlan[stepIndex + 1] ?? null;
    let didReachExpectedNextCell = nextStep === null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await typeDigitIntoActiveCell(page, step.digit);
      await wait(140);

      if (!nextStep) {
        if (!expectNoEditableAfterFinalStep) {
          didReachExpectedNextCell = true;
          break;
        }

        const editableCellCount = await page.locator(activeEditableSelector).count();
        didReachExpectedNextCell = editableCellCount === 0;
        if (didReachExpectedNextCell) {
          break;
        }
        continue;
      }

      const nextSelector = `${activeEditableSelector}[data-entry-step-id="${nextStep.stepId}"][data-entry-digit-index="${nextStep.digitIndex}"]`;
      try {
        await page.waitForSelector(nextSelector, { timeout: 1_500 });
        didReachExpectedNextCell = true;
        break;
      } catch {}
    }

    assert.equal(
      didReachExpectedNextCell,
      true,
      `Did not advance to expected next editable cell after step ${step.stepId}.`,
    );
  }
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

test("visual workflow: multi-digit rows expose one digit cell at a time with auto progression", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    await page.locator(activeEditableSelector).first().waitFor({ state: "visible" });
    await expectActiveEditableCell(page, {
      stepId: "workspace-preview-problem:step:0:quotient-digit",
      digitIndex: 0,
    });
    const coachPrompt = await page
      .locator('[data-visual-snapshot="workspace-live"] .coach-item')
      .first()
      .innerText();
    assert.equal(coachPrompt.trim(), "How many times does 12 go into 43?");
    assert.equal(
      await page.locator(
        '[data-visual-snapshot="workspace-live"] .divisor-cell[data-step-focus="active"][data-step-focus-kind="quotient-digit"]',
      ).count(),
      1,
    );
    assert.equal(
      await page.locator(
        '[data-visual-snapshot="workspace-live"] .dividend-digit[data-step-focus="active"][data-step-focus-kind="quotient-digit"]',
      ).count(),
      2,
    );
    assert.equal(
      await page.locator(
        '[data-visual-snapshot="workspace-live"] .dividend-digit[data-dividend-digit-index="2"][data-step-focus="active"]',
      ).count(),
      0,
    );
    await expectFocusedEditableCell(page, {
      stepId: "workspace-preview-problem:step:0:quotient-digit",
      digitIndex: 0,
    });

    await typeDigitIntoActiveCell(page, "3");
    await wait(160);
    await expectActiveEditableCell(page, {
      stepId: "workspace-preview-problem:step:1:multiply-result",
      digitIndex: 0,
    });
    await expectFocusedEditableCell(page, {
      stepId: "workspace-preview-problem:step:1:multiply-result",
      digitIndex: 0,
    });

    await typeDigitIntoActiveCell(page, "3");
    await wait(160);
    await expectActiveEditableCell(page, {
      stepId: "workspace-preview-problem:step:1:multiply-result",
      digitIndex: 1,
    });
    await expectFocusedEditableCell(page, {
      stepId: "workspace-preview-problem:step:1:multiply-result",
      digitIndex: 1,
    });

    const multiplyRowDigitCells = page.locator(
      '[data-visual-snapshot="workspace-live"] [data-entry-step-id="workspace-preview-problem:step:1:multiply-result"][data-entry-lane="work-row"]',
    );
    await typeDigitsFollowingPlan(page, manualSolvePlan.slice(2), 1);
    assert.equal(await multiplyRowDigitCells.count(), 2);

    await expectActiveEditableCell(page, {
      stepId: "workspace-preview-problem:step:2:subtraction-result",
      digitIndex: 0,
    });
  } finally {
    await context.close();
  }
});

test("visual workflow: wrong digit triggers red error feedback and a 2-second retry lock", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const firstStep = {
      stepId: "workspace-preview-problem:step:0:quotient-digit",
      digitIndex: 0,
    };

    await expectActiveEditableCell(page, firstStep);
    await typeDigitIntoActiveCell(page, "9");
    await page.waitForSelector(
      `[data-entry-step-id="${firstStep.stepId}"][data-entry-digit-index="${firstStep.digitIndex}"][data-entry-error="pulse"]`,
      { timeout: 1_200 },
    );
    assert.equal(
      await page.locator(activeEditableSelector).count(),
      0,
      "Expected no editable digit cell while retry lock is active after a wrong digit.",
    );

    await page.waitForSelector(
      `[data-entry-step-id="${firstStep.stepId}"][data-entry-digit-index="${firstStep.digitIndex}"][data-entry-error="locked"]`,
      { timeout: 1_400 },
    );
    await page.waitForTimeout(700);
    assert.equal(
      await page.locator(activeEditableSelector).count(),
      0,
      "Expected retry lock to remain active shortly after the wrong-digit feedback pulse.",
    );

    await expectActiveEditableCell(page, firstStep);
    await expectFocusedEditableCell(page, firstStep);
    await typeDigitIntoActiveCell(page, "3");
    await wait(170);
    await expectActiveEditableCell(page, {
      stepId: "workspace-preview-problem:step:1:multiply-result",
      digitIndex: 0,
    });
  } finally {
    await context.close();
  }
});

test("visual layout mandate: solved solution digits align to dividend digit columns", { concurrency: false }, async () => {
  const { context, page } = await createWorkspacePage();

  try {
    const measuredCenters = await page.evaluate(() => {
      const selectCenter = (selector) => {
        const element = document.querySelector(selector);
        if (!element) {
          return null;
        }

        const box = element.getBoundingClientRect();
        return box.left + box.width / 2;
      };

      return {
        dividendDigit0: selectCenter(
          '[data-visual-snapshot="workspace-solved"] .dividend-digit[data-dividend-digit-index="0"]',
        ),
        dividendDigit1: selectCenter(
          '[data-visual-snapshot="workspace-solved"] .dividend-digit[data-dividend-digit-index="1"]',
        ),
        dividendDigit2: selectCenter(
          '[data-visual-snapshot="workspace-solved"] .dividend-digit[data-dividend-digit-index="2"]',
        ),
        quotientDigit0: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:0:quotient-digit"]',
        ),
        quotientDigit1: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:4:quotient-digit"]',
        ),
        multiply1Digit0: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:1:multiply-result"][data-entry-digit-index="0"]',
        ),
        multiply1Digit1: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:1:multiply-result"][data-entry-digit-index="1"]',
        ),
        subtraction1Digit0: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:2:subtraction-result"][data-entry-digit-index="0"]',
        ),
        bringDownDigit: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:3:bring-down"][data-entry-digit-index="0"]',
        ),
        multiply2Digit0: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:5:multiply-result"][data-entry-digit-index="0"]',
        ),
        multiply2Digit1: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:5:multiply-result"][data-entry-digit-index="1"]',
        ),
        subtraction2Digit0: selectCenter(
          '[data-visual-snapshot="workspace-solved"] [data-entry-step-id="workspace-preview-problem:step:6:subtraction-result"][data-entry-digit-index="0"]',
        ),
      };
    });

    for (const [key, center] of Object.entries(measuredCenters)) {
      assert.notEqual(center, null, `Missing center measurement for ${key}: ${JSON.stringify(measuredCenters)}`);
    }

    const maxHorizontalDelta = 2;
    const alignmentExpectations = [
      {
        measuredKey: "quotientDigit0",
        dividendKey: "dividendDigit1",
        message: "First quotient digit should align with dividend column 1.",
      },
      {
        measuredKey: "quotientDigit1",
        dividendKey: "dividendDigit2",
        message: "Second quotient digit should align with dividend column 2.",
      },
      {
        measuredKey: "multiply1Digit0",
        dividendKey: "dividendDigit0",
        message: "First multiply row digit 0 should align with dividend column 0.",
      },
      {
        measuredKey: "multiply1Digit1",
        dividendKey: "dividendDigit1",
        message: "First multiply row digit 1 should align with dividend column 1.",
      },
      {
        measuredKey: "subtraction1Digit0",
        dividendKey: "dividendDigit1",
        message: "First subtraction result should align with dividend column 1.",
      },
      {
        measuredKey: "bringDownDigit",
        dividendKey: "dividendDigit2",
        message: "Bring-down digit should align with dividend column 2.",
      },
      {
        measuredKey: "multiply2Digit0",
        dividendKey: "dividendDigit1",
        message: "Second multiply row digit 0 should align with dividend column 1.",
      },
      {
        measuredKey: "multiply2Digit1",
        dividendKey: "dividendDigit2",
        message: "Second multiply row digit 1 should align with dividend column 2.",
      },
      {
        measuredKey: "subtraction2Digit0",
        dividendKey: "dividendDigit2",
        message: "Final subtraction result should align with dividend column 2.",
      },
    ];

    for (const expectation of alignmentExpectations) {
      const measuredCenter = measuredCenters[expectation.measuredKey];
      const expectedDividendCenter = measuredCenters[expectation.dividendKey];
      assert.ok(
        Math.abs(measuredCenter - expectedDividendCenter) <= maxHorizontalDelta,
        `${expectation.message} (measured delta=${Math.abs(measuredCenter - expectedDividendCenter).toFixed(2)}px)`,
      );
    }
  } finally {
    await context.close();
  }
});

test("visual workflow: solving a full problem advances to the next question and keeps reward surface stable", { concurrency: false }, async () => {
  const { context, page } = await createHomePage();

  try {
    const solvedBefore = await page.locator(".surface-header .status-chip").first().innerText();
    assert.ok(solvedBefore.includes("Solved: 0"), `Expected solved count before run to be 0, received: ${solvedBefore}`);

    await typeDigitsFollowingPlan(page, manualSolvePlan, manualSolvePlan.length, false);
    await page.waitForTimeout(1_000);

    const revealModal = page.locator('[data-ui-surface="reward-reveal-modal"]');
    if ((await revealModal.count()) > 0) {
      await page
        .locator('[data-ui-surface="reward-reveal-modal"] .jp-button')
        .filter({ hasText: "Back To Board" })
        .first()
        .click();
    }

    await page.waitForSelector('[data-ui-action="next-problem"]', { timeout: 10_000 });
    const focusedAction = await page.evaluate(() => {
      const activeElement = document.activeElement;
      return activeElement?.getAttribute("data-ui-action") ?? null;
    });
    assert.equal(
      focusedAction,
      "next-problem",
      `Expected keyboard focus to move to NEXT after solve, received: ${String(focusedAction)}`,
    );
    await page.click('[data-ui-action="next-problem"]');

    const solvedAfter = await page.locator(".surface-header .status-chip").first().innerText();
    assert.ok(solvedAfter.includes("Solved: 1"), `Expected solved count after run to be 1, received: ${solvedAfter}`);

    const nextDividendText = (await page.locator(".dividend-line").first().innerText()).replace(/\s+/g, "");
    assert.notEqual(nextDividendText, "4320", "Expected the board to chain into a different follow-up problem.");

    const rewardSurfaceText = await page
      .locator('[data-ui-surface="earned-reward"]')
      .first()
      .innerText();
    assert.ok(
      rewardSurfaceText.includes("Milestone 5"),
      `Expected earned reward surface to remain visible with milestone context, received: ${rewardSurfaceText}`,
    );
    assert.equal(
      rewardSurfaceText.includes("Reward image generation is not running yet."),
      true,
      "Expected the first post-solve state to remain in pending reward mode before milestone unlock.",
    );

    const statusNotices = await page.locator('p[role="status"]').allTextContents();
    assert.equal(
      statusNotices.some((notice) => notice.includes("Gemini configuration is missing or invalid")),
      false,
      "Expected reward generation to avoid Gemini configuration error notices via runtime fallback.",
    );
  } finally {
    await context.close();
  }
});

async function expectActiveEditableCell(page, { stepId, digitIndex }) {
  const expectedSelector = `${activeEditableSelector}[data-entry-step-id="${stepId}"][data-entry-digit-index="${digitIndex}"]`;
  await page.waitForSelector(expectedSelector, { timeout: 10_000 });
  const editableCellCount = await page.locator(activeEditableSelector).count();
  assert.equal(editableCellCount, 1, "Expected exactly one editable digit cell.");
}

async function expectFocusedEditableCell(page, { stepId, digitIndex }) {
  const focusedCellMetadata = await page.evaluate(() => ({
    stepId: document.activeElement?.getAttribute("data-entry-step-id") ?? null,
    digitIndex: document.activeElement?.getAttribute("data-entry-digit-index") ?? null,
    isEditable: document.activeElement?.getAttribute("contenteditable") === "true",
  }));

  assert.deepEqual(focusedCellMetadata, {
    stepId,
    digitIndex: String(digitIndex),
    isEditable: true,
  });
}
