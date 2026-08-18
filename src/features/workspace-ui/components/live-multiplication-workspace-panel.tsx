"use client";

import { useCallback, useState } from "react";

import type { LongMultiplicationStep } from "@/features/contracts";
import type { LongDivisionStepValidationResult } from "@/features/division-engine/lib/step-validation";
import type { MultiplicationActiveStepFocus } from "@/features/workspace-ui/lib";
import {
  DEFAULT_MULTIPLICATION_FEEDBACK_MESSAGE,
  resolveMultiplicationStepCoachMessage,
  type DinoFeedbackMessage,
} from "@/features/workspace-ui/lib";

import { LongMultiplicationRenderer } from "./long-multiplication-renderer";

export interface LiveMultiplicationWorkspacePanelProps {
  readonly multiplicand: number;
  readonly multiplier: number;
  readonly multiplicandDecimalPlaces?: number;
  readonly multiplierDecimalPlaces?: number;
  readonly steps: readonly LongMultiplicationStep[];
  readonly onStepValidation?: (validation: LongDivisionStepValidationResult) => void;
}

interface CoachMessageEntry {
  readonly message: DinoFeedbackMessage;
}

export function LiveMultiplicationWorkspacePanel({
  multiplicand,
  multiplier,
  multiplicandDecimalPlaces = 0,
  multiplierDecimalPlaces = 0,
  steps,
  onStepValidation,
}: LiveMultiplicationWorkspacePanelProps) {
  const [coachMessageEntry, setCoachMessageEntry] = useState<CoachMessageEntry>(() => ({
    message: DEFAULT_MULTIPLICATION_FEEDBACK_MESSAGE,
  }));
  const activeCoachMessage = coachMessageEntry.message;

  const handleActiveStepFocusChange = useCallback(
    (focus: MultiplicationActiveStepFocus) => {
      setCoachMessageEntry({
        message: resolveMultiplicationStepCoachMessage(focus),
      });
    },
    [],
  );
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
      <LongMultiplicationRenderer
        multiplicand={multiplicand}
        multiplicandDecimalPlaces={multiplicandDecimalPlaces}
        multiplier={multiplier}
        multiplierDecimalPlaces={multiplierDecimalPlaces}
        onActiveStepFocusChange={handleActiveStepFocusChange}
        onStepValidation={handleStepValidation}
        steps={steps}
      />

      <aside
        className="hint-stack"
        data-feedback-outcome={activeCoachMessage.outcome}
        data-feedback-tone={activeCoachMessage.tone}
      >
        <h3 className="hint-title">Console Coach</h3>
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
