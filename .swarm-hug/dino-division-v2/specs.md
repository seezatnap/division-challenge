# Specifications: dino-division-v2

# Dino Division v2 — Product Requirements Document

## Overview
An interactive, dinosaur-themed long-division practice game built as a web app. Players solve long-division problems by typing numbers directly into a visual representation of the long-division layout — the classic "bus stop" notation rendered on screen. The UI highlights (glows) exactly where the player should type next, making the experience feel dynamic, live, and fun. Every 5 problems solved, a dinosaur picture is generated via the Gemini API and added to a "Dino Gallery."

## Critical UX: Visual Long-Division Workspace

The **core differentiator** of this app is the long-division workspace. It must NOT use form fields, dropdowns, or step-by-step prompts. Instead:

### Layout
Render the classic long-division notation on screen:
```
         ____Q____
   D  )  dividend
        -  XXX
        ------
           XXX
          - XXX
          ------
            ...
```
- The **divisor** is shown to the left of the bracket.
- The **dividend** is shown inside the bracket.
- The **quotient** builds above the bracket as the player solves each digit.
- **Work rows** (multiply result, subtraction, bring-down) appear below the dividend as the player progresses.

### Glowing Input System
- At each step of the algorithm, exactly ONE position on the workspace glows (highlighted/pulsing border, bright color, subtle animation) to indicate where the player should type next.
- The glow positions follow the long-division algorithm:
  1. **Quotient digit**: The next empty position above the bracket glows. Player types the partial quotient digit.
  2. **Multiply result**: The row below the current working number glows. Player types the product of (divisor × quotient digit just entered).
  3. **Subtraction result**: The next row glows. Player types the difference.
  4. **Bring down**: The next digit of the dividend animates sliding down to join the remainder, creating the new working number. (This can be automatic or require a keypress.)
- Each glow position is a single inline input (styled to blend into the workspace, not a form field) or a contentEditable span.
- When the player types the correct value, the glow advances to the next position with a satisfying micro-animation (e.g., the number "locks in" with a brief scale/color pulse).
- When the player types an incorrect value, show a playful dino-themed hint (e.g., "The T-Rex says: try multiplying again!") and let them retry. The glow stays on the same position.

### Dynamic & Live Feel
- Numbers should appear immediately as typed — no submit buttons.
- Transitions between steps should be smooth (CSS transitions/animations).
- The bring-down step should animate the digit sliding down.
- Correct answers get a brief celebratory micro-animation.
- The overall workspace should feel like writing on paper, not filling out a form.

## Core Features

### 1. Problem Generation & Difficulty Progression
- Generate long-division problems with difficulty tiers: start simple (2-digit ÷ 1-digit) and scale up (4–5 digit ÷ 2–3 digit) as the player progresses.
- Include problems with and without remainders.
- Track problems solved per session and lifetime.
- Increase difficulty based on cumulative problems solved.

### 2. Dinosaur Reward System & Prefetching
- Every 5 problems solved, generate a dinosaur image via Gemini API (model: `gemini-2.0-flash-exp`, key from `GEMINI_API_KEY` in `.env.local`).
- The dinosaur is chosen from a built-in list of 100 dinosaurs.
- The prompt requests the dinosaur in a realistic Jurassic Park cinematic style.
- **Prefetching**: When the player is approaching the next reward milestone (e.g., on problem 3 or 4 of a set of 5), check if the next dinosaur's image already exists on the server. If not, kick off generation in the background.
- **Loading state**: If the reward is earned while generation is still in flight, show a dino-themed "egg hatching" loading animation, poll until the image is ready, then reveal it.
- No duplicate generation — skip if the image already exists on disk.

### 3. Dino Gallery
- A page/section displaying all unlocked dinosaurs with image, name, and date earned.
- Empty-state messaging for new players.
- Live refresh after new unlocks.

### 4. Dinosaur List (100 dinosaurs)
Maintain a static list of 100 dinosaurs. Include the most popular JP/JW/Chaos Theory dinosaurs prominently:
- Tyrannosaurus Rex, Velociraptor, Triceratops, Brachiosaurus, Dilophosaurus, Spinosaurus, Stegosaurus, Parasaurolophus, Gallimimus, Compsognathus, Pteranodon, Mosasaurus, Indominus Rex, Indoraptor, Giganotosaurus, Therizinosaurus, Atrociraptor, Pyroraptor, Dimetrodon, Sinoceratops, Allosaurus, Carnotaurus, Baryonyx, Ankylosaurus, Pachycephalosaurus, Dimorphodon, Nasutoceratops, Quetzalcoatlus, Dreadnoughtus, Oviraptor, Corythosaurus, Ceratosaurus, Suchomimus, Mamenchisaurus, Metriacanthosaurus, Edmontosaurus, Microceratus, Apatosaurus, Stigimoloch, Monolophosaurus, Lystrosaurus, Moros intrepidus, Iguanodon, Kentrosaurus, Proceratosaurus, Segisaurus, Herrerasaurus, Majungasaurus, Concavenator, Acrocanthosaurus, Carcharodontosaurus, Pachyrhinosaurus, Albertosaurus, Deinonychus, Utahraptor, Plateosaurus, Coelophysis, Ornithomimus, Struthiomimus, Hadrosaurus, Lambeosaurus, Maiasaura, Protoceratops, Amargasaurus, Nigersaurus, Dsungaripterus, Tupandactylus, Nothosaurus, Plesiosaurus, Ichthyosaurus, Sarcosuchus, Deinosuchus, Kaprosuchus, Megalosaurus, Rajasaurus, Irritator, Gigantoraptor, Europasaurus, Scolosaurus, Minmi, Sauropelta, Nodosaurus, Polacanthus, Gastonia, Crichtonsaurus, Mussaurus, Lesothosaurus, Scutellosaurus, Pisanosaurus, Eoraptor, Chromogisaurus, Panphagia, Saturnalia, Guaibasaurus, Staurikosaurus, Buriolestes, Gnathovorax, Bagualosaurus, Nhandumirim, Erythrovenator
- The full list of 100 should be defined in a constants/data file.

### 5. Filesystem-Based Storage / Save Files
- Use the File System Access API to save and load game data.
- Ask for permission before saving/loading.
- Save files are JSON, named by player name (e.g., `rex-save.json`).
- Contents: player name, total problems solved, current difficulty level, unlocked dinosaurs (name + image path + date earned), session history.
- On game start, prompt for player name and offer to load an existing save or start new.

### 6. Dino Theming
- Dinosaur/Jurassic Park themed UI: earthy/jungle color palette, themed typography, subtle dino silhouettes and motifs.
- Fun dino encouragement messages on correct answers ("Roarsome!", "You're dino-mite!", "Clever girl...").
- Playful error feedback ("Uh oh, the raptor got that one...", "The T-Rex says: try again!").
- The glowing input positions should use a warm amber/gold glow that fits the Jurassic aesthetic.

## Tech Stack
- Next.js (App Router) with TypeScript
- Tailwind CSS for styling + CSS animations for the glow/transition effects
- Google Generative AI SDK (`@google/generative-ai`) for Gemini image generation
- File System Access API for save/load (with graceful fallback)

## Lessons from v1 (dino-division)
These issues were found in the first iteration and should be addressed in v2:
- try1 (codex) had good logical correctness (math validation, reward ordering, retry handling) — carry those patterns forward.
- try2 (claude) had better UX polish (theming, component structure) — carry the visual quality forward.
- Both used form-based step inputs instead of a visual workspace — this is the primary thing to fix.
- Reward milestone ordering/retry and save-race conditions were found and fixed in v1 — build those fixes in from the start.

## Non-Goals
- No user authentication / accounts — just local save files
- No multiplayer
- No backend database

