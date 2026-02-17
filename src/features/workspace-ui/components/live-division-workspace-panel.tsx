"use client";

import { useCallback, useState } from "react";

import type { LongDivisionStep } from "@/features/contracts";
import type { LongDivisionStepValidationResult } from "@/features/division-engine/lib/step-validation";
import {
  DEFAULT_DINO_FEEDBACK_MESSAGE,
  resolveDinoFeedbackMessage,
  type DinoFeedbackMessage,
} from "@/features/workspace-ui/lib/dino-feedback-messaging";

import { BusStopLongDivisionRenderer } from "./bus-stop-long-division-renderer";

const MAX_COACH_MESSAGE_COUNT = 3;

export interface LiveDivisionWorkspacePanelProps {
  readonly divisor: number;
  readonly dividend: number;
  readonly steps: readonly LongDivisionStep[];
}

export function LiveDivisionWorkspacePanel({
  divisor,
  dividend,
  steps,
}: LiveDivisionWorkspacePanelProps) {
  const [coachMessages, setCoachMessages] = useState<DinoFeedbackMessage[]>([
    DEFAULT_DINO_FEEDBACK_MESSAGE,
  ]);
  const activeCoachMessage = coachMessages[0] ?? DEFAULT_DINO_FEEDBACK_MESSAGE;

  const handleWorkspaceStepValidation = useCallback(
    (validation: LongDivisionStepValidationResult) => {
      const nextMessage = resolveDinoFeedbackMessage(validation);
      setCoachMessages((currentMessages) =>
        [nextMessage, ...currentMessages].slice(0, MAX_COACH_MESSAGE_COUNT),
      );
    },
    [],
  );

  return (
    <div className="game-grid">
      <BusStopLongDivisionRenderer
        dividend={dividend}
        divisor={divisor}
        enableLiveTyping
        onStepValidation={handleWorkspaceStepValidation}
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
          {coachMessages.map((message) => (
            <li
              className="coach-item"
              data-feedback-key={message.messageKey}
              data-feedback-tone={message.tone}
              key={message.id}
            >
              {message.text}
            </li>
          ))}
        </ul>
        <p className="hint-note">{activeCoachMessage.note}</p>
      </aside>
    </div>
  );
}
