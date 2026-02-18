# Specifications: jp3-design-pass

# JP3 Research Center Design Pass — PRD

## Overview

Rework the Dino Division game's visual design to match the Jurassic Park III "Research Center" website aesthetic captured in `./test-comp-targets/`. The current design uses soft sand/ivory panels with rounded corners. The target design uses a distinct JP3 web-interface look: wood/bamboo textured frame borders, bold green info panels, metallic toolbar/footer bars, jungle canopy backgrounds, and a more "computer terminal in a field station" feel.

## Reference Comps

### `test-comp-targets/Jp3websitebrachi.webp` (Primary)
- **Frame**: Weathered wood/bamboo border surrounding the entire viewport, with visible bolt/rivet details at corners
- **Background**: Jungle canopy photo behind panels — lush tropical trees/foliage
- **Left panel**: "The Research Center" title in serif font, subtitle text, then a 3×3 thumbnail grid of dinosaur silhouettes on bright green tiles with thin borders
- **Right panel**: Two-section layout:
  - Top: Dinosaur image on green background with detailed info card (name, pronunciation, diet, dimensions, taxon, etc.) in a data-sheet style
  - Bottom: Descriptive paragraph text on green background
- **Scroll indicators**: Red triangular up/down arrows for scrolling content
- **Footer bar**: "ISLA SORNA SURVEILLANCE DEVICE" label, dark metallic bar with small icon buttons (equipment icons), "MORE" link with red arrow
- **JP3 logo**: Bottom-left corner, circular emblem

### `test-comp-targets/download.jpeg` (Secondary)
- Same wood-frame + jungle-background + green-panel treatment
- Shows game/product info layout with similar aesthetic
- Confirms the design language is consistent across pages

## Design System Changes

### 1. Background & Frame
- **Replace** radial gradient background with a **full-viewport jungle canopy photo** (dark, atmospheric, slightly blurred)
- **Add** a wood/bamboo textured **border frame** around the entire app viewport (visible on all four sides)
- Frame should have a weathered, rough-hewn look with visible grain texture
- Corner bolts/rivets as decorative pseudo-elements

### 2. Panels
- **Replace** current translucent ivory `jurassic-panel` with **opaque bright green panels** (#2d8a2d / similar JP3 green)
- Panels should have **inset borders** (slightly darker green edge or subtle bevel) to give a "screen" feel
- Panel backgrounds: solid green, not translucent — information displayed on them should feel like a computer readout
- Content text on green panels: white or light cream for readability

### 3. Typography
- Keep `Cinzel` for major headings (matches the serif style seen in "The Research Center")
- Body text on green panels: clean sans-serif (current `Alegreya Sans` is fine), white/cream color
- Data labels should be **bold**, values regular weight — mimicking the info card layout in the comp
- Monospace numerals in the workspace should remain `IBM Plex Mono`

### 4. Color Palette Update
| Token | Current | New | Usage |
|---|---|---|---|
| `--jp-panel-bg` | `rgba(244,236,214,0.88)` | `#1a7a2e` (JP3 green) | Primary panel fill |
| `--jp-panel-text` | `var(--jp-ink)` | `#f0edd8` (cream) | Text on green panels |
| `--jp-panel-border` | `rgba(47,36,24,0.32)` | `#145a22` (dark green) | Panel inner border |
| `--jp-frame` | (new) | `#6b4c2a` (wood brown) | Outer frame |
| `--jp-frame-grain` | (new) | texture/pattern | Wood grain overlay |
| `--jp-toolbar` | (new) | `#2a2a2a` (dark metallic) | Footer/toolbar bar |
| `--jp-toolbar-text` | (new) | `#c0c0c0` (silver) | Toolbar labels |
| `--jp-accent-red` | (new) | `#cc3333` | Scroll arrows, action indicators |
| Keep `--jp-amber`, `--jp-glow` | same | same | Active cell glow (still amber/gold) |

### 5. Footer / Toolbar Bar
- Add a persistent **bottom toolbar** styled as the "ISLA SORNA SURVEILLANCE DEVICE" bar
- Dark metallic background, centered label text in small caps
- Small icon buttons (can be simple SVG pictograms: footprint, fossil, DNA helix, egg)
- "MORE" or navigation affordances with red arrow indicators
- Houses session stats (problems solved, current streak, difficulty level)

### 6. Gallery Rework
- Dinosaur gallery should look like the **Research Center thumbnail grid**: bright green tile backgrounds, dinosaur images centered, name labels below each tile
- Selected/detail view should mimic the **info card** in the comp: dinosaur image top-left, data sheet (name, pronunciation, diet, length, height, weight, time period, taxon) on the right, description paragraph below
- Use the comp's two-panel layout (thumbnail grid left, detail right) on desktop

### 7. Division Workspace
- The workspace panel gets the green panel treatment
- Bus-stop notation rendered in cream/white on green — high contrast
- Active cell glow remains amber/gold (it pops well against green)
- Work rows, bring-down animations, lock-in pulses all keep their current behavior but adapt colors
- The "Dino Coach" sidebar feedback messages should appear in a sub-panel or callout styled like a field-station readout

### 8. Player Start / Save-Load
- Start screen should show the Research Center title treatment
- Load/save UI styled with green panels and wood frame
- Player name input styled as a field-station terminal input (green-on-dark or cream-on-green)

### 9. Reward Reveal
- Egg-hatching animation keeps its current phases but the container panel uses green + wood frame
- Revealed dinosaur image should appear in a styled frame matching the comp's dinosaur portrait area

## Visual Testing Requirements

### Approach
Extend the existing Playwright visual test suite (`tests/workspace-visual-layout.visual.mjs`) with **screenshot comparison tests** that validate the new design against reference screenshots.

### Test Cases

1. **Frame & Background Test**: Full-page screenshot verifying wood frame border is visible on all four sides, jungle background shows through between panels
2. **Panel Color Test**: Verify game panel, gallery panel, and reward panel all use green backgrounds — sample pixel colors at panel centers, assert RGB values are within green range (R < 80, G > 100, B < 80)
3. **Toolbar Bar Test**: Verify bottom toolbar is visible, dark-colored, contains expected label text ("SURVEILLANCE DEVICE" or similar)
4. **Gallery Grid Layout Test**: Verify gallery renders as a grid of green tiles with dinosaur thumbnails — check grid container has expected column count, tiles have green backgrounds
5. **Workspace Contrast Test**: Verify division workspace text (digits, operators) is light-colored on green background — sample text element colors, assert sufficient contrast ratio
6. **Typography Test**: Verify heading elements use serif font (Cinzel), body text uses sans-serif — check computed `font-family` values
7. **Active Glow Test**: Verify the active input cell still glows amber/gold — existing glow tests should pass with adapted color selectors
8. **Comp Overlay Comparison** (stretch): Screenshot the gallery detail view and overlay-compare layout proportions against the Brachiosaurus info card from the comp (structural similarity, not pixel-perfect)

### Test Implementation
- Add new test file: `tests/jp3-design-visual.test.mjs`
- Use same `agent-browser` + Playwright setup as existing visual tests
- Add reference screenshots to `test-comp-targets/references/` for comparison baselines
- Use pixel-sampling and bounding-box assertions rather than full-page pixel-diff (more resilient to content changes)

## Out of Scope
- No changes to game logic, division engine, problem generation, or progression rules
- No changes to Gemini image generation pipeline
- No changes to save/load persistence mechanics
- No changes to state management or data flow
- Hybrid gallery/lab modal gets the green treatment but no layout redesign

## File Impact Estimate
- `src/app/globals.css` — Major rewrite of palette, panel styles, backgrounds, add frame/toolbar styles
- `src/app/layout.tsx` — Add frame wrapper element, possibly toolbar component
- `src/app/page.tsx` — Add toolbar section, restructure gallery layout for two-panel desktop view
- `src/features/gallery/components/dino-gallery-panel.tsx` — Rework to Research Center grid + info card layout
- `src/features/workspace-ui/components/live-division-workspace-panel.tsx` — Color adaptations
- `src/features/workspace-ui/components/bus-stop-long-division-renderer.tsx` — Color adaptations for green bg
- `src/features/rewards/components/earned-reward-reveal-panel.tsx` — Panel color adaptations
- `public/` — Add jungle background image, wood texture assets
- `tests/jp3-design-visual.test.mjs` — New visual test file
- `tests/jurassic-theme-ui.test.mjs` — Update assertions for new CSS class names/colors

