import * as THREE from 'three';
import type { SpeciesId } from '../safari/species';
import type { CarPresence } from './awareness';

/**
 * Cartoon car bonks. Driving into an animal never hurts it: it either gets
 * squashed flat like a pancake (and pops back up a few seconds later, none the
 * worse), or is launched off into the distance, sometimes right at the camera.
 * Either way it goes dizzy: spiral or X eyes, and a little swirl over its head.
 */

export type BonkStyle = 'squash' | 'launch';

/** Slower than this (units/s, ≈ 20 km/h) the car just nudges past animals. */
const BONK_SPEED = 4.5;
/** The car's reach, as a circle around its centre. */
const CAR_RADIUS = 1.5;
/** Seconds spent flat before popping back up. */
const SQUASH_TIME = 3.2;
/** The splat at the start and the pop back up at the end. */
const SPLAT_TIME = 0.14;
const POP_TIME = 0.5;
/** How flat a squashed animal gets, and how wide. */
const FLAT_Y = 0.13;
const FLAT_XZ = 1.45;
/** A launched animal is gone after this long (well off screen by then). */
const LAUNCH_TIME = 2.2;
const GRAVITY = 22;
/** Chance a launch heads straight for the camera, for drama. */
const AT_CAMERA_CHANCE = 0.3;
/** Seconds for a camera-bound animal to reach the lens. */
const AT_CAMERA_TIME = 0.7;
/** After popping back up, an animal can't be squashed again for a moment. */
export const BONK_IMMUNITY = 2;

/** Is the car going fast enough, and close enough, to bonk an animal at (x, z)? */
export function carHits(x: number, z: number, radius: number, car: CarPresence): boolean {
  return car.speed >= BONK_SPEED && Math.hypot(x - car.position.x, z - car.position.z) < CAR_RADIUS + radius;
}

/** Heads up for sound and stats: something just got bonked. */
export type BonkListener = (style: BonkStyle, species: SpeciesId, at: THREE.Vector3) => void;
const listeners = new Set<BonkListener>();
export function onBonk(listener: BonkListener): void {
  listeners.add(listener);
}

/**
 * One bonk in progress. The owning manager stops its usual AI for the animal
 * and calls update() every frame instead, until `done`.
 */
export class Bonk {
  time = 0;
  private readonly vel = new THREE.Vector3();
  private readonly spinAxis = new THREE.Vector3();
  private spinRate = 0;
  /** A launch aimed at the camera ends as soon as it gets there. */
  private launchTime = LAUNCH_TIME;
  private readonly face: DizzyFace;

  constructor(
    readonly style: BonkStyle,
    species: SpeciesId,
    /** Where the animal was hit (for a launch: its position, updated as it flies). */
    pos: THREE.Vector3,
    car: CarPresence,
    eyes: THREE.Object3D[],
    /** Scene group for the dizzy effects (world space). */
    effects: THREE.Group,
    /** The animal's (scaled) height, to put the swirl over its head. */
    private readonly height: number,
  ) {
    this.face = new DizzyFace(eyes, effects, THREE.MathUtils.clamp(height * 0.6, 0.9, 1.6));
    if (style === 'launch') this.aim(pos, car);
    for (const listener of listeners) listener(style, species, pos);
  }

  get done(): boolean {
    return this.time >= (this.style === 'squash' ? SQUASH_TIME : this.launchTime);
  }

  /**
   * Animate the animal. `pos` is its position (a launch moves it); `ground` is
   * the height it rests at; `scale` its normal uniform scale.
   */
  update(dt: number, root: THREE.Object3D, pos: THREE.Vector3, ground: number, scale: number): void {
    this.time += dt;
    let squashY = 1;
    if (this.style === 'squash') {
      const t = this.time;
      let y = FLAT_Y;
      let xz = FLAT_XZ;
      let hop = 0;
      if (t < SPLAT_TIME) {
        // Splat: squish down fast, spreading out with a little overshoot.
        const k = easeOutBack(t / SPLAT_TIME);
        y = 1 + (FLAT_Y - 1) * Math.min(1, k);
        xz = 1 + (FLAT_XZ - 1) * k;
      } else if (t > SQUASH_TIME - POP_TIME) {
        // Pop back up: spring tall, wobble, settle.
        const k = (t - (SQUASH_TIME - POP_TIME)) / POP_TIME;
        const spring = 1 - Math.cos(k * Math.PI * 2.5) * Math.exp(-k * 4);
        y = FLAT_Y + (1 - FLAT_Y) * spring;
        xz = FLAT_XZ + (1 - FLAT_XZ) * spring;
        hop = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.35;
      } else {
        // Lying flat, with a dazed little breathing wobble.
        y = FLAT_Y * (1 + Math.sin(t * 6) * 0.08);
      }
      root.scale.set(scale * xz, scale * y, scale * xz);
      root.position.set(pos.x, ground + hop * scale, pos.z);
      squashY = y;
    } else {
      this.vel.y -= GRAVITY * dt;
      pos.addScaledVector(this.vel, dt);
      root.position.copy(pos);
      _q.setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      root.quaternion.premultiply(_q);
    }
    // Swirl over the head (over the pancake when squashed).
    root.updateMatrixWorld(true);
    this.face.update(dt, root.position, this.height * squashY + 0.8, squashY < 0.5);
  }

  /** Put the eyes back and clear the effects. */
  dispose(): void {
    this.face.dispose();
  }

  private aim(pos: THREE.Vector3, car: CarPresence): void {
    const spin = 10 + Math.random() * 8;
    this.spinAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.spinRate = spin;
    if (Math.random() < AT_CAMERA_CHANCE) {
      // Straight at the lens: reach the camera in AT_CAMERA_TIME, arcing under gravity.
      const T = AT_CAMERA_TIME;
      _v.copy(car.camera).add(_jitter.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6, 0)).sub(pos);
      this.vel.copy(_v).divideScalar(T);
      this.vel.y += 0.5 * GRAVITY * T;
      this.launchTime = T + 0.15;
      return;
    }
    // Otherwise, off ahead of the car and a little to one side, high and far.
    const dir = Math.atan2(car.velocity.x, car.velocity.z) + (Math.random() - 0.5) * 1.2;
    const speed = 13 + car.speed * 0.6 + Math.random() * 4;
    this.vel.set(Math.sin(dir) * speed, 10 + Math.random() * 4, Math.cos(dir) * speed);
  }
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _jitter = new THREE.Vector3();

function easeOutBack(t: number): number {
  const c = 1.7;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

// ---------------------------------------------------------------- dizzy face

/** How much bigger than the real eye a dizzy eye is drawn (cartoon-readable). */
const EYE_GROW = 3.2;
/** …but never smaller than this (world units), so they read from the driving camera. */
const MIN_EYE_SIZE = 0.34;
const SWIRL_SPIN = 5;

/**
 * Dizzy eyes (spirals or X's, as camera-facing sprites over the real eyes,
 * which are hidden meanwhile) and a spinning swirl with orbiting stars.
 */
class DizzyFace {
  private readonly sprites: THREE.Sprite[] = [];
  private readonly swirl: THREE.Group;
  private readonly sizes: number[];

  constructor(
    private readonly eyes: THREE.Object3D[],
    private readonly effects: THREE.Group,
    /** Swirl size: bigger over bigger animals. */
    swirlScale: number,
  ) {
    const assets = dizzyAssets();
    const material = Math.random() < 0.5 ? assets.spiralEye : assets.crossEye;
    this.sizes = eyes.map((eye) => localRadius(eye) * EYE_GROW);
    for (const eye of eyes) {
      eye.visible = false;
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 3;
      effects.add(sprite);
      this.sprites.push(sprite);
    }
    this.swirl = new THREE.Group();
    const spiral = new THREE.Mesh(assets.swirlGeometry, assets.swirlMaterial);
    this.swirl.add(spiral);
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(assets.starGeometry, assets.starMaterial);
      const a = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(a) * 0.36, 0.04 * Math.sin(a * 2), Math.sin(a) * 0.36);
      this.swirl.add(star);
    }
    this.swirl.scale.setScalar(swirlScale);
    effects.add(this.swirl);
  }

  update(dt: number, at: THREE.Vector3, headY: number, flat: boolean): void {
    this.eyes.forEach((eye, i) => {
      const sprite = this.sprites[i];
      eye.getWorldPosition(sprite.position);
      // World size follows the animal's overall scale (read off the eye's parent chain).
      eye.getWorldScale(_scale);
      const size = Math.max(MIN_EYE_SIZE, (this.sizes[i] * Math.max(_scale.x, _scale.z)) / Math.max(1e-6, eye.scale.x));
      sprite.scale.set(size, size, 1);
      // A pancake's eyes peek up on top of it rather than sinking into the ground.
      if (flat) sprite.position.y += size * 0.45;
    });
    this.swirl.position.set(at.x, at.y + headY, at.z);
    this.swirl.rotation.y += SWIRL_SPIN * dt;
    for (let i = 1; i < this.swirl.children.length; i++) this.swirl.children[i].rotation.y += 6 * dt;
  }

  dispose(): void {
    for (const eye of this.eyes) eye.visible = true;
    for (const sprite of this.sprites) this.effects.remove(sprite);
    this.effects.remove(this.swirl);
  }
}

const _scale = new THREE.Vector3();

/** Rough radius of an eye (a scaled sphere mesh, or a group of them) in its parent's space. */
function localRadius(obj: THREE.Object3D): number {
  if (obj instanceof THREE.Mesh) {
    obj.geometry.computeBoundingSphere();
    return obj.geometry.boundingSphere!.radius * Math.max(obj.scale.x, obj.scale.y, obj.scale.z);
  }
  let r = 0;
  for (const child of obj.children) r = Math.max(r, child.position.length() + localRadius(child));
  return r * Math.max(obj.scale.x, obj.scale.y, obj.scale.z);
}

interface DizzyAssets {
  spiralEye: THREE.SpriteMaterial;
  crossEye: THREE.SpriteMaterial;
  swirlGeometry: THREE.BufferGeometry;
  swirlMaterial: THREE.MeshBasicMaterial;
  starGeometry: THREE.BufferGeometry;
  starMaterial: THREE.MeshBasicMaterial;
}

let assets: DizzyAssets | null = null;

function dizzyAssets(): DizzyAssets {
  if (assets) return assets;
  // A flat spiral, two and a half turns, lying in the XZ plane.
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const a = t * Math.PI * 5;
    const r = 0.04 + t * 0.26;
    points.push(new THREE.Vector3(Math.cos(a) * r, t * 0.06, Math.sin(a) * r));
  }
  assets = {
    spiralEye: eyeMaterial(drawSpiralEye),
    crossEye: eyeMaterial(drawCrossEye),
    swirlGeometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, 0.035, 6, false),
    swirlMaterial: new THREE.MeshBasicMaterial({ color: '#9577f0' }),
    starGeometry: new THREE.OctahedronGeometry(0.1),
    starMaterial: new THREE.MeshBasicMaterial({ color: '#ffe27a' }),
  };
  return assets;
}

/** Shared by warm-up: the dizzy effects' materials, to compile their shaders ahead of time. */
export function dizzyMaterials(): THREE.Material[] {
  const a = dizzyAssets();
  return [a.spiralEye, a.crossEye, a.swirlMaterial, a.starMaterial];
}

function eyeMaterial(draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.SpriteMaterial {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
}

/** A white eyeball with a dark spiral. */
function drawSpiralEye(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#4a3f58';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, c - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = t * Math.PI * 5;
    const r = t * (c - 9);
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** A chunky dark X. */
function drawCrossEye(ctx: CanvasRenderingContext2D, size: number): void {
  const m = size * 0.2;
  ctx.strokeStyle = '#4a3f58';
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(m, m);
  ctx.lineTo(size - m, size - m);
  ctx.moveTo(size - m, m);
  ctx.lineTo(m, size - m);
  ctx.stroke();
}
