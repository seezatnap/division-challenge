import {
  DINOSAUR_ROSTER,
  TOTAL_DINOSAURS,
  PROBLEMS_PER_MILESTONE,
  getDinosaurForMilestone,
  getMilestoneForDinosaur,
  milestoneFromProblemsSolved,
  getDinosaurForProblemsSolved,
  isRewardMilestone,
  getNextMilestone,
  getAllDinosaurNames,
  getPriorityDinosaurNames,
  getNonPriorityDinosaurNames,
} from "@/features/rewards/dinosaurs";

// ---------------------------------------------------------------------------
// Roster Integrity
// ---------------------------------------------------------------------------

describe("DINOSAUR_ROSTER", () => {
  it("contains exactly 100 dinosaurs", () => {
    expect(DINOSAUR_ROSTER).toHaveLength(100);
  });

  it("exports TOTAL_DINOSAURS as 100", () => {
    expect(TOTAL_DINOSAURS).toBe(100);
  });

  it("exports PROBLEMS_PER_MILESTONE as 5", () => {
    expect(PROBLEMS_PER_MILESTONE).toBe(5);
  });

  it("has no duplicate names", () => {
    const names = DINOSAUR_ROSTER.map((d) => d.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("has 50 priority dinosaurs (JP/JW/Chaos Theory)", () => {
    const priorityCount = DINOSAUR_ROSTER.filter((d) => d.isPriority).length;
    expect(priorityCount).toBe(50);
  });

  it("has 50 non-priority dinosaurs", () => {
    const nonPriorityCount = DINOSAUR_ROSTER.filter(
      (d) => !d.isPriority
    ).length;
    expect(nonPriorityCount).toBe(50);
  });

  it("places all priority dinosaurs before non-priority ones", () => {
    const firstNonPriorityIndex = DINOSAUR_ROSTER.findIndex(
      (d) => !d.isPriority
    );
    const lastPriorityIndex =
      DINOSAUR_ROSTER.length -
      1 -
      [...DINOSAUR_ROSTER].reverse().findIndex((d) => d.isPriority);

    expect(firstNonPriorityIndex).toBeGreaterThan(lastPriorityIndex);
  });

  it("starts with Tyrannosaurus Rex", () => {
    expect(DINOSAUR_ROSTER[0].name).toBe("Tyrannosaurus Rex");
    expect(DINOSAUR_ROSTER[0].isPriority).toBe(true);
  });

  it("ends with Erythrovenator", () => {
    expect(DINOSAUR_ROSTER[99].name).toBe("Erythrovenator");
    expect(DINOSAUR_ROSTER[99].isPriority).toBe(false);
  });

  it("every entry has a non-empty name", () => {
    for (const entry of DINOSAUR_ROSTER) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("every entry has a boolean isPriority field", () => {
    for (const entry of DINOSAUR_ROSTER) {
      expect(typeof entry.isPriority).toBe("boolean");
    }
  });

  it("includes key JP/JW franchise dinosaurs in the priority set", () => {
    const priorityNames = new Set(
      DINOSAUR_ROSTER.filter((d) => d.isPriority).map((d) => d.name)
    );
    const keyDinos = [
      "Tyrannosaurus Rex",
      "Velociraptor",
      "Triceratops",
      "Brachiosaurus",
      "Dilophosaurus",
      "Spinosaurus",
      "Indominus Rex",
      "Indoraptor",
      "Giganotosaurus",
      "Therizinosaurus",
    ];
    for (const name of keyDinos) {
      expect(priorityNames.has(name)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getDinosaurForMilestone
// ---------------------------------------------------------------------------

describe("getDinosaurForMilestone", () => {
  it("returns the first dinosaur for milestone 1", () => {
    const result = getDinosaurForMilestone(1);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Tyrannosaurus Rex");
    expect(result!.isPriority).toBe(true);
  });

  it("returns the second dinosaur for milestone 2", () => {
    const result = getDinosaurForMilestone(2);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Velociraptor");
  });

  it("returns the 50th dinosaur for milestone 50 (last priority)", () => {
    const result = getDinosaurForMilestone(50);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Acrocanthosaurus");
    expect(result!.isPriority).toBe(true);
  });

  it("returns the 51st dinosaur for milestone 51 (first non-priority)", () => {
    const result = getDinosaurForMilestone(51);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Carcharodontosaurus");
    expect(result!.isPriority).toBe(false);
  });

  it("returns the 100th dinosaur for milestone 100", () => {
    const result = getDinosaurForMilestone(100);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Erythrovenator");
    expect(result!.isPriority).toBe(false);
  });

  it("returns undefined for milestone 0", () => {
    expect(getDinosaurForMilestone(0)).toBeUndefined();
  });

  it("returns undefined for negative milestone", () => {
    expect(getDinosaurForMilestone(-1)).toBeUndefined();
  });

  it("returns undefined for milestone > 100", () => {
    expect(getDinosaurForMilestone(101)).toBeUndefined();
  });

  it("returns undefined for non-integer milestone", () => {
    expect(getDinosaurForMilestone(1.5)).toBeUndefined();
  });

  it("is deterministic: same milestone always returns same dinosaur", () => {
    const first = getDinosaurForMilestone(42);
    const second = getDinosaurForMilestone(42);
    expect(first).toEqual(second);
  });
});

// ---------------------------------------------------------------------------
// getMilestoneForDinosaur
// ---------------------------------------------------------------------------

describe("getMilestoneForDinosaur", () => {
  it("returns 1 for Tyrannosaurus Rex", () => {
    expect(getMilestoneForDinosaur("Tyrannosaurus Rex")).toBe(1);
  });

  it("returns 100 for Erythrovenator", () => {
    expect(getMilestoneForDinosaur("Erythrovenator")).toBe(100);
  });

  it("returns undefined for unknown dinosaur", () => {
    expect(getMilestoneForDinosaur("Godzilla")).toBeUndefined();
  });

  it("is case-sensitive", () => {
    expect(getMilestoneForDinosaur("tyrannosaurus rex")).toBeUndefined();
  });

  it("returns correct milestone for a mid-roster dinosaur", () => {
    expect(getMilestoneForDinosaur("Velociraptor")).toBe(2);
    expect(getMilestoneForDinosaur("Spinosaurus")).toBe(6);
  });

  it("is the inverse of getDinosaurForMilestone", () => {
    for (let i = 1; i <= 100; i++) {
      const dino = getDinosaurForMilestone(i)!;
      expect(getMilestoneForDinosaur(dino.name)).toBe(i);
    }
  });
});

// ---------------------------------------------------------------------------
// milestoneFromProblemsSolved
// ---------------------------------------------------------------------------

describe("milestoneFromProblemsSolved", () => {
  it("returns 0 for 0 problems solved", () => {
    expect(milestoneFromProblemsSolved(0)).toBe(0);
  });

  it("returns 0 for 1–4 problems solved", () => {
    for (let i = 1; i <= 4; i++) {
      expect(milestoneFromProblemsSolved(i)).toBe(0);
    }
  });

  it("returns 1 for 5 problems solved", () => {
    expect(milestoneFromProblemsSolved(5)).toBe(1);
  });

  it("returns 1 for 6–9 problems solved", () => {
    for (let i = 6; i <= 9; i++) {
      expect(milestoneFromProblemsSolved(i)).toBe(1);
    }
  });

  it("returns 2 for 10 problems solved", () => {
    expect(milestoneFromProblemsSolved(10)).toBe(2);
  });

  it("returns 100 for 500 problems solved", () => {
    expect(milestoneFromProblemsSolved(500)).toBe(100);
  });

  it("returns > 100 for problems solved beyond roster size", () => {
    expect(milestoneFromProblemsSolved(505)).toBe(101);
  });

  it("returns 0 for negative problems solved", () => {
    expect(milestoneFromProblemsSolved(-5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getDinosaurForProblemsSolved
// ---------------------------------------------------------------------------

describe("getDinosaurForProblemsSolved", () => {
  it("returns undefined for < 5 problems solved", () => {
    expect(getDinosaurForProblemsSolved(0)).toBeUndefined();
    expect(getDinosaurForProblemsSolved(4)).toBeUndefined();
  });

  it("returns T. Rex for 5 problems solved", () => {
    const result = getDinosaurForProblemsSolved(5);
    expect(result).toBeDefined();
    expect(result!.name).toBe("Tyrannosaurus Rex");
  });

  it("returns T. Rex for 6–9 problems solved (still milestone 1)", () => {
    for (let i = 6; i <= 9; i++) {
      expect(getDinosaurForProblemsSolved(i)!.name).toBe("Tyrannosaurus Rex");
    }
  });

  it("returns Velociraptor for 10 problems solved", () => {
    expect(getDinosaurForProblemsSolved(10)!.name).toBe("Velociraptor");
  });

  it("returns Erythrovenator for 500 problems solved", () => {
    expect(getDinosaurForProblemsSolved(500)!.name).toBe("Erythrovenator");
  });

  it("returns undefined for > 500 problems solved (beyond roster)", () => {
    expect(getDinosaurForProblemsSolved(505)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isRewardMilestone
// ---------------------------------------------------------------------------

describe("isRewardMilestone", () => {
  it("returns false for 0 problems solved", () => {
    expect(isRewardMilestone(0)).toBe(false);
  });

  it("returns true for 5 problems solved", () => {
    expect(isRewardMilestone(5)).toBe(true);
  });

  it("returns true for 10 problems solved", () => {
    expect(isRewardMilestone(10)).toBe(true);
  });

  it("returns false for non-milestone counts", () => {
    expect(isRewardMilestone(1)).toBe(false);
    expect(isRewardMilestone(3)).toBe(false);
    expect(isRewardMilestone(7)).toBe(false);
    expect(isRewardMilestone(11)).toBe(false);
  });

  it("returns true for 500 (last possible milestone)", () => {
    expect(isRewardMilestone(500)).toBe(true);
  });

  it("returns true beyond roster size (still a multiple of 5)", () => {
    expect(isRewardMilestone(505)).toBe(true);
  });

  it("returns false for negative values", () => {
    expect(isRewardMilestone(-5)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNextMilestone
// ---------------------------------------------------------------------------

describe("getNextMilestone", () => {
  it("returns 1 for 0 problems solved", () => {
    expect(getNextMilestone(0)).toBe(1);
  });

  it("returns 1 for 1–4 problems solved", () => {
    for (let i = 1; i <= 4; i++) {
      expect(getNextMilestone(i)).toBe(1);
    }
  });

  it("returns 2 for 5 problems solved", () => {
    expect(getNextMilestone(5)).toBe(2);
  });

  it("returns 100 for 495–499 problems solved", () => {
    for (let i = 495; i <= 499; i++) {
      expect(getNextMilestone(i)).toBe(100);
    }
  });

  it("returns undefined for 500 problems solved (all milestones reached)", () => {
    expect(getNextMilestone(500)).toBeUndefined();
  });

  it("returns undefined for > 500 problems solved", () => {
    expect(getNextMilestone(505)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getAllDinosaurNames
// ---------------------------------------------------------------------------

describe("getAllDinosaurNames", () => {
  it("returns an array of 100 strings", () => {
    const names = getAllDinosaurNames();
    expect(names).toHaveLength(100);
    for (const name of names) {
      expect(typeof name).toBe("string");
    }
  });

  it("first name is Tyrannosaurus Rex", () => {
    expect(getAllDinosaurNames()[0]).toBe("Tyrannosaurus Rex");
  });

  it("last name is Erythrovenator", () => {
    expect(getAllDinosaurNames()[99]).toBe("Erythrovenator");
  });
});

// ---------------------------------------------------------------------------
// getPriorityDinosaurNames
// ---------------------------------------------------------------------------

describe("getPriorityDinosaurNames", () => {
  it("returns exactly 50 names", () => {
    expect(getPriorityDinosaurNames()).toHaveLength(50);
  });

  it("starts with Tyrannosaurus Rex", () => {
    expect(getPriorityDinosaurNames()[0]).toBe("Tyrannosaurus Rex");
  });

  it("ends with Acrocanthosaurus", () => {
    expect(getPriorityDinosaurNames()[49]).toBe("Acrocanthosaurus");
  });

  it("all names are present in the full roster as priority", () => {
    const priorityNames = getPriorityDinosaurNames();
    for (const name of priorityNames) {
      const entry = DINOSAUR_ROSTER.find((d) => d.name === name);
      expect(entry).toBeDefined();
      expect(entry!.isPriority).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getNonPriorityDinosaurNames
// ---------------------------------------------------------------------------

describe("getNonPriorityDinosaurNames", () => {
  it("returns exactly 50 names", () => {
    expect(getNonPriorityDinosaurNames()).toHaveLength(50);
  });

  it("starts with Carcharodontosaurus", () => {
    expect(getNonPriorityDinosaurNames()[0]).toBe("Carcharodontosaurus");
  });

  it("ends with Erythrovenator", () => {
    expect(getNonPriorityDinosaurNames()[49]).toBe("Erythrovenator");
  });

  it("all names are present in the full roster as non-priority", () => {
    const nonPriorityNames = getNonPriorityDinosaurNames();
    for (const name of nonPriorityNames) {
      const entry = DINOSAUR_ROSTER.find((d) => d.name === name);
      expect(entry).toBeDefined();
      expect(entry!.isPriority).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Feature exports (from rewards/index.ts)
// ---------------------------------------------------------------------------

describe("rewards feature dinosaur exports", () => {
  it("re-exports all dinosaur utilities from the rewards feature index", async () => {
    const rewards = await import("@/features/rewards");
    expect(rewards.DINOSAUR_ROSTER).toBeDefined();
    expect(rewards.TOTAL_DINOSAURS).toBe(100);
    expect(rewards.PROBLEMS_PER_MILESTONE).toBe(5);
    expect(typeof rewards.getDinosaurForMilestone).toBe("function");
    expect(typeof rewards.getMilestoneForDinosaur).toBe("function");
    expect(typeof rewards.milestoneFromProblemsSolved).toBe("function");
    expect(typeof rewards.getDinosaurForProblemsSolved).toBe("function");
    expect(typeof rewards.isRewardMilestone).toBe("function");
    expect(typeof rewards.getNextMilestone).toBe("function");
    expect(typeof rewards.getAllDinosaurNames).toBe("function");
    expect(typeof rewards.getPriorityDinosaurNames).toBe("function");
    expect(typeof rewards.getNonPriorityDinosaurNames).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// Deterministic order guarantee
// ---------------------------------------------------------------------------

describe("deterministic unlock order", () => {
  it("the roster order never changes across multiple reads", () => {
    const first = getAllDinosaurNames();
    const second = getAllDinosaurNames();
    expect(first).toEqual(second);
  });

  it("milestone-to-dinosaur mapping is bijective for 1..100", () => {
    const seen = new Set<string>();
    for (let m = 1; m <= 100; m++) {
      const dino = getDinosaurForMilestone(m)!;
      expect(dino).toBeDefined();
      expect(seen.has(dino.name)).toBe(false);
      seen.add(dino.name);
    }
    expect(seen.size).toBe(100);
  });
});
