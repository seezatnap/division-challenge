import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DinoGallery, {
  formatUnlockedDinosaurEarnedDate,
  sortUnlockedDinosaursByEarnedDate,
} from "../app/dino-gallery";
import type { UnlockedDinosaur } from "../lib/domain";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("formatUnlockedDinosaurEarnedDate returns fallback text for invalid dates", () => {
  assert.equal(formatUnlockedDinosaurEarnedDate("not-a-date"), "Unknown date");
});

test("sortUnlockedDinosaursByEarnedDate orders most recent entries first", () => {
  const sorted = sortUnlockedDinosaursByEarnedDate([
    {
      name: "Earliest",
      imagePath: "/generated-dinosaurs/earliest.png",
      earnedAt: "2026-02-14T08:00:00.000Z",
    },
    {
      name: "Unknown Timestamp",
      imagePath: "/generated-dinosaurs/unknown.png",
      earnedAt: "not-a-date",
    },
    {
      name: "Latest",
      imagePath: "/generated-dinosaurs/latest.png",
      earnedAt: "2026-02-16T18:00:00.000Z",
    },
  ]);

  assert.deepEqual(sorted.map((dinosaur) => dinosaur.name), [
    "Latest",
    "Earliest",
    "Unknown Timestamp",
  ]);
});

test("DinoGallery renders empty-state guidance with no unlocked dinosaurs", () => {
  const markup = renderToStaticMarkup(
    createElement(DinoGallery, { unlockedDinosaurs: [] }),
  );

  assert.match(markup, /Dino Gallery/);
  assert.match(markup, /No dinosaurs unlocked yet/);
  assert.match(markup, /Solve 5 problems to earn your first dino/);
});

test("DinoGallery renders unlocked dinosaur image, name, and earned date", () => {
  const unlockedDinosaurs: UnlockedDinosaur[] = [
    {
      name: "Tyrannosaurus Rex",
      imagePath: "/generated-dinosaurs/tyrannosaurus-rex.png",
      earnedAt: "2026-02-15T09:30:00.000Z",
    },
    {
      name: "Velociraptor",
      imagePath: "/generated-dinosaurs/velociraptor.png",
      earnedAt: "2026-02-16T11:45:00.000Z",
    },
  ];
  const markup = renderToStaticMarkup(
    createElement(DinoGallery, { unlockedDinosaurs }),
  );

  const velociraptorPosition = markup.indexOf("Velociraptor");
  const tyrannosaurusPosition = markup.indexOf("Tyrannosaurus Rex");
  assert.ok(velociraptorPosition >= 0);
  assert.ok(tyrannosaurusPosition >= 0);
  assert.ok(
    velociraptorPosition < tyrannosaurusPosition,
    "Expected newest unlocked dinosaur to render first in the gallery.",
  );
  assert.match(markup, /src="\/generated-dinosaurs\/velociraptor\.png"/);
  assert.match(
    markup,
    new RegExp(
      `Earned ${escapeRegExp(
        formatUnlockedDinosaurEarnedDate("2026-02-16T11:45:00.000Z"),
      )}`,
    ),
  );
});
