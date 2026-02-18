import { useEffect, useState } from "react";

import {
  INITIAL_SCROLL_INDICATOR_STATE,
  resolveScrollIndicatorState,
  type ScrollIndicatorState,
} from "@/features/hooks/scroll-indicator-state";

export function useScrollIndicatorState(
  scrollElement: HTMLElement | null,
): ScrollIndicatorState {
  const [scrollIndicatorState, setScrollIndicatorState] =
    useState<ScrollIndicatorState>(INITIAL_SCROLL_INDICATOR_STATE);
  const resolvedScrollIndicatorState = scrollElement
    ? scrollIndicatorState
    : INITIAL_SCROLL_INDICATOR_STATE;

  useEffect(() => {
    if (!scrollElement) {
      return;
    }

    let animationFrameId: number | null = null;

    const syncScrollIndicatorState = (): void => {
      const nextState = resolveScrollIndicatorState({
        scrollTop: scrollElement.scrollTop,
        scrollHeight: scrollElement.scrollHeight,
        clientHeight: scrollElement.clientHeight,
      });

      setScrollIndicatorState((previousState) => {
        if (
          previousState.isScrollable === nextState.isScrollable &&
          previousState.canScrollUp === nextState.canScrollUp &&
          previousState.canScrollDown === nextState.canScrollDown
        ) {
          return previousState;
        }

        return nextState;
      });
    };

    const scheduleScrollIndicatorSync = (): void => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        syncScrollIndicatorState();
      });
    };

    scheduleScrollIndicatorSync();

    scrollElement.addEventListener("scroll", scheduleScrollIndicatorSync, {
      passive: true,
    });
    window.addEventListener("resize", scheduleScrollIndicatorSync);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleScrollIndicatorSync);
    resizeObserver?.observe(scrollElement);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      scrollElement.removeEventListener("scroll", scheduleScrollIndicatorSync);
      window.removeEventListener("resize", scheduleScrollIndicatorSync);
      resizeObserver?.disconnect();
    };
  }, [scrollElement]);

  return resolvedScrollIndicatorState;
}
