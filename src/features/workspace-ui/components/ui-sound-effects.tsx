"use client";

import { useEffect } from "react";

import { playWorkspaceSoundEffect } from "@/features/workspace-ui/lib";

const CLICKABLE_SELECTOR = 'button, [role="button"], a[href], input[type="submit"]';

/**
 * Installs a document-level listener that plays a synthesized click for every
 * button/link activation site-wide. Renders nothing.
 */
export function UiSoundEffects() {
  useEffect(() => {
    const handlePointerClick = (event: MouseEvent) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      const clickable = eventTarget.closest(CLICKABLE_SELECTOR);
      if (!clickable || (clickable as HTMLButtonElement).disabled) {
        return;
      }

      playWorkspaceSoundEffect("ui-click");
    };

    document.addEventListener("click", handlePointerClick, { capture: true });

    return () => {
      document.removeEventListener("click", handlePointerClick, { capture: true });
    };
  }, []);

  return null;
}
