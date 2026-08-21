import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

const PANEL_PATH = "src/features/workspace-ui/components/fraction-reduction-panel.tsx";

test("the fraction panel exposes the surfaces and actions the UI conventions expect", async () => {
  const source = await readRepoFile(PANEL_PATH);

  for (const fragment of [
    'data-ui-surface="fraction-workspace"',
    'data-ui-surface="fraction-row"',
    'data-ui-surface="fraction-divisor-choices"',
    'data-ui-surface="fraction-reduction-line"',
    'data-ui-surface="fraction-helper-modal"',
    'data-ui-component="fraction-value"',
    'data-ui-component="fraction-entry"',
    'data-ui-component="fraction-hint"',
    "data-ui-action={`select-fraction-divisor-${choice}`}",
    "data-ui-action={`open-fraction-helper-${part}`}",
    'data-ui-action="close-fraction-helper"',
  ]) {
    assert.ok(source.includes(fragment), `Expected panel to include ${fragment}`);
  }
});

test("the fraction panel reuses the workspace entry vocabulary rather than form controls", async () => {
  const source = await readRepoFile(PANEL_PATH);

  // Same cell treatment, glow and red shake as the long-division workspace.
  for (const fragment of [
    '"inline-entry"',
    '"digit-cell"',
    "inline-entry-error-pulse",
    "inline-entry-active glow-amber",
    'data-entry-glow={isActive && !isFilled ? "amber" : "none"}',
    'data-entry-state={isFilled ? "locked" : "pending"}',
    "contentEditable={!isFilled}",
    'role="textbox"',
  ]) {
    assert.ok(source.includes(fragment), `Expected panel to include ${fragment}`);
  }

  for (const forbidden of ["<form", "<input", "<select", "<textarea", "<option"]) {
    assert.ok(!source.includes(forbidden), `Panel must not use ${forbidden}`);
  }
});

test("the helper modal embeds the real division workspace and follows the modal pattern", async () => {
  const source = await readRepoFile(PANEL_PATH);

  for (const fragment of [
    "LiveDivisionWorkspacePanel",
    "solveLongDivision",
    "createPortal",
    '"jp-modal-backdrop"',
    '"jp-modal jp-modal-workspace"',
    'aria-modal="true"',
    'role="dialog"',
    'event.key === "Escape"',
    'document.body.style.overflow = "hidden"',
    // Solving in the modal feeds the answer back into the blank.
    "handleHelperValidation",
    "submitEntry(helperModal.part, solvedValue)",
  ]) {
    assert.ok(source.includes(fragment), `Expected helper modal to include ${fragment}`);
  }
});

test("focus follows the active blank so the player never has to click a box", async () => {
  const source = await readRepoFile(PANEL_PATH);

  assert.ok(source.includes("shouldAutoFocus"), "Expected an auto-focus flag");
  assert.ok(
    source.includes("entryElement.focus()"),
    "Expected the active blank to take focus",
  );
  // The numerator is active first; the denominator becomes active once the
  // numerator is filled.
  assert.ok(
    source.includes('isRowActive && !isFilled && (part === "numerator" || isNumeratorFilled)'),
    "Expected numerator-then-denominator activation order",
  );
  // Focus must not be stolen from the scratch pad while it is open.
  assert.ok(
    source.includes("shouldAutoFocus={isActivePart && !isHelperModalOpen}"),
    "Expected auto-focus to stand down while the helper modal is open",
  );
});

test("every offered divisor is rendered, including none of the above", async () => {
  const source = await readRepoFile(PANEL_PATH);

  assert.ok(source.includes("FRACTION_DIVISOR_CHOICES"), "Expected the shared choice list");
  assert.ok(
    source.includes("NO_COMMON_DIVISOR_CHOICE"),
    "Expected the none-of-the-above choice",
  );
  assert.ok(source.includes("None of the above"), "Expected the none-of-the-above label");
  assert.ok(
    source.includes("Divide the numerator and denominator by {row.divisor}"),
    "Expected the divide-by hint next to the blanks",
  );
});

test("the page offers fraction mode and renders the panel for it", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  assert.ok(
    source.includes('{ value: "fractions", label: "Fractions" }'),
    "Expected a Fractions mode option",
  );
  assert.ok(!source.includes('"Mixed Ops"'), "Mixed Ops should be replaced by Fractions");
  assert.ok(
    source.includes('gameSession.activeMode === "fractions" &&\n            isFractionProblem(gameSession.activeProblem) ? ('),
    "Expected the page to branch to the fraction panel on the active mode",
  );
  assert.ok(source.includes("<FractionReductionPanel"), "Expected the panel to be rendered");
  assert.ok(
    source.includes("onProblemSolved={handleFractionProblemSolved}"),
    "Expected the solved callback to be wired",
  );
  // Retired mode must not linger in the mode plumbing.
  assert.ok(!source.includes('=== "mixed"'), "Expected the mixed-mode branch to be gone");
});

test("fraction styling matches the workspace it sits beside", async () => {
  const styles = await readRepoFile("src/app/globals.css");

  const fractionWorkspaceRule = styles.slice(styles.indexOf(".fraction-workspace {"));
  assert.ok(
    /margin-top:\s*1rem/.test(fractionWorkspaceRule.slice(0, 200)),
    "Expected the same top margin as .game-grid so panels do not touch",
  );
  assert.ok(
    styles.includes(".fraction-choice-button.inline-entry-error-pulse"),
    "Expected wrong choices to reuse the error-pulse treatment",
  );
  assert.ok(
    /\.fraction-choice-button\.inline-entry-error-pulse\s*\{[^}]*inline-entry-error-shake/s.test(styles),
    "Expected the wrong-choice animation to reuse the workspace shake keyframes",
  );
  // Controls sit on the dark green panel, so they take the panel text colour
  // rather than a light-on-light fill.
  assert.ok(
    /\.fraction-choice-button\s*\{[^}]*color:\s*var\(--jp-panel-text\)/s.test(styles),
    "Expected choice buttons to use the panel text token",
  );
  assert.ok(
    styles.includes(".jp-modal.jp-modal-workspace"),
    "Expected a wider modal variant for the embedded workspace",
  );
});

test("the fraction engine is registered as a feature module", async () => {
  const [contracts, registry, foundation] = await Promise.all([
    readRepoFile("src/features/contracts.ts"),
    readRepoFile("src/features/registry.ts"),
    readRepoFile("tests/foundation-structure.test.mjs"),
  ]);

  assert.ok(contracts.includes('| "fraction-engine"'), "Expected the module id in contracts");
  assert.ok(
    contracts.includes('export type GameMode = "division" | "multiplication" | "fractions";'),
    "Expected fractions to be a first-class game mode",
  );
  assert.ok(registry.includes("fractionEngineModule"), "Expected registry registration");
  assert.ok(
    foundation.includes("src/features/fraction-engine/index.ts"),
    "Expected the feature directory to be covered by the structure test",
  );
});

test("the divisor chooser is a keyboard-navigable toolbar, not a bare button pile", async () => {
  const source = await readRepoFile(PANEL_PATH);

  // Toolbar rather than radiogroup: arrow keys in a radio group select as they
  // move, which here would submit a wrong answer just for browsing.
  assert.ok(source.includes('role="toolbar"'), "Expected a toolbar role on the choice group");
  assert.ok(
    source.includes('aria-orientation="horizontal"'),
    "Expected the toolbar orientation to be declared",
  );
  assert.ok(
    source.includes("aria-labelledby={promptId}"),
    "Expected the toolbar to be labelled by the question it answers",
  );
  assert.ok(!source.includes('role="radiogroup"'), "A radiogroup would select while arrowing");

  // Roving tabindex: exactly one tab stop, arrows move focus within it.
  assert.ok(
    source.includes("tabIndex={isRovingFocusTarget ? 0 : -1}"),
    "Expected a roving tabindex across the choices",
  );
  assert.ok(
    source.includes('data-roving-focus={isRovingFocusTarget ? "true" : "false"}'),
    "Expected the focus target to be marked for the focus effect",
  );

  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.ok(source.includes(`case "${key}":`), `Expected ${key} to move focus`);
  }
  assert.ok(source.includes("moveChoiceFocus"), "Expected a focus-moving helper");
  assert.ok(
    source.includes("event.preventDefault();"),
    "Expected arrow keys to not also scroll the page",
  );
});

test("focus arrives at the chooser without stealing it back afterwards", async () => {
  const source = await readRepoFile(PANEL_PATH);

  assert.ok(source.includes("shouldFocusChoiceRef"), "Expected a guarded focus flag");
  assert.ok(
    source.includes("choiceToolbarRef.current?.querySelector"),
    "Expected the effect to look inside the toolbar for its focus target",
  );
  assert.ok(
    source.includes('[data-roving-focus="true"]'),
    "Expected the effect to focus the roving target",
  );

  assert.ok(
    source.includes("!shouldFocusChoiceRef.current"),
    "Expected the effect to bail unless focus was explicitly requested",
  );
  assert.ok(
    source.includes("isHelperModalOpen ||"),
    "Expected the chooser not to pull focus out of the scratch pad",
  );
});

test("choice and entry outcomes are announced, not only shaken", async () => {
  const [source, styles] = await Promise.all([
    readRepoFile(PANEL_PATH),
    readRepoFile("src/app/globals.css"),
  ]);

  assert.ok(source.includes('aria-live="polite"'), "Expected a polite live region");
  // The live region lives inside the paper panel: the two-column grid must not
  // gain a third child, or the coach gets pushed below the workspace.
  const gridChildren = source.slice(
    source.indexOf('className="fraction-workspace"'),
    source.indexOf("{helperModal && modalHost"),
  );
  assert.equal(
    (gridChildren.match(/^      <(div|aside|p)\b/gm) ?? []).length,
    2,
    "Expected exactly two children of the fraction workspace grid",
  );
  assert.ok(source.includes('role="status"'), "Expected the live region to be a status");
  assert.ok(source.includes("setChoiceAnnouncement"), "Expected outcomes to be announced");
  assert.ok(
    source.includes("does not divide both"),
    "Expected a wrong divisor to be explained in words",
  );
  assert.ok(
    /\.fraction-announcement\s*\{[^}]*clip-path:\s*inset\(50%\)/s.test(styles),
    "Expected the announcement to be visually hidden but readable by assistive tech",
  );
  assert.ok(
    styles.includes(".fraction-choice-button:focus-visible"),
    "Expected a visible focus ring on the choices",
  );
});

test("a solved fraction gets the same verified coach sign-off as division", async () => {
  const [source, divisionPanel] = await Promise.all([
    readRepoFile(PANEL_PATH),
    readRepoFile("src/features/workspace-ui/components/live-division-workspace-panel.tsx"),
  ]);

  // Division's completion state: celebration tone, which is what paints the
  // coach panel amber.
  assert.ok(
    divisionPanel.includes("data-feedback-tone={activeCoachMessage.tone}"),
    "Expected division to drive the coach tone (guards this comparison)",
  );
  assert.ok(
    source.includes('data-feedback-tone={isSolved ? "celebration" : "encouragement"}'),
    "Expected a solved fraction to switch the coach to the celebration tone",
  );
  assert.ok(
    source.includes('data-feedback-outcome={isSolved ? "complete" : "in-progress"}'),
    "Expected the completion outcome to be exposed like the other panels",
  );
  assert.ok(
    source.includes("Trail computation complete. Run log marked VERIFIED."),
    "Expected the same verified sign-off wording",
  );
  assert.ok(
    source.includes('statusLabel: "Console Sequence Complete"'),
    "Expected the same completion status label",
  );
  assert.ok(source.includes('<h3 className="hint-title">'), "Expected the coach heading level to match");
});
