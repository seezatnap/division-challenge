import type { FeatureModuleDescriptor } from "@/features/contracts";

export const workspaceUiModule: FeatureModuleDescriptor = {
  id: "workspace-ui",
  title: "Workspace UI",
  summary: "Bus-stop renderer, glowing active cell controls, and typing interaction surface.",
  rootPath: "src/features/workspace-ui",
};

export * from "./barbasol-spinner";
export * from "./bus-stop-long-division-renderer";
export * from "./fraction-reduction-panel";
export * from "./live-division-workspace-panel";
export * from "./long-multiplication-renderer";
export * from "./live-multiplication-workspace-panel";
export * from "./ui-sound-effects";
