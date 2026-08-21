"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  createGalleryRewardFromUnlock,
  dispatchDinoGalleryRewardsUpdatedEvent,
} from "@/features/gallery/lib";
import {
  fetchEarnedRewardImageStatus,
  pollEarnedRewardImageUntilReady,
  type EarnedRewardImageStatus,
} from "@/features/rewards/lib/earned-reward-reveal";
import { BarbasolSpinner } from "@/features/workspace-ui/components/barbasol-spinner";

type RewardRevealPhase =
  | "hatching"
  | "cracking"
  | "revealing"
  | "revealed"
  | "missing"
  | "timed-out"
  | "error";
type RewardRevealTransitionPhase = "hatching" | "cracking" | "revealing" | "revealed";
type RewardRevealLoaderPhase = "hatching" | "cracking";

const CRACKING_PHASE_DURATION_MS = 280;
const REVEALING_PHASE_DURATION_MS = 220;

// Rotating kid-friendly lines for the hatching wait; the poll attempt number
// stays internal — "Poll attempt 12" reads like a debug log to an 8-year-old.
const HATCHING_WAIT_LINES = [
  "Warming up the incubator...",
  "Listening for little shell taps...",
  "Counting tiny toeprints in the nest...",
  "Calibrating the egg scanner...",
  "Shhh — keep quiet near the nest...",
] as const;

export interface EarnedRewardRevealPanelProps {
  dinosaurName: string;
  milestoneSolvedCount: number;
  initialStatus?: EarnedRewardImageStatus;
  initialImagePath?: string | null;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  statusEndpoint?: string;
  /**
   * Pop the full-screen reveal modal automatically once the image is ready.
   * The page turns this off for a reward restored from a saved profile, so a
   * dino unlocked last week doesn't re-announce itself on every page load.
   */
  autoOpenRevealModal?: boolean;
  /**
   * "panel" renders the in-page hatching card plus the reveal modal;
   * "modal-only" keeps the polling and the celebration modal but renders no
   * in-page card (the gallery tile already shows the generating state).
   */
  presentation?: "panel" | "modal-only";
}

function createRewardRevealResetKey(
  dinosaurName: string,
  initialStatus: EarnedRewardImageStatus,
  initialImagePath: string | null,
): string {
  return `${dinosaurName}|${initialStatus}|${initialImagePath ?? ""}`;
}

function toInitialRevealPhase(
  initialStatus: EarnedRewardImageStatus,
  initialImagePath: string | null,
): RewardRevealPhase {
  if (initialStatus === "ready" && initialImagePath) {
    return "revealed";
  }

  if (initialStatus === "missing") {
    return "missing";
  }

  return "hatching";
}

function isRewardTransitionPhase(phase: RewardRevealPhase): phase is RewardRevealTransitionPhase {
  return phase === "hatching" || phase === "cracking" || phase === "revealing" || phase === "revealed";
}

function isRewardLoaderPhase(phase: RewardRevealPhase): phase is RewardRevealLoaderPhase {
  return phase === "hatching" || phase === "cracking";
}

function resolveRewardStatusChipLabel(phase: RewardRevealPhase): string {
  if (phase === "cracking") {
    return "Shell Cracking";
  }

  if (phase === "revealing" || phase === "revealed") {
    return "Reward Revealed";
  }

  return "Egg Hatching";
}

function EarnedRewardRevealPanelContent({
  dinosaurName,
  milestoneSolvedCount,
  initialStatus = "generating",
  initialImagePath = null,
  pollIntervalMs,
  maxPollAttempts,
  statusEndpoint,
  autoOpenRevealModal = true,
  presentation = "panel",
}: EarnedRewardRevealPanelProps) {
  const [phase, setPhase] = useState<RewardRevealPhase>(() =>
    toInitialRevealPhase(initialStatus, initialImagePath),
  );
  const [imagePath, setImagePath] = useState<string | null>(initialImagePath);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [isRevealModalOpen, setIsRevealModalOpen] = useState(false);
  const revealedRewardBroadcastKeyRef = useRef<string | null>(null);
  const didAutoOpenRevealModalRef = useRef(false);

  useEffect(() => {
    if (phase !== "cracking") {
      return;
    }

    const timeoutHandle = setTimeout(() => {
      setPhase("revealing");
    }, CRACKING_PHASE_DURATION_MS);

    return () => {
      clearTimeout(timeoutHandle);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "revealing") {
      return;
    }

    const timeoutHandle = setTimeout(() => {
      setPhase("revealed");
    }, REVEALING_PHASE_DURATION_MS);

    return () => {
      clearTimeout(timeoutHandle);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "hatching") {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const result = await pollEarnedRewardImageUntilReady({
          dinosaurName,
          pollIntervalMs,
          maxPollAttempts,
          onPollStatus: (_snapshot, attempt) => {
            if (!isCancelled) {
              setPollAttempt(attempt);
            }
          },
          pollStatus: async (targetDinosaurName) =>
            fetchEarnedRewardImageStatus({
              dinosaurName: targetDinosaurName,
              endpoint: statusEndpoint,
            }),
        });

        if (isCancelled) {
          return;
        }

        if (result.outcome === "revealed") {
          setImagePath(result.snapshot.imagePath);
          setPhase("cracking");
          return;
        }

        setPhase(result.outcome === "missing" ? "missing" : "timed-out");
      } catch {
        if (!isCancelled) {
          setPhase("error");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [dinosaurName, maxPollAttempts, phase, pollIntervalMs, statusEndpoint]);

  useEffect(() => {
    if (phase !== "revealed" || !imagePath) {
      return;
    }

    const broadcastKey = `${dinosaurName}|${milestoneSolvedCount}|${imagePath}`;
    if (revealedRewardBroadcastKeyRef.current === broadcastKey) {
      return;
    }

    revealedRewardBroadcastKeyRef.current = broadcastKey;

    const unlockedReward = createGalleryRewardFromUnlock({
      dinosaurName,
      imagePath,
      milestoneSolvedCount,
    });
    dispatchDinoGalleryRewardsUpdatedEvent([unlockedReward]);
  }, [dinosaurName, imagePath, milestoneSolvedCount, phase]);

  useEffect(() => {
    if (
      !autoOpenRevealModal ||
      phase !== "revealed" ||
      !imagePath ||
      didAutoOpenRevealModalRef.current
    ) {
      return;
    }

    didAutoOpenRevealModalRef.current = true;
    setIsRevealModalOpen(true);
  }, [autoOpenRevealModal, imagePath, phase]);

  useEffect(() => {
    if (!isRevealModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsRevealModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRevealModalOpen]);

  const closeRevealModal = (): void => {
    setIsRevealModalOpen(false);
  };

  const modalHost = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      {presentation === "panel" ? (
      <article
        className="earned-reward-panel"
        data-reward-motion={isRewardTransitionPhase(phase) ? phase : "fallback"}
        data-reward-phase={phase}
        data-ui-surface="earned-reward"
      >
        <header className="earned-reward-header">
          <div>
            <p className="surface-kicker">Earned Reward</p>
            <h3 className="surface-title">Milestone {milestoneSolvedCount}</h3>
          </div>
          <p className="status-chip">{resolveRewardStatusChipLabel(phase)}</p>
        </header>

        {(phase === "revealing" || phase === "revealed") && imagePath ? (
          <figure
            className="reward-reveal-figure"
            data-reveal-state={phase === "revealing" ? "revealing" : "revealed"}
          >
            <Image
              alt={`${dinosaurName} reward image`}
              className="reward-reveal-image"
              height={540}
              // Above the fold when a hatch lands, so skip the lazy round-trip.
              priority
              src={imagePath}
              width={960}
            />
            <figcaption className="reward-reveal-caption">
              {dinosaurName} unlocked at {milestoneSolvedCount} solves.
            </figcaption>
          </figure>
        ) : null}

        {isRewardLoaderPhase(phase) ? (
          <div className="reward-can-loader" data-hatch-state={phase} role="status">
            <BarbasolSpinner />
            {phase === "cracking" ? (
              <>
                <p className="reward-loader-title">Shell fracture detected...</p>
                <p className="reward-loader-copy">
                  {dinosaurName} is breaking through. Hold steady for reveal.
                </p>
              </>
            ) : (
              <>
                <p className="reward-loader-title">The reward egg is hatching...</p>
                <p className="reward-loader-copy">
                  {dinosaurName}:{" "}
                  {HATCHING_WAIT_LINES[pollAttempt % HATCHING_WAIT_LINES.length]}
                </p>
              </>
            )}
          </div>
        ) : null}

        {phase === "missing" ? (
          <p className="reward-loader-copy">
            Reward image generation is not running yet. Keep solving and we&apos;ll hatch it soon.
          </p>
        ) : null}

        {phase === "timed-out" ? (
          <p className="reward-loader-copy">
            Hatching is taking longer than expected. We&apos;ll reveal your reward automatically once ready.
          </p>
        ) : null}

        {phase === "error" ? (
          <p className="reward-loader-copy">
            Could not load reward status right now. Try again in a moment.
          </p>
        ) : null}
      </article>
      ) : null}

      {isRevealModalOpen && imagePath && modalHost
        ? createPortal(
        <div
          className="jp-modal-backdrop jp-modal-backdrop-reveal"
          data-ui-surface="reward-reveal-modal"
          onClick={closeRevealModal}
          role="presentation"
        >
          <div className="jp-modal-aura jp-modal-aura-reveal">
            <section
              aria-label={`${dinosaurName} reward reveal`}
              aria-modal="true"
              className="jp-modal reward-reveal-modal"
              onClick={(event) => {
                event.stopPropagation();
              }}
              role="dialog"
            >
              <p className="surface-kicker">Dino Unlocked</p>
              <h3 className="surface-title reward-modal-title">{dinosaurName}</h3>
              <p className="reward-modal-subtitle">
                Milestone {milestoneSolvedCount} complete.
              </p>
              <Image
                alt={`${dinosaurName} reward image`}
                className="reward-modal-image"
                height={540}
                loading="lazy"
                src={imagePath}
                width={960}
              />
              <button className="jp-button" onClick={closeRevealModal} type="button">
                Back To Board
              </button>
            </section>
          </div>
        </div>
          ,
          modalHost,
        )
        : null}
    </>
  );
}

export function EarnedRewardRevealPanel({
  dinosaurName,
  initialStatus = "generating",
  initialImagePath = null,
  ...props
}: EarnedRewardRevealPanelProps) {
  const rewardRevealResetKey = createRewardRevealResetKey(
    dinosaurName,
    initialStatus,
    initialImagePath,
  );

  return (
    <EarnedRewardRevealPanelContent
      key={rewardRevealResetKey}
      dinosaurName={dinosaurName}
      initialImagePath={initialImagePath}
      initialStatus={initialStatus}
      {...props}
    />
  );
}
