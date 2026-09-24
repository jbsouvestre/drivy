import * as THREE from 'three';
import { hash2, mulberry32 } from '../rng';
import { ValueNoise2D } from './noise';
import { propDefs, writePropMatrix, type Collider, type Prop, type PropKind } from './props';
import { biome, BiomeMap, type BiomeId, type BiomeSample, type GroundPalette } from './biomes';
import { buildWater, WATER_LEVEL } from './Water';
import { Roads, type RoadKind, type RoadPath } from './Roads';
import { buildRoadMeshes } from './roadMesh';
import { Structures } from './structures/Structures';

export const CHUNK_SIZE = 32;
/** Chunks kept loaded around the player, in each direction. */
const VIEW_RADIUS = 3;
/** Far chunks built per frame while streaming (near ones are always built at once). */
const CHUNKS_PER_FRAME = 1;
/** Extra ring kept before unloading, so chunks don't thrash at borders. */
const UNLOAD_RADIUS = VIEW_RADIUS + 1;
const SEGMENTS = 24;
/** Tallest hills, in world units. */
const HILL_HEIGHT = 4.5;
/** Gentle everywhere-bumps layered on top of the hills. */
const BUMP_HEIGHT = 0.35;
/** How deep pond basins dig below the meadows. */
const POND_DEPTH = 1.7;
/** No ponds this close to the spawn point. */
const POND_CLEAR_RADIUS = 18;
/** Difficulty ramps from 0 to 1 between these distances from spawn. */
const DIFFICULTY_START = 60;
const DIFFICULTY_FULL = 700;
/** Sandy beach ring colour around ponds. */
const SAND = new THREE.Color('#f5e6c8');
/** Frosty shoreline colour in the snow. */
const ICE_SHORE = new THREE.Color('#dcebf7');
/** Size of one checker tile in world units. */
const TILE_SIZE = 4;
/** Props are scattered on a jittered grid of this cell size. */
const SCATTER_CELL = 4;
/** Keep the spawn point free of props. */
const SPAWN_CLEAR_RADIUS = 10;
/** Past a road's edge, the ground eases from road level back to natural terrain over this distance. */
const ROAD_BLEND = 6;
/** Ponds give way to a causeway within this distance of a road's edge. */
const ROAD_POND_CLEAR = 14;
/** Road surfaces stay at least this far above the water. */
const ROAD_ABOVE_WATER = 0.35;
/** Nothing grows within this distance of a road's edge. */
const ROAD_PROP_CLEAR = 2.5;

const PALETTES: GroundPalette[] = [
  { low: '#bfe8cf', mid: '#dcf2c4', high: '#ffe3c7' }, // mint meadow
  { low: '#c9e4f5', mid: '#e2ecd0', high: '#fbd9e2' }, // cotton candy
  { low: '#d4e8c2', mid: '#f3efc4', high: '#f7d6c4' }, // lemon sorbet
  { low: '#d9d2f0', mid: '#cdeee0', high: '#fbe3f0' }, // lavender field
];

interface Chunk {
  cx: number;
  cz: number;
  group: THREE.Group;
  ground: THREE.Mesh;
  water: THREE.Mesh | null;
  props: THREE.InstancedMesh[];
  roads: THREE.Mesh[];
  colliders: Collider[];
  /** Lily pads and water lilies (no collision), for animals that like to sit on them. */
  pads: Prop[];
}

interface PropSpawn {
  kind: PropKind;
  x: number;
  z: number;
  rotY: number;
  scale: number;
  tint: number;
}

interface Wobble {
  prop: Prop;
  chunk: Chunk;
  dirX: number;
  dirZ: number;
  amp: number;
  t: number;
}

/** Anything that can report the ground height at a point. */
export interface Terrain {
  heightAt(x: number, z: number): number;
  /** Surface height of ponds; ground below it is under water. */
  readonly waterLevel: number;
  /** The kind of road at a point, or null off-road. */
  surfaceAt(x: number, z: number): RoadKind | null;
}

/**
 * Infinite, seeded world made of square chunks that stream in and out around
 * a focus point. Chunks are a pure function of (seed, cx, cz), so revisiting a
 * place — or replaying a seed — always yields the same terrain and props.
 */
export class World implements Terrain {
  readonly group = new THREE.Group();

  private seed = 0;
  private terrainNoise = new ValueNoise2D(0);
  private forestNoise = new ValueNoise2D(0);
  private hillNoise = new ValueNoise2D(0);
  private pondNoise = new ValueNoise2D(0);
  private biomes = new BiomeMap(0);
  private readonly roads = new Roads();
  /** Windmills, beach huts, igloos…: the human touches, placed like everything else by the seed. */
  readonly structures = new Structures(this);
  private palette = PALETTES[0];
  private readonly chunks = new Map<number, Chunk>();
  private readonly wobbles = new Map<Prop, Wobble>();
  private readonly parsedPalettes = new Map<BiomeId, ParsedPalette>();
  /** Chunks still to build, nearest first. */
  private readonly pending: [number, number][] = [];
  private centerX = Number.NaN;
  private centerZ = Number.NaN;
  private readonly groundMaterial: THREE.MeshStandardMaterial;

  constructor() {
    this.group.add(this.structures.group);
    this.groundMaterial = new THREE.MeshStandardMaterial({
      map: createCheckerTexture(CHUNK_SIZE / (TILE_SIZE * 2)),
      vertexColors: true,
      roughness: 1,
      metalness: 0,
    });
  }

  setSeed(seed: number): void {
    this.clear();
    this.seed = seed;
    this.terrainNoise = new ValueNoise2D(seed);
    this.forestNoise = new ValueNoise2D(hash2(seed, 0xf0, 0x7e57));
    this.hillNoise = new ValueNoise2D(hash2(seed, 0x4111, 0x1a));
    this.pondNoise = new ValueNoise2D(hash2(seed, 0x9014, 0xd5));
    this.biomes = new BiomeMap(hash2(seed, 0xb10, 0xe5));
    this.roads.setSeed(seed);
    this.structures.setSeed(seed);
    const rand = mulberry32(hash2(seed, 0x9e37, 0x79b9));
    this.palette = PALETTES[Math.floor(rand() * PALETTES.length)];
    this.parsedPalettes.clear();
  }

  /** Load chunks near `focus`, drop far-away ones, and animate bumped props. */
  update(focus: THREE.Vector3, dt: number): void {
    const ccx = Math.floor(focus.x / CHUNK_SIZE);
    const ccz = Math.floor(focus.z / CHUNK_SIZE);

    // Only rescan when the focus moves into another chunk.
    if (ccx !== this.centerX || ccz !== this.centerZ) {
      this.centerX = ccx;
      this.centerZ = ccz;
      this.pending.length = 0;
      for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
          if (!this.chunks.has(chunkKey(ccx + dx, ccz + dz))) this.pending.push([ccx + dx, ccz + dz]);
        }
      }
      // Nearest first, so the ground under the car always comes first.
      this.pending.sort((a, b) => Math.hypot(a[0] - ccx, a[1] - ccz) - Math.hypot(b[0] - ccx, b[1] - ccz));

      for (const [key, chunk] of this.chunks) {
        if (Math.abs(chunk.cx - ccx) > UNLOAD_RADIUS || Math.abs(chunk.cz - ccz) > UNLOAD_RADIUS) {
          this.disposeChunk(chunk);
          this.chunks.delete(key);
        }
      }
    }

    // Build the chunks right around the focus immediately; stream the rest in
    // one per frame (they're far off, under the fog), so crossing into a new
    // chunk never builds a whole row in a single frame.
    let built = 0;
    while (this.pending.length > 0) {
      const [cx, cz] = this.pending[0];
      const near = Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) <= 1;
      if (!near && built >= CHUNKS_PER_FRAME) break;
      this.pending.shift();
      const key = chunkKey(cx, cz);
      if (this.chunks.has(key)) continue;
      const chunk = this.buildChunk(cx, cz);
      this.chunks.set(key, chunk);
      this.group.add(chunk.group);
      built++;
    }

    this.updateWobbles(dt);
  }

  /** Height of pond surfaces; ground below this is under water. */
  readonly waterLevel = WATER_LEVEL;

  /**
   * Ground height at any point: soft rolling hills rising out of flat meadows,
   * with pond basins dug into the flats, plus a subtle bumpiness. Roads flatten
   * the ground across their width (and cross ponds on causeways). Pure function
   * of (seed, x, z), so it's seamless across chunks and identical on every visit.
   */
  heightAt(x: number, z: number): number {
    const count = this.roads.nearby(x, z);
    if (count === 0) return this.naturalHeight(x, z, 1, 1);
    const hits = this.roads.hits;
    let minEdge = Infinity;
    for (let i = 0; i < count; i++) minEdge = Math.min(minEdge, hits[i].edge);
    const natural = this.naturalHeight(x, z, smoothstep(2, ROAD_POND_CLEAR, minEdge), 1);
    if (minEdge >= ROAD_BLEND) return natural;
    // Each road pulls the ground to its own level (the bump- and pond-free height of its
    // centreline), fading out past its edge. Where roads meet, their levels blend smoothly.
    let weightSum = 0;
    let levelSum = 0;
    let pull = 0;
    for (let i = 0; i < count; i++) {
      const hit = hits[i];
      const w = 1 - smoothstep(1, ROAD_BLEND, hit.edge);
      if (w <= 0) continue;
      const level = this.roadLevel(hit.path, hit.index) * (1 - hit.t) + this.roadLevel(hit.path, hit.index + 1) * hit.t;
      weightSum += w;
      levelSum += w * level;
      pull = Math.max(pull, w);
    }
    if (weightSum === 0) return natural;
    return natural + (levelSum / weightSum - natural) * pull;
  }

  /**
   * A road's level at centreline sample `i`: the bump- and pond-free terrain
   * height there, kept above the water. Cached on the path, since every
   * height query near a road needs it.
   */
  private roadLevel(path: RoadPath, i: number): number {
    let level = path.levels[i];
    if (Number.isNaN(level)) {
      level = Math.max(this.naturalHeight(path.xs[i], path.zs[i], 0, 0), WATER_LEVEL + ROAD_ABOVE_WATER);
      path.levels[i] = level;
    }
    return level;
  }

  /** The kind of road at a point, or null off-road. */
  surfaceAt(x: number, z: number): RoadKind | null {
    const road = this.roads.nearest(x, z);
    return road && road.edge <= 0 ? road.kind : null;
  }

  /** Distance from a point to the nearest road's edge (negative on a road, Infinity if none nearby). */
  roadClearance(x: number, z: number): number {
    return this.roads.clearance(x, z);
  }

  /** Terrain before roads: `pondKeep` and `bumpKeep` (0–1) scale the ponds and small bumps. */
  private naturalHeight(x: number, z: number, pondKeep: number, bumpKeep: number): number {
    const b = this.biomes.sample(x, z);
    // Blend the two nearest biomes' terrain settings (no closures: this runs thousands of times per chunk).
    const da = biome(b.a);
    const db = biome(b.b);
    const ta = b.t;
    const tb = 1 - ta;
    const hillScale = da.hillHeight * ta + db.hillHeight * tb;
    const pondScale = da.pondAmount * ta + db.pondAmount * tb;
    const pondStart = da.pondCoverage * ta + db.pondCoverage * tb;
    const duneScale = da.duneHeight * ta + db.duneHeight * tb;
    const hilliness = smoothstep(0.42, 0.72, this.hillNoise.fbm(x / 50, z / 50, 3));
    const bumps = bumpKeep > 0 ? (this.hillNoise.sample(x / 11 + 71.3, z / 11 - 13.7) - 0.5) * BUMP_HEIGHT * bumpKeep : 0;
    // Pond basins: only on the flat meadows between hills, and never at spawn.
    const pond =
      pondKeep *
      smoothstep(pondStart, pondStart + 0.12, this.pondNoise.fbm(x / 40, z / 40, 2)) *
      (1 - smoothstep(0, 0.25, hilliness)) *
      smoothstep(POND_CLEAR_RADIUS, POND_CLEAR_RADIUS + 10, Math.hypot(x, z));
    // Dunes: long ridges, stretched along one axis like wind-swept sand.
    let dunes = 0;
    if (duneScale > 0.01) {
      const ridge = 1 - Math.abs(this.hillNoise.fbm(x / 30 + 11.3, z / 85 - 7.1, 2) * 2 - 1);
      dunes = ridge * ridge * duneScale;
    }
    return hilliness * HILL_HEIGHT * hillScale + bumps + dunes - pond * POND_DEPTH * pondScale;
  }

  /** The two nearest biomes at a point and how dominant the nearest is (shared object: read it right away). */
  biomeAt(x: number, z: number): BiomeSample {
    return this.biomes.sample(x, z);
  }

  /** The biome that dominates at a point. */
  dominantBiome(x: number, z: number): BiomeId {
    return this.biomes.sample(x, z).a;
  }

  /** How much of biome `id` is present at a point, 0–1. */
  biomeWeight(x: number, z: number, id: BiomeId): number {
    return this.biomes.weight(x, z, id);
  }

  /**
   * How challenging this spot is: 0 around spawn, easing up to 1 far away.
   * Animals out there are shyer; later, biomes and rarity will read it too.
   */
  difficultyAt(x: number, z: number): number {
    return smoothstep(DIFFICULTY_START, DIFFICULTY_FULL, Math.hypot(x, z));
  }

  /** Lily pads and water lilies within `range` of (x, z). */
  padsNear(x: number, z: number, range: number, out: Prop[] = []): Prop[] {
    out.length = 0;
    for (let cz = Math.floor((z - range) / CHUNK_SIZE); cz <= Math.floor((z + range) / CHUNK_SIZE); cz++) {
      for (let cx = Math.floor((x - range) / CHUNK_SIZE); cx <= Math.floor((x + range) / CHUNK_SIZE); cx++) {
        const chunk = this.chunks.get(chunkKey(cx, cz));
        if (!chunk) continue;
        for (const p of chunk.pads) if (Math.hypot(p.x - x, p.z - z) <= range) out.push(p);
      }
    }
    return out;
  }

  /** Collect colliders that could touch a circle of `range` around (x, z). */
  collidersNear(x: number, z: number, range: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const minCx = Math.floor((x - range) / CHUNK_SIZE);
    const maxCx = Math.floor((x + range) / CHUNK_SIZE);
    const minCz = Math.floor((z - range) / CHUNK_SIZE);
    const maxCz = Math.floor((z + range) / CHUNK_SIZE);
    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const chunk = this.chunks.get(chunkKey(cx, cz));
        if (!chunk) continue;
        for (const c of chunk.colliders) {
          if (Math.abs(c.x - x) <= range + c.radius && Math.abs(c.z - z) <= range + c.radius) out.push(c);
        }
      }
    }
    return out;
  }

  /** Make a prop wobble, leaning first toward (dirX, dirZ). */
  bump(collider: Collider, dirX: number, dirZ: number, impact: number): void {
    const prop = collider.prop;
    if (!prop) {
      collider.bump?.(dirX, dirZ, impact);
      return;
    }
    const chunk = this.chunks.get(chunkKey(Math.floor(prop.x / CHUNK_SIZE), Math.floor(prop.z / CHUNK_SIZE)));
    if (!chunk) return;
    const amp = propDefs()[prop.kind].wobble * THREE.MathUtils.clamp(impact / 14, 0.2, 1);
    const existing = this.wobbles.get(prop);
    if (existing && existing.amp * Math.exp(-existing.t * 3) > amp) return;
    this.wobbles.set(prop, { prop, chunk, dirX, dirZ, amp, t: 0 });
  }

  clear(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.structures.clear();
    this.chunks.clear();
    this.wobbles.clear();
    this.pending.length = 0;
    this.centerX = this.centerZ = Number.NaN;
  }

  private updateWobbles(dt: number): void {
    for (const w of this.wobbles.values()) {
      if (this.chunks.get(chunkKey(w.chunk.cx, w.chunk.cz)) !== w.chunk) {
        this.wobbles.delete(w.prop);
        continue;
      }
      w.t += dt;
      const decay = Math.exp(-w.t * 3);
      if (decay < 0.01) {
        writePropMatrix(w.prop);
        this.wobbles.delete(w.prop);
      } else {
        // Springy damped oscillation that starts leaning away from the car.
        writePropMatrix(w.prop, w.dirX, w.dirZ, w.amp * decay * Math.cos(w.t * 16));
      }
    }
  }

  private buildChunk(cx: number, cz: number): Chunk {
    const group = new THREE.Group();
    const { mesh: ground, gridHeight } = this.buildGround(cx, cz);
    group.add(ground);
    // The water surface uses the same vertex grid, so reuse the ground heights.
    const step = CHUNK_SIZE / SEGMENTS;
    const water = buildWater(cx, cz, CHUNK_SIZE, SEGMENTS, (x, z) =>
      gridHeight(Math.round((x - cx * CHUNK_SIZE) / step), Math.round((z - cz * CHUNK_SIZE) / step)),
    );
    if (water) group.add(water);

    const colliders: Collider[] = [];
    const pads: Prop[] = [];
    const props = this.buildProps(this.scatter(cx, cz), group, colliders, pads);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const paths = this.roads.pathsIn(x0, z0, x0 + CHUNK_SIZE, z0 + CHUNK_SIZE, _roadPaths);
    const roads = buildRoadMeshes(paths, x0, z0, CHUNK_SIZE, (x, z) => this.heightAt(x, z));
    for (const mesh of roads) group.add(mesh);
    // Structures live in their own group (they animate, so they're not baked with the chunk).
    this.structures.buildChunk(chunkKey(cx, cz), x0, z0, CHUNK_SIZE, colliders);
    // Chunks never move: bake their transforms once instead of recomputing them every frame.
    // (Prop wobbles write to the instance buffers, not these object transforms.)
    group.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    return { cx, cz, group, ground, water, props, roads, colliders, pads };
  }

  private buildGround(cx: number, cz: number): { mesh: THREE.Mesh; gridHeight: (i: number, j: number) => number } {
    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, SEGMENTS, SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const originX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const originZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;

    // Sample heights on the vertex grid plus a one-cell border, so normals at
    // chunk edges see their neighbours and lighting has no seams.
    const step = CHUNK_SIZE / SEGMENTS;
    const side = SEGMENTS + 3;
    const heights = new Float32Array(side * side);
    const x0 = cx * CHUNK_SIZE - step;
    const z0 = cz * CHUNK_SIZE - step;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) heights[j * side + i] = this.heightAt(x0 + i * step, z0 + j * step);
    }
    const h = (i: number, j: number) => heights[(j + 1) * side + (i + 1)];

    const tmp = new THREE.Color();
    const other = new THREE.Color();
    const white = new THREE.Color('#ffffff');

    const pos = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const n3 = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      // PlaneGeometry vertices run row by row from -x/-z; recover grid coords.
      const gi = Math.round((pos.getX(i) + CHUNK_SIZE / 2) / step);
      const gj = Math.round((pos.getZ(i) + CHUNK_SIZE / 2) / step);
      pos.setY(i, h(gi, gj));
      n3.set(h(gi - 1, gj) - h(gi + 1, gj), 2 * step, h(gi, gj - 1) - h(gi, gj + 1)).normalize();
      normal.setXYZ(i, n3.x, n3.y, n3.z);

      const wx = pos.getX(i) + originX;
      const wz = pos.getZ(i) + originZ;
      const n = this.terrainAt(wx, wz);
      // Ground colour from each nearby biome's palette, blended across borders.
      const b = this.biomes.sample(wx, wz);
      const ta = b.t;
      const idB = b.b;
      groundColor(this.paletteOf(b.a), n, tmp);
      if (ta < 1) tmp.lerp(groundColor(this.paletteOf(idB), n, other), 1 - ta);
      // Sun-kissed hilltops: lighten with height so the hills read from above.
      tmp.lerp(white, 0.3 * Math.max(0, h(gi, gj) / HILL_HEIGHT));
      // Sandy shores and pond beds.
      tmp.lerp(b.a === 'snow' ? ICE_SHORE : SAND, 1 - smoothstep(WATER_LEVEL, WATER_LEVEL + 0.35, h(gi, gj)));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, this.groundMaterial);
    mesh.position.set(originX, 0, originZ);
    mesh.receiveShadow = true;
    return { mesh, gridHeight: h };
  }

  private paletteOf(id: BiomeId): ParsedPalette {
    const def = biome(id);
    let parsed = this.parsedPalettes.get(id);
    if (!parsed) {
      parsed = parsePalette(def.palette ?? this.palette);
      this.parsedPalettes.set(id, parsed);
    }
    return parsed;
  }

  private terrainAt(x: number, z: number): number {
    return this.terrainNoise.fbm(x / 60, z / 60);
  }

  /**
   * Decide which props go in a chunk. Every grid cell draws the same number of
   * random values whether or not it spawns anything, keeping placement stable.
   */
  private scatter(cx: number, cz: number): PropSpawn[] {
    const rand = mulberry32(hash2(this.seed ^ 0x5eed, cx, cz));
    const cells = CHUNK_SIZE / SCATTER_CELL;
    const margin = 0.6;
    const spawns: PropSpawn[] = [];

    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const rx = rand();
        const rz = rand();
        const rSpawn = rand();
        const rVariant = rand();
        const rScale = rand();
        const rRot = rand();
        const rTint = rand();
        const rBiome = rand();

        const x = cx * CHUNK_SIZE + i * SCATTER_CELL + margin + rx * (SCATTER_CELL - 2 * margin);
        const z = cz * CHUNK_SIZE + j * SCATTER_CELL + margin + rz * (SCATTER_CELL - 2 * margin);
        if (x * x + z * z < SPAWN_CLEAR_RADIUS * SPAWN_CLEAR_RADIUS) continue;
        // Roads and structures are kept clear: nothing grows on them or right beside them.
        if (this.roads.clearance(x, z) < ROAD_PROP_CLEAR) continue;
        if (this.structures.blocks(x, z)) continue;
        const ground = this.heightAt(x, z);
        // Which biome's planting rules apply here (mixed along borders).
        const b = this.biomes.sample(x, z);
        const here: BiomeId = rBiome < b.t ? b.a : b.b;
        // Keep trees off the beach; stones may sit half in the water (wetlands plant in it).
        if (here !== 'wetlands' && here !== 'coast' && ground < WATER_LEVEL - 0.1) continue;

        const forest = this.forestNoise.fbm(x / 45, z / 45);
        const rocky = this.terrainAt(x, z);
        const dry = ground > WATER_LEVEL + 0.35;

        let kind: PropKind;
        let scale: number;
        const depth = WATER_LEVEL - ground;
        if (here === 'snow') {
          // Snowy forests of frosted pines, with ice crystals and the odd snowman.
          const treeChance = 0.05 + smoothstep(0.48, 0.72, forest) * 0.45;
          if (rSpawn < treeChance && dry) {
            kind = 'snowPine';
            scale = 0.85 + rScale * 0.55;
          } else if (rSpawn < treeChance + 0.025) {
            kind = 'iceCrystal';
            scale = 0.7 + rScale * 0.9;
          } else if (rSpawn > 0.994 && dry) {
            kind = 'snowman';
            scale = 0.9 + rScale * 0.3;
          } else if (rSpawn > 0.97 && rSpawn <= 0.994) {
            kind = 'stone';
            scale = 0.6 + rScale * 0.8;
          } else {
            continue;
          }
        } else if (here === 'mushroom') {
          // A mossy hollow: giant mushrooms among dark trees, little clusters everywhere.
          const giantChance = 0.05 + smoothstep(0.45, 0.7, forest) * 0.12;
          if (rSpawn < giantChance && dry) {
            kind = 'giantMushroom';
            scale = 0.8 + rScale * 0.9;
          } else if (rSpawn < giantChance + 0.05 && dry) {
            kind = rVariant < 0.5 ? 'roundTree' : 'pineTree';
            scale = 0.9 + rScale * 0.4;
          } else if (rSpawn < giantChance + 0.3 && dry) {
            kind = 'mushrooms';
            scale = 1 + rScale * 1.2;
          } else if (rSpawn > 0.985) {
            kind = 'stone';
            scale = 0.6 + rScale * 0.8;
          } else {
            continue;
          }
        } else if (here === 'dunes') {
          // Wind-swept sand: cacti, sandstone, grass tufts, palms around the rare oases.
          const oasis = depth > -1.2 && dry;
          if (oasis && rSpawn < 0.25) {
            kind = 'palmTree';
            scale = 0.85 + rScale * 0.4;
          } else if (rSpawn < 0.07 + smoothstep(0.5, 0.75, forest) * 0.1 && dry) {
            kind = 'cactus';
            scale = 0.9 + rScale * 0.8;
          } else if (rSpawn < 0.24 && rSpawn >= 0.18) {
            kind = 'sandstone';
            scale = 0.8 + rScale * 1.3;
          } else if (rSpawn > 0.72 && dry) {
            kind = 'duneGrass';
            scale = 0.8 + rScale * 0.6;
          } else {
            continue;
          }
        } else if (here === 'coast') {
          // Beaches around big lagoons: shells by the water, palms and grass further up.
          if (depth > 0.2) {
            if (rSpawn >= 0.015) continue;
            kind = 'stone';
            scale = 0.8 + rScale * 0.8;
          } else if (depth > -1.4) {
            if (rSpawn < 0.2) {
              kind = 'shells';
              scale = 1.8 + rScale * 1.4;
            } else if (rSpawn < 0.2 && dry) {
              kind = 'palmTree';
              scale = 0.9 + rScale * 0.4;
            } else continue;
          } else if (rSpawn < 0.07) {
            kind = 'palmTree';
            scale = 0.85 + rScale * 0.45;
          } else if (rSpawn < 0.17) {
            kind = 'duneGrass';
            scale = 0.8 + rScale * 0.6;
          } else if (rSpawn < 0.19) {
            kind = 'flowers';
            scale = 0.7 + rScale * 0.4;
          } else {
            continue;
          }
        } else if (here === 'wetlands') {
          if (depth > 0.3) {
            // Open water: lily pads gather in drifting rafts, some in flower.
            const lilies = 0.04 + smoothstep(0.42, 0.68, forest) * 0.4;
            if (rSpawn >= lilies) continue;
            kind = rVariant < 0.3 ? 'waterLily' : 'lilyPad';
            scale = 0.8 + rScale * 0.6;
          } else if (depth > -0.8) {
            // The shoreline: thick reed beds.
            if (rSpawn >= 0.7) continue;
            kind = 'reeds';
            scale = 1.2 + rScale * 0.6;
          } else if (rSpawn < 0.04) {
            kind = 'roundTree';
            scale = 0.8 + rScale * 0.4;
          } else if (rSpawn < 0.06) {
            kind = 'stone';
            scale = 0.6 + rScale * 0.7;
          } else if (rSpawn < 0.14) {
            kind = 'flowers';
            scale = 0.7 + rScale * 0.5;
          } else {
            continue;
          }
        } else if (here === 'blossom') {
          // Airy woods of blossom trees with sunny glades full of flowers.
          const treeChance = 0.08 + smoothstep(0.45, 0.7, forest) * 0.4;
          const stoneChance = 0.012;
          const flowerChance = 0.3;
          if (rSpawn < treeChance && dry) {
            kind = rVariant < 0.75 ? 'blossomTree' : 'roundTree';
            scale = 0.85 + rScale * 0.45;
          } else if (rSpawn < treeChance + stoneChance) {
            kind = 'stone';
            scale = 0.6 + rScale * 0.8;
          } else if (rSpawn < treeChance + stoneChance + flowerChance && dry) {
            kind = 'flowers';
            scale = 0.8 + rScale * 0.6;
          } else {
            continue;
          }
        } else {
          const treeChance = 0.03 + smoothstep(0.5, 0.72, forest) * 0.6;
          const stoneChance = 0.02 + smoothstep(0.58, 0.75, rocky) * 0.1;
          if (rSpawn < treeChance && dry) {
            // Denser forests lean toward pines.
            kind = rVariant < 0.3 + (forest - 0.5) * 0.8 ? 'pineTree' : 'roundTree';
            scale = 0.8 + rScale * 0.5;
          } else if (rSpawn < treeChance + stoneChance) {
            kind = 'stone';
            scale = 0.7 + rScale * rScale * 1.3;
          } else if (rSpawn < treeChance + stoneChance + 0.035 && dry) {
            kind = 'flowers';
            scale = 0.7 + rScale * 0.5;
          } else {
            continue;
          }
        }

        spawns.push({ kind, x, z, rotY: rRot * Math.PI * 2, scale, tint: rTint });
      }
    }
    return spawns;
  }

  /** Build one InstancedMesh per (kind, part) and a collider per prop. */
  private buildProps(spawns: PropSpawn[], group: THREE.Group, colliders: Collider[], pads: Prop[]): THREE.InstancedMesh[] {
    const defs = propDefs();
    const meshes: THREE.InstancedMesh[] = [];
    const color = new THREE.Color();

    for (const kind of Object.keys(defs) as PropKind[]) {
      const ofKind = spawns.filter((s) => s.kind === kind);
      if (ofKind.length === 0) continue;
      const def = defs[kind];

      const partMeshes = def.parts.map((part) => {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, ofKind.length);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        meshes.push(mesh);
        return mesh;
      });

      ofKind.forEach((s, index) => {
        const prop: Prop = {
          kind,
          x: s.x,
          // Sink the base a little so it stays buried on slopes (stones more, they're wide).
          y: floats(kind) ? WATER_LEVEL + 0.015 : this.heightAt(s.x, s.z) - (kind === 'stone' ? 0.15 * s.scale : 0.1),
          z: s.z,
          rotY: s.rotY,
          scale: s.scale,
          slots: partMeshes.map((mesh) => ({ mesh, index })),
        };
        writePropMatrix(prop);
        def.parts.forEach((part, p) => {
          if (!part.palette) return;
          color.set(part.palette[Math.floor(s.tint * part.palette.length)]);
          partMeshes[p].setColorAt(index, color);
        });
        // Flowers etc. are pure decoration: nothing to bump into.
        if (def.radius > 0) colliders.push({ x: s.x, z: s.z, radius: def.radius * s.scale, prop });
        if (floats(kind)) pads.push(prop);
      });

      for (const mesh of partMeshes) {
        // Pad the bounds so wobbling props aren't culled early.
        mesh.computeBoundingSphere();
        mesh.boundingSphere!.radius += 1;
      }
    }
    return meshes;
  }

  private disposeChunk(chunk: Chunk): void {
    this.group.remove(chunk.group);
    chunk.ground.geometry.dispose();
    chunk.water?.geometry.dispose();
    // Prop geometries/materials are shared; only the per-chunk instance buffers go.
    for (const mesh of chunk.props) mesh.dispose();
    for (const mesh of chunk.roads) mesh.geometry.dispose();
    this.structures.disposeChunk(chunkKey(chunk.cx, chunk.cz));
  }
}

const _roadPaths: RoadPath[] = [];

interface ParsedPalette {
  low: THREE.Color;
  mid: THREE.Color;
  high: THREE.Color;
}

function parsePalette(p: GroundPalette): ParsedPalette {
  return { low: new THREE.Color(p.low), mid: new THREE.Color(p.mid), high: new THREE.Color(p.high) };
}

/** Ground colour for terrain-noise value `n` within a palette. */
function groundColor(p: ParsedPalette, n: number, out: THREE.Color): THREE.Color {
  if (n < 0.5) return out.lerpColors(p.low, p.mid, smoothstep(0.3, 0.5, n));
  return out.lerpColors(p.mid, p.high, smoothstep(0.55, 0.72, n));
}

/** Props that float on the water surface rather than sitting on the ground. */
function floats(kind: PropKind): boolean {
  return kind === 'lilyPad' || kind === 'waterLily';
}

/** Numeric map key for a chunk (no string building on hot paths). ±32k chunks ≈ ±1M units. */
function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Soft two-tone checkerboard, multiplied with the per-vertex ground colors. */
function createCheckerTexture(repeat: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f4f5f3';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}
