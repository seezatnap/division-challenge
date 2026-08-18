import type { FeatureModuleDescriptor } from "@/features/contracts";

export const persistenceModule: FeatureModuleDescriptor = {
  id: "persistence",
  title: "Player Profiles",
  summary:
    "Shared database (Turso/libsql) player profiles, R2 object storage, and browser localStorage compatibility helpers.",
  rootPath: "src/features/persistence",
};

export * from "./local-player-profiles";
export * from "./player-profile-api";
