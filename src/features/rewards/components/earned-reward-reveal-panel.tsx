"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  fetchEarnedRewardImageStatus,
  pollEarnedRewardImageUntilReady,
  type EarnedRewardImageStatus,
} from "@/features/rewards/lib/earned-reward-reveal";

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

  return (
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
            loading="lazy"
            src={imagePath}
            width={960}
          />
          <figcaption className="reward-reveal-caption">
            {dinosaurName} unlocked at {milestoneSolvedCount} solves.
          </figcaption>
        </figure>
      ) : null}

      {isRewardLoaderPhase(phase) ? (
        <div className="reward-egg-loader" data-hatch-state={phase} role="status">
          <div className="reward-egg-shell" aria-hidden="true">
            <span className="reward-egg-shell-top" />
            <span className="reward-egg-shell-bottom" />
            <span className="reward-egg-shell-crack" />
          </div>
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
                Checking generation status for {dinosaurName}. Poll attempt {pollAttempt}.
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
  );
}
