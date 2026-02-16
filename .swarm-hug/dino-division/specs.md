# Specifications: dino-division

# Dino Division — Product Requirements Document

## Overview
An interactive, dinosaur-themed long-division practice game built as a web app. Players solve long-division problems step by step. Every 5 problems solved, a dinosaur picture is generated via the Gemini API (Nano Banana / Gemini 2.0 Flash) and added to a "Dino Gallery." The game is themed around the Jurassic Park / Jurassic World / Camp Cretaceous / Chaos Theory universe.

## Core Features

### 1. Interactive Long-Division Game
- Present long-division problems with a visual, step-by-step interactive UI (like working on paper: divide, multiply, subtract, bring down).
- Problems vary in difficulty: start simple (2-digit ÷ 1-digit) and scale up (4–5 digit ÷ 2–3 digit) as the player progresses.
- Provide immediate feedback on each step (correct / incorrect with hints).
- Track the number of problems solved in the current session and overall.

### 2. Dinosaur Reward System
- Every 5 problems solved, call the Gemini API (model: `gemini-2.0-flash-exp` via Google AI SDK, using the `GEMINI_API_KEY` from `.env.local`) to generate a dinosaur image.
- The dinosaur for each reward is chosen from a built-in list of 100 dinosaurs (see § Dinosaur List).
- The prompt should request the dinosaur rendered in a realistic Jurassic Park cinematic style.
- Generated images are saved to the filesystem (public directory) and displayed in the Dino Gallery.

### 3. Dino Gallery
- A page/section where the player can view all dinosaurs they've unlocked.
- Each gallery entry shows the image, dinosaur name, and the date it was earned.
- Gallery data is persisted per player in a save file.

### 4. Dinosaur List (100 dinosaurs)
Maintain a static list of 100 dinosaurs used as the pool for rewards. Include the most popular JP/JW/Chaos Theory dinosaurs prominently. Examples:
- Tyrannosaurus Rex, Velociraptor, Triceratops, Brachiosaurus, Dilophosaurus, Spinosaurus, Stegosaurus, Parasaurolophus, Gallimimus, Compsognathus, Pteranodon, Mosasaurus, Indominus Rex, Indoraptor, Giganotosaurus, Therizinosaurus, Atrociraptor, Pyroraptor, Dimetrodon, Sinoceratops, Allosaurus, Carnotaurus, Baryonyx, Ankylosaurus, Pachycephalosaurus, Dimorphodon, Nasutoceratops, Quetzalcoatlus, Dreadnoughtus, Oviraptor, Corythosaurus, Ceratosaurus, Suchomimus, Mamenchisaurus, Metriacanthosaurus, Edmontosaurus, Microceratus, Apatosaurus, Stigimoloch, Monolophosaurus, Lystrosaurus, Moros intrepidus, Iguanodon, Kentrosaurus, Proceratosaurus, Segisaurus, Herrerasaurus, Majungasaurus, Concavenator, Acrocanthosaurus, Carcharodontosaurus, Pachyrhinosaurus, Albertosaurus, Deinonychus, Utahraptor, Plateosaurus, Coelophysis, Ornithomimus, Struthiomimus, Hadrosaurus, Lambeosaurus, Maiasaura, Protoceratops, Amargasaurus, Nigersaurus, Dsungaripterus, Tupandactylus, Nothosaurus, Plesiosaurus, Ichthyosaurus, Sarcosuchus, Deinosuchus, Kaprosuchus, Megalosaurus, Rajasaurus, Irritator, Gigantoraptor, Therizinosaurus, Europasaurus, Scolosaurus, Minmi, Sauropelta, Nodosaurus, Polacanthus, Gastonia, Crichtonsaurus, Mussaurus, Lesothosaurus, Scutellosaurus, Pisanosaurus, Eoraptor, Chromogisaurus, Panphagia, Saturnalia, Guaibasaurus, Staurikosaurus, Buriolestes, Gnathovorax, Bagualosaurus, Nhandumirim, Erythrovenator
- The full list of 100 should be defined in a constants/data file.

### 5. Filesystem-Based Storage / Save Files
- Use browser APIs (File System Access API) to save and load game data.
- Ask the player for permission before saving/loading files.
- Save files are JSON, named by player name (e.g., `rex-save.json`).
- Save file contents: player name, total problems solved, current difficulty level, unlocked dinosaurs (name + image path + date earned), and session history.
- On game start, prompt for player name and offer to load an existing save or start new.

### 6. Dino Theming
- The entire UI should be dinosaur/Jurassic Park themed: earthy/jungle color palette, dino-themed fonts or headers, subtle dino silhouettes or borders.
- Fun dino-related encouragement messages on correct answers (e.g., "Roarsome!", "You're dino-mite!").
- Error/incorrect feedback can be playful too (e.g., "Uh oh, the raptor got that one…").

## Tech Stack
- Next.js (App Router) with TypeScript
- Tailwind CSS for styling
- Google Generative AI SDK (`@google/generative-ai`) for Gemini image generation
- File System Access API for save/load (with graceful fallback messaging if unsupported)

## Non-Goals
- No user authentication / accounts — just local save files
- No multiplayer
- No backend database

