import type { FeatureModuleDescriptor } from "@/features/contracts";

export const persistenceModule: FeatureModuleDescriptor = {
  id: "persistence",
  title: "Player Profiles",
  summary:
    "Shared database (Turso/libsql) player profiles and operator credentials, R2 object storage, and browser localStorage compatibility helpers.",
  rootPath: "src/features/persistence",
};

// Client-safe exports only: the server-side auth/database modules import
// node:crypto and live next to these files but are deliberately not re-exported.
export * from "./local-player-profiles";
export * from "./password-policy";
export * from "./player-auth-api";
export * from "./player-profile-api";
