import type { FeatureModuleDescriptor } from "@/features/contracts";
import { divisionEngineModule } from "@/features/division-engine";
import { galleryModule } from "@/features/gallery";
import { persistenceModule } from "@/features/persistence";
import { rewardsModule } from "@/features/rewards";
import { workspaceUiModule } from "@/features/workspace-ui";

export const featureModules: readonly FeatureModuleDescriptor[] = [
  divisionEngineModule,
  workspaceUiModule,
  rewardsModule,
  galleryModule,
  persistenceModule,
];
