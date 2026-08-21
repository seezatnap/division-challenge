"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ScrollIndicators } from "./scroll-indicators";

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
  formatWeightForDisplay,
  parseRewardDinosaurDossierArtifact,
  toRewardDossierApiPath,
  type RewardDinosaurDossier,
} from "@/features/rewards/lib/dino-dossiers";
import { isProvisionalRewardImagePath } from "@/features/rewards/lib/provisional-reward-image";
import { BarbasolSpinner } from "@/features/workspace-ui/components/barbasol-spinner";

const EMPTY_STATE_TITLE = "No dinos unlocked yet.";
const EMPTY_STATE_COPY =
  "Solve problems to bank amber, then trade it above to unlock your first dinosaur.";

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
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const modalScrollRef = useRef<HTMLElement | null>(null);
  const isLightboxOpenRef = useRef(false);

  useEffect(() => {
    isLightboxOpenRef.current = isLightboxOpen;
  }, [isLightboxOpen]);

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
          toRewardDossierApiPath(selectedReward.dinosaurName),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!dossierResponse.ok) {
          return;
        }

        const dossierResponseBody = (await dossierResponse.json().catch(() => null)) as {
          data?: { dossier?: unknown };
        } | null;
        const parsedDossier = parseRewardDinosaurDossierArtifact(
          dossierResponseBody?.data?.dossier,
        );
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
      if (event.key !== "Escape") {
        return;
      }

      // The lightbox stacks on top of the dossier modal, so it closes first.
      if (isLightboxOpenRef.current) {
        setIsLightboxOpen(false);
        return;
      }

      setSelectedReward(null);
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
    setIsLightboxOpen(false);
  }

  const modalHost = typeof document !== "undefined" ? document.body : null;

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
            <button
              aria-haspopup="dialog"
              className="gallery-card-trigger"
              onClick={() => {
                setSelectedReward(reward);
              }}
              type="button"
            >
              <div className="gallery-thumb">
                {isProvisionalRewardImagePath(reward.imagePath) ? (
                  <BarbasolSpinner className="gallery-thumb-spinner" />
                ) : (
                  <Image
                    alt={`${reward.dinosaurName} unlocked reward image`}
                    className="gallery-image"
                    height={240}
                    loading="lazy"
                    src={reward.imagePath}
                    width={320}
                  />
                )}
              </div>
              <p className="gallery-name">{reward.dinosaurName}</p>
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
              className="jp-modal gallery-detail-modal scroll-indicator-container"
              onClick={(event) => {
                event.stopPropagation();
              }}
              ref={modalScrollRef}
              role="dialog"
            >
              <ScrollIndicators scrollRef={modalScrollRef} />
              <div className="detail-two-panel" data-ui-surface="detail-two-panel">
                <div className="detail-panel-image">
                  {isProvisionalRewardImagePath(selectedReward.imagePath) ? (
                    <div className="gallery-detail-loading">
                      <BarbasolSpinner className="gallery-detail-spinner" />
                    </div>
                  ) : (
                    <div className="detail-image-frame">
                      <Image
                        alt={`${selectedReward.dinosaurName} unlocked reward image`}
                        className="gallery-detail-image"
                        height={540}
                        loading="lazy"
                        src={selectedReward.imagePath}
                        width={960}
                      />
                      <button
                        aria-haspopup="dialog"
                        aria-label={`View ${selectedReward.dinosaurName} image full size`}
                        className="image-zoom-button"
                        data-ui-action="open-image-lightbox"
                        onClick={() => {
                          setIsLightboxOpen(true);
                        }}
                        type="button"
                      >
                        <svg
                          aria-hidden="true"
                          className="image-zoom-icon"
                          fill="none"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.2"
                          viewBox="0 0 24 24"
                        >
                          <circle cx="10.5" cy="10.5" r="6.5" />
                          <path d="M15.5 15.5 21 21" />
                          <path d="M10.5 7.5v6M7.5 10.5h6" />
                        </svg>
                      </button>
                    </div>
                  )}
                  <p className="gallery-detail-meta">
                    Milestone {selectedReward.milestoneSolvedCount} • Earned{" "}
                    <time dateTime={selectedReward.earnedAt}>
                      {formatGalleryEarnedDate(selectedReward.earnedAt)}
                    </time>
                  </p>
                </div>
                {selectedRewardDossier ? (
                  <div className="detail-panel-info">
                    <div className="detail-info-card" data-ui-surface="dino-info-card">
                      <h3 className="info-card-name">{selectedReward.dinosaurName}</h3>
                      {selectedRewardDossier.infoCard ? (
                        <>
                          <p className="info-card-scientific">{selectedRewardDossier.infoCard.scientificName}</p>
                          <dl className="info-card-fields" data-ui-surface="dino-dossier">
                            <dt className="info-card-label">Pronounced:</dt>
                            <dd className="info-card-value">{selectedRewardDossier.infoCard.pronunciation}</dd>
                            <dt className="info-card-label">Diet:</dt>
                            <dd className="info-card-value">{selectedRewardDossier.infoCard.diet}</dd>
                            <dt className="info-card-label">Name Means:</dt>
                            <dd className="info-card-value">{selectedRewardDossier.infoCard.nameMeaning}</dd>
                            <dt className="info-card-label">Length:</dt>
                            <dd className="info-card-value">{formatMetersAsMetersAndFeet(selectedRewardDossier.lengthMeters)}</dd>
                            <dt className="info-card-label">Height:</dt>
                            <dd className="info-card-value">{formatMetersAsMetersAndFeet(selectedRewardDossier.heightMeters)}</dd>
                            <dt className="info-card-label">Weight:</dt>
                            <dd className="info-card-value">{formatWeightForDisplay(selectedRewardDossier.infoCard.weightKg)}</dd>
                            <dt className="info-card-label">Time:</dt>
                            <dd className="info-card-value">{selectedRewardDossier.infoCard.timePeriod}</dd>
                            <dt className="info-card-label">Location:</dt>
                            <dd className="info-card-value">{selectedRewardDossier.infoCard.location}</dd>
                            <dt className="info-card-label">Taxon:</dt>
                            <dd className="info-card-value">{selectedRewardDossier.infoCard.taxon}</dd>
                          </dl>
                        </>
                      ) : (
                        <div className="dino-dossier" data-ui-surface="dino-dossier">
                          <p className="dino-dossier-dimensions">
                            Height: {formatMetersAsMetersAndFeet(selectedRewardDossier.heightMeters)} •
                            Length: {formatMetersAsMetersAndFeet(selectedRewardDossier.lengthMeters)}
                          </p>
                          <ul className="dino-dossier-attributes" aria-label="Dinosaur attributes">
                            {selectedRewardDossier.attributes.map((attribute) => (
                              <li className="dino-dossier-attribute" key={attribute}>
                                {attribute}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="detail-description-section">
                {selectedRewardDossier ? (
                  <p className="dino-dossier-description">
                    {selectedRewardDossier.description}
                  </p>
                ) : null}
              </div>
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

      {isLightboxOpen && selectedReward && modalHost
        ? createPortal(
        <div
          className="jp-lightbox-backdrop"
          data-ui-surface="gallery-image-lightbox"
          onClick={() => {
            setIsLightboxOpen(false);
          }}
          role="presentation"
        >
          <figure
            aria-label={`${selectedReward.dinosaurName} full-size image`}
            aria-modal="true"
            className="jp-lightbox"
            onClick={(event) => {
              event.stopPropagation();
            }}
            role="dialog"
          >
            <Image
              alt={`${selectedReward.dinosaurName} unlocked reward image, full size`}
              className="jp-lightbox-image"
              height={1080}
              priority
              sizes="100vw"
              src={selectedReward.imagePath}
              width={1920}
            />
            <figcaption className="jp-lightbox-caption">
              {selectedReward.dinosaurName}
            </figcaption>
            <button
              aria-label="Close full-size image"
              className="jp-lightbox-close"
              onClick={() => {
                setIsLightboxOpen(false);
              }}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </figure>
        </div>
          ,
          modalHost,
        )
        : null}
    </div>
  );
}
