# Tasks

**IMPORTANT — Source Material Reference**: All visual design work in this project MUST reference the comp images in `./test-comp-targets/` as the authoritative style guide. Specifically:
- `test-comp-targets/Jp3websitebrachi.webp` — Primary comp: JP3 "Research Center" interface with wood/bamboo frame borders, bright green info panels, jungle canopy background, 3×3 dinosaur thumbnail grid, Brachiosaurus detail info card, "ISLA SORNA SURVEILLANCE DEVICE" dark metallic footer bar with icon buttons, JP3 logo bottom-left, red triangular scroll arrows.
- `test-comp-targets/download.jpeg` — Secondary comp: Same JP3 web aesthetic applied to a game info page, confirming the consistent design language.
Every task below should be implemented to visually match these comps. When in doubt about a color, layout proportion, texture, or UI pattern, open the comp images and match what you see there.

## Design System Foundation

- [x] (#1) Update the CSS custom properties palette in `globals.css` to replace sand/ivory tokens with JP3 green panel colors matching the green seen in `test-comp-targets/Jp3websitebrachi.webp`, add new tokens for wood frame, dark metallic toolbar, silver toolbar text, and accent red, while preserving amber/glow tokens for active-cell highlighting [5 pts] (A) (A)
- [x] (#2) Replace the current radial-gradient body background with a full-viewport jungle canopy background image matching the lush tropical tree canopy visible behind panels in `test-comp-targets/Jp3websitebrachi.webp` (generate or source a dark atmospheric tropical canopy JPG, place in `public/`, apply as `background-image` on body with `background-size: cover`) [5 pts] (blocked by #1) (A) (A)
- [x] (#3) Implement a wood/bamboo textured border frame that surrounds the entire app viewport on all four sides, matching the weathered rough-hewn wood frame with visible grain texture seen in `test-comp-targets/Jp3websitebrachi.webp`, including decorative corner bolt/rivet details at the frame corners as shown in the comp [5 pts] (blocked by #1) (A) (A)

## Panel Restyling

- [x] (#4) Restyle `.jurassic-panel` from translucent ivory to opaque bright JP3 green matching the info panel color in `test-comp-targets/Jp3websitebrachi.webp` (approximately `#1a7a2e`), with darker green inset borders giving the "computer screen" bevel effect visible in the comp, and update all text within panels to cream/white for readability as shown in the comp's data text [5 pts] (blocked by #1) (A) (B)
- [x] (#5) Update the motif overlay pseudo-element classes (`.motif-canopy`, `.motif-claw`, `.motif-fossil`, `.motif-track`) to work with the new green panel backgrounds, adjusting opacity and colors so they remain subtle decorative accents [5 pts] (blocked by #4) (B) (C)

## Toolbar / Footer Bar

- [x] (#6) Build a persistent bottom toolbar component matching the "ISLA SORNA SURVEILLANCE DEVICE" bar shown at the bottom of `test-comp-targets/Jp3websitebrachi.webp`: dark metallic background, centered small-caps label, small icon buttons matching the equipment pictograms in the comp (footprint, fossil, DNA helix, egg), and a "MORE" link with red arrow indicator as shown in the comp's bottom-right corner [5 pts] (blocked by #1) (A) (B)
- [x] (#7) Wire session stats (problems solved, current streak, difficulty level) into the toolbar bar so they display as readout-style data alongside the icon buttons, maintaining the comp's dark metallic aesthetic [5 pts] (blocked by #6) (B) (B)

## Division Workspace Adaptation

- [x] (#8) Adapt the `BusStopLongDivisionRenderer` color scheme for green-panel backgrounds as seen in `test-comp-targets/Jp3websitebrachi.webp`: division bracket, digits, operator symbols, and work-row text should render in cream/white matching the comp's text color on green; active-cell glow remains amber/gold; error-shake and lock-in animations keep their current behavior but use updated colors [5 pts] (blocked by #4) (A) (A)
- [x] (#9) Restyle the "Dino Coach" sidebar in `LiveDivisionWorkspacePanel` as a field-station readout sub-panel consistent with the comp's inset panel styling: slightly darker green or bordered inset, with coaching messages in monospace or clean sans-serif cream text [5 pts] (blocked by #4) (B) (B)

## Gallery Rework

- [x] (#10) Rework `DinoGalleryPanel` thumbnail grid to match the JP3 Research Center thumbnail grid layout shown in the left panel of `test-comp-targets/Jp3websitebrachi.webp`: bright green tile backgrounds, dinosaur images centered within tiles, name labels below each tile, 3×3 grid matching the comp's proportions [5 pts] (blocked by #4) (A) (A)
- [x] (#11) Implement the Research Center two-panel detail view for gallery matching `test-comp-targets/Jp3websitebrachi.webp`: when a dinosaur is selected, show dinosaur image top-left with a data-sheet info card on the right (name, scientific name, pronunciation, diet, name meaning, length, height, weight, time period, location, taxon) matching the exact layout of the Brachiosaurus info card in the comp, description paragraph below [5 pts] (blocked by #10) (A) (A)
- [B] (#12) Add red triangular scroll indicators (up/down arrows) for scrollable content areas in the gallery detail view and any overflow panels, matching the red triangle scroll arrows visible in the right panel of `test-comp-targets/Jp3websitebrachi.webp` [5 pts] (blocked by #11) (B)

## Player Start & Reward Screens

- [x] (#13) Restyle the player-start screen with the Research Center title treatment matching the "The Research Center" heading style in `test-comp-targets/Jp3websitebrachi.webp`: serif heading, subtitle text, all on a green panel within the wood frame, with the player-name input styled as a field-station terminal input (cream text on dark-green input field) [5 pts] (blocked by #3, #4) (B) (C)
- [x] (#14) Adapt `EarnedRewardRevealPanel` to use green panel + wood frame aesthetic consistent with the comp's panel styling for the egg-hatching container, and style the revealed dinosaur image in a bordered frame matching the comp's dinosaur portrait area in the info card [5 pts] (blocked by #4) (B) (B)

## Layout & Responsive

- [x] (#15) Update the `.jurassic-content` grid layout for desktop to use the comp's two-column proportions as seen in `test-comp-targets/Jp3websitebrachi.webp` (left navigation/gallery column, right workspace/detail column) and ensure the wood frame, toolbar, and jungle background remain correct at all breakpoints [5 pts] (blocked by #3, #6) (A) (A)

## Visual Tests

- [x] (#16) Create `tests/jp3-design-visual.test.mjs` with Playwright visual tests that validate the implementation matches `test-comp-targets/Jp3websitebrachi.webp`: (a) full-page screenshot verifying wood frame border is visible on all four sides, (b) pixel-sample panel centers to assert green background matching the comp's green (R<80, G>100, B<80), (c) verify bottom toolbar is dark-colored and contains expected label text matching the comp's "SURVEILLANCE DEVICE" bar [5 pts] (blocked by #3, #4, #6) (A) (C)
- [B] (#17) Add gallery visual tests validating against the comp: verify gallery renders as a grid of green tiles with dinosaur thumbnails matching the 3×3 grid in `test-comp-targets/Jp3websitebrachi.webp`, check grid has expected column count, verify tiles have green backgrounds via pixel sampling [5 pts] (blocked by #10, #16) (B)
- [C] (#18) Add workspace contrast and typography visual tests: verify workspace text elements are light-colored on green background with sufficient contrast as shown in the comp, verify heading elements use serif font and body uses sans-serif via computed style checks [5 pts] (blocked by #8, #16) (B)
- [C] (#19) Add active-glow visual test: verify the active input cell glows amber/gold against the green panel background (adapt existing glow tests if needed with updated selectors) [5 pts] (blocked by #8, #16) (B)

## Existing Test Updates

- [x] (#20) Update `tests/jurassic-theme-ui.test.mjs` assertions to match the new CSS class names, color values, and design tokens introduced by the JP3 restyling [5 pts] (blocked by #4, #6) (A) (C)

## Polish & Integration

- [A] (#21) Run the full existing test suite (`npm test` and `npm run test:visual`) and fix any regressions caused by the design pass, ensuring all workspace interaction, game logic, persistence, and reward pipeline tests still pass [5 pts] (blocked by #8, #9, #10, #13, #14, #15, #20) (A)
- [ ] (#22) Run `npm run build` and `npm run typecheck` to verify zero TypeScript errors and successful production build after all design changes [5 pts] (blocked by #21) (A)

## Follow-up tasks (from sprint review)
- [A] (#23) Rename `tests/jp3-design-visual.test.mjs` to a visual-only target (for example `tests/jp3-design-visual.visual.mjs`) and update `npm run test:visual` to run it, so `npm test` does not unexpectedly require Playwright/browser artifacts.
