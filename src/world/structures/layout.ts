import { hash2, mulberry32 } from '../../rng';
import type { BiomeId } from '../biomes';
import { KINDS, LANDMARK_OF, MAX_CLEAR, SMALL_OF, type StructureKind } from './kinds';

/** What placement needs to know about the world. */
export interface SiteTerrain {
  heightAt(x: number, z: number): number;
  readonly waterLevel: number;
  biomeWeight(x: number, z: number, id: BiomeId): number;
  dominantBiome(x: number, z: number): BiomeId;
  roadClearance(x: number, z: number): number;
}

/** One placed structure. */
export interface Site {
  kind: StructureKind;
  x: number;
  /** Base height: the lowest ground under it, or the water surface. */
  y: number;
  z: number;
  rotY: number;
  /** Radius kept free of trees and rocks. */
  clear: number;
  /** Seeds the structure's own details (how many bales, which colours…). */
  seed: number;
}

/** Landmarks: one candidate per big cell (rare, but you'll drive past them). */
const LANDMARK_CELL = 180;
const LANDMARK_CHANCE = 0.6;
/** Places tried per landmark cell before giving up. */
const LANDMARK_TRIES = 5;
/** Small structures: one candidate per small cell. */
const SMALL_CELL = 46;
const SMALL_CHANCE = 0.4;
const SMALL_TRIES = 2;
/** Nothing is built this close to the start point… */
const SPAWN_CLEAR = 30;
/** …except a first landmark, somewhere in this ring, so one turns up early. */
const FIRST_LANDMARK_MIN = 60;
const FIRST_LANDMARK_MAX = 85;
/** Grid landmarks keep this far from that first one. */
const FIRST_LANDMARK_SPACE = 150;
/** Structures keep this far from a road's edge (beyond their clear radius). */
const ROAD_GAP = 2;
/** Caches are dropped wholesale past this size (they rebuild on demand). */
const MAX_CACHED = 4000;

/**
 * Where every structure in the (infinite) world stands: a pure function of the
 * seed, computed cell by cell on demand, like the roads.
 */
export class StructureLayout {
  private seed = 0;
  private first: Site | null = null;
  private readonly landmarks = new Map<number, Site | null>();
  private readonly smalls = new Map<number, Site | null>();

  constructor(private readonly terrain: SiteTerrain) {}

  setSeed(seed: number): void {
    this.seed = hash2(seed, 0x5717, 0xc7);
    this.landmarks.clear();
    this.smalls.clear();
    this.first = this.placeFirstLandmark();
  }

  /** Every site whose centre lies in the rectangle. */
  sitesIn(minX: number, minZ: number, maxX: number, maxZ: number, out: Site[] = []): Site[] {
    out.length = 0;
    const inside = (s: Site | null): s is Site => !!s && s.x >= minX && s.x < maxX && s.z >= minZ && s.z < maxZ;
    if (inside(this.first)) out.push(this.first);
    for (let j = Math.floor(minZ / LANDMARK_CELL); j <= Math.floor(maxZ / LANDMARK_CELL); j++) {
      for (let i = Math.floor(minX / LANDMARK_CELL); i <= Math.floor(maxX / LANDMARK_CELL); i++) {
        const s = this.landmarkAt(i, j);
        if (inside(s)) out.push(s);
      }
    }
    for (let j = Math.floor(minZ / SMALL_CELL); j <= Math.floor(maxZ / SMALL_CELL); j++) {
      for (let i = Math.floor(minX / SMALL_CELL); i <= Math.floor(maxX / SMALL_CELL); i++) {
        const s = this.smallAt(i, j);
        if (inside(s)) out.push(s);
      }
    }
    return out;
  }

  /** Is (x, z) inside some structure's clearing (so no tree or rock should grow there)? */
  blocks(x: number, z: number): boolean {
    const within = (s: Site | null) => !!s && (s.x - x) ** 2 + (s.z - z) ** 2 < s.clear * s.clear;
    if (within(this.first)) return true;
    for (let j = Math.floor((z - MAX_CLEAR) / SMALL_CELL); j <= Math.floor((z + MAX_CLEAR) / SMALL_CELL); j++) {
      for (let i = Math.floor((x - MAX_CLEAR) / SMALL_CELL); i <= Math.floor((x + MAX_CLEAR) / SMALL_CELL); i++) {
        if (within(this.smallAt(i, j))) return true;
      }
    }
    return this.nearLandmark(x, z, 0);
  }

  // ---------------------------------------------------------------- cells

  /** Is (x, z) within `gap` of any landmark's clearing? */
  private nearLandmark(x: number, z: number, gap: number): boolean {
    const reach = MAX_CLEAR + gap;
    const hit = (s: Site | null) => !!s && Math.hypot(s.x - x, s.z - z) < s.clear + gap;
    if (hit(this.first)) return true;
    for (let j = Math.floor((z - reach) / LANDMARK_CELL); j <= Math.floor((z + reach) / LANDMARK_CELL); j++) {
      for (let i = Math.floor((x - reach) / LANDMARK_CELL); i <= Math.floor((x + reach) / LANDMARK_CELL); i++) {
        if (hit(this.landmarkAt(i, j))) return true;
      }
    }
    return false;
  }

  private landmarkAt(i: number, j: number): Site | null {
    const key = cellKey(i, j);
    const cached = this.landmarks.get(key);
    if (cached !== undefined) return cached;
    if (this.landmarks.size > MAX_CACHED) this.landmarks.clear();

    let site: Site | null = null;
    const rand = mulberry32(hash2(this.seed ^ 0x1a4d, i, j));
    if (rand() < LANDMARK_CHANCE) {
      for (let t = 0; t < LANDMARK_TRIES && !site; t++) {
        const x = (i + 0.12 + rand() * 0.76) * LANDMARK_CELL;
        const z = (j + 0.12 + rand() * 0.76) * LANDMARK_CELL;
        if (this.first && Math.hypot(x - this.first.x, z - this.first.z) < FIRST_LANDMARK_SPACE) continue;
        site = this.fit(LANDMARK_OF[this.terrain.dominantBiome(x, z)], x, z, rand);
      }
    }
    this.landmarks.set(key, site);
    return site;
  }

  private smallAt(i: number, j: number): Site | null {
    const key = cellKey(i, j);
    const cached = this.smalls.get(key);
    if (cached !== undefined) return cached;
    if (this.smalls.size > MAX_CACHED) this.smalls.clear();

    let site: Site | null = null;
    const rand = mulberry32(hash2(this.seed ^ 0x5a11, i, j));
    if (rand() < SMALL_CHANCE) {
      for (let t = 0; t < SMALL_TRIES && !site; t++) {
        // Keep the centre far enough inside the cell that neighbours never overlap.
        const margin = MAX_CLEAR / SMALL_CELL;
        const x = (i + margin + rand() * (1 - 2 * margin)) * SMALL_CELL;
        const z = (j + margin + rand() * (1 - 2 * margin)) * SMALL_CELL;
        const kind = pickSmall(SMALL_OF[this.terrain.dominantBiome(x, z)], rand());
        if (this.nearLandmark(x, z, KINDS[kind].clear)) continue;
        site = this.fit(kind, x, z, rand);
      }
    }
    this.smalls.set(key, site);
    return site;
  }

  /** A first landmark within easy reach of the start. */
  private placeFirstLandmark(): Site | null {
    const rand = mulberry32(hash2(this.seed ^ 0xf125, 0, 0));
    const start = rand() * Math.PI * 2;
    for (let t = 0; t < 16; t++) {
      const angle = start + t * 2.4;
      const r = FIRST_LANDMARK_MIN + rand() * (FIRST_LANDMARK_MAX - FIRST_LANDMARK_MIN);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const site = this.fit(LANDMARK_OF[this.terrain.dominantBiome(x, z)], x, z, rand);
      if (site) return site;
    }
    return null;
  }

  // ---------------------------------------------------------------- fitting

  /** Can `kind` stand at (x, z)? Returns its site (height, facing) if so. */
  private fit(kind: StructureKind, x: number, z: number, rand: () => number): Site | null {
    const info = KINDS[kind];
    const t = this.terrain;
    if (Math.hypot(x, z) < SPAWN_CLEAR + info.clear) return null;
    if (t.biomeWeight(x, z, info.biome) < (info.landmark ? 0.85 : 0.75)) return null;
    if (t.roadClearance(x, z) < info.clear + ROAD_GAP) return null;

    const water = t.waterLevel;
    const h = (dx: number, dz: number) => t.heightAt(x + dx, z + dz);
    const depth = (dx: number, dz: number) => water - h(dx, dz);
    let y: number;
    let rotY = rand() * Math.PI * 2;
    const seed = hash2(this.seed, Math.round(x * 8), Math.round(z * 8));

    switch (info.place) {
      case 'land': {
        // Dry and gentle across the footprint; build on the lowest point (bases reach down).
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 0; k <= 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const r = k === 8 ? 0 : info.foot;
          const v = h(Math.cos(a) * r, Math.sin(a) * r);
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        if (lo < water + 0.3 || hi - lo > (info.landmark ? 2 : 1.2)) return null;
        y = lo;
        break;
      }
      case 'water': {
        if (depth(0, 0) < 0.7) return null;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          if (depth(Math.cos(a) * info.foot, Math.sin(a) * info.foot) < 0.3) return null;
        }
        y = water;
        break;
      }
      case 'shallow': {
        const d = depth(0, 0);
        if (d < 0.25 || d > 2.2) return null;
        // Near a shore; face it (the ladder side).
        const toLand = this.direction(x, z, 11, (v) => v > water + 0.3);
        if (toLand === null) return null;
        rotY = toLand;
        y = water;
        break;
      }
      case 'shore': {
        const c = h(0, 0);
        if (c < water + 0.25 || c > water + 1.4) return null;
        // Water close by; face it.
        const toWater = this.direction(x, z, 6, (v) => v < water - 0.4);
        if (toWater === null) return null;
        rotY = toWater;
        y = Math.min(c, h(Math.sin(rotY) * 1.5, Math.cos(rotY) * 1.5));
        break;
      }
      case 'jetty': {
        // Right at the waterline, running out over deep enough water with dry land behind.
        if (Math.abs(depth(0, 0)) > 0.35) return null;
        const out = this.direction(x, z, 7, (v, dx, dz) => v < water - 0.6 && t.heightAt(x - dx * 0.5, z - dz * 0.5) > water);
        if (out === null) return null;
        rotY = out;
        y = water;
        break;
      }
    }
    return { kind, x, y, z, rotY, clear: info.clear, seed };
  }

  /** The heading (rotY) of the first of 12 directions whose point at `r` passes `test`, if any. */
  private direction(x: number, z: number, r: number, test: (height: number, dx: number, dz: number) => boolean): number | null {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const dx = Math.sin(a) * r;
      const dz = Math.cos(a) * r;
      if (test(this.terrain.heightAt(x + dx, z + dz), dx, dz)) return a;
    }
    return null;
  }
}

function cellKey(i: number, j: number): number {
  return (i + 32768) * 65536 + (j + 32768);
}

function pickSmall(kinds: StructureKind[], r: number): StructureKind {
  const total = kinds.reduce((sum, k) => sum + KINDS[k].weight, 0);
  let acc = 0;
  for (const k of kinds) {
    acc += KINDS[k].weight / total;
    if (r < acc) return k;
  }
  return kinds[kinds.length - 1];
}
