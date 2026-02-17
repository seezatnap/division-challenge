import Link from "next/link";

export default function GalleryPage() {
  return (
    <div className="min-h-[70vh] px-4">
      {/* Page header */}
      <div className="dino-fade-up mb-8 text-center sm:mb-12">
        <h1 className="dino-heading text-3xl sm:text-4xl md:text-5xl">
          Dino Gallery
        </h1>
        <p className="mt-3 text-sm text-jungle-pale sm:text-base md:text-lg">
          Your collection of unlocked dinosaurs will appear here.
        </p>
      </div>

      {/* Empty state — shown when no dinosaurs unlocked yet */}
      <div className="dino-card mx-auto max-w-lg p-8 text-center sm:p-12">
        <div className="mb-4 text-5xl sm:text-6xl" aria-hidden="true">
          🥚
        </div>
        <h2 className="text-lg font-semibold text-earth-dark sm:text-xl">
          No Dinosaurs Yet
        </h2>
        <p className="mt-2 text-sm text-earth-mid sm:text-base">
          Solve 5 division problems to hatch your first dinosaur!
          Each dino is a unique Jurassic Park-style creation.
        </p>
        <Link
          href="/"
          className="dino-btn dino-btn-primary mt-6 inline-flex"
        >
          Start Practicing
        </Link>
      </div>

      {/* Gallery grid placeholder — DinoCard components will render here */}
      {/* When dinosaurs are unlocked, they display in a responsive grid:
          - Mobile: 2 columns
          - Tablet: 3 columns
          - Desktop: 4 columns
      */}
    </div>
  );
}
