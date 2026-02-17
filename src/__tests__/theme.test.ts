import {
  colors,
  typography,
  layout,
  dinoMotifs,
  pageBackground,
  cardSurface,
  glowActive,
  headingJurassic,
} from "@/features/theme";

describe("Jurassic Theme — Design Tokens", () => {
  describe("Color palette", () => {
    it("exports jungle green colors", () => {
      expect(colors.jungleDeep).toBe("#1a3a1a");
      expect(colors.jungleDark).toBe("#2d5a27");
      expect(colors.jungleMid).toBe("#3d7a35");
      expect(colors.jungleLight).toBe("#5a9e4f");
      expect(colors.junglePale).toBe("#a8d5a0");
    });

    it("exports amber/gold warm tones", () => {
      expect(colors.amberGlow).toBe("#d4a017");
      expect(colors.amberLight).toBe("#f0c94d");
      expect(colors.amberPale).toBe("#fbe89a");
      expect(colors.amberDark).toBe("#8b6914");
    });

    it("exports earth brown tones", () => {
      expect(colors.earthDark).toBe("#2c1810");
      expect(colors.earthMid).toBe("#5c3a28");
      expect(colors.earthLight).toBe("#8b6849");
      expect(colors.earthPale).toBe("#c4a882");
    });

    it("exports volcanic accent colors", () => {
      expect(colors.volcanicRed).toBe("#8b2500");
      expect(colors.lavaOrange).toBe("#cc5500");
    });

    it("exports fossil neutral colors", () => {
      expect(colors.fossilLight).toBe("#f5f0e8");
      expect(colors.fossilMid).toBe("#e0d5c5");
      expect(colors.fossilDark).toBe("#6b5b4a");
      expect(colors.bone).toBe("#faf7f0");
    });

    it("exports text colors for different contexts", () => {
      expect(colors.textPrimary).toBeDefined();
      expect(colors.textSecondary).toBeDefined();
      expect(colors.textMuted).toBeDefined();
      expect(colors.textOnDark).toBeDefined();
      expect(colors.textOnGlow).toBeDefined();
    });

    it("uses earth/jungle palette (no bright artificial colors)", () => {
      // All palette values should be hex strings
      const allColors = Object.values(colors);
      for (const color of allColors) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("Typography scale", () => {
    it("exports responsive display sizes", () => {
      expect(typography.displayLg).toContain("text-4xl");
      expect(typography.displayLg).toContain("md:text-6xl");
      expect(typography.displayMd).toContain("text-3xl");
      expect(typography.displaySm).toContain("text-2xl");
    });

    it("exports body and caption sizes", () => {
      expect(typography.body).toContain("text-base");
      expect(typography.caption).toContain("text-sm");
      expect(typography.small).toContain("text-xs");
    });

    it("uses bold/extrabold for display headings", () => {
      expect(typography.displayLg).toContain("font-extrabold");
      expect(typography.displayMd).toContain("font-bold");
    });
  });

  describe("Layout utilities", () => {
    it("provides container classes with responsive padding", () => {
      expect(layout.container).toContain("max-w-7xl");
      expect(layout.container).toContain("px-4");
      expect(layout.container).toContain("lg:px-8");
    });

    it("provides responsive grid classes", () => {
      expect(layout.grid2).toContain("grid");
      expect(layout.grid2).toContain("sm:grid-cols-2");
      expect(layout.grid3).toContain("lg:grid-cols-3");
      expect(layout.grid4).toContain("lg:grid-cols-4");
    });

    it("provides section spacing", () => {
      expect(layout.section).toContain("py-8");
      expect(layout.section).toContain("lg:py-16");
    });
  });

  describe("Dino motifs", () => {
    it("provides SVG path data for T-Rex", () => {
      expect(dinoMotifs.trex).toBeDefined();
      expect(dinoMotifs.trex.length).toBeGreaterThan(10);
      expect(dinoMotifs.trex).toContain("M");
    });

    it("provides SVG path data for Brachiosaurus", () => {
      expect(dinoMotifs.brachiosaurus).toBeDefined();
      expect(dinoMotifs.brachiosaurus).toContain("M");
    });

    it("provides SVG path data for fern", () => {
      expect(dinoMotifs.fern).toBeDefined();
      expect(dinoMotifs.fern).toContain("M");
    });

    it("provides SVG path data for footprint", () => {
      expect(dinoMotifs.footprint).toBeDefined();
      expect(dinoMotifs.footprint).toContain("M");
    });
  });

  describe("Composed class strings", () => {
    it("pageBackground includes jungle gradient", () => {
      expect(pageBackground).toContain("min-h-screen");
      expect(pageBackground).toContain("bg-gradient");
      expect(pageBackground).toContain("#1a3a1a");
    });

    it("cardSurface includes themed styling", () => {
      expect(cardSurface).toContain("rounded-xl");
      expect(cardSurface).toContain("border");
      expect(cardSurface).toContain("shadow");
    });

    it("glowActive uses amber glow color", () => {
      expect(glowActive).toContain("ring");
      expect(glowActive).toContain("#d4a017");
      expect(glowActive).toContain("animate-pulse");
    });

    it("headingJurassic uses gradient text", () => {
      expect(headingJurassic).toContain("font-extrabold");
      expect(headingJurassic).toContain("bg-clip-text");
      expect(headingJurassic).toContain("bg-gradient");
    });
  });
});
