import type { FeatureModuleDescriptor } from "@/features/contracts";

export const rewardsModule: FeatureModuleDescriptor = {
  id: "rewards",
  title: "Rewards",
  summary:
    "Milestone tracking, Gemini generation orchestration, prefetch flow, and earned reward reveal UX.",
  rootPath: "src/features/rewards",
};

export * from "./earned-reward-reveal-panel";
