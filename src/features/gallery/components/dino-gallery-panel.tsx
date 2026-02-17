"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { UnlockedReward } from "@/features/contracts";
import {
  DINO_GALLERY_REWARDS_UPDATED_EVENT,
  formatGalleryEarnedDate,
  mergeUnlockedRewardsForGallery,
  readUnlockedRewardsFromGalleryEvent,
  sortUnlockedRewardsForGallery,
} from "@/features/gallery/lib";

const EMPTY_STATE_TITLE = "No dinos unlocked yet.";
const EMPTY_STATE_COPY =
  "Solve your first 5 division problems to hatch a dinosaur reward and start your gallery.";

export interface DinoGalleryPanelProps {
  unlockedRewards?: readonly UnlockedReward[];
}

export function DinoGalleryPanel({
  unlockedRewards = [],
}: DinoGalleryPanelProps) {
  const sortedUnlockedRewards = useMemo(
    () => sortUnlockedRewardsForGallery(unlockedRewards),
    [unlockedRewards],
  );
  const [galleryRewards, setGalleryRewards] =
    useState<UnlockedReward[]>(sortedUnlockedRewards);
  const [refreshStatus, setRefreshStatus] = useState<string>("");

  useEffect(() => {
    setGalleryRewards(sortedUnlockedRewards);
  }, [sortedUnlockedRewards]);

  useEffect(() => {
    function handleRewardsUpdated(event: Event): void {
      const unlockedRewardsFromEvent = readUnlockedRewardsFromGalleryEvent(event);

      if (unlockedRewardsFromEvent.length === 0) {
        return;
      }

      setGalleryRewards((currentRewards) => {
        const mergedRewards = mergeUnlockedRewardsForGallery(
          currentRewards,
          unlockedRewardsFromEvent,
        );
        const unlockedCountDelta = mergedRewards.length - currentRewards.length;

        if (unlockedCountDelta > 0) {
          setRefreshStatus(
            unlockedCountDelta === 1
              ? "1 new dinosaur added to your gallery."
              : `${unlockedCountDelta} new dinosaurs added to your gallery.`,
          );
        }

        return mergedRewards;
      });
    }

    window.addEventListener(
      DINO_GALLERY_REWARDS_UPDATED_EVENT,
      handleRewardsUpdated,
    );

    return () => {
      window.removeEventListener(
        DINO_GALLERY_REWARDS_UPDATED_EVENT,
        handleRewardsUpdated,
      );
    };
  }, []);

  if (galleryRewards.length === 0) {
    return (
      <div className="gallery-shell" data-gallery-state="empty">
        <p className="gallery-empty-title">{EMPTY_STATE_TITLE}</p>
        <p className="gallery-empty-copy">{EMPTY_STATE_COPY}</p>
      </div>
    );
  }

  return (
    <div className="gallery-shell" data-gallery-state="unlocked">
      {refreshStatus ? (
        <p className="gallery-refresh-status" role="status">
          {refreshStatus}
        </p>
      ) : null}

      <div className="gallery-grid">
        {galleryRewards.map((reward) => (
          <article className="gallery-card" key={reward.rewardId}>
            <div className="gallery-thumb">
              <Image
                alt={`${reward.dinosaurName} unlocked reward image`}
                className="gallery-image"
                height={352}
                loading="lazy"
                src={reward.imagePath}
                width={640}
              />
            </div>
            <p className="gallery-name">{reward.dinosaurName}</p>
            <p className="gallery-meta">
              Earned{" "}
              <time dateTime={reward.earnedAt}>
                {formatGalleryEarnedDate(reward.earnedAt)}
              </time>
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
