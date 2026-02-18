"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { UnlockedReward } from "@/features/contracts";
import {
  DINO_GALLERY_REWARDS_UPDATED_EVENT,
  buildResearchCenterDinosaurProfile,
  formatGalleryEarnedDate,
  mergeUnlockedRewardsForGallery,
  readUnlockedRewardsFromGalleryEvent,
  sortUnlockedRewardsForGallery,
} from "@/features/gallery/lib";
import {
  buildPrimaryDinosaurDossier,
  parseRewardDinosaurDossierArtifact,
  toPrimaryRewardDossierArtifactPath,
  type RewardDinosaurDossier,
} from "@/features/rewards/lib/dino-dossiers";

const EMPTY_STATE_TITLE = "No dinos unlocked yet.";
const EMPTY_STATE_COPY =
  "Solve your first 5 division problems to hatch a dinosaur reward and start your gallery.";
const GALLERY_DETAIL_PANEL_ID = "research-center-gallery-detail";

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
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(
    sortedUnlockedRewards[0]?.rewardId ?? null,
  );
  const [selectedRewardDossier, setSelectedRewardDossier] =
    useState<RewardDinosaurDossier | null>(null);

  const selectedReward = useMemo(() => {
    if (galleryRewards.length === 0) {
      return null;
    }

    if (!selectedRewardId) {
      return galleryRewards[0] ?? null;
    }

    return galleryRewards.find((reward) => reward.rewardId === selectedRewardId) ?? galleryRewards[0] ?? null;
  }, [galleryRewards, selectedRewardId]);

  const selectedRewardNameKey = useMemo(
    () => selectedReward?.dinosaurName.trim().toLowerCase() ?? null,
    [selectedReward],
  );

  const activeDossier = useMemo(() => {
    if (!selectedReward) {
      return null;
    }

    const selectedDossierNameKey = selectedRewardDossier?.subjectName.trim().toLowerCase();
    if (selectedRewardDossier && selectedDossierNameKey === selectedRewardNameKey) {
      return selectedRewardDossier;
    }

    return buildPrimaryDinosaurDossier(selectedReward.dinosaurName);
  }, [selectedReward, selectedRewardDossier, selectedRewardNameKey]);

  const selectedRewardProfile = useMemo(() => {
    if (!selectedReward || !activeDossier) {
      return null;
    }

    return buildResearchCenterDinosaurProfile(selectedReward.dinosaurName, activeDossier);
  }, [selectedReward, activeDossier]);

  useEffect(() => {
    setGalleryRewards(sortedUnlockedRewards);
  }, [sortedUnlockedRewards]);

  useEffect(() => {
    if (galleryRewards.length === 0) {
      setSelectedRewardId(null);
      return;
    }

    setSelectedRewardId((currentSelectedRewardId) => {
      if (
        currentSelectedRewardId &&
        galleryRewards.some((reward) => reward.rewardId === currentSelectedRewardId)
      ) {
        return currentSelectedRewardId;
      }

      return galleryRewards[0]?.rewardId ?? null;
    });
  }, [galleryRewards]);

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
    const selectedDinosaurName = selectedReward?.dinosaurName;
    if (!selectedDinosaurName) {
      setSelectedRewardDossier(null);
      return;
    }

    let didCancel = false;
    const abortController = new AbortController();
    setSelectedRewardDossier(buildPrimaryDinosaurDossier(selectedDinosaurName));

    void (async () => {
      try {
        const dossierResponse = await fetch(
          toPrimaryRewardDossierArtifactPath(selectedDinosaurName),
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

    return () => {
      didCancel = true;
      abortController.abort();
    };
  }, [selectedReward]);

  if (galleryRewards.length === 0) {
    return (
      <div className="gallery-shell gallery-shell-jp3" data-gallery-state="empty">
        <p className="gallery-empty-title">{EMPTY_STATE_TITLE}</p>
        <p className="gallery-empty-copy">{EMPTY_STATE_COPY}</p>
      </div>
    );
  }

  return (
    <div className="gallery-shell gallery-shell-jp3" data-gallery-state="unlocked">
      {refreshStatus ? (
        <p className="gallery-refresh-status" role="status">
          {refreshStatus}
        </p>
      ) : null}

      <div className="gallery-research-center-grid" data-ui-surface="gallery-detail-panel">
        <section className="gallery-research-center-grid-rail">
          <div className="gallery-grid gallery-grid-jp3">
            {galleryRewards.map((reward) => {
              const isSelected = reward.rewardId === selectedRewardId;

              return (
                <article className="gallery-card gallery-card-jp3" key={reward.rewardId}>
                  <button
                    aria-controls={GALLERY_DETAIL_PANEL_ID}
                    aria-pressed={isSelected}
                    className="gallery-card-trigger gallery-card-trigger-jp3"
                    data-selected={isSelected ? "true" : "false"}
                    onClick={() => {
                      setSelectedRewardId(reward.rewardId);
                    }}
                    type="button"
                  >
                    <div className="gallery-thumb gallery-thumb-jp3">
                      <Image
                        alt={`${reward.dinosaurName} unlocked reward image`}
                        className="gallery-image gallery-image-jp3"
                        height={352}
                        loading="lazy"
                        src={reward.imagePath}
                        width={640}
                      />
                    </div>
                    <p className="gallery-name gallery-name-jp3">{reward.dinosaurName}</p>
                    <p className="gallery-meta gallery-meta-jp3">
                      Earned{" "}
                      <time dateTime={reward.earnedAt}>
                        {formatGalleryEarnedDate(reward.earnedAt)}
                      </time>
                    </p>
                  </button>
                </article>
              );
            })}
          </div>

          {selectedReward ? (
            <p className="gallery-selected-name-jp3">{selectedReward.dinosaurName}</p>
          ) : null}
        </section>

        {selectedReward && selectedRewardProfile ? (
          <article
            aria-label={`${selectedReward.dinosaurName} detail card`}
            className="gallery-detail-panel-jp3"
            id={GALLERY_DETAIL_PANEL_ID}
          >
            <p className="gallery-detail-meta-jp3">
              Milestone {selectedReward.milestoneSolvedCount} | Earned{" "}
              <time dateTime={selectedReward.earnedAt}>
                {formatGalleryEarnedDate(selectedReward.earnedAt)}
              </time>
            </p>

            <div className="gallery-detail-top-jp3">
              <div className="gallery-detail-portrait-jp3">
                <Image
                  alt={`${selectedReward.dinosaurName} unlocked reward image`}
                  className="gallery-detail-image-jp3"
                  height={540}
                  loading="lazy"
                  src={selectedReward.imagePath}
                  width={960}
                />
              </div>
              <section
                aria-label={`${selectedReward.dinosaurName} data sheet`}
                className="gallery-data-sheet-jp3"
                data-ui-surface="dino-dossier"
              >
                <dl className="gallery-data-sheet-list-jp3">
                  {selectedRewardProfile.rows.map((row) => (
                    <div className="gallery-data-sheet-row-jp3" key={row.label}>
                      <dt className="gallery-data-sheet-term-jp3">{row.label}:</dt>
                      <dd className="gallery-data-sheet-value-jp3">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            <p className="gallery-detail-description-jp3">
              {selectedRewardProfile.description}
            </p>
          </article>
        ) : null}
      </div>
    </div>
  );
}
