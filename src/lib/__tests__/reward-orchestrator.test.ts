import { describe, it, expect, vi, beforeEach } from "vitest";
import { processReward } from "../reward-orchestrator";
import type { PlayerSave, UnlockedDinosaur } from "@/types";
import { createNewPlayerSave } from "@/types";
import { DINOSAURS, DINOSAUR_COUNT } from "@/data/dinosaurs";

// ─── Helpers ────────────────────────────────────────────────

/** Build a mock fetch that resolves with the given JSON response. */
function mockFetchOk(data: Record<string, unknown>): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  }) as unknown as typeof fetch;
}

/** Build a mock fetch that resolves with an error status. */
function mockFetchError(
  status: number,
  error: string,
): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  }) as unknown as typeof fetch;
}

/** Build a mock fetch that rejects (network failure). */
function mockFetchReject(message: string): typeof fetch {
  return vi.fn().mockRejectedValue(
    new Error(message),
  ) as unknown as typeof fetch;
}

/** Create a save where all 100 dinosaurs are unlocked. */
function fullyUnlockedSave(): PlayerSave {
  const save = createNewPlayerSave("Completionist");
  save.totalProblemsSolved = DINOSAUR_COUNT * 5;
  save.unlockedDinosaurs = DINOSAURS.map((name) => ({
    name,
    imagePath: `/dinos/${name.toLowerCase().replace(/\s+/g, "-")}.png`,
    dateEarned: "2026-01-01T00:00:00.000Z",
  }));
  return save;
}

// ─── Tests ──────────────────────────────────────────────────

describe("processReward", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Success path ────────────────────────────────────────

  it("returns success with unlocked dinosaur and updated save on successful generation", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = mockFetchOk({
      imagePath: "/dinos/tyrannosaurus-rex-abcd1234.png",
      base64Data: "dGVzdA==",
      mimeType: "image/png",
    });

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    // Should have picked a dinosaur from the pool
    expect(DINOSAURS).toContain(result.unlocked.name);

    // Image path should be set from the API response
    expect(result.unlocked.imagePath).toBe(
      "/dinos/tyrannosaurus-rex-abcd1234.png",
    );

    // Date earned should be a valid ISO string
    expect(() => new Date(result.unlocked.dateEarned)).not.toThrow();
    expect(new Date(result.unlocked.dateEarned).toISOString()).toBe(
      result.unlocked.dateEarned,
    );

    // Updated save should contain the newly unlocked dinosaur
    expect(result.updatedSave.unlockedDinosaurs).toHaveLength(1);
    expect(result.updatedSave.unlockedDinosaurs[0]).toEqual(
      result.unlocked,
    );
  });

  it("calls the generate-dino API with the chosen dinosaur name", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = mockFetchOk({
      imagePath: "/dinos/test.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    const result = await processReward(save, fetchFn);
    expect(result.status).toBe("success");

    // Verify fetch was called correctly
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = (fetchFn as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/generate-dino");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
    });
    const body = JSON.parse(options.body as string);
    expect(typeof body.dinoName).toBe("string");
    expect(DINOSAURS).toContain(body.dinoName);
  });

  it("does not mutate the original save", async () => {
    const save = createNewPlayerSave("Rex");
    const originalDinos = [...save.unlockedDinosaurs];
    const fetchFn = mockFetchOk({
      imagePath: "/dinos/test.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    await processReward(save, fetchFn);

    expect(save.unlockedDinosaurs).toEqual(originalDinos);
    expect(save.unlockedDinosaurs).toHaveLength(0);
  });

  it("preserves existing unlocked dinosaurs in the updated save", async () => {
    const save = createNewPlayerSave("Rex");
    const existingDino: UnlockedDinosaur = {
      name: "Velociraptor",
      imagePath: "/dinos/velociraptor-11111111.png",
      dateEarned: "2026-01-01T00:00:00.000Z",
    };
    save.unlockedDinosaurs = [existingDino];
    save.totalProblemsSolved = 5;

    const fetchFn = mockFetchOk({
      imagePath: "/dinos/new-dino.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    const result = await processReward(save, fetchFn);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.updatedSave.unlockedDinosaurs).toHaveLength(2);
    expect(result.updatedSave.unlockedDinosaurs[0]).toEqual(existingDino);
    expect(result.updatedSave.unlockedDinosaurs[1]).toEqual(
      result.unlocked,
    );
  });

  it("does not pick an already-unlocked dinosaur", async () => {
    const save = createNewPlayerSave("Rex");
    // Unlock all but one dinosaur
    save.unlockedDinosaurs = DINOSAURS.slice(0, DINOSAUR_COUNT - 1).map(
      (name) => ({
        name,
        imagePath: `/dinos/${name.toLowerCase()}.png`,
        dateEarned: "2026-01-01T00:00:00.000Z",
      }),
    );
    save.totalProblemsSolved = (DINOSAUR_COUNT - 1) * 5;

    const fetchFn = mockFetchOk({
      imagePath: "/dinos/last-dino.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    const result = await processReward(save, fetchFn);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    // The only remaining dinosaur is the last one
    const lastDino = DINOSAURS[DINOSAUR_COUNT - 1];
    expect(result.unlocked.name).toBe(lastDino);
  });

  it("preserves all other save fields in the updated save", async () => {
    const save = createNewPlayerSave("Rex");
    save.totalProblemsSolved = 10;
    save.currentDifficulty = 3;
    save.sessionHistory = [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        problemsSolved: 5,
        problemsAttempted: 5,
        startDifficulty: 1,
        endDifficulty: 2,
      },
    ];

    const fetchFn = mockFetchOk({
      imagePath: "/dinos/test.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    const result = await processReward(save, fetchFn);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.updatedSave.playerName).toBe("Rex");
    expect(result.updatedSave.totalProblemsSolved).toBe(10);
    expect(result.updatedSave.currentDifficulty).toBe(3);
    expect(result.updatedSave.sessionHistory).toEqual(save.sessionHistory);
    expect(result.updatedSave.version).toBe(1);
  });

  // ── Pool exhausted path ─────────────────────────────────

  it("returns pool_exhausted when all dinosaurs are already unlocked", async () => {
    const save = fullyUnlockedSave();
    const fetchFn = mockFetchOk({
      imagePath: "/dinos/test.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("pool_exhausted");
    // Should NOT have called the API
    expect(fetchFn).not.toHaveBeenCalled();
  });

  // ── Error paths ─────────────────────────────────────────

  it("returns error when the API responds with a non-ok status", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = mockFetchError(500, "Gemini API rate limit exceeded");

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toBe("Gemini API rate limit exceeded");
  });

  it("returns error with HTTP status when error body has no error field", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toBe("HTTP 503");
  });

  it("returns error when the API response JSON is unparseable", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("invalid json")),
    }) as unknown as typeof fetch;

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toBe("HTTP 500");
  });

  it("returns error when fetch throws (network failure)", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = mockFetchReject("Failed to fetch");

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toBe("Failed to fetch");
  });

  it("returns generic message for non-Error throws", async () => {
    const save = createNewPlayerSave("Rex");
    const fetchFn = vi.fn().mockRejectedValue(
      "unexpected string",
    ) as unknown as typeof fetch;

    const result = await processReward(save, fetchFn);

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.message).toBe("Network request failed.");
  });

  // ── Integration with progression ────────────────────────

  it("works end-to-end with recordSolve trigger", async () => {
    // Simulate: player has solved 4, next solve triggers reward
    const { recordSolve } = await import("../progression");
    const { initNewGame } = await import("../game-state");

    let state = initNewGame("Rex");
    // Solve 4 problems first
    for (let i = 0; i < 4; i++) {
      const { updatedState } = recordSolve(state);
      state = updatedState;
    }

    // 5th solve should trigger reward
    const progression = recordSolve(state);
    expect(progression.shouldReward).toBe(true);

    // Now process the reward
    const fetchFn = mockFetchOk({
      imagePath: "/dinos/some-dino.png",
      base64Data: "abc",
      mimeType: "image/png",
    });

    const result = await processReward(
      progression.updatedState.playerSave,
      fetchFn,
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    expect(result.updatedSave.unlockedDinosaurs).toHaveLength(1);
    expect(DINOSAURS).toContain(result.unlocked.name);
    expect(result.updatedSave.playerName).toBe("Rex");
    expect(result.updatedSave.totalProblemsSolved).toBe(5);
  });
});
