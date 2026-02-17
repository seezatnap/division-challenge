"use client";

import { useCallback, useState } from "react";

import type { LongDivisionStep } from "@/features/contracts";
import type { LongDivisionStepValidationResult } from "@/features/division-engine/lib/step-validation";
import type { BusStopActiveStepFocus } from "@/features/workspace-ui/lib";
import {
  DEFAULT_DINO_FEEDBACK_MESSAGE,
  resolveCurrentStepCoachMessage,
  type DinoFeedbackMessage,
} from "@/features/workspace-ui/lib/dino-feedback-messaging";

import { BusStopLongDivisionRenderer } from "./bus-stop-long-division-renderer";

export interface LiveDivisionWorkspacePanelProps {
  readonly divisor: number;
  readonly dividend: number;
  readonly steps: readonly LongDivisionStep[];
  readonly onStepValidation?: (validation: LongDivisionStepValidationResult) => void;
}

interface CoachMessageEntry {
  readonly message: DinoFeedbackMessage;
}

export function LiveDivisionWorkspacePanel({
  divisor,
  dividend,
  steps,
  onStepValidation,
}: LiveDivisionWorkspacePanelProps) {
  const [coachMessageEntry, setCoachMessageEntry] = useState<CoachMessageEntry>(() => ({
    message: DEFAULT_DINO_FEEDBACK_MESSAGE,
  }));
  const activeCoachMessage = coachMessageEntry.message;

  const handleActiveStepFocusChange = useCallback((focus: BusStopActiveStepFocus) => {
    setCoachMessageEntry({
      message: resolveCurrentStepCoachMessage(focus),
    });
  }, []);
  const handleStepValidation = useCallback(
    (validation: LongDivisionStepValidationResult) => {
      onStepValidation?.(validation);
    },
    [onStepValidation],
  );

  const coachMessages = [
    {
      message: activeCoachMessage,
    },
  ];

  return (
    <div className="game-grid">
      <BusStopLongDivisionRenderer
        dividend={dividend}
        divisor={divisor}
        enableLiveTyping
        onActiveStepFocusChange={handleActiveStepFocusChange}
        onStepValidation={handleStepValidation}
        revealedStepCount={0}
        steps={steps}
      />

      <aside
        className="hint-stack"
        data-feedback-outcome={activeCoachMessage.outcome}
        data-feedback-tone={activeCoachMessage.tone}
      >
        <h3 className="hint-title">Dino Coach</h3>
        <p className="hint-status">{activeCoachMessage.statusLabel}</p>
        <ul className="coach-list">
          {coachMessages.map((entry) => (
            <li
              className="coach-item"
              data-feedback-key={entry.message.messageKey}
              data-feedback-tone={entry.message.tone}
              key={entry.message.id}
            >
              {entry.message.text}
            </li>
          ))}
        </ul>
        <p className="hint-note">{activeCoachMessage.note}</p>
      </aside>
    </div>
  );
}
