"use client";

import { useCallback, useEffect, useState } from "react";

export interface ScrollIndicatorsProps {
  /** The scrollable element to observe. */
  scrollRef: React.RefObject<HTMLElement | null>;
  /** Optional className for the container. */
  className?: string;
}

/**
 * Red triangular scroll indicators (up/down arrows) shown when content
 * is scrollable, matching the JP3 Research Center comp style.
 */
export function ScrollIndicators({
  scrollRef,
  className,
}: ScrollIndicatorsProps) {
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollUp(false);
      setCanScrollDown(false);
      return;
    }

    const threshold = 2;
    setCanScrollUp(el.scrollTop > threshold);
    setCanScrollDown(
      el.scrollTop + el.clientHeight < el.scrollHeight - threshold,
    );
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // ResizeObserver fires its callback asynchronously after layout, so it
    // handles the initial measurement without a synchronous setState.
    el.addEventListener("scroll", update, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      resizeObserver.disconnect();
    };
  }, [scrollRef, update]);

  // Also observe content mutations that might change scroll height.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new MutationObserver(update);
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [scrollRef, update]);

  if (!canScrollUp && !canScrollDown) {
    return null;
  }

  function handleScrollUp(): void {
    scrollRef.current?.scrollBy({ top: -120, behavior: "smooth" });
  }

  function handleScrollDown(): void {
    scrollRef.current?.scrollBy({ top: 120, behavior: "smooth" });
  }

  return (
    <div
      className={`scroll-indicators${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-testid="scroll-indicators"
    >
      <button
        className={`scroll-indicator scroll-indicator-up${canScrollUp ? "" : " scroll-indicator-hidden"}`}
        onClick={handleScrollUp}
        tabIndex={-1}
        type="button"
        aria-label="Scroll up"
        data-testid="scroll-indicator-up"
      >
        <svg
          className="scroll-indicator-svg"
          viewBox="0 0 24 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points="12,2 22,18 2,18" />
        </svg>
      </button>
      <button
        className={`scroll-indicator scroll-indicator-down${canScrollDown ? "" : " scroll-indicator-hidden"}`}
        onClick={handleScrollDown}
        tabIndex={-1}
        type="button"
        aria-label="Scroll down"
        data-testid="scroll-indicator-down"
      >
        <svg
          className="scroll-indicator-svg"
          viewBox="0 0 24 20"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polygon points="12,18 2,2 22,2" />
        </svg>
      </button>
    </div>
  );
}
