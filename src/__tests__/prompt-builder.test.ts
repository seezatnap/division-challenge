import { buildDinoPrompt } from "@/features/rewards/prompt-builder";

describe("buildDinoPrompt", () => {
  it("includes the dinosaur name in the prompt", () => {
    const prompt = buildDinoPrompt({ dinosaurName: "Tyrannosaurus Rex" });

    expect(prompt).toContain("Tyrannosaurus Rex");
  });

  it("produces a Jurassic Park cinematic style prompt", () => {
    const prompt = buildDinoPrompt({ dinosaurName: "Velociraptor" });

    expect(prompt).toMatch(/jurassic park/i);
    expect(prompt).toMatch(/cinematic/i);
    expect(prompt).toMatch(/photorealistic/i);
  });

  it("requests no text or watermarks", () => {
    const prompt = buildDinoPrompt({ dinosaurName: "Triceratops" });

    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/watermark/i);
  });

  it("appends an optional sceneHint", () => {
    const prompt = buildDinoPrompt({
      dinosaurName: "Brachiosaurus",
      sceneHint: "by a misty lake at dawn",
    });

    expect(prompt).toContain("Brachiosaurus");
    expect(prompt).toContain("by a misty lake at dawn");
  });

  it("works without a sceneHint", () => {
    const prompt = buildDinoPrompt({ dinosaurName: "Spinosaurus" });

    // Should still be a well-formed prompt without trailing commas
    expect(prompt).toContain("Spinosaurus");
    expect(prompt).not.toContain("undefined");
  });

  it("ignores whitespace-only sceneHint", () => {
    const withHint = buildDinoPrompt({
      dinosaurName: "Stegosaurus",
      sceneHint: "   ",
    });
    const without = buildDinoPrompt({ dinosaurName: "Stegosaurus" });

    expect(withHint).toBe(without);
  });

  it("trims the dinosaur name", () => {
    const prompt = buildDinoPrompt({ dinosaurName: "  Dilophosaurus  " });

    expect(prompt).toContain("Dilophosaurus");
    expect(prompt).not.toContain("  Dilophosaurus");
  });

  it("throws for an empty dinosaurName", () => {
    expect(() => buildDinoPrompt({ dinosaurName: "" })).toThrow(
      "dinosaurName must not be empty",
    );
  });

  it("throws for a whitespace-only dinosaurName", () => {
    expect(() => buildDinoPrompt({ dinosaurName: "   " })).toThrow(
      "dinosaurName must not be empty",
    );
  });

  it("returns a string (not array, not object)", () => {
    const prompt = buildDinoPrompt({ dinosaurName: "Parasaurolophus" });

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
