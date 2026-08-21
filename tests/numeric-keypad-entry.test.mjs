import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

// Every digit cell is a contentEditable span, not an <input>, so the only
// thing that summons the numeric keypad on phones is inputmode="numeric".
const ENTRY_RENDERERS = [
  "src/features/workspace-ui/components/bus-stop-long-division-renderer.tsx",
  "src/features/workspace-ui/components/long-multiplication-renderer.tsx",
  "src/features/workspace-ui/components/fraction-reduction-panel.tsx",
];

test("every inline digit entry cell requests the numeric keypad on mobile", async () => {
  for (const relativePath of ENTRY_RENDERERS) {
    const source = await readFile(path.join(repoRoot, relativePath), "utf8");
    const cellStart = source.indexOf("contentEditable=");
    assert.ok(cellStart !== -1, `Expected a contentEditable entry cell in ${relativePath}`);
    const cellEnd = source.indexOf(">", cellStart);
    const cellProps = source.slice(cellStart, cellEnd);
    assert.ok(
      cellProps.includes('inputMode="numeric"'),
      `Expected inputMode="numeric" on the entry cell in ${relativePath}`,
    );
  }
});
