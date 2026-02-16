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
    <section className="jurassic-card mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="jurassic-heading text-lg font-semibold">Dino Gallery</h3>
        <p className="jurassic-copy text-sm">
          Unlocked:{" "}
          <span className="font-semibold">{sortedUnlockedDinosaurs.length}</span>
        </p>
      </div>

      {sortedUnlockedDinosaurs.length === 0 ? (
        <p className="dino-status dino-status-idle mt-4 text-sm">
          No dinosaurs unlocked yet. Solve 5 problems to earn your first dino.
          Your paddock will fill up fast.
        </p>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {sortedUnlockedDinosaurs.map((dinosaur) => (
            <li
              key={`${dinosaur.name}-${dinosaur.earnedAt}-${dinosaur.imagePath}`}
              className="jurassic-card overflow-hidden"
            >
              <Image
                src={dinosaur.imagePath}
                alt={`${dinosaur.name} reward`}
                width={640}
                height={360}
                unoptimized
                className="h-36 w-full border-b border-amber-900/40 object-cover"
              />
              <div className="space-y-1 p-3">
                <p className="jurassic-heading text-base font-semibold">
                  {dinosaur.name}
                </p>
                <p className="jurassic-copy text-sm">
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
