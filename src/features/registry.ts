import type { FeatureModuleDescriptor } from "@/features/contracts";
import { divisionEngineModule } from "@/features/division-engine/lib";
import { fractionEngineModule } from "@/features/fraction-engine/lib";
import { multiplicationEngineModule } from "@/features/multiplication-engine/lib";
import { galleryModule } from "@/features/gallery/components";
import { persistenceModule } from "@/features/persistence/lib";
import { rewardsModule } from "@/features/rewards/components";
import { workspaceUiModule } from "@/features/workspace-ui/components";

export const featureModules: readonly FeatureModuleDescriptor[] = [
  divisionEngineModule,
  multiplicationEngineModule,
  fractionEngineModule,
  workspaceUiModule,
  rewardsModule,
  galleryModule,
  persistenceModule,
];
