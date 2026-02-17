"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  createGalleryRewardFromUnlock,
  dispatchDinoGalleryRewardsUpdatedEvent,
} from "@/features/gallery/lib";
import {
  fetchEarnedRewardImageStatus,
  pollEarnedRewardImageUntilReady,
  type EarnedRewardImageStatus,
} from "@/features/rewards/lib/earned-reward-reveal";

type RewardRevealPhase = "hatching" | "revealed" | "missing" | "timed-out" | "error";

export interface EarnedRewardRevealPanelProps {
  dinosaurName: string;
  milestoneSolvedCount: number;
  initialStatus?: EarnedRewardImageStatus;
  initialImagePath?: string | null;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  statusEndpoint?: string;
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

export function EarnedRewardRevealPanel({
  dinosaurName,
  milestoneSolvedCount,
  initialStatus = "generating",
  initialImagePath = null,
  pollIntervalMs,
  maxPollAttempts,
  statusEndpoint,
}: EarnedRewardRevealPanelProps) {
  const [phase, setPhase] = useState<RewardRevealPhase>(() =>
    toInitialRevealPhase(initialStatus, initialImagePath),
  );
  const [imagePath, setImagePath] = useState<string | null>(initialImagePath);
  const [pollAttempt, setPollAttempt] = useState(0);
  const revealedRewardBroadcastKeyRef = useRef<string | null>(null);

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
          setPhase("revealed");
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

  return (
    <article className="earned-reward-panel" data-reward-phase={phase} data-ui-surface="earned-reward">
      <header className="earned-reward-header">
        <div>
          <p className="surface-kicker">Earned Reward</p>
          <h3 className="surface-title">Milestone {milestoneSolvedCount}</h3>
        </div>
        <p className="status-chip">
          {phase === "revealed" ? "Reward Revealed" : "Egg Hatching"}
        </p>
      </header>

      {phase === "revealed" && imagePath ? (
        <figure className="reward-reveal-figure">
          <Image
            alt={`${dinosaurName} reward image`}
            className="reward-reveal-image"
            height={540}
            loading="lazy"
            src={imagePath}
            width={960}
          />
          <figcaption className="reward-reveal-caption">
            {dinosaurName} unlocked at {milestoneSolvedCount} solves.
          </figcaption>
        </figure>
      ) : null}

      {phase === "hatching" ? (
        <div className="reward-egg-loader" role="status">
          <div className="reward-egg-shell" aria-hidden="true">
            <span className="reward-egg-shell-top" />
            <span className="reward-egg-shell-bottom" />
            <span className="reward-egg-shell-crack" />
          </div>
          <p className="reward-loader-title">The reward egg is hatching...</p>
          <p className="reward-loader-copy">
            Checking generation status for {dinosaurName}. Poll attempt {pollAttempt}.
          </p>
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
  );
}
