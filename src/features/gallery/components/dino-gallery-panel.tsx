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
  parseRewardDinosaurDossierArtifact,
  toPrimaryRewardDossierArtifactPath,
  type RewardDinosaurDossier,
} from "@/features/rewards/lib/dino-dossiers";

const EMPTY_STATE_TITLE = "No dinos unlocked yet.";
const EMPTY_STATE_COPY =
  "Solve your first 5 division problems to hatch a dinosaur reward and start your gallery.";

interface ResearchCenterInfoCardPreset {
  scientificName: string;
  pronunciation: string;
  diet: string;
  nameMeaning: string;
  length?: string;
  height?: string;
  weight?: string;
  timePeriod: string;
  location: string;
  taxon: string;
  description?: string;
}

interface ResearchCenterDetailField {
  label: string;
  value: string;
}

interface ResearchCenterDetailCard {
  name: string;
  scientificName: string;
  description: string;
  fields: readonly ResearchCenterDetailField[];
}

const RESEARCH_CENTER_INFO_CARD_PRESETS: Readonly<Record<string, ResearchCenterInfoCardPreset>> = {
  brachiosaurus: {
    scientificName: "Brachiosaurus altithorax",
    pronunciation: "Brac - key - o - saw - rus",
    diet: "Herbivore (Plant-Eater)",
    nameMeaning: '"high chested arm reptile"',
    length: "80 feet (25 m)",
    height: "40 feet (12 m)",
    weight: "60 tons (54,500 kilos)",
    timePeriod: "Late Jurassic to Early Cretaceous • 150 million years ago",
    location: "Western U.S., Southern Europe, Northern Africa",
    taxon: "Sauropodomorpha, Sauropoda, Macronaria",
    description:
      "Brachiosaurus stood among the tallest land animals ever discovered, using its long forelimbs and elevated neck to browse the upper canopy where few other herbivores could feed.",
  },
};

const FALLBACK_DIETS = [
  "Herbivore (Plant-Eater)",
  "Carnivore (Meat-Eater)",
  "Omnivore (Mixed Diet)",
] as const;

const FALLBACK_NAME_MEANINGS = [
  '"long-necked giant reptile"',
  '"swift hunting reptile"',
  '"armored ridge reptile"',
  '"crested river reptile"',
  '"high-shouldered plains reptile"',
] as const;

const FALLBACK_TIME_PERIODS = [
  "Late Jurassic • 155 million years ago",
  "Late Jurassic to Early Cretaceous • 150 million years ago",
  "Early Cretaceous • 125 million years ago",
  "Late Cretaceous • 72 million years ago",
] as const;

const FALLBACK_LOCATIONS = [
  "Western North America",
  "North America and Europe",
  "South America and Africa",
  "Asia and North America",
] as const;

const FALLBACK_TAXA = [
  "Theropoda, Tetanurae",
  "Sauropodomorpha, Neosauropoda",
  "Ornithischia, Thyreophora",
  "Ornithopoda, Iguanodontia",
] as const;

const FALLBACK_SPECIES_EPITHETS = [
  "altus",
  "robustus",
  "magnificus",
  "longus",
  "fortis",
] as const;

function toStableHashSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toScientificName(name: string, seed: number): string {
  const normalizedTokens = name.replace(/[^a-zA-Z\s]/g, " ").split(/\s+/).filter(Boolean);

  if (normalizedTokens.length === 0) {
    return "Unknown species";
  }

  if (normalizedTokens.length === 1) {
    return `${normalizedTokens[0]} ${FALLBACK_SPECIES_EPITHETS[seed % FALLBACK_SPECIES_EPITHETS.length]}`;
  }

  const [genus, ...speciesTokens] = normalizedTokens;
  return `${genus} ${speciesTokens.join(" ").toLowerCase()}`;
}

function toPronunciation(name: string): string {
  const normalizedName = name.toLowerCase().replace(/[^a-z\s]/g, " ").trim();
  if (normalizedName.length === 0) {
    return "Not available";
  }

  const chunks = normalizedName
    .split(/\s+/)
    .flatMap((token) => token.match(/[bcdfghjklmnpqrstvwxyz]*[aeiouy]+[bcdfghjklmnpqrstvwxyz]*/g) ?? [token])
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `${chunk.charAt(0).toUpperCase()}${chunk.slice(1)}`);

  return chunks.join(" - ");
}

function formatMetersForCard(meters: number): string {
  const normalizedMeters = Number.isFinite(meters) ? Math.max(0.1, meters) : 0.1;
  const roundedMeters = Math.round(normalizedMeters * 10) / 10;
  const roundedFeet = Math.round(roundedMeters * 3.28084);
  const metersDisplay = Number.isInteger(roundedMeters) ? `${roundedMeters}` : roundedMeters.toFixed(1);
  return `${roundedFeet} feet (${metersDisplay} m)`;
}

function formatWeightForCard(lengthMeters: number, heightMeters: number): string {
  const normalizedLength = Number.isFinite(lengthMeters) ? Math.max(0.1, lengthMeters) : 0.1;
  const normalizedHeight = Number.isFinite(heightMeters) ? Math.max(0.1, heightMeters) : 0.1;
  const estimatedTons = Math.max(1, Math.round((normalizedLength * normalizedHeight * 0.24) * 10) / 10);
  const tonsDisplay = Number.isInteger(estimatedTons) ? `${estimatedTons}` : estimatedTons.toFixed(1);
  const estimatedKilos = Math.round(estimatedTons * 907.185);
  return `${tonsDisplay} tons (${estimatedKilos.toLocaleString("en-US")} kilos)`;
}

function buildResearchCenterDetailCard(input: {
  dinosaurName: string;
  dossier: RewardDinosaurDossier;
}): ResearchCenterDetailCard {
  const name = normalizeName(input.dinosaurName || input.dossier.subjectName);
  const preset = RESEARCH_CENTER_INFO_CARD_PRESETS[name.toLowerCase()];
  const seed = toStableHashSeed(name.toLowerCase());
  const scientificName = preset?.scientificName ?? toScientificName(name, seed);
  const description = preset?.description ?? input.dossier.description;

  return {
    name,
    scientificName,
    description,
    fields: [
      { label: "Pronunciation", value: preset?.pronunciation ?? toPronunciation(name) },
      { label: "Diet", value: preset?.diet ?? FALLBACK_DIETS[seed % FALLBACK_DIETS.length] },
      {
        label: "Name Meaning",
        value: preset?.nameMeaning ?? FALLBACK_NAME_MEANINGS[seed % FALLBACK_NAME_MEANINGS.length],
      },
      { label: "Length", value: preset?.length ?? formatMetersForCard(input.dossier.lengthMeters) },
      { label: "Height", value: preset?.height ?? formatMetersForCard(input.dossier.heightMeters) },
      {
        label: "Weight",
        value: preset?.weight ?? formatWeightForCard(input.dossier.lengthMeters, input.dossier.heightMeters),
      },
      {
        label: "Time Period",
        value: preset?.timePeriod ?? FALLBACK_TIME_PERIODS[seed % FALLBACK_TIME_PERIODS.length],
      },
      { label: "Location", value: preset?.location ?? FALLBACK_LOCATIONS[seed % FALLBACK_LOCATIONS.length] },
      { label: "Taxon", value: preset?.taxon ?? FALLBACK_TAXA[seed % FALLBACK_TAXA.length] },
    ],
  };
}

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
  const selectedRewardDetailCard = useMemo(() => {
    if (!selectedReward || !selectedRewardDossier) {
      return null;
    }

    return buildResearchCenterDetailCard({
      dinosaurName: selectedReward.dinosaurName,
      dossier: selectedRewardDossier,
    });
  }, [selectedReward, selectedRewardDossier]);

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
              className="jp-modal gallery-detail-modal gallery-detail-modal-research-center"
              onClick={(event) => {
                event.stopPropagation();
              }}
              role="dialog"
            >
              <p className="surface-kicker">Research Center Entry</p>
              {selectedRewardDetailCard ? (
                <section
                  className="dino-dossier dino-dossier-research-center"
                  data-ui-surface="dino-dossier"
                >
                  <div className="gallery-detail-top">
                    <figure className="gallery-detail-figure">
                      <Image
                        alt={`${selectedReward.dinosaurName} unlocked reward image`}
                        className="gallery-detail-image gallery-detail-image-research-center"
                        height={540}
                        loading="lazy"
                        src={selectedReward.imagePath}
                        width={960}
                      />
                    </figure>
                    <section className="gallery-detail-sheet" aria-label={`${selectedReward.dinosaurName} info card`}>
                      <h3 className="surface-title gallery-detail-sheet-title">
                        {selectedRewardDetailCard.name}
                      </h3>
                      <p className="gallery-detail-sheet-scientific">
                        {selectedRewardDetailCard.scientificName}
                      </p>
                      <dl className="gallery-detail-sheet-grid">
                        {selectedRewardDetailCard.fields.map((field) => (
                          <div className="gallery-detail-sheet-row" key={field.label}>
                            <dt className="gallery-detail-sheet-label">{field.label}:</dt>
                            <dd className="gallery-detail-sheet-value">{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                  <p className="dino-dossier-description gallery-detail-description">
                    {selectedRewardDetailCard.description}
                  </p>
                </section>
              ) : null}
              <div className="gallery-detail-actions">
                <button className="jp-button" onClick={closeSelectedReward} type="button">
                  Close
                </button>
              </div>
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
