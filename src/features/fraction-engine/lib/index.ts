import type { FeatureModuleDescriptor } from "@/features/contracts";

export const fractionEngineModule: FeatureModuleDescriptor = {
  id: "fraction-engine",
  title: "Fraction Engine",
  summary:
    "Fraction-reducing problem generation and the round-by-round reduction state machine.",
  rootPath: "src/features/fraction-engine",
};

export * from "./fraction-reduction";
export * from "./problem-generator";
export * from "./reduction-session";
