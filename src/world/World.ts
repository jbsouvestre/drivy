import * as THREE from 'three';
import { hash2, mulberry32 } from '../rng';
import { ValueNoise2D } from './noise';
import { propDefs, writePropMatrix, type Collider, type Prop, type PropKind } from './props';
import { buildWater, WATER_LEVEL } from './Water';

export const CHUNK_SIZE = 32;
/** Chunks kept loaded around the player, in each direction. */
const VIEW_RADIUS = 3;
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
/** Sandy beach ring colour around ponds. */
const SAND = new THREE.Color('#f5e6c8');
/** Size of one checker tile in world units. */
const TILE_SIZE = 4;
/** Props are scattered on a jittered grid of this cell size. */
const SCATTER_CELL = 4;
/** Keep the spawn point free of props. */
const SPAWN_CLEAR_RADIUS = 10;

interface GroundPalette {
  low: string;
  mid: string;
  high: string;
}

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
  colliders: Collider[];
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
  private palette = PALETTES[0];
  private readonly chunks = new Map<string, Chunk>();
  private readonly wobbles = new Map<Prop, Wobble>();
  private readonly groundMaterial: THREE.MeshStandardMaterial;

  constructor() {
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
    const rand = mulberry32(hash2(seed, 0x9e37, 0x79b9));
    this.palette = PALETTES[Math.floor(rand() * PALETTES.length)];
  }

  /** Load chunks near `focus`, drop far-away ones, and animate bumped props. */
  update(focus: THREE.Vector3, dt: number): void {
    const ccx = Math.floor(focus.x / CHUNK_SIZE);
    const ccz = Math.floor(focus.z / CHUNK_SIZE);

    for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = chunkKey(cx, cz);
        if (!this.chunks.has(key)) {
          const chunk = this.buildChunk(cx, cz);
          this.chunks.set(key, chunk);
          this.group.add(chunk.group);
        }
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - ccx) > UNLOAD_RADIUS || Math.abs(chunk.cz - ccz) > UNLOAD_RADIUS) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }

    this.updateWobbles(dt);
  }

  /** Height of pond surfaces; ground below this is under water. */
  readonly waterLevel = WATER_LEVEL;

  /**
   * Ground height at any point: soft rolling hills rising out of flat meadows,
   * with pond basins dug into the flats, plus a subtle bumpiness. Pure function
   * of (seed, x, z), so it's seamless across chunks and identical on every visit.
   */
  heightAt(x: number, z: number): number {
    const hilliness = smoothstep(0.42, 0.72, this.hillNoise.fbm(x / 50, z / 50, 3));
    const bumps = (this.hillNoise.sample(x / 11 + 71.3, z / 11 - 13.7) - 0.5) * BUMP_HEIGHT;
    // Pond basins: only on the flat meadows between hills, and never at spawn.
    const pond =
      smoothstep(0.6, 0.72, this.pondNoise.fbm(x / 40, z / 40, 2)) *
      (1 - smoothstep(0, 0.25, hilliness)) *
      smoothstep(POND_CLEAR_RADIUS, POND_CLEAR_RADIUS + 10, Math.hypot(x, z));
    return hilliness * HILL_HEIGHT + bumps - pond * POND_DEPTH;
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
    const chunk = this.chunks.get(chunkKey(Math.floor(prop.x / CHUNK_SIZE), Math.floor(prop.z / CHUNK_SIZE)));
    if (!chunk) return;
    const amp = propDefs()[prop.kind].wobble * THREE.MathUtils.clamp(impact / 14, 0.2, 1);
    const existing = this.wobbles.get(prop);
    if (existing && existing.amp * Math.exp(-existing.t * 3) > amp) return;
    this.wobbles.set(prop, { prop, chunk, dirX, dirZ, amp, t: 0 });
  }

  clear(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
    this.wobbles.clear();
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
    const ground = this.buildGround(cx, cz);
    group.add(ground);
    const water = buildWater(cx, cz, CHUNK_SIZE, SEGMENTS, (x, z) => this.heightAt(x, z));
    if (water) group.add(water);

    const colliders: Collider[] = [];
    const props = this.buildProps(this.scatter(cx, cz), group, colliders);
    return { cx, cz, group, ground, water, props, colliders };
  }

  private buildGround(cx: number, cz: number): THREE.Mesh {
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

    const low = new THREE.Color(this.palette.low);
    const mid = new THREE.Color(this.palette.mid);
    const high = new THREE.Color(this.palette.high);
    const tmp = new THREE.Color();
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

      const n = this.terrainAt(pos.getX(i) + originX, pos.getZ(i) + originZ);
      if (n < 0.5) tmp.lerpColors(low, mid, smoothstep(0.3, 0.5, n));
      else tmp.lerpColors(mid, high, smoothstep(0.55, 0.72, n));
      // Sun-kissed hilltops: lighten with height so the hills read from above.
      tmp.lerp(white, 0.3 * Math.max(0, h(gi, gj) / HILL_HEIGHT));
      // Sandy shores and pond beds.
      tmp.lerp(SAND, 1 - smoothstep(WATER_LEVEL, WATER_LEVEL + 0.35, h(gi, gj)));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, this.groundMaterial);
    mesh.position.set(originX, 0, originZ);
    mesh.receiveShadow = true;
    return mesh;
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

        const x = cx * CHUNK_SIZE + i * SCATTER_CELL + margin + rx * (SCATTER_CELL - 2 * margin);
        const z = cz * CHUNK_SIZE + j * SCATTER_CELL + margin + rz * (SCATTER_CELL - 2 * margin);
        if (x * x + z * z < SPAWN_CLEAR_RADIUS * SPAWN_CLEAR_RADIUS) continue;
        // Keep trees off the beach; stones may sit half in the water.
        const ground = this.heightAt(x, z);
        if (ground < WATER_LEVEL - 0.1) continue;

        const forest = this.forestNoise.fbm(x / 45, z / 45);
        const rocky = this.terrainAt(x, z);
        const treeChance = 0.03 + smoothstep(0.5, 0.72, forest) * 0.6;
        const stoneChance = 0.02 + smoothstep(0.58, 0.75, rocky) * 0.1;

        let kind: PropKind;
        let scale: number;
        if (rSpawn < treeChance && ground > WATER_LEVEL + 0.35) {
          // Denser forests lean toward pines.
          kind = rVariant < 0.3 + (forest - 0.5) * 0.8 ? 'pineTree' : 'roundTree';
          scale = 0.8 + rScale * 0.5;
        } else if (rSpawn < treeChance + stoneChance) {
          kind = 'stone';
          scale = 0.7 + rScale * rScale * 1.3;
        } else {
          continue;
        }

        spawns.push({ kind, x, z, rotY: rRot * Math.PI * 2, scale, tint: rTint });
      }
    }
    return spawns;
  }

  /** Build one InstancedMesh per (kind, part) and a collider per prop. */
  private buildProps(spawns: PropSpawn[], group: THREE.Group, colliders: Collider[]): THREE.InstancedMesh[] {
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
          y: this.heightAt(s.x, s.z) - (kind === 'stone' ? 0.15 * s.scale : 0.1),
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
        colliders.push({ x: s.x, z: s.z, radius: def.radius * s.scale, prop });
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
  }
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
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
