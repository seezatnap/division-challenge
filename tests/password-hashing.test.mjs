import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

const hashingModulePromise = loadTypeScriptModule(
  "src/features/persistence/lib/password-hashing.ts",
);

test("hashPassword produces a self-describing scrypt hash with a fresh salt each time", async () => {
  const { hashPassword, isPasswordHash } = await hashingModulePromise;

  const first = await hashPassword("correct horse");
  const second = await hashPassword("correct horse");

  assert.ok(isPasswordHash(first));
  assert.ok(first.startsWith("scrypt$16384$8$1$"));
  assert.notEqual(first, second, "salts must differ between hashes of the same password");
  assert.equal(first.includes("correct horse"), false, "plaintext must never appear in the hash");
});

test("verifyPassword accepts the right password and rejects everything else", async () => {
  const { hashPassword, verifyPassword } = await hashingModulePromise;
  const stored = await hashPassword("password");

  assert.equal(await verifyPassword("password", stored), true);
  assert.equal(await verifyPassword("Password", stored), false);
  assert.equal(await verifyPassword("password ", stored), false);
  assert.equal(await verifyPassword("", stored), false);
  assert.equal(await verifyPassword(undefined, stored), false);
});

test("verifyPassword never verifies malformed or tampered hashes", async () => {
  const { hashPassword, verifyPassword, isPasswordHash } = await hashingModulePromise;
  const stored = await hashPassword("password");
  const [algorithm, cost, blockSize, parallelization, salt, hash] = stored.split("$");

  for (const malformed of [
    "",
    "password",
    "bcrypt$10$abc$def",
    `${algorithm}$${cost}$${blockSize}$${parallelization}$${salt}`,
    `${algorithm}$0$${blockSize}$${parallelization}$${salt}$${hash}`,
    `${algorithm}$${cost}$${blockSize}$${parallelization}$$${hash}`,
    null,
    42,
  ]) {
    assert.equal(isPasswordHash(malformed), false, `should reject ${String(malformed)}`);
    assert.equal(await verifyPassword("password", malformed), false);
  }

  const tamperedHash = `${algorithm}$${cost}$${blockSize}$${parallelization}$${salt}$${hash.slice(0, -2)}AA`;
  assert.equal(await verifyPassword("password", tamperedHash), false);
});

test("password policy enforces length bounds", async () => {
  const {
    MIN_PLAYER_PASSWORD_LENGTH,
    MAX_PLAYER_PASSWORD_LENGTH,
    describePasswordPolicyViolation,
    assertPasswordMeetsPolicy,
    DEFAULT_LEGACY_PLAYER_PASSWORD,
  } = await hashingModulePromise;

  assert.equal(describePasswordPolicyViolation(DEFAULT_LEGACY_PLAYER_PASSWORD), null);
  assert.equal(describePasswordPolicyViolation("a".repeat(MIN_PLAYER_PASSWORD_LENGTH)), null);
  assert.match(describePasswordPolicyViolation(""), /required/i);
  assert.match(describePasswordPolicyViolation(undefined), /required/i);
  assert.match(
    describePasswordPolicyViolation("a".repeat(MIN_PLAYER_PASSWORD_LENGTH - 1)),
    /at least/i,
  );
  assert.match(
    describePasswordPolicyViolation("a".repeat(MAX_PLAYER_PASSWORD_LENGTH + 1)),
    /at most/i,
  );
  assert.throws(() => assertPasswordMeetsPolicy("a"), /at least/i);
  assert.doesNotThrow(() => assertPasswordMeetsPolicy("abcd"));
});

test("secureStringEquals compares strings without leaking via exceptions", async () => {
  const { secureStringEquals } = await hashingModulePromise;

  assert.equal(secureStringEquals("password", "password"), true);
  assert.equal(secureStringEquals("password", "passw0rd"), false);
  assert.equal(secureStringEquals("password", "password!"), false);
  assert.equal(secureStringEquals("", ""), true);
  assert.equal(secureStringEquals(undefined, "password"), false);
});
