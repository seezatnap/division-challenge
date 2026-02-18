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

test("division bracket uses cream/white color derived from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  assert.ok(
    css.includes("bracket-stack"),
    "Expected .bracket-stack rule in globals.css",
  );
  assert.ok(
    css.includes("border-left: var(--division-bracket-stroke-width) solid color-mix(in srgb, var(--jp-panel-text)"),
    "Expected bracket-stack border-left to use --jp-panel-text via color-mix",
  );
  assert.ok(
    css.includes("border-top: var(--division-bracket-stroke-width) solid color-mix(in srgb, var(--jp-panel-text)"),
    "Expected bracket-stack border-top to use --jp-panel-text via color-mix",
  );
  assert.equal(
    css.includes(".bracket-stack") &&
      !css.match(/\.bracket-stack\s*\{[^}]*rgba\(240/),
    true,
    "bracket-stack should not use hardcoded rgba(240...) for border colors",
  );
});

test("digit cells use cream/white text and border derived from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const digitCellSection = css.slice(
    css.indexOf(".digit-cell {"),
    css.indexOf("}", css.indexOf(".digit-cell {")) + 1,
  );
  assert.ok(
    digitCellSection.includes("color: var(--jp-panel-text)"),
    "Expected digit-cell to use --jp-panel-text for text color",
  );
  assert.ok(
    digitCellSection.includes("color-mix(in srgb, var(--jp-panel-text)"),
    "Expected digit-cell border to reference --jp-panel-text via color-mix",
  );
});

test("divisor cell uses cream/white text from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const divisorSection = css.slice(
    css.indexOf(".divisor-cell {"),
    css.indexOf("}", css.indexOf(".divisor-cell {")) + 1,
  );
  assert.ok(
    divisorSection.includes("color: var(--jp-panel-text)"),
    "Expected divisor-cell to use --jp-panel-text",
  );
});

test("dividend-line and work-row-value use cream/white text from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  assert.ok(
    css.includes(".dividend-line,\n.work-line,\n.work-row-value"),
    "Expected combined rule for dividend-line, work-line, work-row-value",
  );

  const combinedRule = css.slice(
    css.indexOf(".dividend-line,\n.work-line,\n.work-row-value"),
    css.indexOf("}", css.indexOf(".dividend-line,\n.work-line,\n.work-row-value")) + 1,
  );
  assert.ok(
    combinedRule.includes("color: var(--jp-panel-text)"),
    "Expected dividend/work text to use --jp-panel-text",
  );
});

test("work-row operator symbols use cream/white text from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const workRowOpSection = css.slice(
    css.indexOf(".work-row-op {"),
    css.indexOf("}", css.indexOf(".work-row-op {")) + 1,
  );
  assert.ok(
    workRowOpSection.includes("color: var(--jp-panel-text)"),
    "Expected work-row-op to use --jp-panel-text for operator color",
  );
});

test("workspace label uses cream/white derived from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const labelSection = css.slice(
    css.indexOf(".workspace-label {"),
    css.indexOf("}", css.indexOf(".workspace-label {")) + 1,
  );
  assert.ok(
    labelSection.includes("color-mix(in srgb, var(--jp-panel-text)"),
    "Expected workspace-label to use --jp-panel-text via color-mix",
  );
});

test("quotient pending border uses cream/white derived from --jp-panel-text instead of clay brown", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const pendingSection = css.slice(
    css.indexOf(".inline-entry-quotient.inline-entry-pending {"),
    css.indexOf("}", css.indexOf(".inline-entry-quotient.inline-entry-pending {")) + 1,
  );
  assert.ok(
    pendingSection.includes("color-mix(in srgb, var(--jp-panel-text)"),
    "Expected quotient pending border to use --jp-panel-text via color-mix",
  );
  assert.equal(
    pendingSection.includes("169, 127, 69"),
    false,
    "Expected no hardcoded clay brown (169, 127, 69) in quotient pending border",
  );
});

test("work-row pending border uses cream/white derived from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const pendingSection = css.slice(
    css.indexOf(".inline-entry-work-row.inline-entry-pending {"),
    css.indexOf("}", css.indexOf(".inline-entry-work-row.inline-entry-pending {")) + 1,
  );
  assert.ok(
    pendingSection.includes("color-mix(in srgb, var(--jp-panel-text)"),
    "Expected work-row pending border to use --jp-panel-text via color-mix",
  );
});

test("multiply-result underline uses cream/white derived from --jp-panel-text", async () => {
  const css = await readRepoFile("src/app/globals.css");

  assert.ok(
    css.includes('.work-row[data-step-kind="multiply-result"] .work-row-value-shell::after'),
    "Expected multiply-result underline rule",
  );

  const ruleStart = css.indexOf('.work-row[data-step-kind="multiply-result"] .work-row-value-shell::after');
  const ruleEnd = css.indexOf("}", ruleStart) + 1;
  const rule = css.slice(ruleStart, ruleEnd);

  assert.ok(
    rule.includes("color-mix(in srgb, var(--jp-panel-text)"),
    "Expected multiply-result underline to use --jp-panel-text via color-mix",
  );
});

test("bring-down animation colors use --jp-panel-bg instead of --jp-bark for green-panel context", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const bringDownSlide = css.slice(
    css.indexOf(".bring-down-digit-slide {"),
    css.indexOf("}", css.indexOf(".bring-down-digit-slide {")) + 1,
  );
  assert.ok(
    bringDownSlide.includes("var(--jp-panel-bg)"),
    "Expected bring-down-digit-slide to mix with --jp-panel-bg",
  );
  assert.equal(
    bringDownSlide.includes("var(--jp-bark)"),
    false,
    "Expected no --jp-bark reference in bring-down-digit-slide",
  );

  const bringDownOrigin = css.slice(
    css.indexOf(".dividend-digit-bring-down-origin {"),
    css.indexOf("}", css.indexOf(".dividend-digit-bring-down-origin {")) + 1,
  );
  assert.ok(
    bringDownOrigin.includes("var(--jp-panel-bg)"),
    "Expected dividend-digit-bring-down-origin to mix with --jp-panel-bg",
  );
  assert.equal(
    bringDownOrigin.includes("var(--jp-bark)"),
    false,
    "Expected no --jp-bark reference in dividend-digit-bring-down-origin",
  );
});

test("lock-in subtraction-result ring uses cream/white from --jp-panel-text instead of moss green", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const lockSubRule = css.slice(
    css.indexOf('.inline-entry-lock-in[data-entry-lock-pulse="subtraction-result"]::after'),
    css.indexOf("}", css.indexOf('.inline-entry-lock-in[data-entry-lock-pulse="subtraction-result"]::after')) + 1,
  );
  assert.ok(
    lockSubRule.includes("color-mix(in srgb, var(--jp-panel-text)"),
    "Expected subtraction-result lock ring to use --jp-panel-text via color-mix",
  );
  assert.equal(
    lockSubRule.includes("113, 137, 81"),
    false,
    "Expected no hardcoded moss green (113, 137, 81) in subtraction-result lock ring",
  );
});

test("active-cell glow remains amber/gold (not changed to cream/white)", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const glowSection = css.slice(
    css.indexOf(".glow-amber {"),
    css.indexOf("}", css.indexOf(".glow-amber {")) + 1,
  );
  assert.ok(
    glowSection.includes("211, 160, 58"),
    "Expected amber/gold colors preserved in glow-amber",
  );
  assert.ok(
    glowSection.includes("244, 212, 141"),
    "Expected amber-bright colors preserved in glow-amber",
  );
  assert.ok(
    glowSection.includes("var(--jp-glow)"),
    "Expected --jp-glow variable preserved in glow-amber",
  );
});

test("error-shake animation preserves red error colors and shake behavior", async () => {
  const css = await readRepoFile("src/app/globals.css");

  assert.ok(
    css.includes("@keyframes inline-entry-error-shake"),
    "Expected error-shake keyframes to be defined",
  );
  assert.ok(
    css.includes(".inline-entry.inline-entry-error-pulse"),
    "Expected error-pulse rule to be defined",
  );

  const errorPulse = css.slice(
    css.indexOf(".inline-entry.inline-entry-error-pulse {"),
    css.indexOf("}", css.indexOf(".inline-entry.inline-entry-error-pulse {")) + 1,
  );
  assert.ok(
    errorPulse.includes("213, 57, 57"),
    "Expected red error colors preserved in error-pulse",
  );
  assert.ok(
    errorPulse.includes("inline-entry-error-shake"),
    "Expected error-shake animation name in error-pulse rule",
  );
});

test("lock-in animation preserves amber/gold flash behavior", async () => {
  const css = await readRepoFile("src/app/globals.css");

  assert.ok(
    css.includes("@keyframes inline-entry-lock-in"),
    "Expected lock-in keyframes to be defined",
  );
  assert.ok(
    css.includes("@keyframes inline-entry-lock-ring"),
    "Expected lock-ring keyframes to be defined",
  );

  const lockInKeyframes = css.slice(
    css.indexOf("@keyframes inline-entry-lock-in"),
    css.indexOf("@keyframes inline-entry-lock-ring"),
  );
  assert.ok(
    lockInKeyframes.includes("244, 212, 141"),
    "Expected amber-bright colors preserved in lock-in keyframes",
  );
  assert.ok(
    lockInKeyframes.includes("211, 160, 58"),
    "Expected amber colors preserved in lock-in keyframes",
  );
});

test("context-value-glow preserves amber highlighting for step focus", async () => {
  const css = await readRepoFile("src/app/globals.css");

  const contextGlow = css.slice(
    css.indexOf(".context-value-glow {"),
    css.indexOf("}", css.indexOf(".context-value-glow {")) + 1,
  );
  assert.ok(
    contextGlow.includes("var(--jp-amber-bright)"),
    "Expected amber-bright color preserved in context-value-glow",
  );
  assert.ok(
    contextGlow.includes("amber-value-pulse"),
    "Expected amber-value-pulse animation preserved",
  );
});
