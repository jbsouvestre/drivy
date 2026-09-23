import type * as THREE from 'three';

export type BiomeId = 'meadow';

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
  | 'firefly';

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
const OWL_BEHAVIORS = [b('perched', 'Perched'), b('hooting', 'Hooting'), b('head-tilt', 'Head tilt'), b('flying', 'Flying'), b('startled', 'Startled')];

export const SPECIES: Species[] = [
  {
    id: 'duck',
    name: 'Duck',
    biome: 'meadow',
    emoji: '🦆',
    hint: 'Paddles around ponds with a trail of little ones.',
    rare: false,
    behaviors: [b('swimming', 'Swimming'), b('dabbling', 'Dabbling'), b('quacking', 'Quacking'), b('family', 'Family portrait'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
  },
  {
    id: 'duckling',
    name: 'Duckling',
    biome: 'meadow',
    emoji: '🐥',
    hint: 'Never far behind its mother.',
    rare: false,
    behaviors: [b('swimming', 'Swimming'), b('dabbling', 'Dabbling'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
  },
  {
    id: 'squirrel',
    name: 'Squirrel',
    biome: 'meadow',
    emoji: '🐿️',
    hint: 'Sits on top of round trees.',
    rare: false,
    behaviors: [b('perched', 'Perched'), b('nibbling', 'Nibbling'), b('leaping', 'Leaping'), b('sleeping', 'Sleeping'), b('startled', 'Startled')],
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
];

const byId = new Map(SPECIES.map((s) => [s.id, s]));

export function species(id: SpeciesId): Species {
  return byId.get(id)!;
}

export function behaviorLabel(id: SpeciesId, behavior: string): string {
  return species(id).behaviors.find((x) => x.id === behavior)?.label ?? behavior;
}
