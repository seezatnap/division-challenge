import type { FeatureModuleDescriptor } from "@/features/contracts";

export const persistenceModule: FeatureModuleDescriptor = {
  id: "persistence",
  title: "Player Profiles",
  summary:
    "Shared sqlite-backed player profiles with browser localStorage compatibility helpers.",
  rootPath: "src/features/persistence",
};

export * from "./local-player-profiles";
export * from "./player-profile-api";
