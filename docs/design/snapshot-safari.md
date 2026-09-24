# Snapshot Safari: game design

**Status:** draft for review · **Date:** 2026-09-23

A relaxing wildlife photography game. You drive a toy car through an endless,
seeded pastel world, find animals, and photograph them to fill a field journal.
There are no fail states and no timers: animals running off just means "try again".

## Decisions

| Topic | Decision |
|---|---|
| World | One continuous, seeded world. Biomes are regions in it, blending at soft borders. |
| Access | Every biome is reachable from the start; nothing is locked. |
| Difficulty | Grows with **distance from the spawn point** (see below). |
| Camera | Photo mode is a **low, first-person-ish view** from the car: a new perspective on the world. |
| Journal | **One journal across all seeds**, stored locally in the browser. |
| Rewards | The journal is its own reward for now; no cosmetic unlocks. |
| Photo mode driving | The car can **creep** (low speed cap) while in photo mode. |
| Keys | `C` photo mode, `J` journal. |

## Core loop

1. **Explore**: drive, look and listen for signs of animals.
2. **Approach**: shy animals notice fast or close cars, so slow down and creep up.
3. **Snap**: enter photo mode, aim, zoom, press the shutter.
4. **Score**: get 1–3 stars and possibly a behaviour bonus.
5. **Collect**: the best photo per species fills its journal page, and newly seen behaviours tick off.

## World and biomes

- Every point in the world gets a **biome** from `(seed, x, z)`, like the terrain.
  Biome regions are large noise cells with soft borders.
  Terrain shape, ground palette, props, water and species all read the biome value.
- The **Meadow** (what exists today) always surrounds the spawn.
- Every biome has a **distance tier**, the minimum distance from spawn where it can
  appear, so the world opens up the further you go:

| Tier | From spawn | Biomes |
|---|---|---|
| 0 | 0 | 🌾 Meadow |
| 1 | ~150 | 🌸 Blossom Woods, 🪷 Lily Wetlands |
| 2 | ~400 | 🏜️ Candy Dunes, 🐚 Sherbet Coast |
| 3 | ~700 | ❄️ Snowdrop Hills, 🍄 Mushroom Hollow |

Each biome defines its ground palette, props, hill shape, water amount, ambient
sound, 4–6 species and one rare "legendary" (e.g. golden duck, moon fox).

### Difficulty = distance

A difficulty value `d` from 0 to 1 rises with distance from spawn. It never adds danger. It scales:

- **Shyness**: how far away animals notice the car, and how easily they flee.
- **Rarity**: the chance of rare variants and legendaries.
- **Terrain**: hill height, lake size, forest density.
- **Behaviour depth**: more collectible behaviours per species further out.

## Photo mode

- **Enter/exit:** `C`. The car brakes down to a creep: WASD still drives, capped at a slow speed.
- **Camera:** the view glides from the top-down follow camera to eye level just
  above the car's roof, as if peeking out of the window.
  Mouse look uses pointer lock and can turn freely around the car.
  The scroll wheel zooms (field of view 55° → 15°).
- **Shutter:** click or `Space`. A white flash, a "click" sound, and a polaroid
  preview slides in showing stars, the species and any behaviour bonus.
- **World keeps running:** animals move, day/night continues, and the horn still
  works, so you can snap the scatter.
- **HUD:** a viewfinder frame, a zoom level readout, and a small "subject in
  frame" hint when an animal is centred.

### Scoring

For each animal inside the frame (a photographable subject):

| Factor | How |
|---|---|
| Size | Fraction of the frame taken up by the animal's projected bounds |
| Framing | Distance from centre, with a rule-of-thirds bonus |
| Facing | Angle between the animal's forward direction and the camera |
| Clear view | Raycasts against trees and stones: blocked means a penalty |
| Behaviour | Bonus if the animal is doing something special (dabbling, hooting, leaping, startled, …) |
| Rarity / light | Bonus for rare variants, golden hour, night |

The best-scoring subject is the photo's species. The total maps to 1–3 stars.
Extra animals in frame add a small "group shot" bonus.

## Field journal

- A page per biome and an entry per species. Species show as a **silhouette until photographed**.
- Each entry stores: best stars, a **behaviour checklist** (e.g. duck: swimming,
  dabbling, family line, sleeping, startled), the best photo thumbnail,
  and when and in which seed it was taken.
- Completion percentages per biome and overall.
- A photo can be saved as a PNG.
- Stored in `localStorage` (`drivy.journal.v1`), shared across seeds.
  Thumbnails are small JPEGs, around 256 px.

## Sound: honk vs chime

- **Honk** (exists): startles animals. Gives action shots (scatter, leap, flap), but they leave.
- **Chime** (new, soft): curious animals turn to look or come closer. Good for portraits.
  Some species respond only to one of the two.

## Architecture sketch

- **`Biome` field in `World`:** `biomeAt(x, z)` returns weights for blending,
  and `difficultyAt(x, z)` returns `d`.
  Terrain, palette, scatter and water consult them.
- **Species registry (data):** id, biome(s), model factory, shyness, active hours,
  rarity, and a list of behaviours.
- **`Photographable` interface**, which every wildlife manager exposes for its live animals:
  `{ speciesId, bounds(): Sphere, forward(): Vector3, behavior(): string | null, rare: boolean }`.
- **`PhotoMode`:** camera transition, input (pointer lock, zoom), shutter,
  scoring (projection + raycasts), and a thumbnail rendered to an offscreen target.
- **`Journal`:** a store with load/save/merge and events for the UI.
- **UI:** viewfinder HUD, polaroid toast, journal overlay (key `J`).

## Phased plan

1. ✅ **Photo mode and journal (Meadow only).** First-person camera, shutter,
   scoring, polaroid toast, journal for the existing species (duck, squirrel,
   bird, owl, fireflies), local save. *This alone makes it a game.*
2. ✅ **Approach mechanic.** Shyness and noticing radius, fleeing when the car is too
   fast or close, sneaking up slowly. The chime sound (`Q`).
   Implemented as an alertness meter per animal ("?" when wary; a stopped car calms them),
   with shyness scaled by `difficultyAt()` (distance from spawn).
3. ✅ **Biome system.** Biome field + difficulty from distance, blending, per-biome
   palette, props and terrain. First new biome: **Blossom Woods** with 3 species.
   Implemented as seeded Voronoi regions (~190 units) in `world/biomes.ts`; Blossom Woods
   starts ~160 units out, with blossom trees, flower glades, falling petals, and
   deer (herds, very shy), foxes (sit, pounce) and night-only hedgehogs (curl up when startled).
   Biome HUD pill, first-visit banner, journal grouped by biome (undiscovered = locked).
4. ✅ **More biomes and species.** Wetlands next, then tiers 2–3, legendaries, rare variants.
   - ✅ **Lily Wetlands** (tier 1): big flat lakes (`pondCoverage`), reed beds, lily pads and water lilies;
     frogs (lily pads, croak, dive in), herons (wade, fish, fly off), pond turtles (swim, hide in shell), dragonflies.
   - ✅ **Legendaries**: Golden Duck (Meadow), Moon Fox (Blossom Woods, night only), Golden Frog (Wetlands).
     Spawn chance scales with difficulty (`rareChance`), they glow softly, +0.25 score bonus, gold journal badge.
   - ✅ **Tier 2** (~400+ units out): **Candy Dunes** (dune ridges via `duneHeight`, cacti, sandstone, dune grass,
     oasis palms; camels, fennec foxes, sand lizards, legendary Rainbow Lizard) and **Sherbet Coast**
     (big lagoons, beaches with shells and palms; crabs that tuck in, seals, seagulls, legendary Pearl Seal).
     Ground animals now declare their biome, beach habitat (`nearWater`) and rest pose, so new species reuse
     the deer / fox / hedgehog behaviour sets with their own labels.
   - ✅ **Tier 3** (~700+ units out): **Snowdrop Hills** (tall snowy hills, frosted pines, ice crystals,
     snowmen, icy shores, falling snow; arctic foxes, snow bunnies, penguins, legendary Aurora Fox, night only)
     and **Mushroom Hollow** (giant mushrooms whose caps glow in their own colours at night, mushroom
     clusters, rising spores; snails that hide in their shells, sleepy badgers, legendary Glow Snail, night only).
   - Photo mode hides the car's shell once settled, so low, close animals aren't blocked by the roof.
5. ✅ **Nice-to-haves.**
   - **Photo requests**: Pelly the pelican (The Pastel Post) keeps 3 optional requests on the board, drawn only
     from discovered biomes; a matching photo completes one and a new one arrives. Shown in the journal and HUD (📮).
   - **Weather**: clear spells and showers that fade in/out; rain streaks (a snowstorm in Snowdrop Hills), softer
     greyer light, more frogs singing, and rain-only journal behaviours (frog, duck, snail, penguin).
   - **Ambience only** (no music, as decided): synthesised wind, water and waves, rain, birdsong, crickets and
     Mushroom Hollow chimes, crossfading with biome, time of day and weather. `M` mutes.
   - Cosmetic unlocks: not built — the journal stays its own reward.

## Open questions

- None right now.
