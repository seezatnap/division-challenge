import type { FeatureModuleDescriptor } from "@/features/contracts";

export const rewardsModule: FeatureModuleDescriptor = {
  id: "rewards",
  title: "Rewards",
  summary: "Milestone tracking, Gemini generation orchestration, and reward prefetch flow.",
  rootPath: "src/features/rewards",
};
