import type { FeatureModuleDescriptor } from "@/features/contracts";

export const divisionEngineModule: FeatureModuleDescriptor = {
  id: "division-engine",
  title: "Division Engine",
  summary: "Long-division problem generation, solving, validation, and game-loop orchestration.",
  rootPath: "src/features/division-engine",
};

export * from "./problem-generator";
export * from "./long-division-solver";
export * from "./step-validation";
export * from "./game-loop";
