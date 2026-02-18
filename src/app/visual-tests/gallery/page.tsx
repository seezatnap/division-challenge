import { DinoGalleryPanel } from "@/features/gallery/components/dino-gallery-panel";
import type { UnlockedReward } from "@/features/contracts";

const GALLERY_VISUAL_TEST_REWARDS: UnlockedReward[] = Array.from(
  { length: 9 },
  (_, index) => ({
    rewardId: `visual-test-reward-${index}`,
    dinosaurName: [
      "Tyrannosaurus Rex",
      "Velociraptor",
      "Triceratops",
      "Brachiosaurus",
      "Dilophosaurus",
      "Spinosaurus",
      "Stegosaurus",
      "Parasaurolophus",
      "Gallimimus",
    ][index],
    imagePath: `/api/reward-image/${encodeURIComponent(
      [
        "Tyrannosaurus Rex",
        "Velociraptor",
        "Triceratops",
        "Brachiosaurus",
        "Dilophosaurus",
        "Spinosaurus",
        "Stegosaurus",
        "Parasaurolophus",
        "Gallimimus",
      ][index],
    )}/status`,
    earnedAt: new Date(2025, 0, index + 1).toISOString(),
    milestoneSolvedCount: (index + 1) * 5,
  }),
);

export default function GalleryVisualTestPage() {
  return (
    <main className="jurassic-shell">
      <div className="jurassic-content">
        <section
          className="jurassic-panel"
          data-visual-snapshot="gallery-grid"
          data-ui-surface="gallery"
        >
          <DinoGalleryPanel unlockedRewards={GALLERY_VISUAL_TEST_REWARDS} />
        </section>
      </div>
    </main>
  );
}
