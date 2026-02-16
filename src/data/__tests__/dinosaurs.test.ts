import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  DINOSAURS,
  DINOSAUR_COUNT,
  getDinosaurByIndex,
  getRandomDinosaur,
  getNextUnlockedDinosaur,
  isDinosaurName,
} from "../dinosaurs";

// ─── List integrity ─────────────────────────────────────────

describe("DINOSAURS list", () => {
  it("contains exactly DINOSAUR_COUNT (100) entries", () => {
    expect(DINOSAURS).toHaveLength(DINOSAUR_COUNT);
    expect(DINOSAUR_COUNT).toBe(100);
  });

  it("has no duplicate entries", () => {
    const unique = new Set(DINOSAURS);
    expect(unique.size).toBe(DINOSAURS.length);
  });

  it("contains only non-empty strings", () => {
    for (const name of DINOSAURS) {
      expect(typeof name).toBe("string");
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes key franchise headliners", () => {
    const headliners = [
      "Tyrannosaurus Rex",
      "Velociraptor",
      "Triceratops",
      "Brachiosaurus",
      "Indominus Rex",
      "Indoraptor",
      "Giganotosaurus",
      "Therizinosaurus",
      "Atrociraptor",
      "Pyroraptor",
      "Mosasaurus",
    ];
    for (const name of headliners) {
      expect(DINOSAURS).toContain(name);
    }
  });

  it("is frozen / readonly (cannot be mutated at runtime)", () => {
    // The `as const` assertion makes the type readonly; verify the runtime
    // array reference stays stable.
    expect(Object.isFrozen(DINOSAURS)).toBe(true);
  });
});

// ─── getDinosaurByIndex ─────────────────────────────────────

describe("getDinosaurByIndex", () => {
  it("returns the correct dinosaur for valid indices", () => {
    expect(getDinosaurByIndex(0)).toBe("Tyrannosaurus Rex");
    expect(getDinosaurByIndex(1)).toBe("Velociraptor");
    expect(getDinosaurByIndex(99)).toBe("Erythrovenator");
  });

  it("throws RangeError for negative indices", () => {
    expect(() => getDinosaurByIndex(-1)).toThrow(RangeError);
  });

  it("throws RangeError for index >= DINOSAUR_COUNT", () => {
    expect(() => getDinosaurByIndex(100)).toThrow(RangeError);
    expect(() => getDinosaurByIndex(200)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer values", () => {
    expect(() => getDinosaurByIndex(1.5)).toThrow(RangeError);
    expect(() => getDinosaurByIndex(NaN)).toThrow(RangeError);
    expect(() => getDinosaurByIndex(Infinity)).toThrow(RangeError);
  });
});

// ─── getRandomDinosaur ──────────────────────────────────────

describe("getRandomDinosaur", () => {
  it("returns a dinosaur from the list", () => {
    const name = getRandomDinosaur();
    expect(DINOSAURS).toContain(name);
  });

  it("uses Math.random internally", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(getRandomDinosaur()).toBe(DINOSAURS[0]);
    spy.mockReturnValue(0.99);
    expect(getRandomDinosaur()).toBe(DINOSAURS[99]);
    spy.mockRestore();
  });
});

// ─── getNextUnlockedDinosaur ────────────────────────────────

describe("getNextUnlockedDinosaur", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a dinosaur not in the unlocked set", () => {
    const unlocked = new Set(["Tyrannosaurus Rex"]);
    const result = getNextUnlockedDinosaur(unlocked);
    expect(result).not.toBe("Tyrannosaurus Rex");
    expect(result).not.toBeNull();
    expect(DINOSAURS).toContain(result);
  });

  it("accepts a plain array as the unlocked parameter", () => {
    const result = getNextUnlockedDinosaur(["Velociraptor"]);
    expect(result).not.toBe("Velociraptor");
    expect(result).not.toBeNull();
  });

  it("returns null when all dinosaurs are unlocked", () => {
    const allUnlocked = new Set(DINOSAURS);
    expect(getNextUnlockedDinosaur(allUnlocked)).toBeNull();
  });

  it("returns the only remaining dinosaur when 99 are unlocked", () => {
    const allButLast = new Set(DINOSAURS.slice(0, 99));
    const result = getNextUnlockedDinosaur(allButLast);
    expect(result).toBe(DINOSAURS[99]);
  });

  it("returns an empty-set result containing any dinosaur", () => {
    const result = getNextUnlockedDinosaur(new Set());
    expect(result).not.toBeNull();
    expect(DINOSAURS).toContain(result);
  });
});

// ─── isDinosaurName ─────────────────────────────────────────

describe("isDinosaurName", () => {
  it("returns true for a valid dinosaur name", () => {
    expect(isDinosaurName("Tyrannosaurus Rex")).toBe(true);
    expect(isDinosaurName("Erythrovenator")).toBe(true);
    expect(isDinosaurName("Moros intrepidus")).toBe(true);
  });

  it("returns false for an invalid name", () => {
    expect(isDinosaurName("Pikachu")).toBe(false);
    expect(isDinosaurName("")).toBe(false);
    expect(isDinosaurName("tyrannosaurus rex")).toBe(false); // case-sensitive
  });
});
