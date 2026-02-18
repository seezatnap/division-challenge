export interface ScrollIndicatorState {
  isScrollable: boolean;
  canScrollUp: boolean;
  canScrollDown: boolean;
}

interface ScrollIndicatorMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const SCROLL_EPSILON = 1.5;

export const INITIAL_SCROLL_INDICATOR_STATE: ScrollIndicatorState = {
  isScrollable: false,
  canScrollUp: false,
  canScrollDown: false,
};

export function resolveScrollIndicatorState(
  metrics: ScrollIndicatorMetrics,
): ScrollIndicatorState {
  const scrollRange = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const isScrollable = scrollRange > SCROLL_EPSILON;
  const boundedScrollTop = Math.min(Math.max(0, metrics.scrollTop), scrollRange);

  if (!isScrollable) {
    return INITIAL_SCROLL_INDICATOR_STATE;
  }

  return {
    isScrollable: true,
    canScrollUp: boundedScrollTop > SCROLL_EPSILON,
    canScrollDown: boundedScrollTop < scrollRange - SCROLL_EPSILON,
  };
}
