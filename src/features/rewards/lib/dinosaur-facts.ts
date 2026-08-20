/**
 * Curated, hand-checked fact sheets for every creature in the reward roster.
 *
 * This file is the single source of truth for anything factual the game shows
 * a player: the Research Center info card, dossier dimensions, the prose
 * fallback, and the ground-truth block handed to the language model so it
 * cannot invent numbers. Nothing here is generated, hashed, or sampled from a
 * pool — if a value is not in this table, the app must show no value at all
 * rather than a plausible-looking guess.
 *
 * Sizes are typical adult estimates from published skeletal reconstructions and
 * are rounded; fossil size estimates legitimately vary between studies.
 * `heightMeters` is standing height: hip height for bipeds, shoulder height for
 * quadrupeds, head height for the long-necked sauropods, and body depth for the
 * swimmers. For fliers and swimmers the more meaningful measurement (wingspan,
 * total body length) is called out in `traits`/`description`.
 *
 * Several roster entries are famously *not* dinosaurs (pterosaurs, marine
 * reptiles, the synapsid Dimetrodon) and two are film creations. `group`
 * records that, and the info card surfaces it instead of quietly filing them
 * under Dinosauria.
 */

import { DINOSAUR_ROSTER, type DinosaurName } from "./dinosaurs";

export type CreatureGroup =
  | "dinosaur"
  | "pterosaur"
  | "marine-reptile"
  | "synapsid"
  | "crocodylomorph"
  | "film-creation";

export type CreatureDiet =
  | "carnivore"
  | "herbivore"
  | "omnivore"
  | "piscivore"
  | "insectivore"
  /** Used where the fossils genuinely do not show what the animal ate. */
  | "unknown";

export interface DinosaurFactSheet {
  /** Binomial name; the fictional entries are marked via `group`. */
  readonly scientificName: string;
  /** Plain-English syllables, stressed syllable in caps. */
  readonly pronunciation: string;
  /** Translation of the genus name, without surrounding quotes. */
  readonly nameMeaning: string;
  readonly diet: CreatureDiet;
  readonly lengthMeters: number;
  readonly heightMeters: number;
  readonly weightKg: number;
  readonly period: string;
  /** Older bound of the age range, in millions of years ago. */
  readonly startMya: number;
  /** Younger bound of the age range, in millions of years ago. */
  readonly endMya: number;
  readonly location: string;
  readonly taxon: string;
  readonly group: CreatureGroup;
  /** Three short, true trait phrases used in the dossier and image prompt. */
  readonly traits: readonly [string, string, string];
  /** Two-sentence, family-friendly summary. Must stay factually accurate. */
  readonly description: string;
  /**
   * Set only where the roster key does not match the accepted genus spelling.
   * The roster key is load-bearing (saved player profiles and stored image keys
   * use it), so the misspelling stays and the correct name is recorded here.
   */
  readonly rosterNameNote?: string;
}

const DINOSAUR_FACT_SHEET_ENTRIES: Readonly<Record<DinosaurName, DinosaurFactSheet>> = {
  "Tyrannosaurus Rex": {
    scientificName: "Tyrannosaurus rex",
    pronunciation: "tih-RAN-oh-SOR-us REX",
    nameMeaning: "tyrant lizard king",
    diet: "carnivore",
    lengthMeters: 12.3, heightMeters: 3.7, weightKg: 8000,
    period: "Late Cretaceous", startMya: 68, endMya: 66,
    location: "Western North America",
    taxon: "Theropoda, Tyrannosauridae",
    group: "dinosaur",
    traits: ["bone-crushing bite", "excellent sense of smell", "short two-fingered arms"],
    description:
      "Tyrannosaurus rex had the strongest bite of any known land animal, able to crush bone to get at the marrow inside. Despite its huge head, its arms were only about a metre long — though they were extremely muscular.",
  },
  Velociraptor: {
    scientificName: "Velociraptor mongoliensis",
    pronunciation: "veh-LOSS-ih-RAP-tor",
    nameMeaning: "swift thief",
    diet: "carnivore",
    lengthMeters: 2, heightMeters: 0.5, weightKg: 15,
    period: "Late Cretaceous", startMya: 75, endMya: 71,
    location: "Mongolia and northern China",
    taxon: "Theropoda, Dromaeosauridae",
    group: "dinosaur",
    traits: ["sickle claw on each foot", "covered in feathers", "about the size of a turkey"],
    description:
      "The real Velociraptor was about the size of a turkey and covered in feathers, far smaller than the movie version. Fossil arm bones carry quill knobs, the same anchor points that hold wing feathers on birds today.",
  },
  Triceratops: {
    scientificName: "Triceratops horridus",
    pronunciation: "try-SER-uh-tops",
    nameMeaning: "three-horned face",
    diet: "herbivore",
    lengthMeters: 9, heightMeters: 3, weightKg: 8000,
    period: "Late Cretaceous", startMya: 68, endMya: 66,
    location: "Western North America",
    taxon: "Ornithischia, Ceratopsidae",
    group: "dinosaur",
    traits: ["two brow horns and a nose horn", "huge bony neck frill", "parrot-like beak"],
    description:
      "Triceratops carried one of the largest skulls of any land animal, up to a third of its whole body length. It sheared through tough plants with a beak and hundreds of stacked teeth, and lived right up to the asteroid impact.",
  },
  Brachiosaurus: {
    scientificName: "Brachiosaurus altithorax",
    pronunciation: "BRAK-ee-oh-SOR-us",
    nameMeaning: "arm lizard",
    diet: "herbivore",
    lengthMeters: 21, heightMeters: 12, weightKg: 35000,
    period: "Late Jurassic", startMya: 154, endMya: 150,
    location: "Western United States",
    taxon: "Sauropodomorpha, Sauropoda, Brachiosauridae",
    group: "dinosaur",
    traits: ["front legs longer than back legs", "giraffe-like upright neck", "high-canopy browser"],
    description:
      "Brachiosaurus is named for its unusually long front legs, which tilted its body upward like a giraffe. That posture let it browse leaves around nine to thirteen metres up, higher than any other plant-eater sharing its habitat could reach.",
  },
  Dilophosaurus: {
    scientificName: "Dilophosaurus wetherilli",
    pronunciation: "die-LOAF-oh-SOR-us",
    nameMeaning: "two-crested lizard",
    diet: "carnivore",
    lengthMeters: 7, heightMeters: 2, weightKg: 400,
    period: "Early Jurassic", startMya: 193, endMya: 183,
    location: "Arizona, United States",
    taxon: "Theropoda, Dilophosauridae",
    group: "dinosaur",
    traits: ["paired crests on its skull", "slender snout", "largest hunter of its time"],
    description:
      "Dilophosaurus wore two thin bony crests on its head, probably for display. The neck frill and venom spitting were invented for the film — there is no fossil evidence for either, and the real animal was about seven metres long.",
  },
  Spinosaurus: {
    scientificName: "Spinosaurus aegyptiacus",
    pronunciation: "SPINE-oh-SOR-us",
    nameMeaning: "spine lizard",
    diet: "piscivore",
    lengthMeters: 15, heightMeters: 4.5, weightKg: 7400,
    period: "Late Cretaceous", startMya: 99, endMya: 93,
    location: "North Africa (Egypt and Morocco)",
    taxon: "Theropoda, Spinosauridae",
    group: "dinosaur",
    traits: ["tall sail along its back", "crocodile-shaped snout", "paddle-like tail"],
    description:
      "Spinosaurus is the longest known predatory dinosaur, with a sail of skin-covered spines up to two metres tall. Its cone-shaped teeth, dense bones and finned tail point to a life spent hunting fish in rivers.",
  },
  Stegosaurus: {
    scientificName: "Stegosaurus stenops",
    pronunciation: "STEG-oh-SOR-us",
    nameMeaning: "roofed lizard",
    diet: "herbivore",
    lengthMeters: 9, heightMeters: 2.75, weightKg: 3500,
    period: "Late Jurassic", startMya: 155, endMya: 150,
    location: "Western United States and Portugal",
    taxon: "Ornithischia, Thyreophora, Stegosauria",
    group: "dinosaur",
    traits: ["two rows of back plates", "four tail spikes", "low-browsing beak"],
    description:
      "Stegosaurus had seventeen bony plates along its back that likely worked for display and shedding heat, not armour. Its four tail spikes are nicknamed the thagomizer, and fossil injuries show they were swung at attackers.",
  },
  Parasaurolophus: {
    scientificName: "Parasaurolophus walkeri",
    pronunciation: "PAIR-uh-SOR-OL-oh-fus",
    nameMeaning: "near crested lizard",
    diet: "herbivore",
    lengthMeters: 9.5, heightMeters: 4.3, weightKg: 2500,
    period: "Late Cretaceous", startMya: 76, endMya: 73,
    location: "Western North America",
    taxon: "Ornithischia, Hadrosauridae",
    group: "dinosaur",
    traits: ["long hollow head crest", "duck-like beak", "walked on two or four legs"],
    description:
      "The metre-long crest of Parasaurolophus is hollow, with looping tubes connected to its nose. Scientists have modelled the airflow and think it worked like a trumpet for calling across the herd.",
  },
  Gallimimus: {
    scientificName: "Gallimimus bullatus",
    pronunciation: "GAL-ih-MIME-us",
    nameMeaning: "chicken mimic",
    diet: "omnivore",
    lengthMeters: 6, heightMeters: 1.9, weightKg: 440,
    period: "Late Cretaceous", startMya: 71, endMya: 69,
    location: "Mongolia",
    taxon: "Theropoda, Ornithomimidae",
    group: "dinosaur",
    traits: ["ostrich-shaped body", "toothless beak", "built for fast running"],
    description:
      "Gallimimus was the largest of the ornithomimids, the ostrich-like dinosaurs, with long shins built for sprinting. It had no teeth at all and probably ate plants, insects and small animals it could swallow whole.",
  },
  Compsognathus: {
    scientificName: "Compsognathus longipes",
    pronunciation: "komp-SOG-nay-thus",
    nameMeaning: "elegant jaw",
    diet: "carnivore",
    lengthMeters: 1, heightMeters: 0.3, weightKg: 2.5,
    period: "Late Jurassic", startMya: 151, endMya: 145,
    location: "Southern Germany and France",
    taxon: "Theropoda, Compsognathidae",
    group: "dinosaur",
    traits: ["about the size of a chicken", "hollow bones", "quick lizard hunter"],
    description:
      "Compsognathus was one of the smallest dinosaurs, about the size of a chicken and weighing roughly as much as one. One skeleton preserves a whole lizard in its stomach, so we know exactly what its last meal was.",
  },
  Pteranodon: {
    scientificName: "Pteranodon longiceps",
    pronunciation: "teh-RAN-oh-don",
    nameMeaning: "winged and toothless",
    diet: "piscivore",
    lengthMeters: 1.8, heightMeters: 1.8, weightKg: 25,
    period: "Late Cretaceous", startMya: 86, endMya: 84,
    location: "Inland sea of North America (Kansas)",
    taxon: "Pterosauria, Pteranodontidae",
    group: "pterosaur",
    traits: ["wingspan up to about 6 metres", "long backward head crest", "no teeth at all"],
    description:
      "Pteranodon was a flying reptile, not a dinosaur, with a wingspan around six metres but a body weighing only about 25 kilograms. It snatched fish from the surface of the sea that once covered Kansas.",
  },
  Mosasaurus: {
    scientificName: "Mosasaurus hoffmannii",
    pronunciation: "MOES-uh-SOR-us",
    nameMeaning: "Meuse River lizard",
    diet: "carnivore",
    lengthMeters: 13, heightMeters: 2, weightKg: 10000,
    period: "Late Cretaceous", startMya: 82, endMya: 66,
    location: "Oceans worldwide (first found in the Netherlands)",
    taxon: "Squamata, Mosasauridae",
    group: "marine-reptile",
    traits: ["four paddle-shaped flippers", "double-hinged jaws", "close cousin of monitor lizards"],
    description:
      "Mosasaurus was a giant sea lizard rather than a dinosaur, and it is more closely related to today's monitor lizards and snakes. Its jaws had an extra hinge that let it swallow very large prey whole.",
  },
  "Indominus Rex": {
    scientificName: "Indominus rex",
    pronunciation: "in-DOM-ih-nus REX",
    nameMeaning: "untamable king",
    diet: "carnivore",
    lengthMeters: 15, heightMeters: 5.5, weightKg: 8000,
    period: "Modern era", startMya: 0, endMya: 0,
    location: "Isla Nublar",
    taxon: "InGen engineered hybrid",
    group: "film-creation",
    traits: ["engineered in the InGen lab", "able to change colour and hide", "mix of several species"],
    description:
      "Indominus rex is a laboratory hybrid engineered by InGen scientists, built from Tyrannosaurus, Velociraptor, cuttlefish and tree frog DNA. Its mixed genome makes it larger than either parent and lets it change colour to blend into its surroundings.",
  },
  Indoraptor: {
    scientificName: "Indoraptor",
    pronunciation: "IN-doh-RAP-tor",
    nameMeaning: "untamable thief",
    diet: "carnivore",
    lengthMeters: 7.3, heightMeters: 3, weightKg: 1200,
    period: "Modern era", startMya: 0, endMya: 0,
    location: "Lockwood Manor",
    taxon: "InGen engineered hybrid",
    group: "film-creation",
    traits: ["engineered in the InGen lab", "bred as a trained hunter", "black hide with a gold stripe"],
    description:
      "The Indoraptor is a smaller hybrid engineered in the lab from Indominus rex and Velociraptor DNA. It was bred to follow commands and hunt with frightening speed and precision.",
  },
  Giganotosaurus: {
    scientificName: "Giganotosaurus carolinii",
    pronunciation: "JIG-uh-NOTE-oh-SOR-us",
    nameMeaning: "giant southern lizard",
    diet: "carnivore",
    lengthMeters: 13, heightMeters: 3.6, weightKg: 8000,
    period: "Late Cretaceous", startMya: 99, endMya: 95,
    location: "Patagonia, Argentina",
    taxon: "Theropoda, Carcharodontosauridae",
    group: "dinosaur",
    traits: ["blade-shaped slicing teeth", "slightly longer than T. rex", "hunted giant sauropods"],
    description:
      "Giganotosaurus was slightly longer than Tyrannosaurus but more lightly built, with thin slicing teeth instead of bone-crushers. It was found in 1993 by a mechanic hunting fossils in his spare time.",
  },
  Therizinosaurus: {
    scientificName: "Therizinosaurus cheloniformis",
    pronunciation: "THAIR-ih-ZINE-oh-SOR-us",
    nameMeaning: "scythe lizard",
    diet: "herbivore",
    lengthMeters: 10, heightMeters: 4.5, weightKg: 5000,
    period: "Late Cretaceous", startMya: 72, endMya: 68,
    location: "Mongolia",
    taxon: "Theropoda, Therizinosauridae",
    group: "dinosaur",
    traits: ["claw bones about half a metre long", "feathered body", "plant-eating theropod"],
    description:
      "Therizinosaurus had the longest claws of any known land animal: about half a metre of bone, and perhaps a full metre once the horny sheath is added. Despite belonging to the meat-eating branch of the family tree, it used them to pull down branches and ate plants.",
  },
  Atrociraptor: {
    scientificName: "Atrociraptor marshalli",
    pronunciation: "uh-TROSS-ih-RAP-tor",
    nameMeaning: "savage thief",
    diet: "carnivore",
    lengthMeters: 2, heightMeters: 0.6, weightKg: 15,
    period: "Late Cretaceous", startMya: 69, endMya: 67,
    location: "Alberta, Canada",
    taxon: "Theropoda, Dromaeosauridae",
    group: "dinosaur",
    traits: ["short deep snout", "known mainly from jaws", "feathered raptor"],
    description:
      "Atrociraptor is known from jaw bones found near Drumheller, Alberta, showing a shorter, deeper snout than most raptors. Like its relatives it was feathered and carried a sickle claw on each foot.",
  },
  Pyroraptor: {
    scientificName: "Pyroraptor olympius",
    pronunciation: "PIE-roh-RAP-tor",
    nameMeaning: "fire thief",
    diet: "carnivore",
    lengthMeters: 2.4, heightMeters: 0.6, weightKg: 20,
    period: "Late Cretaceous", startMya: 72, endMya: 70,
    location: "Provence, southern France",
    taxon: "Theropoda, Dromaeosauridae",
    group: "dinosaur",
    traits: ["named after a wildfire", "island-dwelling raptor", "curved sickle claw"],
    description:
      "Pyroraptor got its name because its bones were exposed by a forest fire in southern France. It lived on the chain of islands that covered Europe in the Late Cretaceous.",
  },
  Dimetrodon: {
    scientificName: "Dimetrodon limbatus",
    pronunciation: "die-MET-roh-don",
    nameMeaning: "two measures of teeth",
    diet: "carnivore",
    lengthMeters: 3.5, heightMeters: 1.2, weightKg: 250,
    period: "Early Permian", startMya: 295, endMya: 272,
    location: "North America and Europe",
    taxon: "Synapsida, Sphenacodontidae",
    group: "synapsid",
    traits: ["tall sail on its back", "two different tooth shapes", "lived before the dinosaurs"],
    description:
      "Dimetrodon is not a dinosaur — it is a synapsid, part of the group that eventually led to mammals, so it is closer to us than to a T. rex. It died out about 40 million years before the first dinosaurs appeared.",
  },
  Sinoceratops: {
    scientificName: "Sinoceratops zhuchengensis",
    pronunciation: "SIGH-no-SER-uh-tops",
    nameMeaning: "Chinese horned face",
    diet: "herbivore",
    lengthMeters: 6, heightMeters: 2, weightKg: 2000,
    period: "Late Cretaceous", startMya: 74, endMya: 72,
    location: "Shandong Province, China",
    taxon: "Ornithischia, Ceratopsidae",
    group: "dinosaur",
    traits: ["hooked spikes around its frill", "single nose horn", "only large horned dinosaur from China"],
    description:
      "Sinoceratops is the only large horned dinosaur of its kind ever found in China, where it was described in 2010. A row of short hooked horns curls forward around the edge of its frill.",
  },
  Allosaurus: {
    scientificName: "Allosaurus fragilis",
    pronunciation: "AL-oh-SOR-us",
    nameMeaning: "different lizard",
    diet: "carnivore",
    lengthMeters: 8.5, heightMeters: 2.7, weightKg: 1700,
    period: "Late Jurassic", startMya: 155, endMya: 145,
    location: "Western United States and Portugal",
    taxon: "Theropoda, Allosauridae",
    group: "dinosaur",
    traits: ["ridges above its eyes", "hatchet-style bite", "most common Jurassic predator"],
    description:
      "Allosaurus was the top hunter of Jurassic North America, and more than forty individuals have been dug from a single Utah quarry. It struck downward with its jaws open wide, using its skull like a hatchet.",
  },
  Carnotaurus: {
    scientificName: "Carnotaurus sastrei",
    pronunciation: "KAR-no-TOR-us",
    nameMeaning: "meat-eating bull",
    diet: "carnivore",
    lengthMeters: 8, heightMeters: 3, weightKg: 1500,
    period: "Late Cretaceous", startMya: 72, endMya: 69,
    location: "Patagonia, Argentina",
    taxon: "Theropoda, Abelisauridae",
    group: "dinosaur",
    traits: ["bull-like horns above its eyes", "tiny stubby arms", "built for speed"],
    description:
      "Carnotaurus is the only known meat-eating dinosaur with true horns over its eyes. Its arms were even shorter than a T. rex's, but its huge tail muscles made it one of the fastest large predators.",
  },
  Baryonyx: {
    scientificName: "Baryonyx walkeri",
    pronunciation: "bah-ree-ON-iks",
    nameMeaning: "heavy claw",
    diet: "piscivore",
    lengthMeters: 9, heightMeters: 2.7, weightKg: 1700,
    period: "Early Cretaceous", startMya: 130, endMya: 125,
    location: "Southern England",
    taxon: "Theropoda, Spinosauridae",
    group: "dinosaur",
    traits: ["30-centimetre thumb claw", "narrow crocodile-like jaws", "fish scales found in its stomach"],
    description:
      "Baryonyx was discovered in an English clay pit in 1983 when an amateur fossil hunter found its huge thumb claw. Acid-etched fish scales in its rib cage proved it fished, much like a grizzly bear does.",
  },
  Ankylosaurus: {
    scientificName: "Ankylosaurus magniventris",
    pronunciation: "ANG-kih-loh-SOR-us",
    nameMeaning: "fused lizard",
    diet: "herbivore",
    lengthMeters: 6.5, heightMeters: 1.7, weightKg: 6000,
    period: "Late Cretaceous", startMya: 68, endMya: 66,
    location: "Western North America",
    taxon: "Ornithischia, Ankylosauridae",
    group: "dinosaur",
    traits: ["bony club on its tail", "armour plates set in the skin", "wide low-slung body"],
    description:
      "Ankylosaurus was covered in bony plates, even over its eyelids, and swung a heavy club of fused tail bone. Engineers who modelled the swing think it could break the leg bones of an attacking predator.",
  },
  Pachycephalosaurus: {
    scientificName: "Pachycephalosaurus wyomingensis",
    pronunciation: "PAK-ee-SEF-uh-loh-SOR-us",
    nameMeaning: "thick-headed lizard",
    diet: "herbivore",
    lengthMeters: 4.5, heightMeters: 1.8, weightKg: 450,
    period: "Late Cretaceous", startMya: 70, endMya: 66,
    location: "Western North America",
    taxon: "Ornithischia, Pachycephalosauridae",
    group: "dinosaur",
    traits: ["skull dome 25 centimetres thick", "knobs and small spikes", "two-legged runner"],
    description:
      "Pachycephalosaurus had a skull roof about 25 centimetres of solid bone, ringed with bony knobs. Some fossil domes show healed injuries, which many scientists read as evidence of head-butting or flank-butting contests.",
  },
  Dimorphodon: {
    scientificName: "Dimorphodon macronyx",
    pronunciation: "die-MORF-oh-don",
    nameMeaning: "two-form tooth",
    diet: "carnivore",
    lengthMeters: 1, heightMeters: 0.4, weightKg: 2,
    period: "Early Jurassic", startMya: 195, endMya: 190,
    location: "Southern England",
    taxon: "Pterosauria, Dimorphodontidae",
    group: "pterosaur",
    traits: ["wingspan about 1.4 metres", "deep puffin-like head", "two different tooth shapes"],
    description:
      "Dimorphodon was a small flying reptile with a surprisingly deep head, a bit like a puffin's. Mary Anning found the first skeleton on the Dorset coast in 1828.",
  },
  Nasutoceratops: {
    scientificName: "Nasutoceratops titusi",
    pronunciation: "nah-SOO-toh-SER-uh-tops",
    nameMeaning: "big-nosed horned face",
    diet: "herbivore",
    lengthMeters: 4.5, heightMeters: 1.5, weightKg: 1500,
    period: "Late Cretaceous", startMya: 76, endMya: 75,
    location: "Utah, United States",
    taxon: "Ornithischia, Ceratopsidae",
    group: "dinosaur",
    traits: ["forward-curving cow-like horns", "unusually large snout", "short frill"],
    description:
      "Nasutoceratops has long brow horns that sweep forward like a Texas longhorn's, unlike any other horned dinosaur. It lived on Laramidia, the western half of North America back when a wide seaway split the continent in two.",
  },
  Quetzalcoatlus: {
    scientificName: "Quetzalcoatlus northropi",
    pronunciation: "KWET-zal-koh-AT-lus",
    nameMeaning: "feathered serpent god",
    diet: "carnivore",
    lengthMeters: 6, heightMeters: 5, weightKg: 220,
    period: "Late Cretaceous", startMya: 68, endMya: 66,
    location: "Texas, United States",
    taxon: "Pterosauria, Azhdarchidae",
    group: "pterosaur",
    traits: ["wingspan around 10-11 metres", "as tall as a giraffe on the ground", "stalked prey on foot"],
    description:
      "Quetzalcoatlus was one of the largest flying animals ever, standing as tall as a giraffe with a wingspan of about ten metres. It is a pterosaur, not a dinosaur, and it probably hunted on foot like a giant stork.",
  },
  Dreadnoughtus: {
    scientificName: "Dreadnoughtus schrani",
    pronunciation: "dred-NAW-tus",
    nameMeaning: "fears nothing",
    diet: "herbivore",
    lengthMeters: 26, heightMeters: 8, weightKg: 48000,
    period: "Late Cretaceous", startMya: 77, endMya: 76,
    location: "Patagonia, Argentina",
    taxon: "Sauropodomorpha, Titanosauria",
    group: "dinosaur",
    traits: ["neck about 11 metres long", "one of the most complete giant sauropods", "still growing when it died"],
    description:
      "Dreadnoughtus is known from an unusually complete skeleton for such a giant, so its size estimate of roughly 48 tonnes is better supported than most. Its bones show it was still growing when it died.",
  },
  Oviraptor: {
    scientificName: "Oviraptor philoceratops",
    pronunciation: "OH-vih-RAP-tor",
    nameMeaning: "egg thief",
    diet: "omnivore",
    lengthMeters: 1.6, heightMeters: 0.9, weightKg: 33,
    period: "Late Cretaceous", startMya: 75, endMya: 71,
    location: "Mongolia",
    taxon: "Theropoda, Oviraptoridae",
    group: "dinosaur",
    traits: ["toothless beak", "crest on its snout", "sat on its nest like a bird"],
    description:
      "Oviraptor was named \"egg thief\" because the first skeleton was found on a nest of eggs. Decades later the same kind of eggs turned up with oviraptorid embryos inside — the nests were their own, and the animals were guarding them.",
  },
  Corythosaurus: {
    scientificName: "Corythosaurus casuarius",
    pronunciation: "koh-RITH-oh-SOR-us",
    nameMeaning: "helmet lizard",
    diet: "herbivore",
    lengthMeters: 9, heightMeters: 4, weightKg: 3000,
    period: "Late Cretaceous", startMya: 77, endMya: 76,
    location: "Alberta, Canada",
    taxon: "Ornithischia, Hadrosauridae",
    group: "dinosaur",
    traits: ["fan-shaped head crest", "hollow tubes inside the crest", "herd-living duckbill"],
    description:
      "Corythosaurus wore a tall rounded crest shaped like a Corinthian helmet, hollow inside and connected to its nostrils. Several fossils preserve skin impressions, showing a pebbly hide.",
  },
  Ceratosaurus: {
    scientificName: "Ceratosaurus nasicornis",
    pronunciation: "seh-RAT-oh-SOR-us",
    nameMeaning: "horned lizard",
    diet: "carnivore",
    lengthMeters: 6, heightMeters: 2.1, weightKg: 700,
    period: "Late Jurassic", startMya: 153, endMya: 148,
    location: "Western United States and Portugal",
    taxon: "Theropoda, Ceratosauridae",
    group: "dinosaur",
    traits: ["blade-like horn on its nose", "row of bony scutes down its back", "unusually long teeth"],
    description:
      "Ceratosaurus carried a flat horn on its snout and a line of small armour plates along its spine. Its teeth were extremely long for its skull size, which is why it is easy to spot in a fossil bed.",
  },
  Suchomimus: {
    scientificName: "Suchomimus tenerensis",
    pronunciation: "SOOK-oh-MIME-us",
    nameMeaning: "crocodile mimic",
    diet: "piscivore",
    lengthMeters: 11, heightMeters: 3.4, weightKg: 3800,
    period: "Early Cretaceous", startMya: 125, endMya: 112,
    location: "Niger, Africa",
    taxon: "Theropoda, Spinosauridae",
    group: "dinosaur",
    traits: ["long narrow crocodile snout", "low ridge along its back", "large hooked thumb claws"],
    description:
      "Suchomimus had jaws like a crocodile's, lined with about 120 slightly hooked teeth for gripping slippery fish. It was found in the Sahara in 1997, in rock that was once a lush river floodplain.",
  },
  Mamenchisaurus: {
    scientificName: "Mamenchisaurus sinocanadorum",
    pronunciation: "mah-MEN-chih-SOR-us",
    nameMeaning: "Mamenxi lizard",
    diet: "herbivore",
    lengthMeters: 22, heightMeters: 7, weightKg: 30000,
    period: "Late Jurassic", startMya: 162, endMya: 145,
    location: "China",
    taxon: "Sauropodomorpha, Mamenchisauridae",
    group: "dinosaur",
    traits: ["longest neck of any known animal", "air-filled lightweight neck bones", "swept its head to graze"],
    description:
      "Mamenchisaurus had the longest neck of any animal ever found — in the largest species it reached about half the body length. Air sacs inside the bones kept that enormous neck light enough to lift.",
  },
  Metriacanthosaurus: {
    scientificName: "Metriacanthosaurus parkeri",
    pronunciation: "MET-ree-uh-KAN-thoh-SOR-us",
    nameMeaning: "moderately spined lizard",
    diet: "carnivore",
    lengthMeters: 8, heightMeters: 2.5, weightKg: 1000,
    period: "Late Jurassic", startMya: 163, endMya: 157,
    location: "Southern England",
    taxon: "Theropoda, Metriacanthosauridae",
    group: "dinosaur",
    traits: ["medium-height spines on its back", "known from a partial skeleton", "coastal hunter"],
    description:
      "Metriacanthosaurus is named for the back spines that are taller than most theropods' but shorter than a sail-backed dinosaur's. It is known from one partial skeleton found near Weymouth in Dorset, England.",
  },
  Edmontosaurus: {
    scientificName: "Edmontosaurus annectens",
    pronunciation: "ed-MON-toh-SOR-us",
    nameMeaning: "Edmonton lizard",
    diet: "herbivore",
    lengthMeters: 12, heightMeters: 4.3, weightKg: 6000,
    period: "Late Cretaceous", startMya: 73, endMya: 66,
    location: "Western North America",
    taxon: "Ornithischia, Hadrosauridae",
    group: "dinosaur",
    traits: ["broad duck-like bill", "hundreds of grinding teeth", "travelled in huge herds"],
    description:
      "Edmontosaurus chewed tough plants with dental batteries holding over a thousand teeth stacked in columns. Bone beds with thousands of individuals show it lived in enormous herds.",
  },
  Microceratus: {
    scientificName: "Microceratus gobiensis",
    pronunciation: "MY-kroh-SER-uh-tus",
    nameMeaning: "small horned one",
    diet: "herbivore",
    lengthMeters: 0.75, heightMeters: 0.3, weightKg: 4,
    period: "Late Cretaceous", startMya: 90, endMya: 84,
    location: "Mongolia",
    taxon: "Ornithischia, Ceratopsia",
    group: "dinosaur",
    traits: ["one of the smallest horned dinosaurs", "ran on two legs", "parrot-like beak"],
    description:
      "Microceratus was one of the tiniest relatives of Triceratops, only about 75 centimetres long. Unlike its huge cousins it ran on two legs and had barely any frill.",
  },
  Apatosaurus: {
    scientificName: "Apatosaurus louisae",
    pronunciation: "uh-PAT-oh-SOR-us",
    nameMeaning: "deceptive lizard",
    diet: "herbivore",
    lengthMeters: 22, heightMeters: 5, weightKg: 25000,
    period: "Late Jurassic", startMya: 152, endMya: 151,
    location: "Western United States",
    taxon: "Sauropodomorpha, Diplodocidae",
    group: "dinosaur",
    traits: ["whip-like tail", "peg-shaped raking teeth", "extremely thick neck"],
    description:
      "Apatosaurus had a surprisingly thick, muscular neck and a tail that tapered into a long whip. Its close relative Brontosaurus was long thought to be the same animal, but a 2015 study separated them again.",
  },
  Stigimoloch: {
    scientificName: "Stygimoloch spinifer",
    pronunciation: "STIJ-ih-MOH-lok",
    nameMeaning: "horned devil from the river Styx",
    diet: "herbivore",
    lengthMeters: 3, heightMeters: 1.5, weightKg: 78,
    period: "Late Cretaceous", startMya: 68, endMya: 66,
    location: "Montana and Wyoming, United States",
    taxon: "Ornithischia, Pachycephalosauridae",
    group: "dinosaur",
    traits: ["long spikes on the back of its skull", "small bony dome", "may be a young Pachycephalosaurus"],
    description:
      "Stygimoloch (spelled \"Stigimoloch\" in this game's roster) had a cluster of long horns behind a small skull dome. Many palaeontologists now think it is a teenage Pachycephalosaurus whose spikes shrank as the dome grew.",
    rosterNameNote:
      "The accepted spelling is Stygimoloch; the roster key keeps the older misspelling because saved profiles and stored images reference it.",
  },
  Monolophosaurus: {
    scientificName: "Monolophosaurus jiangi",
    pronunciation: "MON-oh-LOAF-oh-SOR-us",
    nameMeaning: "single-crested lizard",
    diet: "carnivore",
    lengthMeters: 5.5, heightMeters: 1.8, weightKg: 475,
    period: "Middle Jurassic", startMya: 163, endMya: 161,
    location: "Xinjiang, China",
    taxon: "Theropoda, Tetanurae",
    group: "dinosaur",
    traits: ["single hollow crest along its snout", "air passages inside the crest", "lakeside hunter"],
    description:
      "Monolophosaurus had one tall hollow crest running down the middle of its snout, built from air-filled sinuses. It may have used it to make sounds or to show off to other dinosaurs.",
  },
  Lystrosaurus: {
    scientificName: "Lystrosaurus murrayi",
    pronunciation: "LIS-troh-SOR-us",
    nameMeaning: "shovel lizard",
    diet: "herbivore",
    lengthMeters: 1, heightMeters: 0.5, weightKg: 90,
    period: "Late Permian to Early Triassic", startMya: 255, endMya: 250,
    location: "South Africa, India, China, Russia and Antarctica",
    taxon: "Therapsida, Dicynodontia",
    group: "synapsid",
    traits: ["two tusks and a horny beak", "survived the largest mass extinction", "found on many continents"],
    description:
      "Lystrosaurus is not a dinosaur but a relative of mammals, and it survived the Great Dying that killed most life on Earth. Finding the same animal in Africa, India and Antarctica helped prove the continents were once joined.",
  },
  "Moros intrepidus": {
    scientificName: "Moros intrepidus",
    pronunciation: "MOR-ohs in-TREP-ih-dus",
    nameMeaning: "intrepid harbinger of doom",
    diet: "carnivore",
    lengthMeters: 3, heightMeters: 1.2, weightKg: 78,
    period: "Late Cretaceous", startMya: 97, endMya: 95,
    location: "Utah, United States",
    taxon: "Theropoda, Tyrannosauroidea",
    group: "dinosaur",
    traits: ["early cousin of T. rex", "only about hip-height to an adult", "long legs for running"],
    description:
      "Moros intrepidus was a small early tyrannosaur, only about 1.2 metres tall at the hip and 78 kilograms. It shows that the family stayed small for tens of millions of years before T. rex grew huge.",
  },
  Iguanodon: {
    scientificName: "Iguanodon bernissartensis",
    pronunciation: "ig-WAH-noh-don",
    nameMeaning: "iguana tooth",
    diet: "herbivore",
    lengthMeters: 10, heightMeters: 3.5, weightKg: 3500,
    period: "Early Cretaceous", startMya: 126, endMya: 122,
    location: "Belgium, England and Germany",
    taxon: "Ornithischia, Iguanodontia",
    group: "dinosaur",
    traits: ["cone-shaped thumb spike", "walked on two or four legs", "one of the first dinosaurs named"],
    description:
      "Iguanodon was only the second dinosaur ever named, in 1825, and early scientists put its thumb spike on its nose like a rhino horn. A Belgian coal mine later produced dozens of complete skeletons that corrected the mistake.",
  },
  Kentrosaurus: {
    scientificName: "Kentrosaurus aethiopicus",
    pronunciation: "KEN-troh-SOR-us",
    nameMeaning: "pointed lizard",
    diet: "herbivore",
    lengthMeters: 4.5, heightMeters: 1.5, weightKg: 700,
    period: "Late Jurassic", startMya: 154, endMya: 151,
    location: "Tanzania, Africa",
    taxon: "Ornithischia, Stegosauria",
    group: "dinosaur",
    traits: ["spikes down the back half of its body", "plates over the shoulders", "African cousin of Stegosaurus"],
    description:
      "Kentrosaurus swapped Stegosaurus's broad plates for long spikes along its hips and tail. Computer models of its tail show it could swing those spikes fast enough to be dangerous.",
  },
  Proceratosaurus: {
    scientificName: "Proceratosaurus bradleyi",
    pronunciation: "pro-seh-RAT-oh-SOR-us",
    nameMeaning: "before Ceratosaurus",
    diet: "carnivore",
    lengthMeters: 3, heightMeters: 1, weightKg: 40,
    period: "Middle Jurassic", startMya: 168, endMya: 166,
    location: "Gloucestershire, England",
    taxon: "Theropoda, Proceratosauridae",
    group: "dinosaur",
    traits: ["small crest on its nose", "very early tyrannosaur relative", "known from one skull"],
    description:
      "Proceratosaurus is known from a single skull found while digging a reservoir in England. Though small, it is one of the earliest members of the branch that later produced Tyrannosaurus.",
  },
  Segisaurus: {
    scientificName: "Segisaurus halli",
    pronunciation: "SEG-ih-SOR-us",
    nameMeaning: "Segi Canyon lizard",
    diet: "carnivore",
    lengthMeters: 1, heightMeters: 0.5, weightKg: 5,
    period: "Early Jurassic", startMya: 196, endMya: 183,
    location: "Arizona, United States",
    taxon: "Theropoda, Coelophysoidea",
    group: "dinosaur",
    traits: ["about the size of a goose", "hollow air-filled bones", "known from one skeleton"],
    description:
      "Segisaurus was a slender goose-sized hunter found in Segi Canyon, Arizona, in 1933. It was long described as having solid bones, but a 2005 restudy showed they were hollow like other early meat-eaters'.",
  },
  Herrerasaurus: {
    scientificName: "Herrerasaurus ischigualastensis",
    pronunciation: "heh-RARE-uh-SOR-us",
    nameMeaning: "Herrera's lizard",
    diet: "carnivore",
    lengthMeters: 4.5, heightMeters: 1.1, weightKg: 210,
    period: "Late Triassic", startMya: 231, endMya: 229,
    location: "Ischigualasto, Argentina",
    taxon: "Dinosauria, Herrerasauridae",
    group: "dinosaur",
    traits: ["one of the earliest known dinosaurs", "grasping hands with long claws", "sliding jaw joint"],
    description:
      "Herrerasaurus is one of the oldest dinosaurs known, from a time when dinosaurs were still rare animals. A flexible joint in its lower jaw let it hold struggling prey.",
  },
  Majungasaurus: {
    scientificName: "Majungasaurus crenatissimus",
    pronunciation: "mah-JUNG-guh-SOR-us",
    nameMeaning: "Mahajanga lizard",
    diet: "carnivore",
    lengthMeters: 7, heightMeters: 2.4, weightKg: 1100,
    period: "Late Cretaceous", startMya: 70, endMya: 66,
    location: "Madagascar",
    taxon: "Theropoda, Abelisauridae",
    group: "dinosaur",
    traits: ["single thick horn on its head", "very short arms", "wide bulldog-like skull"],
    description:
      "Majungasaurus had one dome-like horn on top of its skull and a short, deep snout built for holding prey. Tooth marks on Majungasaurus bones from other Majungasaurus make it one of the few dinosaurs with direct evidence of cannibalism.",
  },
  Concavenator: {
    scientificName: "Concavenator corcovatus",
    pronunciation: "kon-kah-VEN-ah-tor",
    nameMeaning: "Cuenca hunter",
    diet: "carnivore",
    lengthMeters: 6, heightMeters: 2, weightKg: 500,
    period: "Early Cretaceous", startMya: 130, endMya: 125,
    location: "Cuenca, Spain",
    taxon: "Theropoda, Carcharodontosauria",
    group: "dinosaur",
    traits: ["tall triangular hump over its hips", "possible quill knobs on its arm", "preserved skin impressions"],
    description:
      "Concavenator has a strange pointed hump just in front of its hips, made of two tall vertebrae. Its fossil also preserves scaly foot impressions and small bumps on the forearm that some scientists read as quill anchors.",
  },
  Acrocanthosaurus: {
    scientificName: "Acrocanthosaurus atokensis",
    pronunciation: "AK-roh-KAN-thoh-SOR-us",
    nameMeaning: "high-spined lizard",
    diet: "carnivore",
    lengthMeters: 11.5, heightMeters: 3.5, weightKg: 6200,
    period: "Early Cretaceous", startMya: 113, endMya: 110,
    location: "Oklahoma and Texas, United States",
    taxon: "Theropoda, Carcharodontosauridae",
    group: "dinosaur",
    traits: ["tall ridge along its back", "apex predator of its time", "left long fossil trackways"],
    description:
      "Acrocanthosaurus had spines up to 60 centimetres tall along its backbone, forming a thick muscular ridge. Texas trackways appear to record one stalking a long-necked sauropod.",
  },
  Carcharodontosaurus: {
    scientificName: "Carcharodontosaurus saharicus",
    pronunciation: "kar-KAR-oh-DON-toh-SOR-us",
    nameMeaning: "shark-toothed lizard",
    diet: "carnivore",
    lengthMeters: 12, heightMeters: 3.8, weightKg: 6600,
    period: "Late Cretaceous", startMya: 99, endMya: 94,
    location: "North Africa",
    taxon: "Theropoda, Carcharodontosauridae",
    group: "dinosaur",
    traits: ["serrated shark-like teeth", "skull over 1.5 metres long", "original fossils lost in the war"],
    description:
      "Carcharodontosaurus is named for teeth that look like a great white shark's, with fine serrations for slicing flesh. The first fossils were destroyed in a bombing raid in 1944, so new ones had to be found decades later.",
  },
  Pachyrhinosaurus: {
    scientificName: "Pachyrhinosaurus canadensis",
    pronunciation: "PAK-ee-RYE-no-SOR-us",
    nameMeaning: "thick-nosed lizard",
    diet: "herbivore",
    lengthMeters: 7, heightMeters: 2.5, weightKg: 4000,
    period: "Late Cretaceous", startMya: 73, endMya: 69,
    location: "Alberta, Canada and Alaska",
    taxon: "Ornithischia, Ceratopsidae",
    group: "dinosaur",
    traits: ["thick bony pad instead of a nose horn", "spikes on its frill", "lived in polar herds"],
    description:
      "Instead of a nose horn, Pachyrhinosaurus grew a massive slab of bone called a boss across its snout. Huge bone beds in Alaska show entire herds living through months of polar winter darkness.",
  },
  Albertosaurus: {
    scientificName: "Albertosaurus sarcophagus",
    pronunciation: "al-BER-toh-SOR-us",
    nameMeaning: "Alberta lizard",
    diet: "carnivore",
    lengthMeters: 9, heightMeters: 3, weightKg: 2000,
    period: "Late Cretaceous", startMya: 71, endMya: 68,
    location: "Alberta, Canada",
    taxon: "Theropoda, Tyrannosauridae",
    group: "dinosaur",
    traits: ["lighter and faster than T. rex", "small brow crests", "found together in groups"],
    description:
      "Albertosaurus was a slimmer, quicker cousin of Tyrannosaurus, about three-quarters the length. One Alberta bone bed holds at least twenty-six individuals of different ages, hinting that they lived in groups.",
  },
  Deinonychus: {
    scientificName: "Deinonychus antirrhopus",
    pronunciation: "die-NON-ih-kus",
    nameMeaning: "terrible claw",
    diet: "carnivore",
    lengthMeters: 3.4, heightMeters: 0.9, weightKg: 73,
    period: "Early Cretaceous", startMya: 115, endMya: 108,
    location: "Montana, Wyoming and Utah, United States",
    taxon: "Theropoda, Dromaeosauridae",
    group: "dinosaur",
    traits: ["13-centimetre sickle claw", "stiff balancing tail", "feathered body"],
    description:
      "Deinonychus is the animal the Jurassic Park raptors were really based on — the film borrowed the name Velociraptor but the size of this one. Its 1969 description helped prove dinosaurs were active, warm-blooded and bird-like.",
  },
  Utahraptor: {
    scientificName: "Utahraptor ostrommaysi",
    pronunciation: "YOO-tah-RAP-tor",
    nameMeaning: "Utah's thief",
    diet: "carnivore",
    lengthMeters: 5.5, heightMeters: 1.7, weightKg: 500,
    period: "Early Cretaceous", startMya: 139, endMya: 135,
    location: "Utah, United States",
    taxon: "Theropoda, Dromaeosauridae",
    group: "dinosaur",
    traits: ["largest known raptor", "foot claw over 20 centimetres", "heavily feathered"],
    description:
      "Utahraptor is the biggest raptor ever found, roughly the weight of a polar bear. A block of sandstone containing several individuals stuck in quicksand is still being carefully excavated.",
  },
  Plateosaurus: {
    scientificName: "Plateosaurus trossingensis",
    pronunciation: "PLAT-ee-oh-SOR-us",
    nameMeaning: "broad lizard",
    diet: "herbivore",
    lengthMeters: 8, heightMeters: 2.6, weightKg: 1400,
    period: "Late Triassic", startMya: 214, endMya: 204,
    location: "Germany, Switzerland and France",
    taxon: "Sauropodomorpha, Plateosauridae",
    group: "dinosaur",
    traits: ["early long-necked plant eater", "walked on two legs", "grasping hands with a thumb claw"],
    description:
      "Plateosaurus was one of the first really large dinosaurs, and unlike its giant sauropod cousins it walked on two legs. German quarries have produced more than a hundred skeletons of it.",
  },
  Coelophysis: {
    scientificName: "Coelophysis bauri",
    pronunciation: "see-LOW-fie-sis",
    nameMeaning: "hollow form",
    diet: "carnivore",
    lengthMeters: 3, heightMeters: 0.9, weightKg: 20,
    period: "Late Triassic", startMya: 216, endMya: 203,
    location: "New Mexico and Arizona, United States",
    taxon: "Theropoda, Coelophysidae",
    group: "dinosaur",
    traits: ["hollow lightweight bones", "found by the hundreds together", "slender and fast"],
    description:
      "Coelophysis is known from hundreds of skeletons piled together at Ghost Ranch, New Mexico. A Coelophysis skull flew aboard the Space Shuttle Endeavour in 1998, making it one of the few dinosaurs to reach orbit.",
  },
  Ornithomimus: {
    scientificName: "Ornithomimus edmontonicus",
    pronunciation: "OR-nith-oh-MIME-us",
    nameMeaning: "bird mimic",
    diet: "omnivore",
    lengthMeters: 3.8, heightMeters: 1.8, weightKg: 170,
    period: "Late Cretaceous", startMya: 76, endMya: 66,
    location: "Western North America",
    taxon: "Theropoda, Ornithomimidae",
    group: "dinosaur",
    traits: ["feathered arms like wings", "toothless beak", "ostrich-like build"],
    description:
      "Ornithomimus fossils from Alberta preserve feathers, including long ones forming a wing-like fan on the arms of adults. It could not fly, so those feathers were probably for display or shading eggs.",
  },
  Struthiomimus: {
    scientificName: "Struthiomimus altus",
    pronunciation: "STROOTH-ee-oh-MIME-us",
    nameMeaning: "ostrich mimic",
    diet: "omnivore",
    lengthMeters: 4.3, heightMeters: 1.4, weightKg: 150,
    period: "Late Cretaceous", startMya: 76, endMya: 74,
    location: "Alberta, Canada",
    taxon: "Theropoda, Ornithomimidae",
    group: "dinosaur",
    traits: ["long hooked hands", "toothless beak", "one of the fastest dinosaurs"],
    description:
      "Struthiomimus looked remarkably like a modern ostrich, right down to the long neck and small head. Its long shins suggest it could sprint at highway speeds to escape predators.",
  },
  Hadrosaurus: {
    scientificName: "Hadrosaurus foulkii",
    pronunciation: "HAD-roh-SOR-us",
    nameMeaning: "bulky lizard",
    diet: "herbivore",
    lengthMeters: 8, heightMeters: 3, weightKg: 3000,
    period: "Late Cretaceous", startMya: 80, endMya: 75,
    location: "New Jersey, United States",
    taxon: "Ornithischia, Hadrosauridae",
    group: "dinosaur",
    traits: ["first good dinosaur skeleton found in America", "broad duck-like bill", "state fossil of New Jersey"],
    description:
      "Hadrosaurus was dug from a New Jersey marl pit in 1858 and was the first fairly complete dinosaur skeleton found anywhere in the world. It proved that some dinosaurs walked on two legs.",
  },
  Lambeosaurus: {
    scientificName: "Lambeosaurus lambei",
    pronunciation: "LAM-bee-oh-SOR-us",
    nameMeaning: "Lambe's lizard",
    diet: "herbivore",
    lengthMeters: 9.5, heightMeters: 4, weightKg: 2500,
    period: "Late Cretaceous", startMya: 76, endMya: 75,
    location: "Alberta, Canada and Montana",
    taxon: "Ornithischia, Hadrosauridae",
    group: "dinosaur",
    traits: ["hatchet-shaped head crest", "hollow crest passages", "known from Alberta and Montana"],
    description:
      "Lambeosaurus carried a crest shaped like a hatchet, with a backward-pointing bony spike. The crest is hollow, and air moving through it probably produced honking calls.",
  },
  Maiasaura: {
    scientificName: "Maiasaura peeblesorum",
    pronunciation: "MY-ah-SOR-ah",
    nameMeaning: "good mother lizard",
    diet: "herbivore",
    lengthMeters: 9, heightMeters: 3, weightKg: 3000,
    period: "Late Cretaceous", startMya: 78, endMya: 76,
    location: "Montana, United States",
    taxon: "Ornithischia, Hadrosauridae",
    group: "dinosaur",
    traits: ["nested in large colonies", "fed its babies in the nest", "herds of thousands"],
    description:
      "Maiasaura earned its name \"good mother lizard\" from nests found with hatchlings whose legs were too undeveloped to walk. That discovery was the first strong evidence that dinosaurs cared for their young.",
  },
  Protoceratops: {
    scientificName: "Protoceratops andrewsi",
    pronunciation: "PROH-toh-SER-uh-tops",
    nameMeaning: "first horned face",
    diet: "herbivore",
    lengthMeters: 2, heightMeters: 0.8, weightKg: 90,
    period: "Late Cretaceous", startMya: 75, endMya: 71,
    location: "Mongolia",
    taxon: "Ornithischia, Protoceratopsidae",
    group: "dinosaur",
    traits: ["large frill but no horns", "about the size of a sheep", "parrot-like beak"],
    description:
      "Protoceratops was a sheep-sized relative of Triceratops with a big frill but no real horns. The famous \"Fighting Dinosaurs\" fossil preserves one locked in combat with a Velociraptor, buried by collapsing sand.",
  },
  Amargasaurus: {
    scientificName: "Amargasaurus cazaui",
    pronunciation: "ah-MAR-gah-SOR-us",
    nameMeaning: "La Amarga lizard",
    diet: "herbivore",
    lengthMeters: 10, heightMeters: 2.6, weightKg: 2600,
    period: "Early Cretaceous", startMya: 129, endMya: 122,
    location: "Neuquén, Argentina",
    taxon: "Sauropodomorpha, Dicraeosauridae",
    group: "dinosaur",
    traits: ["double row of tall neck spines", "small for a sauropod", "low browser"],
    description:
      "Amargasaurus had two rows of tall spines running along its neck, possibly supporting a sail or covered in horn. It was tiny by sauropod standards, about the length of a school bus.",
  },
  Nigersaurus: {
    scientificName: "Nigersaurus taqueti",
    pronunciation: "NEE-zher-SOR-us",
    nameMeaning: "Niger lizard",
    diet: "herbivore",
    lengthMeters: 9, heightMeters: 1.8, weightKg: 4000,
    period: "Early Cretaceous", startMya: 115, endMya: 105,
    location: "Niger, Africa",
    taxon: "Sauropodomorpha, Rebbachisauridae",
    group: "dinosaur",
    traits: ["over 500 teeth", "wide vacuum-shaped mouth", "grazed close to the ground"],
    description:
      "Nigersaurus had a mouth wider than its skull, lined with more than five hundred slender teeth. Each tooth was replaced roughly every fourteen days — faster than any other known dinosaur.",
  },
  Dsungaripterus: {
    scientificName: "Dsungaripterus weii",
    pronunciation: "jung-ah-RIP-ter-us",
    nameMeaning: "Junggar wing",
    diet: "carnivore",
    lengthMeters: 1.4, heightMeters: 0.6, weightKg: 10,
    period: "Early Cretaceous", startMya: 130, endMya: 120,
    location: "Xinjiang, China",
    taxon: "Pterosauria, Dsungaripteridae",
    group: "pterosaur",
    traits: ["wingspan about 3 metres", "upturned tweezer-like beak", "flat crushing back teeth"],
    description:
      "Dsungaripterus was a flying reptile with a narrow upturned beak for prying shellfish out of crevices. Blunt teeth at the back of its jaws crushed the shells.",
  },
  Tupandactylus: {
    scientificName: "Tupandactylus imperator",
    pronunciation: "too-pan-DAK-tih-lus",
    nameMeaning: "Tupã's finger",
    diet: "herbivore",
    lengthMeters: 1.2, heightMeters: 1, weightKg: 20,
    period: "Early Cretaceous", startMya: 115, endMya: 110,
    location: "Araripe Basin, Brazil",
    taxon: "Pterosauria, Tapejaridae",
    group: "pterosaur",
    traits: ["enormous sail-like head crest", "wingspan around 4 metres", "toothless beak"],
    description:
      "Tupandactylus wore a head crest taller than the rest of its body, made of bone and a soft sail of tissue. This flying reptile probably ate fruit in the forests of ancient Brazil.",
  },
  Nothosaurus: {
    scientificName: "Nothosaurus mirabilis",
    pronunciation: "NOH-thoh-SOR-us",
    nameMeaning: "false lizard",
    diet: "piscivore",
    lengthMeters: 4, heightMeters: 0.6, weightKg: 200,
    period: "Middle to Late Triassic", startMya: 240, endMya: 210,
    location: "Europe, North Africa and China",
    taxon: "Sauropterygia, Nothosauridae",
    group: "marine-reptile",
    traits: ["webbed feet", "needle-sharp interlocking teeth", "hunted at sea, rested on shore"],
    description:
      "Nothosaurus was a sea-going reptile that lived rather like a seal, swimming after fish and hauling out on rocks. Its long jaws were lined with needle teeth that meshed together to trap slippery prey.",
  },
  Plesiosaurus: {
    scientificName: "Plesiosaurus dolichodeirus",
    pronunciation: "PLEE-see-oh-SOR-us",
    nameMeaning: "near lizard",
    diet: "piscivore",
    lengthMeters: 3.5, heightMeters: 0.8, weightKg: 450,
    period: "Early Jurassic", startMya: 199, endMya: 190,
    location: "Dorset, England",
    taxon: "Sauropterygia, Plesiosauria",
    group: "marine-reptile",
    traits: ["very long neck and small head", "four wing-like flippers", "flew through the water"],
    description:
      "Plesiosaurus swam by flapping four flippers, more like a penguin flying underwater than a rowing boat. Mary Anning found the first complete skeleton on England's Jurassic Coast in 1823.",
  },
  Ichthyosaurus: {
    scientificName: "Ichthyosaurus communis",
    pronunciation: "IK-thee-oh-SOR-us",
    nameMeaning: "fish lizard",
    diet: "piscivore",
    lengthMeters: 3, heightMeters: 0.7, weightKg: 90,
    period: "Early Jurassic", startMya: 199, endMya: 190,
    location: "England, Germany and Belgium",
    taxon: "Ichthyosauria, Ichthyosauridae",
    group: "marine-reptile",
    traits: ["dolphin-shaped body", "large eyes ringed with bone", "gave birth to live young"],
    description:
      "Ichthyosaurus looked so much like a dolphin that it is a classic example of unrelated animals evolving the same shape. Fossils caught in the act of giving birth prove its babies were born live, tail first.",
  },
  Sarcosuchus: {
    scientificName: "Sarcosuchus imperator",
    pronunciation: "SAR-koh-SOO-kus",
    nameMeaning: "flesh crocodile",
    diet: "carnivore",
    lengthMeters: 11, heightMeters: 1.5, weightKg: 4300,
    period: "Early Cretaceous", startMya: 133, endMya: 112,
    location: "Niger and Brazil",
    taxon: "Crocodylomorpha, Pholidosauridae",
    group: "crocodylomorph",
    traits: ["nicknamed SuperCroc", "bulb-shaped snout tip", "armour plates a metre long"],
    description:
      "Sarcosuchus was a crocodile relative about the length of a bus, with a strange bulb on the end of its snout. Growth rings in its armour plates suggest it took fifty to sixty years to reach full size.",
  },
  Deinosuchus: {
    scientificName: "Deinosuchus riograndensis",
    pronunciation: "DIE-no-SOO-kus",
    nameMeaning: "terrible crocodile",
    diet: "carnivore",
    lengthMeters: 10, heightMeters: 1.8, weightKg: 5000,
    period: "Late Cretaceous", startMya: 82, endMya: 73,
    location: "North America",
    taxon: "Crocodylomorpha, Alligatoroidea",
    group: "crocodylomorph",
    traits: ["banana-sized teeth", "ambushed dinosaurs at the water's edge", "closer to alligators than crocodiles"],
    description:
      "Deinosuchus was a giant alligator relative with teeth the size of bananas, built for crushing rather than slicing. Bite marks matching its jaws appear on the bones of large duck-billed dinosaurs.",
  },
  Kaprosuchus: {
    scientificName: "Kaprosuchus saharicus",
    pronunciation: "KAP-roh-SOO-kus",
    nameMeaning: "boar crocodile",
    diet: "carnivore",
    lengthMeters: 3.5, heightMeters: 0.7, weightKg: 200,
    period: "Late Cretaceous", startMya: 95, endMya: 93,
    location: "Niger, Africa",
    taxon: "Crocodylomorpha, Mahajangasuchidae",
    group: "crocodylomorph",
    traits: ["three sets of tusk-like fangs", "forward-facing eyes", "known only from its skull"],
    description:
      "Kaprosuchus is nicknamed \"BoarCroc\" for the tusk-like teeth that stuck out past its jaws. Only its skull has ever been found, so its body size is an estimate that scientists keep revising.",
  },
  Megalosaurus: {
    scientificName: "Megalosaurus bucklandii",
    pronunciation: "MEG-uh-loh-SOR-us",
    nameMeaning: "great lizard",
    diet: "carnivore",
    lengthMeters: 7, heightMeters: 2.3, weightKg: 1000,
    period: "Middle Jurassic", startMya: 168, endMya: 166,
    location: "Southern England",
    taxon: "Theropoda, Megalosauridae",
    group: "dinosaur",
    traits: ["first dinosaur ever named", "blade-shaped teeth", "known from scattered bones"],
    description:
      "Megalosaurus was named in 1824, the first dinosaur ever given a scientific name — nearly twenty years before the word \"dinosaur\" was invented. Early reconstructions wrongly showed it as a lumbering four-legged giant.",
  },
  Rajasaurus: {
    scientificName: "Rajasaurus narmadensis",
    pronunciation: "RAH-jah-SOR-us",
    nameMeaning: "prince lizard",
    diet: "carnivore",
    lengthMeters: 7.5, heightMeters: 2.4, weightKg: 1300,
    period: "Late Cretaceous", startMya: 69, endMya: 66,
    location: "Narmada Valley, India",
    taxon: "Theropoda, Abelisauridae",
    group: "dinosaur",
    traits: ["low horn on its forehead", "short deep skull", "lived beside erupting volcanoes"],
    description:
      "Rajasaurus was India's top predator, with a single low horn on its head. It lived among the vast lava flows of the Deccan Traps, right at the end of the age of dinosaurs.",
  },
  Irritator: {
    scientificName: "Irritator challengeri",
    pronunciation: "EAR-ih-tay-tor",
    nameMeaning: "irritating one",
    diet: "piscivore",
    lengthMeters: 7.5, heightMeters: 2.2, weightKg: 1000,
    period: "Early Cretaceous", startMya: 113, endMya: 110,
    location: "Araripe Basin, Brazil",
    taxon: "Theropoda, Spinosauridae",
    group: "dinosaur",
    traits: ["crest along the top of its skull", "cone-shaped fish-catching teeth", "named out of frustration"],
    description:
      "Irritator got its odd name because fossil dealers had glued a fake snout onto the skull, which irritated the scientists who had to undo it. Its species name honours Professor Challenger from The Lost World.",
  },
  Gigantoraptor: {
    scientificName: "Gigantoraptor erlianensis",
    pronunciation: "jy-GAN-toh-RAP-tor",
    nameMeaning: "giant thief",
    diet: "omnivore",
    lengthMeters: 8, heightMeters: 3.5, weightKg: 2000,
    period: "Late Cretaceous", startMya: 96, endMya: 88,
    location: "Inner Mongolia, China",
    taxon: "Theropoda, Oviraptorosauria",
    group: "dinosaur",
    traits: ["giant beaked feathered dinosaur", "no teeth", "very long legs"],
    description:
      "Gigantoraptor was a beaked, feathered dinosaur that weighed as much as a small elephant — roughly 35 times heavier than the largest beaked dinosaur known before it. It was discovered by accident during the filming of a documentary.",
  },
  Europasaurus: {
    scientificName: "Europasaurus holgeri",
    pronunciation: "yoo-ROH-pah-SOR-us",
    nameMeaning: "Europe lizard",
    diet: "herbivore",
    lengthMeters: 6.2, heightMeters: 1.7, weightKg: 800,
    period: "Late Jurassic", startMya: 154, endMya: 151,
    location: "Northern Germany",
    taxon: "Sauropodomorpha, Brachiosauridae",
    group: "dinosaur",
    traits: ["dwarf sauropod", "adults about the size of a car", "lived on a Jurassic island"],
    description:
      "Europasaurus is a dwarf relative of Brachiosaurus, with fully grown adults only about six metres long. Living on a small island limited its food, and over generations the whole species shrank.",
  },
  Scolosaurus: {
    scientificName: "Scolosaurus cutleri",
    pronunciation: "SKOH-loh-SOR-us",
    nameMeaning: "thorn lizard",
    diet: "herbivore",
    lengthMeters: 5.5, heightMeters: 1.5, weightKg: 2000,
    period: "Late Cretaceous", startMya: 77, endMya: 75,
    location: "Alberta, Canada",
    taxon: "Ornithischia, Ankylosauridae",
    group: "dinosaur",
    traits: ["rows of spikes along its sides", "tail tip never found", "skin impressions preserved"],
    description:
      "Scolosaurus is known from a remarkably complete armoured skeleton that even preserves impressions of its skin. Its spiky plates were arranged in neat bands across its back.",
  },
  Minmi: {
    scientificName: "Minmi paravertebra",
    pronunciation: "MIN-mee",
    nameMeaning: "named after Minmi Crossing",
    diet: "herbivore",
    lengthMeters: 3, heightMeters: 1, weightKg: 300,
    period: "Early Cretaceous", startMya: 119, endMya: 113,
    location: "Queensland, Australia",
    taxon: "Ornithischia, Ankylosauria",
    group: "dinosaur",
    traits: ["named after Minmi Crossing", "armour plates over its back", "one of Australia's first named dinosaurs"],
    description:
      "Minmi is named after Minmi Crossing in Queensland, and for years it held the record for the shortest dinosaur name — until Mei was named in 2004. The famous armoured fossil with fruit and seeds in its stomach was once called Minmi but is now its own animal, Kunbarrasaurus.",
  },
  Sauropelta: {
    scientificName: "Sauropelta edwardsorum",
    pronunciation: "SOR-oh-PEL-tuh",
    nameMeaning: "lizard shield",
    diet: "herbivore",
    lengthMeters: 5.2, heightMeters: 1.7, weightKg: 1500,
    period: "Early Cretaceous", startMya: 115, endMya: 110,
    location: "Wyoming and Montana, United States",
    taxon: "Ornithischia, Nodosauridae",
    group: "dinosaur",
    traits: ["long spikes on its neck and shoulders", "no tail club", "heavy armoured hide"],
    description:
      "Sauropelta carried a row of long spikes along its neck and shoulders that grew shorter toward the tail. As a nodosaur it had no tail club, relying on armour and spikes instead.",
  },
  Nodosaurus: {
    scientificName: "Nodosaurus textilis",
    pronunciation: "NO-doh-SOR-us",
    nameMeaning: "knobbed lizard",
    diet: "herbivore",
    lengthMeters: 6, heightMeters: 1.5, weightKg: 3500,
    period: "Late Cretaceous", startMya: 100, endMya: 94,
    location: "Wyoming and Kansas, United States",
    taxon: "Ornithischia, Nodosauridae",
    group: "dinosaur",
    traits: ["banded knobby armour", "no tail club", "low-slung grazer"],
    description:
      "Nodosaurus is named for the knobs of bone set in bands across its back, which gave the fossil a woven look. It fed close to the ground on soft plants.",
  },
  Polacanthus: {
    scientificName: "Polacanthus foxii",
    pronunciation: "pol-uh-KAN-thus",
    nameMeaning: "many spines",
    diet: "herbivore",
    lengthMeters: 5, heightMeters: 1.3, weightKg: 1000,
    period: "Early Cretaceous", startMya: 130, endMya: 125,
    location: "Isle of Wight, England",
    taxon: "Ornithischia, Nodosauridae",
    group: "dinosaur",
    traits: ["spiky front half", "solid bony shield over its hips", "no tail club"],
    description:
      "Polacanthus had tall spines over its neck and shoulders and a single fused sheet of bone across its hips. Most of what we know comes from fossils eroding out of the cliffs on the Isle of Wight.",
  },
  Gastonia: {
    scientificName: "Gastonia burgei",
    pronunciation: "gas-TOH-nee-ah",
    nameMeaning: "Gaston's lizard",
    diet: "herbivore",
    lengthMeters: 5, heightMeters: 1.4, weightKg: 1900,
    period: "Early Cretaceous", startMya: 139, endMya: 134,
    location: "Utah, United States",
    taxon: "Ornithischia, Ankylosauria",
    group: "dinosaur",
    traits: ["blade-like shoulder spikes", "bony shield over the hips", "many skeletons in one quarry"],
    description:
      "Gastonia bristled with flattened blade-like spikes along its shoulders and sides. Several individuals and hundreds of loose armour pieces have come from a single Utah quarry, so its armour is unusually well understood.",
  },
  Crichtonsaurus: {
    scientificName: "Crichtonsaurus bohlini",
    pronunciation: "KRY-ton-SOR-us",
    nameMeaning: "Crichton's lizard",
    diet: "herbivore",
    lengthMeters: 3.5, heightMeters: 1, weightKg: 500,
    period: "Late Cretaceous", startMya: 92, endMya: 89,
    location: "Liaoning, China",
    taxon: "Ornithischia, Ankylosauridae",
    group: "dinosaur",
    traits: ["named after the author of Jurassic Park", "armoured back", "known from jaws and partial skeletons"],
    description:
      "Crichtonsaurus is named in honour of Michael Crichton, who wrote Jurassic Park. It was a modest-sized armoured dinosaur from the fossil-rich rocks of Liaoning, China.",
  },
  Mussaurus: {
    scientificName: "Mussaurus patagonicus",
    pronunciation: "moo-SOR-us",
    nameMeaning: "mouse lizard",
    diet: "herbivore",
    lengthMeters: 6, heightMeters: 1.5, weightKg: 1000,
    period: "Early Jurassic", startMya: 194, endMya: 192,
    location: "Patagonia, Argentina",
    taxon: "Sauropodomorpha",
    group: "dinosaur",
    traits: ["named for its mouse-sized hatchlings", "babies walked on four legs, adults on two", "nested in colonies"],
    description:
      "Mussaurus means \"mouse lizard\" because the first fossils found were tiny hatchlings that fit in a human hand. Adults grew to about a tonne, and fossil nesting grounds show they raised their young together.",
  },
  Lesothosaurus: {
    scientificName: "Lesothosaurus diagnosticus",
    pronunciation: "leh-SOO-too-SOR-us",
    nameMeaning: "Lesotho lizard",
    diet: "herbivore",
    lengthMeters: 1.2, heightMeters: 0.4, weightKg: 10,
    period: "Early Jurassic", startMya: 199, endMya: 190,
    location: "Lesotho and South Africa",
    taxon: "Ornithischia",
    group: "dinosaur",
    traits: ["about the size of a large cat", "leaf-shaped cheek teeth", "very early bird-hipped dinosaur"],
    description:
      "Lesothosaurus was a cat-sized plant eater and one of the earliest bird-hipped dinosaurs known. Its simple leaf-shaped teeth show what the ancestors of Stegosaurus and Triceratops started out with.",
  },
  Scutellosaurus: {
    scientificName: "Scutellosaurus lawleri",
    pronunciation: "skoo-TELL-oh-SOR-us",
    nameMeaning: "little shielded lizard",
    diet: "herbivore",
    lengthMeters: 1.2, heightMeters: 0.5, weightKg: 10,
    period: "Early Jurassic", startMya: 196, endMya: 183,
    location: "Arizona, United States",
    taxon: "Ornithischia, Thyreophora",
    group: "dinosaur",
    traits: ["hundreds of tiny armour studs", "extra-long tail for balance", "could run on two legs"],
    description:
      "Scutellosaurus was an early armoured dinosaur covered in more than three hundred small bony studs. Unlike its heavy later relatives it was light enough to run on its hind legs.",
  },
  Pisanosaurus: {
    scientificName: "Pisanosaurus mertii",
    pronunciation: "pih-SAH-no-SOR-us",
    nameMeaning: "Pisano's lizard",
    diet: "herbivore",
    lengthMeters: 1, heightMeters: 0.4, weightKg: 9,
    period: "Late Triassic", startMya: 229, endMya: 225,
    location: "Ischigualasto, Argentina",
    taxon: "Ornithischia (uncertain placement)",
    group: "dinosaur",
    traits: ["cat-sized plant eater", "known from fragments", "one of the oldest of its kind"],
    description:
      "Pisanosaurus is a cat-sized Triassic plant eater known only from a few crushed bones. Scientists still argue whether it is the oldest bird-hipped dinosaur or a close cousin of dinosaurs.",
  },
  Eoraptor: {
    scientificName: "Eoraptor lunensis",
    pronunciation: "EE-oh-RAP-tor",
    nameMeaning: "dawn thief",
    diet: "omnivore",
    lengthMeters: 1.7, heightMeters: 0.5, weightKg: 10,
    period: "Late Triassic", startMya: 231, endMya: 228,
    location: "Ischigualasto, Argentina",
    taxon: "Dinosauria, basal Sauropodomorpha",
    group: "dinosaur",
    traits: ["one of the oldest known dinosaurs", "mix of leaf-shaped and pointed teeth", "five-fingered hands"],
    description:
      "Eoraptor is among the oldest dinosaurs ever found, from the \"Valley of the Moon\" in Argentina. Its mixed set of teeth suggests it ate both plants and small animals.",
  },
  Chromogisaurus: {
    scientificName: "Chromogisaurus novasi",
    pronunciation: "kroh-MOH-jih-SOR-us",
    nameMeaning: "coloured earth lizard",
    diet: "omnivore",
    lengthMeters: 2, heightMeters: 0.6, weightKg: 15,
    period: "Late Triassic", startMya: 231, endMya: 228,
    location: "Ischigualasto, Argentina",
    taxon: "Sauropodomorpha, Guaibasauridae",
    group: "dinosaur",
    traits: ["named for the colourful rock it was found in", "early sauropod relative", "known from limb and hip bones"],
    description:
      "Chromogisaurus is named for the brightly coloured badlands of Argentina's Valley of the Moon. It is an early member of the group that eventually produced the giant long-necked dinosaurs.",
  },
  Panphagia: {
    scientificName: "Panphagia protos",
    pronunciation: "pan-FAY-jee-ah",
    nameMeaning: "eats everything",
    diet: "omnivore",
    lengthMeters: 1.3, heightMeters: 0.4, weightKg: 10,
    period: "Late Triassic", startMya: 231, endMya: 229,
    location: "Ischigualasto, Argentina",
    taxon: "Sauropodomorpha (basal)",
    group: "dinosaur",
    traits: ["name means all-eating", "mixed tooth shapes", "known from a young individual"],
    description:
      "Panphagia was named \"all-eating\" because its teeth are a mix of shapes suited to both plants and meat. The only known skeleton belonged to a juvenile.",
  },
  Saturnalia: {
    scientificName: "Saturnalia tupiniquim",
    pronunciation: "sat-ur-NAY-lee-ah",
    nameMeaning: "carnival",
    diet: "omnivore",
    lengthMeters: 1.5, heightMeters: 0.5, weightKg: 10,
    period: "Late Triassic", startMya: 233, endMya: 228,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Sauropodomorpha (basal)",
    group: "dinosaur",
    traits: ["found during carnival season", "slender and lightly built", "leaf-shaped back teeth"],
    description:
      "Saturnalia is named after the Roman carnival because it was discovered during Brazil's carnival season. Slim and small, it sits near the base of the long-necked dinosaur family tree.",
  },
  Guaibasaurus: {
    scientificName: "Guaibasaurus candelariensis",
    pronunciation: "gwy-bah-SOR-us",
    nameMeaning: "Guaíba lizard",
    diet: "omnivore",
    lengthMeters: 2, heightMeters: 0.6, weightKg: 15,
    period: "Late Triassic", startMya: 225, endMya: 212,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Dinosauria, Guaibasauridae",
    group: "dinosaur",
    traits: ["preserved in a bird-like resting pose", "slender running legs", "early dinosaur"],
    description:
      "Guaibasaurus is one of the few early dinosaurs found curled in a bird-like sleeping posture, with its legs tucked beneath it. That pose hints that bird-style resting behaviour is very ancient.",
  },
  Staurikosaurus: {
    scientificName: "Staurikosaurus pricei",
    pronunciation: "STOR-ik-oh-SOR-us",
    nameMeaning: "Southern Cross lizard",
    diet: "carnivore",
    lengthMeters: 2.2, heightMeters: 0.8, weightKg: 30,
    period: "Late Triassic", startMya: 233, endMya: 225,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Dinosauria, Herrerasauridae",
    group: "dinosaur",
    traits: ["named after the Southern Cross stars", "long shins built for speed", "blade-like teeth"],
    description:
      "Staurikosaurus is named after the Southern Cross, the constellation seen from Brazil where it was found. It was a slender early predator, roughly the size of a large dog.",
  },
  Buriolestes: {
    scientificName: "Buriolestes schultzi",
    pronunciation: "BOO-ree-oh-LES-teez",
    nameMeaning: "Buriol's robber",
    diet: "carnivore",
    lengthMeters: 1.5, heightMeters: 0.4, weightKg: 7,
    period: "Late Triassic", startMya: 233, endMya: 230,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Sauropodomorpha (basal)",
    group: "dinosaur",
    traits: ["meat-eating ancestor of the sauropods", "sharp curved teeth", "brain studied by CT scan"],
    description:
      "Buriolestes is an early member of the sauropod line that still ate meat, showing the giants started out as small hunters. A CT scan of its skull revealed a brain built for chasing quick prey.",
  },
  Gnathovorax: {
    scientificName: "Gnathovorax cabreirai",
    pronunciation: "NATH-oh-VOR-aks",
    nameMeaning: "ravenous jaws",
    diet: "carnivore",
    lengthMeters: 3, heightMeters: 1, weightKg: 80,
    period: "Late Triassic", startMya: 233, endMya: 230,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Dinosauria, Herrerasauridae",
    group: "dinosaur",
    traits: ["most complete early predator skeleton from Brazil", "keen eyesight", "grasping clawed hands"],
    description:
      "Gnathovorax is the most complete skeleton of an early predatory dinosaur ever found in Brazil. Scans of its braincase suggest excellent vision for tracking prey.",
  },
  Bagualosaurus: {
    scientificName: "Bagualosaurus agudoensis",
    pronunciation: "bah-GWAH-loh-SOR-us",
    nameMeaning: "sturdy lizard",
    diet: "herbivore",
    lengthMeters: 2.5, heightMeters: 0.7, weightKg: 30,
    period: "Late Triassic", startMya: 233, endMya: 230,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Sauropodomorpha",
    group: "dinosaur",
    traits: ["larger than its Triassic neighbours", "leaf-shaped plant-eating teeth", "described in 2018"],
    description:
      "Bagualosaurus was noticeably bigger than the other dinosaurs living alongside it in Triassic Brazil. Its leaf-shaped teeth capture the moment when the sauropod line switched from meat to plants.",
  },
  Nhandumirim: {
    scientificName: "Nhandumirim waldsangae",
    pronunciation: "nyan-doo-MEE-rim",
    nameMeaning: "little rhea",
    diet: "unknown",
    lengthMeters: 1.5, heightMeters: 0.4, weightKg: 5,
    period: "Late Triassic", startMya: 233, endMya: 230,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Dinosauria (placement uncertain)",
    group: "dinosaur",
    traits: ["named after the rhea bird", "very slender legs", "known from one partial skeleton"],
    description:
      "Nhandumirim means \"little rhea\" in the Tupi language, after the flightless bird that still runs across southern Brazil. Its only skeleton is young and has no skull, so scientists cannot yet say what it ate or exactly where it sits on the dinosaur family tree.",
  },
  Erythrovenator: {
    scientificName: "Erythrovenator jacuiensis",
    pronunciation: "eh-RITH-roh-VEN-ah-tor",
    nameMeaning: "red hunter",
    diet: "carnivore",
    lengthMeters: 1.5, heightMeters: 0.5, weightKg: 6,
    period: "Late Triassic", startMya: 233, endMya: 225,
    location: "Rio Grande do Sul, Brazil",
    taxon: "Theropoda (early)",
    group: "dinosaur",
    traits: ["named for the red rocks it came from", "known from a single thigh bone", "one of the oldest theropods"],
    description:
      "Erythrovenator is known from just one thigh bone found in red Triassic mudstone. Even that single bone is enough to place it among the earliest meat-eating dinosaurs.",
  },
};

const DIET_DISPLAY_LABELS: Readonly<Record<CreatureDiet, string>> = {
  carnivore: "Carnivore (Meat-Eater)",
  herbivore: "Herbivore (Plant-Eater)",
  omnivore: "Omnivore (Plants & Animals)",
  piscivore: "Piscivore (Fish-Eater)",
  insectivore: "Insectivore (Insect-Eater)",
  unknown: "Not known yet — too few fossils",
};

/** Appended to the taxon line so the card never mis-files a non-dinosaur. */
const GROUP_CLARIFICATIONS: Readonly<Record<CreatureGroup, string | null>> = {
  dinosaur: null,
  pterosaur: "flying reptile, not a dinosaur",
  "marine-reptile": "marine reptile, not a dinosaur",
  synapsid: "not a dinosaur — closer to mammals",
  crocodylomorph: "crocodile relative, not a dinosaur",
  "film-creation": "engineered by InGen",
};

export const DINOSAUR_FACT_SHEETS = DINOSAUR_FACT_SHEET_ENTRIES;

export function getDinosaurFactSheet(name: string): DinosaurFactSheet | null {
  if (typeof name !== "string") {
    return null;
  }

  const normalizedName = name.trim().toLowerCase();
  if (normalizedName.length === 0) {
    return null;
  }

  const matchedName = DINOSAUR_ROSTER.find(
    (rosterName) => rosterName.toLowerCase() === normalizedName,
  );

  return matchedName ? DINOSAUR_FACT_SHEET_ENTRIES[matchedName] : null;
}

export function formatDietForDisplay(diet: CreatureDiet): string {
  return DIET_DISPLAY_LABELS[diet];
}

/** e.g. "Late Jurassic — 154 to 150 million years ago" (engineered hybrids get no age range). */
export function formatTimePeriodForDisplay(factSheet: DinosaurFactSheet): string {
  if (factSheet.group === "film-creation") {
    return `${factSheet.period} — engineered by InGen`;
  }

  if (factSheet.startMya === factSheet.endMya) {
    return `${factSheet.period} — about ${factSheet.startMya} million years ago`;
  }

  return `${factSheet.period} — ${factSheet.startMya} to ${factSheet.endMya} million years ago`;
}

export function formatTaxonForDisplay(factSheet: DinosaurFactSheet): string {
  const clarification = GROUP_CLARIFICATIONS[factSheet.group];
  return clarification ? `${factSheet.taxon} (${clarification})` : factSheet.taxon;
}

export function isRealAnimal(factSheet: DinosaurFactSheet): boolean {
  return factSheet.group !== "film-creation";
}
