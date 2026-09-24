import type { BiomeId } from '../biomes';

export type StructureKind =
  // Meadow
  | 'windmill'
  | 'cabin'
  | 'hayBales'
  | 'picnic'
  // Blossom Woods
  | 'pagoda'
  | 'torii'
  | 'stoneLanterns'
  | 'swingTree'
  // Lily Wetlands
  | 'stiltHouse'
  | 'jetty'
  | 'rowBoat'
  | 'fishingHut'
  // Candy Dunes
  | 'pyramid'
  | 'tent'
  | 'caravan'
  | 'well'
  // Sherbet Coast
  | 'lighthouse'
  | 'beachHuts'
  | 'parasol'
  | 'sandcastle'
  // Snowdrop Hills
  | 'iglooVillage'
  | 'chalet'
  | 'sled'
  | 'iceFishing'
  // Mushroom Hollow
  | 'mushroomHouse'
  | 'fairyRing'
  | 'signpost'
  | 'lanternString';

/**
 * Where a structure may stand: on dry, gentle ground; afloat; standing in the
 * shallows (on stilts); on the shore facing the water; or running out from the
 * shore over the water (a jetty).
 */
export type Placement = 'land' | 'water' | 'shallow' | 'shore' | 'jetty';

export interface KindInfo {
  biome: BiomeId;
  /** A rare, big set piece (one per biome); otherwise a small, common one. */
  landmark: boolean;
  /** Radius kept free of trees and rocks, and away from roads. */
  clear: number;
  /** Radius over which the ground must be gentle enough to build on. */
  foot: number;
  place: Placement;
  /** Relative frequency among its biome's small structures. */
  weight: number;
}

export const KINDS: Record<StructureKind, KindInfo> = {
  windmill: { biome: 'meadow', landmark: true, clear: 7, foot: 2.4, place: 'land', weight: 1 },
  cabin: { biome: 'meadow', landmark: false, clear: 6, foot: 2.6, place: 'land', weight: 1 },
  hayBales: { biome: 'meadow', landmark: false, clear: 4.5, foot: 2.5, place: 'land', weight: 1.4 },
  picnic: { biome: 'meadow', landmark: false, clear: 3.5, foot: 1.6, place: 'land', weight: 0.8 },

  pagoda: { biome: 'blossom', landmark: true, clear: 8, foot: 3.5, place: 'land', weight: 1 },
  torii: { biome: 'blossom', landmark: false, clear: 7, foot: 2, place: 'land', weight: 1 },
  stoneLanterns: { biome: 'blossom', landmark: false, clear: 3.5, foot: 1.8, place: 'land', weight: 1.2 },
  swingTree: { biome: 'blossom', landmark: false, clear: 5, foot: 1.5, place: 'land', weight: 1 },

  stiltHouse: { biome: 'wetlands', landmark: true, clear: 6.5, foot: 2.5, place: 'shallow', weight: 1 },
  jetty: { biome: 'wetlands', landmark: false, clear: 4, foot: 1, place: 'jetty', weight: 1 },
  rowBoat: { biome: 'wetlands', landmark: false, clear: 3, foot: 2, place: 'water', weight: 1 },
  fishingHut: { biome: 'wetlands', landmark: false, clear: 5, foot: 2, place: 'shore', weight: 1 },

  pyramid: { biome: 'dunes', landmark: true, clear: 9, foot: 5.5, place: 'land', weight: 1 },
  tent: { biome: 'dunes', landmark: false, clear: 4.5, foot: 2, place: 'land', weight: 1.2 },
  caravan: { biome: 'dunes', landmark: false, clear: 5, foot: 2.2, place: 'land', weight: 0.9 },
  well: { biome: 'dunes', landmark: false, clear: 4, foot: 1.5, place: 'land', weight: 0.9 },

  lighthouse: { biome: 'coast', landmark: true, clear: 7, foot: 2.2, place: 'land', weight: 1 },
  beachHuts: { biome: 'coast', landmark: false, clear: 7, foot: 3, place: 'land', weight: 1 },
  parasol: { biome: 'coast', landmark: false, clear: 3.5, foot: 1.5, place: 'land', weight: 1.2 },
  sandcastle: { biome: 'coast', landmark: false, clear: 3, foot: 1.3, place: 'land', weight: 1 },

  iglooVillage: { biome: 'snow', landmark: true, clear: 9, foot: 6, place: 'land', weight: 1 },
  chalet: { biome: 'snow', landmark: false, clear: 6, foot: 2.5, place: 'land', weight: 1 },
  sled: { biome: 'snow', landmark: false, clear: 3, foot: 1.2, place: 'land', weight: 1 },
  iceFishing: { biome: 'snow', landmark: false, clear: 3.5, foot: 1.8, place: 'land', weight: 1 },

  mushroomHouse: { biome: 'mushroom', landmark: true, clear: 8, foot: 3, place: 'land', weight: 1 },
  fairyRing: { biome: 'mushroom', landmark: false, clear: 4, foot: 2.5, place: 'land', weight: 1.2 },
  signpost: { biome: 'mushroom', landmark: false, clear: 4.5, foot: 2, place: 'land', weight: 1 },
  lanternString: { biome: 'mushroom', landmark: false, clear: 4, foot: 2.5, place: 'land', weight: 1 },
};

/** Largest clear radius of any kind (how far a site can reach). */
export const MAX_CLEAR = Math.max(...Object.values(KINDS).map((k) => k.clear));

/** Each biome's landmark, and its small structures. */
export const LANDMARK_OF = {} as Record<BiomeId, StructureKind>;
export const SMALL_OF = {} as Record<BiomeId, StructureKind[]>;
for (const [kind, info] of Object.entries(KINDS) as [StructureKind, KindInfo][]) {
  if (info.landmark) LANDMARK_OF[info.biome] = kind;
  else (SMALL_OF[info.biome] ??= []).push(kind);
}
