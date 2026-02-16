import { describe, it, expect } from "vitest";
import {
  PALETTE,
  MOTIFS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  COMPLETION_MESSAGES,
  LEVEL_UP_MESSAGES,
  randomMessage,
} from "../theme";

// ─── Palette ──────────────────────────────────────────────

describe("PALETTE", () => {
  it("defines all earthy / jungle colour tokens", () => {
    expect(PALETTE.jungleGreen).toBe("#2d6a4f");
    expect(PALETTE.jungleGreenLight).toBe("#40916c");
    expect(PALETTE.fern).toBe("#1b4332");
    expect(PALETTE.amber).toBe("#b5651d");
    expect(PALETTE.sand).toBe("#f5e6ca");
    expect(PALETTE.ivory).toBe("#faf6ed");
    expect(PALETTE.volcanic).toBe("#1a1409");
    expect(PALETTE.lavaRock).toBe("#2a2215");
    expect(PALETTE.earthBrown).toBe("#6b4e32");
    expect(PALETTE.fossil).toBe("#7a7062");
    expect(PALETTE.leaf).toBe("#52b788");
  });

  it("contains only valid hex colour codes", () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    for (const [key, value] of Object.entries(PALETTE)) {
      expect(value, `PALETTE.${key} should be a valid hex color`).toMatch(
        hexPattern,
      );
    }
  });
});

// ─── Motifs ───────────────────────────────────────────────

describe("MOTIFS", () => {
  it("includes dinosaur-themed emoji motifs", () => {
    expect(MOTIFS.dino).toBe("🦕");
    expect(MOTIFS.trex).toBe("🦖");
    expect(MOTIFS.footprint).toBe("🐾");
    expect(MOTIFS.leaf).toBe("🌿");
    expect(MOTIFS.volcano).toBe("🌋");
    expect(MOTIFS.bone).toBe("🦴");
    expect(MOTIFS.egg).toBe("🥚");
    expect(MOTIFS.trophy).toBe("🏆");
  });

  it("all motif values are non-empty strings", () => {
    for (const [key, value] of Object.entries(MOTIFS)) {
      expect(value.length, `MOTIFS.${key} should be non-empty`).toBeGreaterThan(
        0,
      );
    }
  });
});

// ─── Message arrays ───────────────────────────────────────

describe("SUCCESS_MESSAGES", () => {
  it("has at least 10 messages", () => {
    expect(SUCCESS_MESSAGES.length).toBeGreaterThanOrEqual(10);
  });

  it("contains the classic dino-themed messages from the spec", () => {
    expect(SUCCESS_MESSAGES).toContain("Roarsome!");
    expect(SUCCESS_MESSAGES).toContain("You're dino-mite!");
    expect(SUCCESS_MESSAGES).toContain("Clever girl!");
  });

  it("all entries are non-empty strings", () => {
    for (const msg of SUCCESS_MESSAGES) {
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe("ERROR_MESSAGES", () => {
  it("has at least 5 messages", () => {
    expect(ERROR_MESSAGES.length).toBeGreaterThanOrEqual(5);
  });

  it("contains the classic dino-themed messages from the spec", () => {
    expect(ERROR_MESSAGES).toContain(
      "Uh oh, the raptor got that one…",
    );
    expect(ERROR_MESSAGES).toContain(
      "Even a T-Rex stumbles sometimes!",
    );
  });

  it("all entries are non-empty strings", () => {
    for (const msg of ERROR_MESSAGES) {
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe("COMPLETION_MESSAGES", () => {
  it("has at least 3 messages", () => {
    expect(COMPLETION_MESSAGES.length).toBeGreaterThanOrEqual(3);
  });

  it("all entries are non-empty strings", () => {
    for (const msg of COMPLETION_MESSAGES) {
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});

describe("LEVEL_UP_MESSAGES", () => {
  it("has at least 2 messages", () => {
    expect(LEVEL_UP_MESSAGES.length).toBeGreaterThanOrEqual(2);
  });

  it("each message references Tier", () => {
    for (const msg of LEVEL_UP_MESSAGES) {
      expect(msg).toContain("Tier");
    }
  });
});

// ─── randomMessage ────────────────────────────────────────

describe("randomMessage", () => {
  it("returns a string from the given array", () => {
    const messages = ["alpha", "beta", "gamma"];
    const result = randomMessage(messages);
    expect(messages).toContain(result);
  });

  it("returns the only element from a single-element array", () => {
    expect(randomMessage(["only"])).toBe("only");
  });

  it("works with readonly arrays", () => {
    const result = randomMessage(SUCCESS_MESSAGES);
    expect(SUCCESS_MESSAGES).toContain(result);
  });

  it("returns different messages over many calls (non-deterministic sanity check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(randomMessage(SUCCESS_MESSAGES));
    }
    // With 15 messages and 100 iterations, we should see more than 1
    expect(seen.size).toBeGreaterThan(1);
  });
});
