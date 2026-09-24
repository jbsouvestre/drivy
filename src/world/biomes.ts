import { hash2 } from '../rng';

export type BiomeId = 'meadow' | 'blossom' | 'wetlands' | 'dunes' | 'coast' | 'snow' | 'mushroom';

export interface GroundPalette {
  low: string;
  mid: string;
  high: string;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  emoji: string;
  /** Closest distance from spawn where this biome's regions can appear (its "tier"). */
  minDistance: number;
  /** Scale on the tallest hills. */
  hillHeight: number;
  /** Scale on how much pond basins dig in. */
  pondAmount: number;
  /** Pond-noise threshold where basins start: lower means more of the land is water. */
  pondCoverage: number;
  /** Height of long wind-swept dune ridges (0 = none). */
  duneHeight: number;
  /** Ground colours; null uses the seed's own meadow palette. */
  palette: GroundPalette | null;
}

/** Ordered by `minDistance` (tier). */
export const BIOMES: BiomeDef[] = [
  { id: 'meadow', name: 'Meadow', emoji: '🌾', minDistance: 0, hillHeight: 1, pondAmount: 1, pondCoverage: 0.6, duneHeight: 0, palette: null },
  {
    id: 'blossom',
    name: 'Blossom Woods',
    emoji: '🌸',
    minDistance: 150,
    hillHeight: 0.7,
    pondAmount: 0.45,
    pondCoverage: 0.62,
    duneHeight: 0,
    palette: { low: '#f6d9e7', mid: '#fbe7ef', high: '#eadff6' },
  },
  {
    id: 'wetlands',
    name: 'Lily Wetlands',
    emoji: '🪷',
    minDistance: 150,
    hillHeight: 0.3,
    pondAmount: 1.15,
    pondCoverage: 0.44,
    duneHeight: 0,
    palette: { low: '#cdeee2', mid: '#e0f2d8', high: '#eff0d2' },
  },
  {
    id: 'dunes',
    name: 'Candy Dunes',
    emoji: '🏜️',
    minDistance: 400,
    hillHeight: 0.35,
    pondAmount: 0.6,
    pondCoverage: 0.7,
    duneHeight: 2.8,
    palette: { low: '#ffe2c6', mid: '#ffd6c2', high: '#fcd0d8' },
  },
  {
    id: 'coast',
    name: 'Sherbet Coast',
    emoji: '🐚',
    minDistance: 400,
    hillHeight: 0.25,
    pondAmount: 1.9,
    pondCoverage: 0.34,
    duneHeight: 0.4,
    palette: { low: '#fff0dc', mid: '#ffe8d6', high: '#fde0e4' },
  },
  {
    id: 'snow',
    name: 'Snowdrop Hills',
    emoji: '❄️',
    minDistance: 700,
    hillHeight: 1.7,
    pondAmount: 0.5,
    pondCoverage: 0.66,
    duneHeight: 0,
    palette: { low: '#eef2ff', mid: '#f8f8ff', high: '#ffffff' },
  },
  {
    id: 'mushroom',
    name: 'Mushroom Hollow',
    emoji: '🍄',
    minDistance: 700,
    hillHeight: 0.8,
    pondAmount: 0.7,
    pondCoverage: 0.6,
    duneHeight: 0,
    palette: { low: '#b9d9c9', mid: '#cfd4ec', high: '#e2d2ef' },
  },
];

const BY_ID = new Map(BIOMES.map((b) => [b.id, b]));

export function biome(id: BiomeId): BiomeDef {
  return BY_ID.get(id)!;
}

/**
 * Two nearest biomes at a point and how much the nearest one dominates:
 * `t` is 1 deep inside region `a`, easing to 0.5 on the border with `b`.
 */
export interface BiomeSample {
  a: BiomeId;
  b: BiomeId;
  t: number;
}

/** Size of biome regions (Voronoi cells), in world units. */
const CELL = 190;
/** Width of the soft blend along region borders. */
const BLEND = 36;

/**
 * Seeded, infinite biome map: the world is cut into jittered Voronoi cells and
 * each cell picks a biome among those its distance from spawn allows. Near
 * spawn only the Meadow qualifies, so the world opens up the further you drive.
 */
interface Cell {
  /** Region centre in world units. */
  x: number;
  z: number;
  biome: BiomeId;
}

export class BiomeMap {
  private readonly scratch: BiomeSample = { a: 'meadow', b: 'meadow', t: 1 };
  /** Region centres and biomes, computed once per cell (this is sampled thousands of times per chunk). */
  private readonly cells = new Map<number, Cell>();

  constructor(private readonly seed: number) {}

  /** Sample at (x, z). Returns a shared object: read it before sampling again. */
  sample(x: number, z: number): BiomeSample {
    const gx = Math.floor(x / CELL);
    const gz = Math.floor(z / CELL);
    let d1 = Infinity;
    let d2 = Infinity;
    let c1: Cell | null = null;
    let c2: Cell | null = null;
    for (let iz = gz - 1; iz <= gz + 1; iz++) {
      for (let ix = gx - 1; ix <= gx + 1; ix++) {
        const c = this.cell(ix, iz);
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d < d1) {
          d2 = d1;
          c2 = c1;
          d1 = d;
          c1 = c;
        } else if (d < d2) {
          d2 = d;
          c2 = c;
        }
      }
    }
    const s = this.scratch;
    s.a = c1!.biome;
    s.b = c2!.biome;
    const u = Math.min(1, Math.max(0, (d2 - d1) / BLEND));
    s.t = s.a === s.b ? 1 : 0.5 + 0.5 * u * u * (3 - 2 * u);
    return s;
  }

  /** How much of biome `id` is present at (x, z), 0–1. */
  weight(x: number, z: number, id: BiomeId): number {
    const s = this.sample(x, z);
    return (s.a === id ? s.t : 0) + (s.b === id ? 1 - s.t : 0);
  }

  /** A region's jittered centre and its biome (cached). */
  private cell(ix: number, iz: number): Cell {
    // Cells are ~190 units wide, so ±32k cells covers any distance anyone will drive.
    const key = (ix + 32768) * 65536 + (iz + 32768);
    let c = this.cells.get(key);
    if (!c) {
      const h = hash2(this.seed ^ 0xb10e, ix, iz);
      const x = (ix + 0.15 + 0.7 * ((h & 0xffff) / 65536)) * CELL;
      const z = (iz + 0.15 + 0.7 * ((h >>> 16) / 65536)) * CELL;
      c = { x, z, biome: this.cellBiome(ix, iz, x, z) };
      this.cells.set(key, c);
    }
    return c;
  }

  /** The biome a cell belongs to, limited by its distance from spawn. */
  private cellBiome(ix: number, iz: number, cx: number, cz: number): BiomeId {
    const dist = Math.hypot(cx, cz);
    // A region's edge reaches ~half a cell nearer than its centre, so judge the tier
    // with that margin: a biome's first edges then appear around its minDistance.
    // BIOMES is ordered by tier, so the allowed ones are a prefix (no allocation: this runs a lot).
    let allowed = 0;
    while (allowed < BIOMES.length && BIOMES[allowed].minDistance + CELL * 0.55 <= dist) allowed++;
    allowed = Math.max(1, allowed);
    return BIOMES[hash2(this.seed ^ 0xb1a5, ix, iz) % allowed].id;
  }
}
