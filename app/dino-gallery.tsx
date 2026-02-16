import Image from "next/image";
import type { UnlockedDinosaur } from "@/lib/domain";

const EARNED_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export interface DinoGalleryProps {
  unlockedDinosaurs: readonly UnlockedDinosaur[];
}

export function formatUnlockedDinosaurEarnedDate(earnedAt: string): string {
  const timestamp = Date.parse(earnedAt);
  if (Number.isNaN(timestamp)) {
    return "Unknown date";
  }

  return EARNED_DATE_FORMATTER.format(new Date(timestamp));
}

export function sortUnlockedDinosaursByEarnedDate(
  unlockedDinosaurs: readonly UnlockedDinosaur[],
): UnlockedDinosaur[] {
  return [...unlockedDinosaurs].sort((left, right) => {
    const leftTimestamp = Date.parse(left.earnedAt);
    const rightTimestamp = Date.parse(right.earnedAt);

    if (Number.isNaN(leftTimestamp) && Number.isNaN(rightTimestamp)) {
      return left.name.localeCompare(right.name);
    }

    if (Number.isNaN(leftTimestamp)) {
      return 1;
    }

    if (Number.isNaN(rightTimestamp)) {
      return -1;
    }

    if (leftTimestamp === rightTimestamp) {
      return left.name.localeCompare(right.name);
    }

    return rightTimestamp - leftTimestamp;
  });
}

export default function DinoGallery({ unlockedDinosaurs }: DinoGalleryProps) {
  const sortedUnlockedDinosaurs = sortUnlockedDinosaursByEarnedDate(
    unlockedDinosaurs,
  );

  return (
    <section className="mt-6 rounded-xl border border-emerald-700 bg-emerald-950/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">Dino Gallery</h3>
        <p className="text-sm text-emerald-100">
          Unlocked:{" "}
          <span className="font-semibold">{sortedUnlockedDinosaurs.length}</span>
        </p>
      </div>

      {sortedUnlockedDinosaurs.length === 0 ? (
        <p className="mt-4 rounded-lg border border-emerald-700 bg-emerald-900/30 p-4 text-sm text-emerald-100">
          No dinosaurs unlocked yet. Solve 5 problems to earn your first dino.
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {sortedUnlockedDinosaurs.map((dinosaur) => (
            <li
              key={`${dinosaur.name}-${dinosaur.earnedAt}-${dinosaur.imagePath}`}
              className="overflow-hidden rounded-lg border border-emerald-700 bg-emerald-900/30"
            >
              <Image
                src={dinosaur.imagePath}
                alt={`${dinosaur.name} reward`}
                width={640}
                height={360}
                unoptimized
                className="h-36 w-full object-cover"
              />
              <div className="space-y-1 p-3">
                <p className="text-base font-semibold text-emerald-50">
                  {dinosaur.name}
                </p>
                <p className="text-sm text-emerald-200">
                  Earned {formatUnlockedDinosaurEarnedDate(dinosaur.earnedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
