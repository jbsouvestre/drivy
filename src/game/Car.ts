import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Collider } from '../world/props';
import type { Terrain } from '../world/World';
import { Headlights } from './Headlights';

export interface DriveInput {
  readonly throttle: number;
  readonly steer: number;
  readonly handbrake: boolean;
}

export interface Impact {
  collider: Collider;
  /** Unit direction from the car toward the obstacle. */
  dirX: number;
  dirZ: number;
  /** Closing speed at the moment of impact. */
  strength: number;
}

const MAX_SPEED = 24;
const MAX_REVERSE = 9;
const ACCEL = 16;
const BRAKE = 34;
const ROLL_DRAG = 7;
const MAX_STEER = 0.55;
const STEER_SPEED = 5;
const WHEELBASE = 2.3;
const WHEEL_RADIUS = 0.45;

/** How fast sideways sliding is cancelled (1/s). High = grippy, low = drifty. */
const GRIP = 20;
const HANDBRAKE_GRIP = 2.2;
/** Share of cancelled sideways speed turned back into forward speed (arcade feel). */
const REDIRECT = 0.35;
const HANDBRAKE_REDIRECT = 0.25;
const HANDBRAKE_DRAG = 8;
/** Extra rotation while the handbrake is on, to swing the tail out. */
const HANDBRAKE_YAW = 1.6;
/** Rear wheels relative to the car's origin (local x, z). */
/** Honk hop: how long and how high the little jump is. */
const HOP_DURATION = 0.32;
const HOP_HEIGHT = 0.35;
/** Pull along slopes (units/s² per unit of rise per unit run): slower uphill, faster downhill. */
const SLOPE_GRAVITY = 10;
/** Half the distance between the front/back and left/right ground samples used for tilt. */
const TILT_HALF_LENGTH = 1.2;
const TILT_HALF_WIDTH = 0.9;
/** In ponds the toy car floats with its underside this far below the surface. */
const FLOAT_DEPTH = 0.4;
/** Extra drag in water (units/s²) and how much of top speed deep water takes away. */
const WATER_DRAG = 12;
const WATER_SPEED_LOSS = 0.55;
const REAR_WHEELS: readonly [number, number][] = [
  [-1.0, -1.15],
  [1.0, -1.15],
];

/** The car's footprint for collisions: circles along its length (local z). */
const HIT_OFFSETS = [-0.95, 0, 0.95];
const HIT_RADIUS = 0.95;
/** Bounciness of head-on hits (0 = dead stop, 1 = full rebound). */
const RESTITUTION = 0.35;
/** Contacts gentler than this don't count as impacts (e.g. resting against a tree). */
const MIN_IMPACT = 1.5;

const COLORS = {
  body: '#ff9aa2',
  roof: '#fff5e6',
  glass: '#bde0fe',
  tire: '#6d6875',
  hub: '#fff5e6',
  headlight: '#fff3b0',
  taillight: '#f47c87',
};

function toon(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 });
}

/**
 * A chunky toy car with arcade (bicycle-model) handling.
 * Local +Z is the front of the car.
 */
export class Car {
  readonly root = new THREE.Group();

  /** World-space velocity on the ground plane (y stays 0). */
  readonly velocity = new THREE.Vector3();
  /** Signed speed along the car's heading, units/sec. */
  speed = 0;
  /** Sideways sliding speed, units/sec; positive toward the car's left. */
  lateral = 0;
  /** Yaw in radians; 0 faces +Z. */
  heading = Math.PI;
  handbrake = false;
  /** How hard the tyres are skidding right now, 0..1. */
  skid = 0;

  private steerAngle = 0;
  private prevSpeed = 0;
  private squash = 0;
  private squashTime = 0;
  /** Body roll/pitch before horn shake is layered on top. */
  private roll = 0;
  private pitch = 0;
  private hornOn = false;
  private hornTime = 0;
  private hopTime = HOP_DURATION;
  /** Ground under the car, plus how steep it is along / across the car (rise per unit). */
  private groundY = 0;
  private slopeForward = 0;
  private slopeLeft = 0;
  private tiltPitch = 0;
  private tiltRoll = 0;
  /** How submerged the car is: 0 on land → 1 floating. */
  private wet = 0;
  /** Fraction of top speed allowed (photo mode lowers it to a creep). Speeds above it brake smoothly. */
  speedLimit = 1;
  private braking = false;
  private headlights!: Headlights;
  private readonly tailMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly body = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly rearWheels: THREE.Mesh[] = [];
  private readonly frontPivots: THREE.Group[] = [];

  constructor(private readonly terrain: Terrain) {
    // Yaw first, then pitch/roll in the car's own frame, so tilting follows the slope.
    this.root.rotation.order = 'YXZ';
    this.buildModel();
    this.reset();
  }

  reset(): void {
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.lateral = 0;
    this.skid = 0;
    this.handbrake = false;
    this.prevSpeed = 0;
    this.steerAngle = 0;
    this.squash = 0;
    this.hornOn = false;
    this.hopTime = HOP_DURATION;
    this.heading = Math.PI;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, this.heading, 0);
    this.tiltPitch = 0;
    this.tiltRoll = 0;
    this.sampleGround(0);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  update(dt: number, input: DriveInput): void {
    const { throttle } = input;
    this.handbrake = input.handbrake;

    // Split velocity into forward / sideways parts relative to the current heading.
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let vf = this.velocity.x * fx + this.velocity.z * fz;
    let vl = this.velocity.x * fz - this.velocity.z * fx;

    // Hills: gravity pulls back going up and helps going down.
    vf -= SLOPE_GRAVITY * this.slopeForward * dt;
    // Ponds: wading is slow going.
    if (this.wet > 0) vf = approachZero(vf, WATER_DRAG * this.wet * dt);

    if (throttle > 0) {
      vf += (vf < 0 ? BRAKE : ACCEL) * dt;
    } else if (throttle < 0) {
      vf -= (vf > 0 ? BRAKE : ACCEL * 0.7) * dt;
    } else {
      vf = approachZero(vf, ROLL_DRAG * dt);
    }
    if (this.handbrake) vf = approachZero(vf, HANDBRAKE_DRAG * dt);

    // Tyres cancel sideways sliding; part of it is redirected forward so turns keep momentum.
    const grip = this.handbrake ? HANDBRAKE_GRIP : GRIP;
    const cancelled = vl * (1 - Math.exp(-grip * dt));
    vl -= cancelled;
    vf += Math.sign(vf) * Math.abs(cancelled) * (this.handbrake ? HANDBRAKE_REDIRECT : REDIRECT);
    const waterCap = 1 - WATER_SPEED_LOSS * this.wet;
    vf = THREE.MathUtils.clamp(vf, -MAX_REVERSE * waterCap, MAX_SPEED * waterCap);
    // Speed limit: ease down rather than stopping dead.
    const limit = MAX_SPEED * this.speedLimit;
    if (Math.abs(vf) > limit) vf -= Math.sign(vf) * Math.min(Math.abs(vf) - limit, BRAKE * dt);

    // Steering eases toward the target and gets gentler at high speed.
    const speedFactor = 1 - 0.45 * Math.min(1, Math.abs(vf) / MAX_SPEED);
    const targetSteer = input.steer * MAX_STEER * speedFactor;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, STEER_SPEED * dt);

    // Rebuild velocity on the old axes, then turn the car: the lag between
    // heading and velocity is what becomes a slide on the next frame.
    this.velocity.set(fx * vf + fz * vl, 0, fz * vf - fx * vl);
    const yawBoost = this.handbrake ? HANDBRAKE_YAW : 1;
    this.heading += (vf / WHEELBASE) * Math.tan(this.steerAngle) * yawBoost * dt;
    this.root.rotation.y = this.heading;
    this.root.position.addScaledVector(this.velocity, dt);
    this.sampleGround(dt);

    this.speed = vf;
    this.lateral = vl;

    // Skid when sliding sideways, handbraking at speed, or braking hard.
    const slide = smoothstep(2.5, 6.5, Math.abs(vl));
    const locked = this.handbrake ? smoothstep(2, 6, Math.abs(vf)) : 0;
    const braking = throttle < 0 && vf > 0 ? smoothstep(8, 16, vf) * 0.7 : 0;
    this.braking = (throttle < 0 && vf > 0.5) || (this.handbrake && Math.abs(vf) > 0.5);
    this.skid = Math.max(slide, locked, braking);

    this.animate(dt);
  }

  /**
   * Press or release the horn. Pressing makes the car hop; holding makes it
   * jitter. Returns true on the frame the horn starts.
   */
  setHorn(on: boolean): boolean {
    const started = on && !this.hornOn;
    this.hornOn = on;
    if (started) {
      this.hopTime = 0;
      this.hornTime = 0;
    }
    return started;
  }

  get headlightsOn(): boolean {
    return this.headlights.on;
  }

  /** Flip the headlights; returns the new state. */
  toggleHeadlights(): boolean {
    return this.headlights.toggle();
  }

  /**
   * Read the terrain around the car: height under it, and slope along and across
   * it, which drive both the tilt and the uphill/downhill pull.
   */
  private sampleGround(dt: number): void {
    const p = this.root.position;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // Support surface: the ground, or the float line when the ground is under water.
    const floatLine = this.terrain.waterLevel - FLOAT_DEPTH;
    const support = (x: number, z: number) => Math.max(this.terrain.heightAt(x, z), floatLine);
    const h = (along: number, left: number) => support(p.x + fx * along + fz * left, p.z + fz * along - fx * left);

    const front = h(TILT_HALF_LENGTH, 0);
    const back = h(-TILT_HALF_LENGTH, 0);
    const left = h(0, TILT_HALF_WIDTH);
    const right = h(0, -TILT_HALF_WIDTH);
    this.slopeForward = (front - back) / (2 * TILT_HALF_LENGTH);
    this.slopeLeft = (left - right) / (2 * TILT_HALF_WIDTH);
    // Rest on the average of the four contact points so the car doesn't sink into crests.
    const under = this.terrain.heightAt(p.x, p.z);
    this.wet = THREE.MathUtils.clamp((this.terrain.waterLevel - under) / FLOAT_DEPTH, 0, 1);
    this.groundY = Math.max(support(p.x, p.z), (front + back + left + right) / 4);
    // Bob gently when afloat.
    if (under < floatLine) this.groundY += Math.sin(performance.now() * 0.004) * 0.05 * this.wet;

    // Nose up when climbing (negative X rotation lifts +Z); left side up rolls +Z.
    const k = dt > 0 ? Math.min(1, 12 * dt) : 1;
    this.tiltPitch += (-Math.atan(this.slopeForward) - this.tiltPitch) * k;
    this.tiltRoll += (Math.atan(this.slopeLeft) - this.tiltRoll) * k;
    this.root.rotation.x = this.tiltPitch;
    this.root.rotation.z = this.tiltRoll;
    if (dt === 0) this.root.position.y = this.groundY;
  }

  /** 0 on dry land → 1 when floating in a pond. */
  get wetness(): number {
    return this.wet;
  }

  /** Height of the ground right under the car (ignores the honk hop). */
  get ground(): number {
    return this.groundY;
  }

  /** World positions of the rear tyres' contact points. */
  rearWheelPositions(out: [THREE.Vector3, THREE.Vector3]): [THREE.Vector3, THREE.Vector3] {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const p = this.root.position;
    REAR_WHEELS.forEach(([lx, lz], i) => {
      // Local +X maps to world (fz, -fx); local +Z to (fx, fz).
      const x = p.x + fz * lx + fx * lz;
      const z = p.z - fx * lx + fz * lz;
      out[i].set(x, this.terrain.heightAt(x, z), z);
    });
    return out;
  }

  /**
   * Push the car out of any overlapping colliders and bounce its velocity off
   * them. Glancing hits slide along; head-on hits rebound.
   */
  resolveCollisions(colliders: readonly Collider[]): Impact[] {
    const impacts: Impact[] = [];
    if (colliders.length === 0) return impacts;

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const pos = this.root.position;
    const vel = this.velocity;

    // Two passes settle cases where resolving one contact creates another.
    for (let pass = 0; pass < 2; pass++) {
      for (const offset of HIT_OFFSETS) {
        for (const c of colliders) {
          const dx = pos.x + fx * offset - c.x;
          const dz = pos.z + fz * offset - c.z;
          const minDist = HIT_RADIUS + c.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= minDist * minDist) continue;

          const d = Math.sqrt(d2);
          // Normal points from the obstacle toward the car.
          const nx = d > 1e-4 ? dx / d : -fx;
          const nz = d > 1e-4 ? dz / d : -fz;
          pos.x += nx * (minDist - d);
          pos.z += nz * (minDist - d);

          const vn = vel.x * nx + vel.z * nz;
          if (vn >= 0) continue;
          vel.x -= (1 + RESTITUTION) * vn * nx;
          vel.z -= (1 + RESTITUTION) * vn * nz;

          if (-vn > MIN_IMPACT) impacts.push({ collider: c, dirX: -nx, dirZ: -nz, strength: -vn });
        }
      }
    }

    this.speed = vel.x * fx + vel.z * fz;
    const hardest = impacts.reduce((m, i) => Math.max(m, i.strength), 0);
    if (hardest > 0) {
      this.squash = Math.max(this.squash, Math.min(1, hardest / 14));
      this.squashTime = 0;
    }
    return impacts;
  }

  private animate(dt: number): void {
    this.headlights.update(dt);
    // Tail lights glow softly with the headlights, and brightly when braking.
    const tailGlow = this.braking ? 2.2 : this.headlights.on ? 0.6 : 0;
    for (const m of this.tailMaterials) m.emissiveIntensity += (tailGlow - m.emissiveIntensity) * Math.min(1, 20 * dt);

    const spin = (this.speed * dt) / WHEEL_RADIUS;
    for (const wheel of this.wheels) {
      // The handbrake locks the rear wheels.
      if (!(this.handbrake && this.rearWheels.includes(wheel))) wheel.rotation.x += spin;
    }
    for (const pivot of this.frontPivots) pivot.rotation.y = this.steerAngle;

    // Playful body motion: lean out of turns, squat on accel, dip on brake.
    const accel = (this.speed - this.prevSpeed) / Math.max(dt, 1e-4);
    this.prevSpeed = this.speed;
    const targetRoll =
      this.steerAngle * Math.min(1, Math.abs(this.speed) / 10) * 0.18 * Math.sign(this.speed || 1) -
      THREE.MathUtils.clamp(this.lateral * 0.015, -0.1, 0.1);
    const targetPitch = THREE.MathUtils.clamp(-accel * 0.006, -0.08, 0.08);
    const k = Math.min(1, 8 * dt);
    this.roll += (targetRoll - this.roll) * k;
    this.pitch += (targetPitch - this.pitch) * k;
    this.body.position.y = Math.sin(performance.now() * 0.012) * 0.015 * Math.min(1, Math.abs(this.speed) / 4);

    // Horn: rattle the body for as long as it's held.
    let shakeRoll = 0;
    let shakePitch = 0;
    if (this.hornOn) {
      this.hornTime += dt;
      shakeRoll = Math.sin(this.hornTime * 70) * 0.035;
      shakePitch = Math.sin(this.hornTime * 53 + 1) * 0.02;
    }
    this.body.rotation.z = this.roll + shakeRoll;
    this.body.rotation.x = this.pitch + shakePitch;

    // Horn: one little hop per press, stretching on the way up and squashing on landing.
    let stretch = 0;
    if (this.hopTime < HOP_DURATION) {
      this.hopTime = Math.min(HOP_DURATION, this.hopTime + dt);
      const t = this.hopTime / HOP_DURATION;
      this.root.position.y = this.groundY + Math.sin(Math.PI * t) * HOP_HEIGHT;
      stretch = t < 0.5 ? Math.sin(Math.PI * t * 2) * 0.12 : -Math.sin(Math.PI * (t - 0.5) * 2) * 0.16;
    } else {
      this.root.position.y = this.groundY;
    }

    // Jelly squash after a bump.
    let s = 0;
    if (this.squash > 0.001) {
      this.squashTime += dt;
      this.squash *= Math.exp(-5 * dt);
      s = this.squash * Math.cos(this.squashTime * 22);
    }
    this.body.scale.set(1 + 0.12 * s - 0.5 * stretch, 1 - 0.2 * s + stretch, 1 + 0.12 * s - 0.5 * stretch);
  }

  private buildModel(): void {
    const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.body) => {
      const mesh = new THREE.Mesh(geo, toon(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Chassis & cabin
    add(new RoundedBoxGeometry(2.0, 0.85, 3.6, 4, 0.32), COLORS.body, 0, 0.78, 0);
    add(new RoundedBoxGeometry(1.7, 0.72, 1.9, 4, 0.28), COLORS.glass, 0, 1.4, -0.25);
    add(new RoundedBoxGeometry(1.55, 0.18, 1.7, 3, 0.08), COLORS.roof, 0, 1.82, -0.25);

    // Bumpers
    add(new RoundedBoxGeometry(1.8, 0.3, 0.3, 3, 0.12), COLORS.roof, 0, 0.5, 1.78);
    add(new RoundedBoxGeometry(1.8, 0.3, 0.3, 3, 0.12), COLORS.roof, 0, 0.5, -1.78);

    // Lights
    const lamp = new THREE.SphereGeometry(0.17, 16, 12);
    const bulbs: THREE.MeshStandardMaterial[] = [];
    const lampSpots: THREE.Vector3[] = [];
    for (const x of [-0.62, 0.62]) {
      const head = add(lamp, COLORS.headlight, x, 0.9, 1.78).material as THREE.MeshStandardMaterial;
      head.emissive.set(COLORS.headlight);
      head.emissiveIntensity = 0.4;
      bulbs.push(head);
      // The light sits just in front of the bulb so the bulb mesh doesn't shadow it.
      lampSpots.push(new THREE.Vector3(x, 0.9, 1.98));

      const tail = add(lamp, COLORS.taillight, x, 0.9, -1.78).material as THREE.MeshStandardMaterial;
      tail.emissive.set(COLORS.taillight);
      tail.emissiveIntensity = 0;
      this.tailMaterials.push(tail);
    }
    this.headlights = new Headlights(this.root, lampSpots, bulbs);

    this.root.add(this.body);

    // Wheels live on the root so they stay planted while the body wobbles.
    const tireGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.42, 24);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 12);
    const capGeo = new THREE.BoxGeometry(0.5, 0.46, 0.12);
    for (const [x, z, front] of [
      [-1.0, 1.15, true],
      [1.0, 1.15, true],
      [-1.0, -1.15, false],
      [1.0, -1.15, false],
    ] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, WHEEL_RADIUS, z);
      this.root.add(pivot);

      const wheel = add(tireGeo, COLORS.tire, 0, 0, 0, pivot);
      wheel.rotation.z = Math.PI / 2;
      add(hubGeo, COLORS.hub, 0, 0, 0, wheel);
      // A little stripe across the hub so the spin is visible.
      add(capGeo, COLORS.body, 0, 0, 0, wheel);

      this.wheels.push(wheel);
      if (front) this.frontPivots.push(pivot);
      else this.rearWheels.push(wheel);
    }
  }
}

function approachZero(v: number, amount: number): number {
  return Math.abs(v) <= amount ? 0 : v - Math.sign(v) * amount;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
