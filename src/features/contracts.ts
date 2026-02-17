export type FeatureModuleId =
  | "division-engine"
  | "workspace-ui"
  | "rewards"
  | "gallery"
  | "persistence";

export interface FeatureModuleDescriptor {
  id: FeatureModuleId;
  title: string;
  summary: string;
  rootPath: string;
}
