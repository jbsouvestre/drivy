import { hash2, mulberry32 } from '../rng';

export type RoadKind = 'asphalt' | 'dirt';

/** Half the paved width of each kind of road, in world units. */
export const ROAD_HALF_WIDTH: Record<RoadKind, number> = { asphalt: 3.4, dirt: 2.3 };
/** Queries only care about roads this close to a point (terrain shaping reaches this far). */
export const ROAD_RANGE = 20;
/** Length of one repeat of the road markings, in world units. */
export const ROAD_TEXTURE_LENGTH = 8;

/** Spacing of the road lattice: highway nodes along a row, and rows apart. */
const NODE_SPACING = 300;
const ROW_SPACING = 340;
/** How far lattice nodes stray from their grid position (fraction of spacing). */
const NODE_JITTER_U = 0.2;
const NODE_JITTER_V = 0.16;
/** Extra bends between highway nodes, and how far they swing sideways. */
const ROW_BENDS = 3;
const ROW_SWING = 0.09 * ROW_SPACING;
/** Side roads wind more than highways. */
const LINK_BENDS = 4;
const LINK_SWING = 0.13 * NODE_SPACING;
/** Chance that a node has a side road to the next highway, and that it's paved. */
const LINK_CHANCE = 0.45;
const LINK_ASPHALT_CHANCE = 0.2;
/** Chance that a highway stretch splits in two (and rejoins), and that the branch is paved. */
const FORK_CHANCE = 0.22;
const FORK_ASPHALT_CHANCE = 0.5;
/** Distance between centreline samples. */
const SAMPLE_STEP = 2.5;
/** Roads reach this far past their end points, overlapping whatever they join. */
const END_OVERLAP = 0.75;
/** The highway near spawn runs straight past, this far from the start point. */
const SPAWN_ROAD_OFFSET = 12;
/** Caches are dropped wholesale past these sizes (they rebuild on demand). */
const MAX_CACHED_PATHS = 800;
const MAX_CACHED_CELLS = 600;
const CELL = 32;

/** One road's centreline, sampled densely, in world coordinates. */
export interface RoadPath {
  kind: RoadKind;
  halfWidth: number;
  /** Draw order: highways over their branches, over side roads. */
  layer: number;
  xs: Float32Array;
  zs: Float32Array;
  /** Distance along the road at each sample (for stripes). */
  s: Float32Array;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Ground level at each sample, filled in lazily by the terrain (NaN until computed). */
  levels: Float32Array;
}

/** A road near a point (shared object: read it right away). */
export interface RoadHit {
  kind: RoadKind;
  halfWidth: number;
  /** Distance from the point to the road's edge (negative on the road). */
  edge: number;
  /** Distance from the point to the centreline. */
  dist: number;
  /** Nearest point on the centreline: between samples `index` and `index + 1`, a fraction `t` along. */
  x: number;
  z: number;
  path: RoadPath;
  index: number;
  t: number;
}

/** A run of consecutive samples [from, to] of one path. */
interface Run {
  path: RoadPath;
  from: number;
  to: number;
}

type Point = [number, number];

/**
 * An endless, sparse road network, a pure function of the seed.
 *
 * Winding asphalt highways run across the world on a rotated lattice; each
 * lattice row is one highway that never ends. Side roads (mostly dirt) link
 * neighbouring highways, and some highway stretches split into two branches
 * that meet again, so every road leads somewhere and none ever dead-ends.
 */
export class Roads {
  private seed = 0;
  private cos = 1;
  private sin = 0;
  private readonly paths = new Map<string, RoadPath | null>();
  private readonly cells = new Map<number, Run[]>();
  /** Results of the last nearby() call: its first `count` entries are valid. */
  readonly hits: RoadHit[] = [];
  private readonly hitPaths: RoadPath[] = [];

  setSeed(seed: number): void {
    this.seed = hash2(seed, 0x20ad, 0x5eed);
    const rand = mulberry32(this.seed);
    // Tilt the lattice so highways don't all run along the world axes.
    const angle = (0.25 + rand() * 0.5) * (Math.PI / 2) * (rand() < 0.5 ? -1 : 1);
    this.cos = Math.cos(angle);
    this.sin = Math.sin(angle);
    this.paths.clear();
    this.cells.clear();
  }

  /**
   * Find every road whose centreline is within ROAD_RANGE of (x, z): one hit
   * per road, at its closest point. Returns how many; they're the first
   * entries of `hits` (reused on every call, so read them right away).
   */
  nearby(x: number, z: number): number {
    const runs = this.cellRuns(Math.floor(x / CELL), Math.floor(z / CELL));
    const hits = this.hits;
    const paths = this.hitPaths;
    paths.length = 0;
    let count = 0;
    const range2 = ROAD_RANGE * ROAD_RANGE;
    for (const run of runs) {
      const { xs, zs } = run.path;
      // Closest segment of this run (squared distances: one square root per run).
      let best2 = range2;
      let bestI = -1;
      let bestT = 0;
      for (let i = run.from; i < run.to; i++) {
        const ax = xs[i];
        const az = zs[i];
        const dx = xs[i + 1] - ax;
        const dz = zs[i + 1] - az;
        const len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = x - ax - dx * t;
        const ez = z - az - dz * t;
        const d2 = ex * ex + ez * ez;
        if (d2 < best2) {
          best2 = d2;
          bestI = i;
          bestT = t;
        }
      }
      if (bestI < 0) continue;
      // One hit per road (a road can cross a cell in several runs).
      let slot = paths.indexOf(run.path);
      if (slot < 0) {
        slot = count++;
        paths.push(run.path);
        hits[slot] ??= { kind: 'asphalt', halfWidth: 0, edge: 0, dist: 0, x: 0, z: 0, path: run.path, index: 0, t: 0 };
        hits[slot].dist = Infinity;
      }
      const hit = hits[slot];
      const dist = Math.sqrt(best2);
      if (dist < hit.dist) {
        const i = bestI;
        hit.kind = run.path.kind;
        hit.halfWidth = run.path.halfWidth;
        hit.edge = dist - run.path.halfWidth;
        hit.dist = dist;
        hit.x = xs[i] + (xs[i + 1] - xs[i]) * bestT;
        hit.z = zs[i] + (zs[i + 1] - zs[i]) * bestT;
        hit.path = run.path;
        hit.index = i;
        hit.t = bestT;
      }
    }
    return count;
  }

  /** The road you're most "on" at (x, z) (smallest distance to its edge), if any is near. */
  nearest(x: number, z: number): RoadHit | null {
    const count = this.nearby(x, z);
    let best: RoadHit | null = null;
    for (let i = 0; i < count; i++) if (!best || this.hits[i].edge < best.edge) best = this.hits[i];
    return best;
  }

  /** How far (x, z) is from the edge of the nearest road (negative on it; Infinity if none near). */
  clearance(x: number, z: number): number {
    return this.nearest(x, z)?.edge ?? Infinity;
  }

  /** Every road path that may pass through the rectangle. */
  pathsIn(minX: number, minZ: number, maxX: number, maxZ: number, out: RoadPath[] = []): RoadPath[] {
    out.length = 0;
    // The rectangle's bounds in lattice space (u along highways, v across them).
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const [x, z] of [
      [minX, minZ],
      [maxX, minZ],
      [minX, maxZ],
      [maxX, maxZ],
    ]) {
      const u = x * this.cos + z * this.sin;
      const v = -x * this.sin + z * this.cos;
      uMin = Math.min(uMin, u);
      uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }
    for (let j = Math.floor(vMin / ROW_SPACING) - 1; j <= Math.floor(vMax / ROW_SPACING) + 1; j++) {
      for (let i = Math.floor(uMin / NODE_SPACING) - 1; i <= Math.floor(uMax / NODE_SPACING) + 1; i++) {
        for (const kind of ['row', 'fork', 'link'] as const) {
          const path = this.path(kind, i, j);
          if (path && path.maxX >= minX && path.minX <= maxX && path.maxZ >= minZ && path.minZ <= maxZ) out.push(path);
        }
      }
    }
    return out;
  }

  // ---------- lattice ----------

  private rand(i: number, j: number, salt: number): () => number {
    return mulberry32(hash2(this.seed ^ salt, i, j));
  }

  /** Is this the highway stretch that runs past the start point? (Kept straight and simple.) */
  private isSpawnStretch(i: number, j: number): boolean {
    return j === 0 && (i === -1 || i === 0);
  }

  /** Highway node (i, j) in lattice space. */
  private node(i: number, j: number): Point {
    const r = this.rand(i, j, 0x40de);
    let u = (i + (r() - 0.5) * 2 * NODE_JITTER_U) * NODE_SPACING;
    let v = (j + (r() - 0.5) * 2 * NODE_JITTER_V) * ROW_SPACING;
    if (j === 0 && i >= -1 && i <= 1) {
      // A highway passes just beside the start point, so it's in sight from the beginning.
      v = SPAWN_ROAD_OFFSET;
      if (i === 0) u = 0.35 * NODE_SPACING; // keep the junction (and its side roads) away from spawn
    }
    return [u, v];
  }

  /** Point k along highway row j (nodes at multiples of ROW_BENDS + 1, bends in between). */
  private rowPoint(j: number, k: number, forkSide = 0): Point {
    const per = ROW_BENDS + 1;
    const i = Math.floor(k / per);
    const m = k - i * per;
    const a = this.node(i, j);
    if (m === 0) return a;
    const b = this.node(i + 1, j);
    const t = m / per;
    const r = this.rand(i, j, 0xbe4d + m);
    let swing = this.isSpawnStretch(i, j) ? 0 : (r() - 0.5) * 2 * ROW_SWING;
    // A branch bulges away from the main road, most in the middle.
    if (forkSide !== 0) swing += forkSide * this.forkWidth(i, j) * Math.sin(Math.PI * t);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + swing];
  }

  private forkWidth(i: number, j: number): number {
    return 45 + this.rand(i, j, 0xf0e1)() * 30;
  }

  /** Build (or fetch) one road: a highway stretch, its branch, or a side road. */
  private path(kind: 'row' | 'fork' | 'link', i: number, j: number): RoadPath | null {
    const key = `${kind}:${i}:${j}`;
    const cached = this.paths.get(key);
    if (cached !== undefined) return cached;
    if (this.paths.size > MAX_CACHED_PATHS) this.paths.clear();

    let path: RoadPath | null = null;
    const per = ROW_BENDS + 1;
    if (kind === 'row') {
      const pts: Point[] = [];
      for (let k = i * per - 1; k <= (i + 1) * per + 1; k++) pts.push(this.rowPoint(j, k));
      path = this.sample(pts, 'asphalt', 3);
    } else if (kind === 'fork') {
      const r = this.rand(i, j, 0xf04c);
      if (!this.isSpawnStretch(i, j) && r() < FORK_CHANCE) {
        const paved = r() < FORK_ASPHALT_CHANCE;
        const side = r() < 0.5 ? -1 : 1;
        // Same end points and tangents as the highway, so the branch peels off smoothly.
        const pts: Point[] = [this.rowPoint(j, i * per - 1)];
        for (let k = i * per; k <= (i + 1) * per; k++) pts.push(this.rowPoint(j, k, side));
        pts.push(this.rowPoint(j, (i + 1) * per + 1));
        path = this.sample(pts, paved ? 'asphalt' : 'dirt', 2);
      }
    } else {
      const r = this.rand(i, j, 0x1114);
      // Side road from node (i, j) up to node (i, j + 1). Never across the start point.
      const nearSpawn = i === 0 && j === -1;
      if (!nearSpawn && r() < LINK_CHANCE) {
        const paved = r() < LINK_ASPHALT_CHANCE;
        const a = this.node(i, j);
        const b = this.node(i, j + 1);
        const reach = ROW_SPACING / (LINK_BENDS + 1);
        // Leave and join the highways head-on: guide points straight across them.
        const pts: Point[] = [[a[0], a[1] - reach], a];
        for (let m = 1; m <= LINK_BENDS; m++) {
          const t = m / (LINK_BENDS + 1);
          const swing = (r() - 0.5) * 2 * LINK_SWING * Math.sin(Math.PI * t);
          pts.push([a[0] + (b[0] - a[0]) * t + swing, a[1] + (b[1] - a[1]) * t]);
        }
        pts.push(b, [b[0], b[1] + reach]);
        path = this.sample(pts, paved ? 'asphalt' : 'dirt', 1);
      }
    }
    this.paths.set(key, path);
    return path;
  }

  /**
   * Sample a smooth curve through `pts` (lattice space), skipping the first and
   * last points, which only shape the tangents at the ends. Returns world coordinates.
   */
  private sample(pts: Point[], kind: RoadKind, layer: number): RoadPath {
    const us: number[] = [];
    const vs: number[] = [];
    for (let k = 1; k < pts.length - 2; k++) {
      const p1 = pts[k];
      const p2 = pts[k + 1];
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / SAMPLE_STEP));
      for (let s = 0; s < n; s++) catmullRom(pts[k - 1], p1, p2, pts[k + 2], s / n, us, vs);
    }
    const last = pts[pts.length - 2];
    us.push(last[0]);
    vs.push(last[1]);
    // Run a little past each end, so roads meeting end to end overlap instead of leaving a
    // crack (only a little: on a bend, a longer straight stub would poke out of the curve).
    const n = us.length;
    const e0 = END_OVERLAP / Math.hypot(us[1] - us[0], vs[1] - vs[0]);
    const e1 = END_OVERLAP / Math.hypot(us[n - 1] - us[n - 2], vs[n - 1] - vs[n - 2]);
    us.unshift(us[0] + (us[0] - us[1]) * e0);
    vs.unshift(vs[0] + (vs[0] - vs[1]) * e0);
    us.push(us[n] + (us[n] - us[n - 1]) * e1);
    vs.push(vs[n] + (vs[n] - vs[n - 1]) * e1);

    const count = us.length;
    const xs = new Float32Array(count);
    const zs = new Float32Array(count);
    const s = new Float32Array(count);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k < count; k++) {
      xs[k] = us[k] * this.cos - vs[k] * this.sin;
      zs[k] = us[k] * this.sin + vs[k] * this.cos;
      if (k > 0) s[k] = s[k - 1] + Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
      minX = Math.min(minX, xs[k]);
      maxX = Math.max(maxX, xs[k]);
      minZ = Math.min(minZ, zs[k]);
      maxZ = Math.max(maxZ, zs[k]);
    }
    // Measure from the real start (index 1), stretched so the markings repeat a whole number
    // of times between the end points: roads meeting there continue each other's dashes.
    const start = s[1];
    const length = s[count - 2] - start;
    const stretch = (Math.max(1, Math.round(length / ROAD_TEXTURE_LENGTH)) * ROAD_TEXTURE_LENGTH) / length;
    for (let k = 0; k < count; k++) s[k] = (s[k] - start) * stretch;
    const levels = new Float32Array(count).fill(Number.NaN);
    return { kind, halfWidth: ROAD_HALF_WIDTH[kind], layer, xs, zs, s, minX, maxX, minZ, maxZ, levels };
  }

  /** Segments that come within ROAD_RANGE of a CELL-sized square (cached). */
  private cellRuns(cx: number, cz: number): Run[] {
    const key = (cx + 32768) * 65536 + (cz + 32768);
    let runs = this.cells.get(key);
    if (runs) return runs;
    if (this.cells.size > MAX_CACHED_CELLS) this.cells.clear();

    runs = [];
    const minX = cx * CELL - ROAD_RANGE;
    const minZ = cz * CELL - ROAD_RANGE;
    const maxX = (cx + 1) * CELL + ROAD_RANGE;
    const maxZ = (cz + 1) * CELL + ROAD_RANGE;
    for (const path of this.pathsIn(minX, minZ, maxX, maxZ, _paths)) {
      const { xs, zs } = path;
      let from = -1;
      for (let k = 0; k < xs.length - 1; k++) {
        const inside =
          Math.max(xs[k], xs[k + 1]) >= minX &&
          Math.min(xs[k], xs[k + 1]) <= maxX &&
          Math.max(zs[k], zs[k + 1]) >= minZ &&
          Math.min(zs[k], zs[k + 1]) <= maxZ;
        if (inside && from < 0) from = k;
        if (!inside && from >= 0) {
          runs.push({ path, from, to: k });
          from = -1;
        }
      }
      if (from >= 0) runs.push({ path, from, to: xs.length - 1 });
    }
    this.cells.set(key, runs);
    return runs;
  }
}

const _paths: RoadPath[] = [];

/** Centripetal Catmull–Rom point at t ∈ [0, 1) between p1 and p2 (no loops or cusps). */
function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number, us: number[], vs: number[]): void {
  const k = (a: Point, b: Point) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0;
  const t1 = t0 + k(p0, p1);
  const t2 = t1 + k(p1, p2);
  const t3 = t2 + k(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const out: number[] = [0, 0];
  for (let c = 0; c < 2; c++) {
    const a1 = ((t1 - tt) / (t1 - t0)) * p0[c] + ((tt - t0) / (t1 - t0)) * p1[c];
    const a2 = ((t2 - tt) / (t2 - t1)) * p1[c] + ((tt - t1) / (t2 - t1)) * p2[c];
    const a3 = ((t3 - tt) / (t3 - t2)) * p2[c] + ((tt - t2) / (t3 - t2)) * p3[c];
    const b1 = ((t2 - tt) / (t2 - t0)) * a1 + ((tt - t0) / (t2 - t0)) * a2;
    const b2 = ((t3 - tt) / (t3 - t1)) * a2 + ((tt - t1) / (t3 - t1)) * a3;
    out[c] = ((t2 - tt) / (t2 - t1)) * b1 + ((tt - t1) / (t2 - t1)) * b2;
  }
  us.push(out[0]);
  vs.push(out[1]);
}
