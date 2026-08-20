import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// End-to-end through the real route handlers, auth module and a throwaway
// database file; only `next/server` is stubbed.
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-auth-routes-db-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(databaseDirectory, "routes.sqlite3")}`;

const nextServerStubUrl = `data:text/javascript;base64,${Buffer.from(`
  export const NextResponse = {
    json(body, init = {}) {
      const headers = new Headers(init.headers ?? {});
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
    },
  };
`).toString("base64")}`;

// One module cache so every route shares the same database module instance.
const loadOptions = {
  replacements: { "next/server": nextServerStubUrl },
  cache: new Map(),
};

const loginRoute = await loadTypeScriptModule("src/app/api/auth/login/route.ts", loadOptions);
const registerRoute = await loadTypeScriptModule("src/app/api/auth/register/route.ts", loadOptions);
const changePasswordRoute = await loadTypeScriptModule(
  "src/app/api/auth/change-password/route.ts",
  loadOptions,
);
const sessionRoute = await loadTypeScriptModule("src/app/api/auth/session/route.ts", loadOptions);
const profilesRoute = await loadTypeScriptModule("src/app/api/player-profiles/route.ts", loadOptions);
const { PLAYER_SESSION_COOKIE_NAME } = await loadTypeScriptModule(
  "src/features/persistence/lib/player-session.ts",
  loadOptions,
);
const { writePlayerProfileSnapshotToSqlite } = await loadTypeScriptModule(
  "src/features/persistence/lib/sqlite-player-profiles.ts",
  loadOptions,
);

const ORIGIN = "https://example.test";

function jsonRequest(pathname, body, { method = "POST", cookie, headers = {} } = {}) {
  return new Request(`${ORIGIN}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function sessionCookieFromResponse(response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "expected a Set-Cookie header");
  const [pair] = setCookie.split(";");
  assert.ok(pair.startsWith(`${PLAYER_SESSION_COOKIE_NAME}=`));
  return { header: setCookie, pair };
}

let playerCounter = 0;
function uniquePlayerName(label) {
  playerCounter += 1;
  return `${label} ${Date.now()} ${playerCounter}`;
}

test("POST /api/auth/register creates the operator, logs in, and sets an HttpOnly cookie", async () => {
  const playerName = uniquePlayerName("Route Reg");
  const response = await registerRoute.POST(
    jsonRequest("/api/auth/register", { playerName, password: "compys-1" }),
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body.data.player, { playerName });
  const { header } = sessionCookieFromResponse(response);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Secure/, "https request gets a Secure cookie");
  assert.match(header, /Path=\//);

  const duplicate = await registerRoute.POST(
    jsonRequest("/api/auth/register", { playerName, password: "another" }),
  );
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "operator-exists");
});

test("POST /api/auth/login verifies the password and distinguishes unknown operators", async () => {
  const playerName = uniquePlayerName("Route Login");
  await registerRoute.POST(jsonRequest("/api/auth/register", { playerName, password: "spino-7" }));

  const ok = await loginRoute.POST(
    jsonRequest("/api/auth/login", { playerName: playerName.toLowerCase(), password: "spino-7" }, {
      headers: { "x-forwarded-proto": "http" },
    }),
  );
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data.player, { playerName });
  assert.doesNotMatch(sessionCookieFromResponse(ok).header, /Secure/, "plain-http origin skips Secure");

  const wrong = await loginRoute.POST(jsonRequest("/api/auth/login", { playerName, password: "nope" }));
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error.code, "invalid-password");
  assert.equal(wrong.headers.get("set-cookie"), null);

  const unknown = await loginRoute.POST(
    jsonRequest("/api/auth/login", { playerName: uniquePlayerName("Ghost"), password: "password" }),
  );
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, "unknown-operator");

  const malformed = await loginRoute.POST(
    new Request(`${ORIGIN}/api/auth/login`, { method: "POST", body: "{nope" }),
  );
  assert.equal(malformed.status, 400);
  assert.match((await malformed.json()).error.message, /valid JSON/i);
});

test("POST /api/auth/login accepts the default password for a profile created before passwords", async () => {
  const playerName = uniquePlayerName("Route Legacy");
  await writePlayerProfileSnapshotToSqlite({ playerName, snapshot: { amber: 2 } });

  const response = await loginRoute.POST(
    jsonRequest("/api/auth/login", { playerName, password: "password" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.player, { playerName });
});

test("GET/DELETE /api/auth/session reflect and clear the cookie", async () => {
  const playerName = uniquePlayerName("Route Session");
  const login = await registerRoute.POST(
    jsonRequest("/api/auth/register", { playerName, password: "trike-3" }),
  );
  const { pair } = sessionCookieFromResponse(login);

  const anonymous = await sessionRoute.GET(new Request(`${ORIGIN}/api/auth/session`));
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "unauthenticated");

  const current = await sessionRoute.GET(
    new Request(`${ORIGIN}/api/auth/session`, { headers: { cookie: `other=1; ${pair}` } }),
  );
  assert.equal(current.status, 200);
  assert.deepEqual((await current.json()).data.player, { playerName });

  const logout = await sessionRoute.DELETE(
    new Request(`${ORIGIN}/api/auth/session`, { method: "DELETE", headers: { cookie: pair } }),
  );
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);

  const afterLogout = await sessionRoute.GET(
    new Request(`${ORIGIN}/api/auth/session`, { headers: { cookie: pair } }),
  );
  assert.equal(afterLogout.status, 401);
});

test("POST /api/auth/change-password needs a session and the current password", async () => {
  const playerName = uniquePlayerName("Route Changer");
  const login = await registerRoute.POST(
    jsonRequest("/api/auth/register", { playerName, password: "old-pass" }),
  );
  const { pair } = sessionCookieFromResponse(login);

  const anonymous = await changePasswordRoute.POST(
    jsonRequest("/api/auth/change-password", { currentPassword: "old-pass", newPassword: "new-pass" }),
  );
  assert.equal(anonymous.status, 401);

  const wrongCurrent = await changePasswordRoute.POST(
    jsonRequest(
      "/api/auth/change-password",
      { currentPassword: "bad", newPassword: "new-pass" },
      { cookie: pair },
    ),
  );
  assert.equal(wrongCurrent.status, 401);
  assert.equal((await wrongCurrent.json()).error.code, "invalid-password");

  const tooShort = await changePasswordRoute.POST(
    jsonRequest(
      "/api/auth/change-password",
      { currentPassword: "old-pass", newPassword: "ab" },
      { cookie: pair },
    ),
  );
  assert.equal(tooShort.status, 400);

  const changed = await changePasswordRoute.POST(
    jsonRequest(
      "/api/auth/change-password",
      { currentPassword: "old-pass", newPassword: "new-pass" },
      { cookie: pair },
    ),
  );
  assert.equal(changed.status, 200);
  assert.deepEqual((await changed.json()).data.player, { playerName });

  const stillLoggedIn = await sessionRoute.GET(
    new Request(`${ORIGIN}/api/auth/session`, { headers: { cookie: pair } }),
  );
  assert.equal(stillLoggedIn.status, 200, "the session that changed the password is kept");

  const oldLogin = await loginRoute.POST(
    jsonRequest("/api/auth/login", { playerName, password: "old-pass" }),
  );
  assert.equal(oldLogin.status, 401);
  const newLogin = await loginRoute.POST(
    jsonRequest("/api/auth/login", { playerName, password: "new-pass" }),
  );
  assert.equal(newLogin.status, 200);
});

test("/api/player-profiles only serves the operator the session belongs to", async () => {
  const playerName = uniquePlayerName("Route Owner");
  const otherName = uniquePlayerName("Route Other");
  const login = await registerRoute.POST(
    jsonRequest("/api/auth/register", { playerName, password: "owner-pass" }),
  );
  const { pair } = sessionCookieFromResponse(login);

  const anonymousGet = await profilesRoute.GET(
    new Request(`${ORIGIN}/api/player-profiles?playerName=${encodeURIComponent(playerName)}`),
  );
  assert.equal(anonymousGet.status, 401);

  const anonymousPut = await profilesRoute.PUT(
    jsonRequest("/api/player-profiles", { playerName, snapshot: {} }, { method: "PUT" }),
  );
  assert.equal(anonymousPut.status, 401);

  const foreignPut = await profilesRoute.PUT(
    jsonRequest(
      "/api/player-profiles",
      { playerName: otherName, snapshot: {} },
      { method: "PUT", cookie: pair },
    ),
  );
  assert.equal(foreignPut.status, 403);
  assert.equal((await foreignPut.json()).error.code, "forbidden");

  const ownPut = await profilesRoute.PUT(
    jsonRequest(
      "/api/player-profiles",
      { playerName: playerName.toUpperCase(), snapshot: { gameSession: { amberBalance: 12 } } },
      { method: "PUT", cookie: pair },
    ),
  );
  assert.equal(ownPut.status, 200);

  const ownGet = await profilesRoute.GET(
    new Request(`${ORIGIN}/api/player-profiles?playerName=${encodeURIComponent(playerName)}`, {
      headers: { cookie: pair },
    }),
  );
  assert.equal(ownGet.status, 200);
  assert.equal((await ownGet.json()).data.profile.snapshot.gameSession.amberBalance, 12);

  const foreignGet = await profilesRoute.GET(
    new Request(`${ORIGIN}/api/player-profiles?playerName=${encodeURIComponent(otherName)}`, {
      headers: { cookie: pair },
    }),
  );
  assert.equal(foreignGet.status, 403);
});
