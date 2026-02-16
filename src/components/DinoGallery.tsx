"use client";

import type { UnlockedDinosaur } from "@/types";
import { DINOSAUR_COUNT } from "@/data/dinosaurs";

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
        <h2 className="text-2xl font-bold">Dino Gallery</h2>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {count} / {total} unlocked
        </span>
      </div>

      {/* Empty State */}
      {count === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-600"
          data-testid="gallery-empty"
        >
          <p className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
            No dinosaurs unlocked yet
          </p>
          <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
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
              className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-700 dark:bg-zinc-900"
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
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">
                  {dino.name}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Earned {formatEarnedDate(dino.dateEarned)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
