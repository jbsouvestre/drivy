import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider } from '../props';
import type { Site } from './layout';

// ---------------------------------------------------------------- shapes

const _color = new THREE.Color();

/**
 * Builds one merged, vertex-coloured geometry out of simple primitives. Each
 * `y` argument is the primitive's base (so shapes stack like toy blocks).
 */
export class Shape {
  private readonly parts: THREE.BufferGeometry[] = [];

  /** Add any geometry (already positioned) in a solid colour. */
  add(geometry: THREE.BufferGeometry, color: string): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    _color.set(color);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ry = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z), color);
  }

  cyl(rTop: number, rBottom: number, h: number, color: string, x = 0, y = 0, z = 0, segments = 12): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, segments).translate(x, y + h / 2, z), color);
  }

  cone(r: number, h: number, color: string, x = 0, y = 0, z = 0, segments = 12): this {
    return this.add(new THREE.ConeGeometry(r, h, segments).translate(x, y + h / 2, z), color);
  }

  /** A square pyramid (w × d base), e.g. a hipped roof. */
  pyramid(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): this {
    const cone = new THREE.ConeGeometry(1, h, 4).rotateY(Math.PI / 4).scale(w / Math.SQRT2, 1, d / Math.SQRT2);
    return this.add(cone.translate(x, y + h / 2, z), color);
  }

  ball(r: number, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1): this {
    return this.add(new THREE.SphereGeometry(1, 14, 10).scale(r * sx, r * sy, r * sz).translate(x, y, z), color);
  }

  /** Upper half of a sphere (a dome), base at y. */
  dome(r: number, color: string, x = 0, y = 0, z = 0, sy = 1): this {
    const g = new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1);
    return this.add(g.translate(x, y, z), color);
  }

  /** A gable roof: triangular prism, ridge along x (width w), eaves d apart, height h. */
  gable(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, ry = 0): this {
    const hw = w / 2;
    const hd = d / 2;
    // prettier-ignore
    const v = [
      // Sloping sides.
      -hw, 0, hd,  hw, 0, hd,  hw, h, 0,   -hw, 0, hd,  hw, h, 0,  -hw, h, 0,
      hw, 0, -hd,  -hw, 0, -hd,  -hw, h, 0,   hw, 0, -hd,  -hw, h, 0,  hw, h, 0,
      // Gable ends.
      hw, 0, hd,  hw, 0, -hd,  hw, h, 0,
      -hw, 0, -hd,  -hw, 0, hd,  -hw, h, 0,
      // Underside.
      -hw, 0, hd,  -hw, 0, -hd,  hw, 0, -hd,   -hw, 0, hd,  hw, 0, -hd,  hw, 0, hd,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.add(g.rotateY(ry).translate(x, y, z), color);
  }

  /** Merge everything added so far. */
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    return merged;
  }
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** A geometry built once and shared by every structure that asks for the same key. */
export function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometryCache.get(key);
  if (!g) {
    g = make();
    geometryCache.set(key, g);
  }
  return g;
}

// ---------------------------------------------------------------- materials

/** Everything solid: colour comes from the vertices. */
const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });

/** Windows and lanterns: lit by an emissive glow tinted by the vertex colour. */
const patchGlow: THREE.Material['onBeforeCompile'] = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif',
  );
};
function glowMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0 });
  m.onBeforeCompile = patchGlow;
  return m;
}
/** Campfire embers: always glowing, flickering (shared, driven by Structures). */
export const FIRE = glowMaterial();
/** Chimney smoke puffs: opaque, they fade by shrinking. */
const SMOKE = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
const PUFF = new THREE.IcosahedronGeometry(1, 1);
/** Fairy sparkles. */
export const SPARKLE = new THREE.MeshBasicMaterial({ color: '#fff4a8' });
/** Lighthouse beam: soft additive light, cloned per lighthouse for its own opacity. */
export const BEAM = new THREE.MeshBasicMaterial({
  color: '#fff3c4',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});

/** For shader warm-up: one of every material structures use. */
export function structureMaterials(): THREE.Material[] {
  return [BODY, glowMaterial(), FIRE, SMOKE, SPARKLE, BEAM];
}

// ---------------------------------------------------------------- instances

/** What structures can see of the world each frame. */
export interface StructureContext {
  time: number;
  car: THREE.Vector3;
  carSpeed: number;
  /** 0 day → 1 night. */
  darkness: number;
  /** 0 clear → 1 shower. */
  rain: number;
}

export type StructureSound = 'foghorn' | 'echo' | 'bells' | 'twinkle' | 'poof';
export type SoundSink = (sound: StructureSound, volume: number) => void;

/** How bright windows get when lit. */
const GLOW_STRENGTH = 1.3;
const SMOKE_LIFE = 3.2;
const PUFFS = 6;

/**
 * One placed structure: its meshes (under `root`), colliders, and the little
 * behaviours that animate it and make it react to the car.
 */
export class Structure {
  readonly root = new THREE.Group();
  readonly colliders: Collider[] = [];
  /** How much it lights up after dark by itself (0 = only when something happens). */
  nightLight = 1;
  /** Extra light, e.g. someone inside switching the lamps on: seconds left. */
  lightTime = 0;
  /** Set by behaviours that manage their own glow level (0–1) this frame. */
  glowLevel: number | null = null;

  private glowMat: THREE.MeshStandardMaterial | null = null;
  private readonly owned: THREE.Material[] = [];
  private readonly updaters: ((ctx: StructureContext, dt: number) => void)[] = [];
  private readonly honkers: ((distance: number) => void)[] = [];
  private readonly baseQuat = new THREE.Quaternion();
  private wobbleAmount = 0;
  private wobble = { amp: 0, t: 0, x: 0, z: 0 };

  constructor(
    readonly site: Site,
    readonly rng: () => number,
    readonly sound: SoundSink,
  ) {
    this.root.position.set(site.x, site.y, site.z);
    this.root.rotation.y = site.rotY;
    this.baseQuat.copy(this.root.quaternion);
  }

  /** A solid part (shared geometry). */
  body(geometry: THREE.BufferGeometry, parent: THREE.Object3D = this.root): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, BODY);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** A glowing part (windows, lanterns): dark by day, lit at night or when something happens. */
  glow(geometry: THREE.BufferGeometry, parent: THREE.Object3D = this.root): THREE.Mesh {
    if (!this.glowMat) {
      this.glowMat = glowMaterial();
      this.owned.push(this.glowMat);
    }
    const mesh = new THREE.Mesh(geometry, this.glowMat);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  /** Always-flickering fire. */
  fire(geometry: THREE.BufferGeometry, parent: THREE.Object3D = this.root): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, FIRE);
    parent.add(mesh);
    return mesh;
  }

  /** A per-structure copy of a material (e.g. a beam with its own opacity), disposed with it. */
  own<T extends THREE.Material>(material: T): T {
    const m = material.clone() as T;
    this.owned.push(m);
    return m;
  }

  /** An empty group to hang animated parts on, at a local position. */
  pivot(x: number, y: number, z: number, parent: THREE.Object3D = this.root): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  /** A solid circle (local coordinates) the car bumps into and animals walk around. */
  collide(x: number, z: number, radius: number): void {
    const { site } = this;
    const c = Math.cos(site.rotY);
    const s = Math.sin(site.rotY);
    this.colliders.push({
      x: site.x + x * c + z * s,
      z: site.z - x * s + z * c,
      radius,
      bump: (dirX, dirZ, impact) => this.bump(dirX, dirZ, impact),
    });
  }

  /** Small things (bales, sleds, signposts) tilt and spring back when bumped. */
  wobbly(amount: number): void {
    this.wobbleAmount = amount;
  }

  /** Chimney smoke: puffs rise and drift from (x, y, z); a honk sends up a burst. */
  smoke(x: number, y: number, z: number): void {
    const puffs: { mesh: THREE.Mesh; phase: number }[] = [];
    for (let i = 0; i < PUFFS; i++) {
      const mesh = new THREE.Mesh(PUFF, SMOKE);
      this.root.add(mesh);
      puffs.push({ mesh, phase: i / PUFFS });
    }
    let burst = 0;
    this.onHonk(() => (burst = 2.5));
    this.onUpdate((ctx, dt) => {
      burst = Math.max(0, burst - dt);
      const rate = (1 + burst * 1.5) / SMOKE_LIFE;
      for (const p of puffs) {
        p.phase = (p.phase + dt * rate) % 1;
        const t = p.phase;
        p.mesh.position.set(x + t * 0.9 + Math.sin(t * 6 + ctx.time) * 0.1, y + t * 2.8, z);
        p.mesh.scale.setScalar(Math.sin(Math.PI * t) * (0.25 + t * 0.45));
      }
    });
  }

  /** Lights on inside for a while (someone's home and heard the honk). */
  lightUp(seconds: number): void {
    this.lightTime = Math.max(this.lightTime, seconds);
  }

  onUpdate(fn: (ctx: StructureContext, dt: number) => void): void {
    this.updaters.push(fn);
  }

  onHonk(fn: (distance: number) => void): void {
    this.honkers.push(fn);
  }

  update(ctx: StructureContext, dt: number): void {
    this.glowLevel = null;
    for (const fn of this.updaters) fn(ctx, dt);
    this.lightTime = Math.max(0, this.lightTime - dt);
    if (this.glowMat) {
      const level = this.glowLevel ?? Math.max(this.nightLight * ctx.darkness, Math.min(1, this.lightTime));
      this.glowMat.emissiveIntensity = GLOW_STRENGTH * level;
    }
    this.updateWobble(dt);
  }

  honk(distance: number): void {
    for (const fn of this.honkers) fn(distance);
  }

  bump(dirX: number, dirZ: number, impact: number): void {
    if (this.wobbleAmount <= 0) return;
    const amp = this.wobbleAmount * THREE.MathUtils.clamp(impact / 14, 0.2, 1);
    if (this.wobble.amp * Math.exp(-this.wobble.t * 3) > amp) return;
    this.wobble = { amp, t: 0, x: dirX, z: dirZ };
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
  }

  private updateWobble(dt: number): void {
    const w = this.wobble;
    if (w.amp <= 0) return;
    w.t += dt;
    const decay = Math.exp(-w.t * 3);
    if (decay < 0.01) {
      w.amp = 0;
      this.root.quaternion.copy(this.baseQuat);
      return;
    }
    // Lean away from the car, then spring back and forth (like bumped props).
    _axis.set(w.z, 0, -w.x).normalize();
    _tilt.setFromAxisAngle(_axis, w.amp * decay * Math.cos(w.t * 16));
    this.root.quaternion.copy(this.baseQuat).premultiply(_tilt);
  }
}

const _axis = new THREE.Vector3();
const _tilt = new THREE.Quaternion();

/** 0 far → 1 close: how near the car is, between `near` and `far` distances. */
export function closeness(ctx: StructureContext, x: number, z: number, near: number, far: number): number {
  const d = Math.hypot(ctx.car.x - x, ctx.car.z - z);
  return 1 - THREE.MathUtils.smoothstep(d, near, far);
}
