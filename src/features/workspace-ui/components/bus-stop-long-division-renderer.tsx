import type { LongDivisionStep } from "@/features/contracts";
import { buildBusStopRenderModel } from "@/features/workspace-ui/lib";

export interface BusStopLongDivisionRendererProps {
  divisor: number;
  dividend: number;
  steps: readonly LongDivisionStep[];
  revealedStepCount?: number;
}

type InlineEntryLane = "quotient" | "work-row";

interface WorkspaceInlineEntryProps {
  lane: InlineEntryLane;
  targetId: string | null;
  value: string;
  isFilled: boolean;
  isActive: boolean;
}

function buildInlineEntryClassName({
  lane,
  isFilled,
  isActive,
}: Pick<WorkspaceInlineEntryProps, "lane" | "isFilled" | "isActive">): string {
  const classes = [
    "inline-entry",
    lane === "quotient"
      ? "inline-entry-quotient digit-cell quotient-digit-cell"
      : "inline-entry-work-row work-row-value",
    isFilled ? "inline-entry-locked" : "inline-entry-pending",
    lane === "quotient" && !isFilled ? "quotient-digit-empty" : "",
    isActive ? "inline-entry-active" : "",
  ];

  return classes.filter(Boolean).join(" ");
}

function renderInlineEntryText(value: string): string {
  return value.length > 0 ? value : "\u00a0";
}

function WorkspaceInlineEntry({ lane, targetId, value, isFilled, isActive }: WorkspaceInlineEntryProps) {
  const isEditable = !isFilled && Boolean(targetId);

  return (
    <span
      aria-label={isEditable ? "Inline workspace entry" : undefined}
      className={buildInlineEntryClassName({ lane, isFilled, isActive })}
      contentEditable={isEditable}
      data-entry-active={isActive ? "true" : "false"}
      data-entry-inline="true"
      data-entry-lane={lane}
      data-entry-state={isFilled ? "locked" : "pending"}
      data-entry-target-id={targetId ?? ""}
      role={isEditable ? "textbox" : undefined}
      spellCheck={false}
      suppressContentEditableWarning={isEditable}
      tabIndex={isEditable ? 0 : undefined}
    >
      {renderInlineEntryText(value)}
    </span>
  );
}

export function BusStopLongDivisionRenderer({
  divisor,
  dividend,
  steps,
  revealedStepCount,
}: BusStopLongDivisionRendererProps) {
  const renderModel = buildBusStopRenderModel({
    divisor,
    dividend,
    steps,
    revealedStepCount,
  });
  const activeTargetId = renderModel.activeTargetId;

  return (
    <article
      aria-label="Long-division workspace"
      className="workspace-paper bus-stop-renderer"
      data-ui-component="bus-stop-renderer"
    >
      <p className="workspace-label">Quotient</p>
      <div className="bus-stop-notation">
        <div className="quotient-row">
          <span aria-hidden="true" className="quotient-row-spacer">
            {renderModel.divisorText}
          </span>
          <div className="quotient-track">
            {renderModel.quotientCells.map((cell) => (
              <WorkspaceInlineEntry
                isActive={Boolean(cell.targetId) && cell.targetId === activeTargetId}
                isFilled={cell.isFilled}
                key={cell.stepId}
                lane="quotient"
                targetId={cell.targetId}
                value={cell.value}
              />
            ))}
          </div>
        </div>

        <div className="bus-stop-core">
          <p className="divisor-cell">{renderModel.divisorText}</p>
          <div className="bracket-stack">
            <p className="dividend-line">{renderModel.dividendText}</p>

            <ol className="work-rows">
              {renderModel.workRows.length === 0 ? (
                <li className="work-row work-row-placeholder">
                  <span aria-hidden="true" className="work-row-op">
                    &nbsp;
                  </span>
                  <span className="work-row-value">...</span>
                </li>
              ) : (
                renderModel.workRows.map((row) => (
                  <li className="work-row" data-step-kind={row.kind} key={row.stepId}>
                    <span aria-hidden="true" className="work-row-op">
                      {row.displayPrefix || "\u00a0"}
                    </span>
                    <WorkspaceInlineEntry
                      isActive={Boolean(row.targetId) && row.targetId === activeTargetId}
                      isFilled={row.isFilled}
                      lane="work-row"
                      targetId={row.targetId}
                      value={row.value}
                    />
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      </div>
    </article>
  );
}
