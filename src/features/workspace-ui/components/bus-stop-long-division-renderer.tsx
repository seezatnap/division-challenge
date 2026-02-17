import type { LongDivisionStep } from "@/features/contracts";
import { buildBusStopRenderModel } from "@/features/workspace-ui/lib";

export interface BusStopLongDivisionRendererProps {
  divisor: number;
  dividend: number;
  steps: readonly LongDivisionStep[];
  revealedStepCount?: number;
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
              <span
                className={`digit-cell quotient-digit-cell${cell.isFilled ? "" : " quotient-digit-empty"}`}
                data-filled={cell.isFilled ? "true" : "false"}
                key={cell.stepId}
              >
                {cell.isFilled ? cell.value : "\u00a0"}
              </span>
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
                    <span className="work-row-value">{row.value}</span>
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
