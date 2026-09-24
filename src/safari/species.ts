import type * as THREE from 'three';
import type { BiomeId } from '../world/biomes';

export type SpeciesId =
  | 'duck'
  | 'duckling'
  | 'squirrel'
  | 'bluebird'
  | 'canary'
  | 'pink-finch'
  | 'mint-tit'
  | 'owl'
  | 'snowy-owl'
  | 'firefly'
  | 'deer'
  | 'fox'
  | 'hedgehog'
  | 'frog'
  | 'heron'
  | 'turtle'
  | 'dragonfly'
  | 'golden-duck'
  | 'moon-fox'
  | 'golden-frog'
  | 'camel'
  | 'fennec'
  | 'lizard'
  | 'rainbow-lizard'
  | 'crab'
  | 'seal'
  | 'seagull'
  | 'pearl-seal';

export interface Behavior {
  id: string;
  label: string;
}

export interface Species {
  id: SpeciesId;
  name: string;
  biome: BiomeId;
  emoji: string;
  /** Shown on the journal page before the species has been photographed. */
  hint: string;
  rare: boolean;
  /** One per biome: very rare, glows a little, and makes for a prized photo. */
  legendary?: boolean;
  /** Behaviours to collect. The first one is the species' everyday state. */
  behaviors: Behavior[];
}

/**
 * An animal that can be photographed right now. Every wildlife manager
 * reports its live animals as subjects; photo mode scores them.
 */
export interface Subject {
  species: SpeciesId;
  /** World-space centre of the animal's body. */
  position: THREE.Vector3;
  /** Rough bounding radius in world units. */
  radius: number;
  /** Horizontal direction the animal's face points. */
  forward: THREE.Vector3;
  /** Current behaviour id (one of the species' behaviours). */
  behavior: string;
  /** No front or back (e.g. a glowing firefly): facing doesn't matter. */
  omnidirectional?: boolean;
}

const b = (id: string, label: string): Behavior => ({ id, label });

const BIRD_BEHAVIORS = [b('flying', 'Flying'), b('gliding', 'Gliding'), b('startled', 'Startled')];
const DUCK_BEHAVIORS = [b('swimming', 'Swimming'), b('dabbling', 'Dabbling'), b('quacking', 'Quacking'), b('family', 'Family portrait'), b('curious', 'Curious'), b('sleeping', 'Sleeping'), b('startled', 'Startled')];
const FOX_BEHAVIORS = [b('trotting', 'Trotting'), b('sitting', 'Sitting'), b('pouncing', 'Pouncing'), b('curious', 'Curious'), b('sleeping', 'Sleeping'), b('startled', 'Startled')];
const FROG_BEHAVIORS = [b('sitting', 'Sitting'), b('croaking', 'Croaking'), b('hopping', 'Hopping'), b('curious', 'Curious'), b('startled', 'Diving in')];
// Tier-2 animals reuse the ground-animal behaviour sets, so their ids match those sets (the labels are their own).
const LIZARD_BEHAVIORS = [b('trotting', 'Scurrying'), b('sitting', 'Basking'), b('pouncing', 'Snapping'), b('curious', 'Curious'), b('sleeping', 'Sleeping'), b('startled', 'Startled')];
const SEAL_BEHAVIORS = [b('shuffling', 'Flopping'), b('sniffing', 'Sunbathing'), b('curious', 'Curious'), b('startled', 'Startled')];
const OWL_BEHAVIORS = [b('perched', 'Perched'), b('hooting', 'Hooting'), b('head-tilt', 'Head tilt'), b('curious', 'Curious'), b('flying', 'Flying'), b('startled', 'Startled')];

export const SPECIES: Species[] = [
  {
    id: 'duck',
    name: 'Duck',
    biome: 'meadow',
    emoji: '🦆',
    hint: 'Paddles around ponds with a trail of little ones.',
    rare: false,
    behaviors: DUCK_BEHAVIORS,
  },
  {
    id: 'duckling',
    name: 'Duckling',
    biome: 'meadow',
    emoji: '🐥',
    hint: 'Never far behind its mother.',
    rare: false,
    behaviors: [b('swimming', 'Swimming'), b('dabbling', 'Dabbling'), b('curious', 'Curious'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
  },
  {
    id: 'squirrel',
    name: 'Squirrel',
    biome: 'meadow',
    emoji: '🐿️',
    hint: 'Sits on top of round trees.',
    rare: false,
    behaviors: [b('perched', 'Perched'), b('nibbling', 'Nibbling'), b('leaping', 'Leaping'), b('curious', 'Curious'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
  },
  { id: 'bluebird', name: 'Bluebird', biome: 'meadow', emoji: '🐦', hint: 'Crosses the sky in small flocks.', rare: false, behaviors: BIRD_BEHAVIORS },
  { id: 'canary', name: 'Canary', biome: 'meadow', emoji: '🐤', hint: 'A sunny little flyer.', rare: false, behaviors: BIRD_BEHAVIORS },
  { id: 'pink-finch', name: 'Pink Finch', biome: 'meadow', emoji: '🐦', hint: 'Rosy feathers, high in the sky.', rare: false, behaviors: BIRD_BEHAVIORS },
  { id: 'mint-tit', name: 'Mint Tit', biome: 'meadow', emoji: '🐦', hint: 'Pale green and easy to miss.', rare: false, behaviors: BIRD_BEHAVIORS },
  { id: 'owl', name: 'Owl', biome: 'meadow', emoji: '🦉', hint: 'Sits on pine tips at night.', rare: false, behaviors: OWL_BEHAVIORS },
  { id: 'snowy-owl', name: 'Snowy Owl', biome: 'meadow', emoji: '🦉', hint: 'Rare, and pale as moonlight.', rare: true, behaviors: OWL_BEHAVIORS },
  {
    id: 'firefly',
    name: 'Firefly',
    biome: 'meadow',
    emoji: '✨',
    hint: 'Glows near the ground after dusk.',
    rare: false,
    behaviors: [b('glowing', 'Glowing'), b('swarm', 'Swarm')],
  },
  {
    id: 'deer',
    name: 'Blossom Deer',
    biome: 'blossom',
    emoji: '🦌',
    hint: 'Grazes in blossom glades. Very shy.',
    rare: false,
    behaviors: [b('grazing', 'Grazing'), b('walking', 'Walking'), b('curious', 'Curious'), b('bounding', 'Bounding'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
  },
  {
    id: 'fox',
    name: 'Fox',
    biome: 'blossom',
    emoji: '🦊',
    hint: 'Trots between the blossom trees.',
    rare: false,
    behaviors: FOX_BEHAVIORS,
  },
  {
    id: 'hedgehog',
    name: 'Hedgehog',
    biome: 'blossom',
    emoji: '🦔',
    hint: 'Snuffles about the woods after dusk.',
    rare: false,
    behaviors: [b('shuffling', 'Shuffling'), b('sniffing', 'Sniffing'), b('curled', 'Curled up'), b('curious', 'Curious')],
  },
  {
    id: 'frog',
    name: 'Frog',
    biome: 'wetlands',
    emoji: '🐸',
    hint: 'Sits on lily pads. Plop!',
    rare: false,
    behaviors: FROG_BEHAVIORS,
  },
  {
    id: 'heron',
    name: 'Heron',
    biome: 'wetlands',
    emoji: '🪶',
    hint: 'Wades in the shallows, fishing. The shyest bird around.',
    rare: false,
    behaviors: [b('standing', 'Standing'), b('wading', 'Wading'), b('fishing', 'Fishing'), b('one-leg', 'One-legged'), b('curious', 'Curious'), b('flying', 'Flying')],
  },
  {
    id: 'turtle',
    name: 'Pond Turtle',
    biome: 'wetlands',
    emoji: '🐢',
    hint: 'Paddles lazily across the lakes.',
    rare: false,
    behaviors: [b('swimming', 'Swimming'), b('sunbathing', 'Sunbathing'), b('hiding', 'Hiding'), b('curious', 'Curious')],
  },
  {
    id: 'dragonfly',
    name: 'Dragonfly',
    biome: 'wetlands',
    emoji: '🪰',
    hint: 'Darts over the reeds on sunny days.',
    rare: false,
    behaviors: [b('hovering', 'Hovering'), b('darting', 'Darting')],
  },
  {
    id: 'golden-duck',
    name: 'Golden Duck',
    biome: 'meadow',
    emoji: '🦆',
    hint: 'A legend of the ponds… some say its feathers shine like the sun.',
    rare: true,
    legendary: true,
    behaviors: DUCK_BEHAVIORS,
  },
  {
    id: 'moon-fox',
    name: 'Moon Fox',
    biome: 'blossom',
    emoji: '🦊',
    hint: 'A legend of the woods, only ever seen at night.',
    rare: true,
    legendary: true,
    behaviors: FOX_BEHAVIORS,
  },
  {
    id: 'golden-frog',
    name: 'Golden Frog',
    biome: 'wetlands',
    emoji: '🐸',
    hint: 'A legend of the lily pads. Rarer the further you roam.',
    rare: true,
    legendary: true,
    behaviors: FROG_BEHAVIORS,
  },
  {
    id: 'camel',
    name: 'Camel',
    biome: 'dunes',
    emoji: '🐫',
    hint: 'Plods between the dunes in little caravans.',
    rare: false,
    behaviors: [b('grazing', 'Nibbling'), b('walking', 'Plodding'), b('curious', 'Curious'), b('bounding', 'Galloping'), b('sleeping', 'Resting'), b('startled', 'Startled')],
  },
  {
    id: 'fennec',
    name: 'Fennec Fox',
    biome: 'dunes',
    emoji: '🦊',
    hint: 'A sandy little fox with a keen nose.',
    rare: false,
    behaviors: FOX_BEHAVIORS,
  },
  {
    id: 'lizard',
    name: 'Sand Lizard',
    biome: 'dunes',
    emoji: '🦎',
    hint: 'Basks on the warm sand, then zips away.',
    rare: false,
    behaviors: LIZARD_BEHAVIORS,
  },
  {
    id: 'rainbow-lizard',
    name: 'Rainbow Lizard',
    biome: 'dunes',
    emoji: '🦎',
    hint: 'A legend of the dunes that shimmers in every colour.',
    rare: true,
    legendary: true,
    behaviors: LIZARD_BEHAVIORS,
  },
  {
    id: 'crab',
    name: 'Beach Crab',
    biome: 'coast',
    emoji: '🦀',
    hint: 'Scuttles by the water. Tucks in when startled.',
    rare: false,
    behaviors: [b('shuffling', 'Scuttling'), b('sniffing', 'Digging'), b('curled', 'Hiding'), b('curious', 'Curious')],
  },
  {
    id: 'seal',
    name: 'Seal',
    biome: 'coast',
    emoji: '🦭',
    hint: 'Lounges on the beach, flops into the sea if bothered.',
    rare: false,
    behaviors: SEAL_BEHAVIORS,
  },
  {
    id: 'seagull',
    name: 'Seagull',
    biome: 'coast',
    emoji: '🕊️',
    hint: 'Struts along the shore looking for snacks.',
    rare: false,
    behaviors: [b('trotting', 'Strutting'), b('sitting', 'Resting'), b('pouncing', 'Pecking'), b('curious', 'Curious'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
  },
  {
    id: 'pearl-seal',
    name: 'Pearl Seal',
    biome: 'coast',
    emoji: '🦭',
    hint: 'A legend of the coast, pale and glowing like a pearl.',
    rare: true,
    legendary: true,
    behaviors: SEAL_BEHAVIORS,
  },
];

const byId = new Map(SPECIES.map((s) => [s.id, s]));

export function species(id: SpeciesId): Species {
  return byId.get(id)!;
}

export function behaviorLabel(id: SpeciesId, behavior: string): string {
  return species(id).behaviors.find((x) => x.id === behavior)?.label ?? behavior;
}
