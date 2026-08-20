import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Own database file so the developer's local data is never touched.
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-player-auth-db-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(databaseDirectory, "auth.sqlite3")}`;

const authModulePromise = loadTypeScriptModule(
  "src/features/persistence/lib/sqlite-player-auth.ts",
);
const profilesModulePromise = loadTypeScriptModule(
  "src/features/persistence/lib/sqlite-player-profiles.ts",
);
const hashingModulePromise = loadTypeScriptModule(
  "src/features/persistence/lib/password-hashing.ts",
);

let playerCounter = 0;
function uniquePlayerName(label) {
  playerCounter += 1;
  return `${label} ${Date.now()} ${playerCounter}`;
}

async function expectAuthError(promise, code) {
  const { isPlayerAuthError } = await authModulePromise;
  await assert.rejects(promise, (error) => {
    assert.ok(isPlayerAuthError(error), `expected PlayerAuthError, got ${error?.message}`);
    assert.equal(error.code, code);
    return true;
  });
}

test("registerPlayer stores a hash (never the plaintext) and authenticatePlayer verifies it", async () => {
  const { registerPlayer, authenticatePlayer, readPlayerCredentials } = await authModulePromise;
  const { isPasswordHash } = await hashingModulePromise;
  const playerName = uniquePlayerName("Reg  Gus");

  const registered = await registerPlayer({ playerName, password: "raptor-pen" });
  assert.equal(registered.playerName, playerName.replace(/\s+/g, " "));

  const credentials = await readPlayerCredentials(playerName);
  assert.ok(credentials);
  assert.ok(isPasswordHash(credentials.passwordHash));
  assert.equal(credentials.passwordHash.includes("raptor-pen"), false);

  const authenticated = await authenticatePlayer({ playerName: playerName.toUpperCase(), password: "raptor-pen" });
  assert.equal(authenticated.playerName, registered.playerName);
  assert.equal(authenticated.playerNameKey, credentials.playerNameKey);

  await expectAuthError(authenticatePlayer({ playerName, password: "wrong" }), "invalid-password");
  await expectAuthError(authenticatePlayer({ playerName, password: "" }), "invalid-request");
});

test("registerPlayer rejects duplicate names, names that already own a profile, and weak passwords", async () => {
  const { registerPlayer } = await authModulePromise;
  const { writePlayerProfileSnapshotToSqlite } = await profilesModulePromise;

  const takenName = uniquePlayerName("Taken");
  await registerPlayer({ playerName: takenName, password: "first-pass" });
  await expectAuthError(
    registerPlayer({ playerName: takenName.toLowerCase(), password: "other-pass" }),
    "operator-exists",
  );

  const legacyName = uniquePlayerName("Legacy Owner");
  await writePlayerProfileSnapshotToSqlite({ playerName: legacyName, snapshot: { amber: 1 } });
  await expectAuthError(
    registerPlayer({ playerName: legacyName, password: "hijack-attempt" }),
    "operator-exists",
  );

  await expectAuthError(
    registerPlayer({ playerName: uniquePlayerName("Weak"), password: "ab" }),
    "invalid-request",
  );
  await expectAuthError(registerPlayer({ playerName: "   ", password: "abcdef" }), "invalid-request");
});

test("authenticatePlayer accepts the default password for a pre-existing profile without credentials and provisions a hash", async () => {
  const { authenticatePlayer, readPlayerCredentials } = await authModulePromise;
  const { writePlayerProfileSnapshotToSqlite } = await profilesModulePromise;
  const { DEFAULT_LEGACY_PLAYER_PASSWORD, verifyPassword } = await hashingModulePromise;
  const playerName = uniquePlayerName("Legacy Gus");

  await writePlayerProfileSnapshotToSqlite({ playerName, snapshot: { amber: 5 } });
  assert.equal(await readPlayerCredentials(playerName), null);

  await expectAuthError(
    authenticatePlayer({ playerName, password: "not-the-default" }),
    "invalid-password",
  );
  assert.equal(await readPlayerCredentials(playerName), null, "a failed login must not provision");

  const authenticated = await authenticatePlayer({
    playerName,
    password: DEFAULT_LEGACY_PLAYER_PASSWORD,
  });
  assert.equal(authenticated.playerName, playerName);

  const credentials = await readPlayerCredentials(playerName);
  assert.ok(credentials, "first successful legacy login provisions credentials");
  assert.equal(await verifyPassword(DEFAULT_LEGACY_PLAYER_PASSWORD, credentials.passwordHash), true);
});

test("authenticatePlayer reports unknown operators distinctly from wrong passwords", async () => {
  const { authenticatePlayer } = await authModulePromise;
  await expectAuthError(
    authenticatePlayer({ playerName: uniquePlayerName("Nobody"), password: "password" }),
    "unknown-operator",
  );
});

test("changePlayerPassword requires the current password, replaces the hash and revokes other sessions", async () => {
  const {
    registerPlayer,
    authenticatePlayer,
    changePlayerPassword,
    createPlayerSession,
    readPlayerSession,
  } = await authModulePromise;
  const playerName = uniquePlayerName("Changer");

  const player = await registerPlayer({ playerName, password: "old-secret" });
  const keptSession = await createPlayerSession(player);
  const otherSession = await createPlayerSession(player);

  await expectAuthError(
    changePlayerPassword({ playerName, currentPassword: "nope", newPassword: "new-secret" }),
    "invalid-password",
  );
  await expectAuthError(
    changePlayerPassword({ playerName, currentPassword: "old-secret", newPassword: "ab" }),
    "invalid-request",
  );

  await changePlayerPassword({
    playerName,
    currentPassword: "old-secret",
    newPassword: "new-secret",
    keepSessionToken: keptSession.token,
  });

  await expectAuthError(authenticatePlayer({ playerName, password: "old-secret" }), "invalid-password");
  assert.equal((await authenticatePlayer({ playerName, password: "new-secret" })).playerName, playerName);
  assert.ok(await readPlayerSession(keptSession.token), "caller's session survives");
  assert.equal(await readPlayerSession(otherSession.token), null, "other sessions are revoked");
});

test("changePlayerPassword lets a legacy profile move off the default password on first use", async () => {
  const { changePlayerPassword, authenticatePlayer } = await authModulePromise;
  const { writePlayerProfileSnapshotToSqlite } = await profilesModulePromise;
  const { DEFAULT_LEGACY_PLAYER_PASSWORD } = await hashingModulePromise;
  const playerName = uniquePlayerName("Legacy Changer");

  await writePlayerProfileSnapshotToSqlite({ playerName, snapshot: {} });
  await changePlayerPassword({
    playerName,
    currentPassword: DEFAULT_LEGACY_PLAYER_PASSWORD,
    newPassword: "fresh-secret",
  });

  await expectAuthError(
    authenticatePlayer({ playerName, password: DEFAULT_LEGACY_PLAYER_PASSWORD }),
    "invalid-password",
  );
  assert.ok(await authenticatePlayer({ playerName, password: "fresh-secret" }));
});

test("sessions round-trip, expire, and can be deleted", async () => {
  const {
    registerPlayer,
    createPlayerSession,
    readPlayerSession,
    deletePlayerSession,
    deleteExpiredPlayerSessions,
    PLAYER_SESSION_TTL_MS,
  } = await authModulePromise;
  const playerName = uniquePlayerName("Sessioner");
  const player = await registerPlayer({ playerName, password: "session-pass" });

  const nowMs = Date.now();
  const session = await createPlayerSession(player, { nowMs });
  assert.equal(session.expiresAtMs, nowMs + PLAYER_SESSION_TTL_MS);
  assert.ok(session.token.length >= 40);

  const loaded = await readPlayerSession(session.token);
  assert.deepEqual(loaded, {
    playerName,
    playerNameKey: player.playerNameKey,
    expiresAtMs: session.expiresAtMs,
  });

  assert.equal(await readPlayerSession("not-a-real-token"), null);
  assert.equal(await readPlayerSession(""), null);
  assert.equal(await readPlayerSession(null), null);

  assert.equal(
    await readPlayerSession(session.token, { nowMs: session.expiresAtMs + 1 }),
    null,
    "expired sessions read as absent",
  );
  assert.equal(await readPlayerSession(session.token), null, "and are purged on that read");

  const shortLived = await createPlayerSession(player, { nowMs, ttlMs: 10 });
  await deleteExpiredPlayerSessions(nowMs + 11);
  assert.equal(await readPlayerSession(shortLived.token), null);

  const deletable = await createPlayerSession(player);
  await deletePlayerSession(deletable.token);
  assert.equal(await readPlayerSession(deletable.token), null);
});
