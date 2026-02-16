"use client";

import type { UnlockedDinosaur } from "@/types";
import { DINOSAUR_COUNT } from "@/data/dinosaurs";
import { MOTIFS } from "@/lib/theme";

// ─── Props ─────────────────────────────────────────────────

export interface DinoGalleryProps {
  /** All dinosaurs the player has unlocked so far. */
  unlockedDinosaurs: readonly UnlockedDinosaur[];
}

// ─── Helpers ───────────────────────────────────────────────

/**
 * Format an ISO-8601 date string into a human-readable date.
 * Returns just the date portion in the user's locale.
 */
export function formatEarnedDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Component ─────────────────────────────────────────────

export default function DinoGallery({ unlockedDinosaurs }: DinoGalleryProps) {
  const count = unlockedDinosaurs.length;
  const total = DINOSAUR_COUNT;

  return (
    <section
      aria-label="Dino Gallery"
      className="w-full max-w-3xl"
    >
      {/* Gallery Header */}
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-2xl font-bold text-jungle dark:text-leaf">
          {MOTIFS.bone} Dino Gallery
        </h2>
        <span className="text-sm text-fossil">
          {count} / {total} unlocked
        </span>
      </div>

      {/* Empty State */}
      {count === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed border-earth/30 bg-sand/50 px-6 py-12 text-center dark:border-earth/40 dark:bg-sand/30"
          data-testid="gallery-empty"
        >
          <p className="text-lg font-semibold text-fossil">
            {MOTIFS.egg} No dinosaurs unlocked yet
          </p>
          <p className="mt-2 text-sm text-fossil/70">
            Solve 5 division problems to earn your first dinosaur!
          </p>
        </div>
      ) : (
        /* Gallery Grid */
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3"
          data-testid="gallery-grid"
        >
          {unlockedDinosaurs.map((dino, index) => (
            <div
              key={`${dino.name}-${index}`}
              className="overflow-hidden rounded-lg border border-earth/20 bg-ivory shadow-sm transition-shadow hover:shadow-md dark:border-earth/30 dark:bg-sand"
              data-testid="gallery-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dino.imagePath}
                alt={dino.name}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
              <div className="p-3">
                <p className="font-semibold text-jungle dark:text-leaf">
                  {dino.name}
                </p>
                <p className="mt-1 text-xs text-fossil">
                  {MOTIFS.footprint} Earned {formatEarnedDate(dino.dateEarned)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
