import type { FeatureModuleDescriptor } from "@/features/contracts";

export const persistenceModule: FeatureModuleDescriptor = {
  id: "persistence",
  title: "Persistence",
  summary: "File System Access save/load adapters with schema-safe fallback support.",
  rootPath: "src/features/persistence",
};

export * from "./game-start-flow";
export * from "./file-system-save-load";
