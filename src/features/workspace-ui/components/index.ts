import type { FeatureModuleDescriptor } from "@/features/contracts";

export const workspaceUiModule: FeatureModuleDescriptor = {
  id: "workspace-ui",
  title: "Workspace UI",
  summary: "Bus-stop renderer, glowing active cell controls, and typing interaction surface.",
  rootPath: "src/features/workspace-ui",
};
