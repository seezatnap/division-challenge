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

test("login screen requires a password and can register a new operator with confirmation", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  for (const fragment of [
    'id="game-start-password"',
    'name="password"',
    'id="game-start-confirm-password"',
    'name="confirmPassword"',
    "Passwords do not match.",
    "MIN_PLAYER_PASSWORD_LENGTH",
    'error.code === "unknown-operator"',
    'error.code === "operator-exists"',
    "Register & Authenticate",
    "Authenticate Session",
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected login fragment: ${fragment}`);
  }

  const passwordInputStart = pageSource.indexOf('id="game-start-password"');
  const passwordInputEnd = pageSource.indexOf("/>", passwordInputStart);
  const passwordInput = pageSource.slice(passwordInputStart, passwordInputEnd);
  assert.ok(passwordInput.includes("required"), "password input must be required");
  assert.ok(passwordInput.includes('type="password"'), "password input must mask its value");
});

test("header container exposes a change-password link in its upper-left account bar", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  const headerStart = pageSource.indexOf('<header className="jurassic-panel jurassic-hero motif-canopy">');
  const headerEnd = pageSource.indexOf("</header>", headerStart);
  assert.ok(headerStart !== -1 && headerEnd !== -1, "expected the dashboard header");
  const headerSource = pageSource.slice(headerStart, headerEnd);

  const accountBarIndex = headerSource.indexOf('data-ui-surface="account-bar"');
  const eyebrowIndex = headerSource.indexOf('className="eyebrow"');
  assert.ok(accountBarIndex !== -1, "expected the account bar inside the header");
  assert.ok(
    accountBarIndex < eyebrowIndex,
    "account bar must be the first thing in the header (upper left)",
  );
  assert.ok(headerSource.includes('data-ui-action="open-change-password"'));
  assert.ok(headerSource.includes("Change password"));
  assert.ok(headerSource.includes('aria-haspopup="dialog"'));
});

test("change-password modal confirms the old password before accepting a new one", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  for (const fragment of [
    'data-ui-surface="change-password-modal"',
    'role="dialog"',
    'aria-labelledby="change-password-heading"',
    'id="change-password-current"',
    'autoComplete="current-password"',
    'id="change-password-new"',
    'id="change-password-confirm"',
    "New passwords do not match.",
    "changePlayerPassword({",
    "currentPassword: currentPasswordDraft,",
    "newPassword: newPasswordDraft,",
    'data-ui-action="submit-change-password"',
    "Password updated.",
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected change-password fragment: ${fragment}`);
  }
});

test("global stylesheet styles the account link and change-password modal", async () => {
  const cssSource = await readRepoFile("src/app/globals.css");

  for (const fragment of [
    ".text-link-button",
    ".hero-account-bar",
    ".hero-account-link",
    ".hero-account-notice",
    ".change-password-modal",
  ]) {
    assert.ok(cssSource.includes(fragment), `Expected CSS fragment: ${fragment}`);
  }
});

test("auth API routes exist for login, register, change-password and session", async () => {
  for (const relativePath of [
    "src/app/api/auth/login/route.ts",
    "src/app/api/auth/register/route.ts",
    "src/app/api/auth/change-password/route.ts",
    "src/app/api/auth/session/route.ts",
  ]) {
    const source = await readRepoFile(relativePath);
    assert.ok(source.includes('export const runtime = "nodejs"'), `${relativePath} runs on node`);
  }

  const hashingSource = await readRepoFile("src/features/persistence/lib/password-hashing.ts");
  assert.ok(hashingSource.includes('from "node:crypto"'), "hashing uses node:crypto scrypt");
  assert.ok(hashingSource.includes("scrypt("), "hashing uses scrypt");
});
