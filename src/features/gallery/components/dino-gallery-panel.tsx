"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { UnlockedReward } from "@/features/contracts";
import {
  DINO_GALLERY_REWARDS_UPDATED_EVENT,
  formatGalleryEarnedDate,
  mergeUnlockedRewardsForGallery,
  readUnlockedRewardsFromGalleryEvent,
  sortUnlockedRewardsForGallery,
} from "@/features/gallery/lib";
import {
  buildPrimaryDinosaurDossier,
  formatMetersAsMetersAndFeet,
  parseRewardDinosaurDossierArtifact,
  toPrimaryRewardDossierArtifactPath,
  type RewardDinosaurDossier,
} from "@/features/rewards/lib/dino-dossiers";

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
  const [selectedReward, setSelectedReward] = useState<UnlockedReward | null>(null);
  const [selectedRewardDossier, setSelectedRewardDossier] =
    useState<RewardDinosaurDossier | null>(null);

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

  useEffect(() => {
    if (!selectedReward) {
      setSelectedRewardDossier(null);
      return;
    }

    let didCancel = false;
    const abortController = new AbortController();
    setSelectedRewardDossier(buildPrimaryDinosaurDossier(selectedReward.dinosaurName));

    void (async () => {
      try {
        const dossierResponse = await fetch(
          toPrimaryRewardDossierArtifactPath(selectedReward.dinosaurName),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!dossierResponse.ok) {
          return;
        }

        const dossierPayload = (await dossierResponse.json().catch(() => null)) as unknown;
        const parsedDossier = parseRewardDinosaurDossierArtifact(dossierPayload);
        if (!parsedDossier || didCancel) {
          return;
        }

        setSelectedRewardDossier(parsedDossier);
      } catch {
        // Keep the deterministic fallback dossier when the artifact fetch fails.
      }
    })();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setSelectedReward(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      didCancel = true;
      abortController.abort();
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedReward]);

  function closeSelectedReward(): void {
    setSelectedReward(null);
  }

  const modalHost = typeof document !== "undefined" ? document.body : null;

  if (galleryRewards.length === 0) {
    return (
      <div
        className="gallery-shell gallery-shell-research-center"
        data-gallery-layout="research-center-grid"
        data-gallery-state="empty"
      >
        <p className="gallery-empty-title">{EMPTY_STATE_TITLE}</p>
        <p className="gallery-empty-copy">{EMPTY_STATE_COPY}</p>
      </div>
    );
  }

  return (
    <div
      className="gallery-shell gallery-shell-research-center"
      data-gallery-layout="research-center-grid"
      data-gallery-state="unlocked"
    >
      {refreshStatus ? (
        <p className="gallery-refresh-status" role="status">
          {refreshStatus}
        </p>
      ) : null}

      <div className="gallery-grid">
        {galleryRewards.map((reward) => (
          <article className="gallery-card" key={reward.rewardId}>
            <button
              aria-haspopup="dialog"
              className="gallery-card-trigger"
              onClick={() => {
                setSelectedReward(reward);
              }}
              type="button"
            >
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
            </button>
          </article>
        ))}
      </div>

      {selectedReward && modalHost
        ? createPortal(
        <div
          className="jp-modal-backdrop"
          data-ui-surface="gallery-detail-modal"
          onClick={closeSelectedReward}
          role="presentation"
        >
          <div className="jp-modal-aura">
            <section
              aria-label={`${selectedReward.dinosaurName} details`}
              aria-modal="true"
              className="jp-modal gallery-detail-modal"
              onClick={(event) => {
                event.stopPropagation();
              }}
              role="dialog"
            >
              <p className="surface-kicker">Gallery Detail</p>
              <h3 className="surface-title gallery-detail-title">{selectedReward.dinosaurName}</h3>
              <p className="gallery-detail-meta">
                Milestone {selectedReward.milestoneSolvedCount} • Earned{" "}
                <time dateTime={selectedReward.earnedAt}>
                  {formatGalleryEarnedDate(selectedReward.earnedAt)}
                </time>
              </p>
              {selectedRewardDossier ? (
                <section className="dino-dossier" data-ui-surface="dino-dossier">
                  <p className="dino-dossier-dimensions">
                    Height: {formatMetersAsMetersAndFeet(selectedRewardDossier.heightMeters)} •
                    Length: {formatMetersAsMetersAndFeet(selectedRewardDossier.lengthMeters)}
                  </p>
                  <p className="dino-dossier-description">
                    {selectedRewardDossier.description}
                  </p>
                  <ul className="dino-dossier-attributes" aria-label="Dinosaur attributes">
                    {selectedRewardDossier.attributes.map((attribute) => (
                      <li className="dino-dossier-attribute" key={attribute}>
                        {attribute}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <Image
                alt={`${selectedReward.dinosaurName} unlocked reward image`}
                className="gallery-detail-image"
                height={540}
                loading="lazy"
                src={selectedReward.imagePath}
                width={960}
              />
              <button className="jp-button" onClick={closeSelectedReward} type="button">
                Close
              </button>
            </section>
          </div>
        </div>
          ,
          modalHost,
        )
        : null}
    </div>
  );
}
