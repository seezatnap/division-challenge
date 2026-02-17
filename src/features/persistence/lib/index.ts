import type { FeatureModuleDescriptor } from "@/features/contracts";

export const persistenceModule: FeatureModuleDescriptor = {
  id: "persistence",
  title: "Player Profiles",
  summary: "Browser localStorage profile helpers keyed by lowercase player name.",
  rootPath: "src/features/persistence",
};

export * from "./local-player-profiles";
