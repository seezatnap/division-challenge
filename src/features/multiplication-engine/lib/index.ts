import type { FeatureModuleDescriptor } from "@/features/contracts";

export const multiplicationEngineModule: FeatureModuleDescriptor = {
  id: "multiplication-engine",
  title: "Multiplication Engine",
  summary:
    "Long-multiplication problem generation, partial-product solving, and step sequencing.",
  rootPath: "src/features/multiplication-engine",
};

export * from "./problem-generator";
export * from "./long-multiplication-solver";
