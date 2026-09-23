import * as THREE from 'three';
import { ALERT_DURATION, animateAlert, createAlert } from './alert';
import type { SpeciesId, Subject } from '../safari/species';
import { BIRD_COLORS, createBird, type BirdModel } from './models';

const MAX_FLOCKS = 2;
/** Flocks start this far from the player and are removed beyond DESPAWN_DISTANCE. */
const SPAWN_DISTANCE = 55;
const DESPAWN_DISTANCE = 70;
/** A honk within this ground distance of a flock sends it scattering. */
const SCARE_RADIUS = 28;
/** The startled jolt before the birds bolt. */
const JOLT_TIME = 0.3;
/** How long the panic lasts before the flock settles into a brisk getaway. */
const PANIC_TIME = 4;
const EYE_SIZE = 0.04;

interface Bird {
  model: BirdModel;
  species: SpeciesId;
  /** Formation slot relative to the flock leader (flock-local, +Z forward). */
  offset: THREE.Vector3;
  phase: number;
  flapRate: number;
  alert: THREE.Sprite;
  alertTime: number;
  /** Direction this bird peels off in when the flock scatters (flock-local). */
  scatter: THREE.Vector3;
}

interface Flock {
  birds: Bird[];
  pos: THREE.Vector3;
  heading: number;
  turnRate: number;
  speed: number;
  baseSpeed: number;
  baseY: number;
  /** Seconds since the last scare, or Infinity if never scared. */
  scareTime: number;
  fleeHeading: number;
  gliding: boolean;
  glideTimer: number;
  time: number;
}

/**
 * Small flocks of toy birds that drift across the sky around the player,
 * flapping and gliding. Purely ambient: they ignore the car.
 */
export class Birds {
  readonly group = new THREE.Group();

  private readonly flocks: Flock[] = [];
  private spawnTimer = 0;
  private first = true;

  /** A honk at `from`: nearby flocks startle and scatter away from it. */
  scare(from: THREE.Vector3): void {
    for (const flock of this.flocks) {
      const dx = flock.pos.x - from.x;
      const dz = flock.pos.z - from.z;
      if (Math.hypot(dx, dz) > SCARE_RADIUS) continue;
      flock.scareTime = 0;
      flock.fleeHeading = Math.atan2(dx, dz);
      flock.turnRate = 0;
      flock.gliding = false;
      for (const bird of flock.birds) {
        // Stagger the "!"s so the flock reacts like individuals.
        bird.alertTime = -Math.random() * 0.15;
        bird.scatter.set((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 1.5);
      }
    }
  }

  /** Report every bird as a photo subject. */
  collectSubjects(out: Subject[]): void {
    for (const flock of this.flocks) {
      const behavior = flock.scareTime < PANIC_TIME ? 'startled' : flock.gliding ? 'gliding' : 'flying';
      for (const bird of flock.birds) {
        const root = bird.model.root;
        out.push({
          species: bird.species,
          position: root.position.clone(),
          radius: 0.55 * root.scale.x,
          forward: new THREE.Vector3(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)),
          behavior,
        });
      }
    }
  }

  /** `canSpawn` false (e.g. at night) lets current flocks fly off without new ones arriving. */
  update(dt: number, focus: THREE.Vector3, canSpawn: boolean): void {
    this.spawnTimer -= dt;
    if (canSpawn && this.flocks.length < MAX_FLOCKS && this.spawnTimer <= 0) {
      this.spawn(focus);
      this.spawnTimer = 4 + Math.random() * 8;
    }

    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const flock = this.flocks[i];
      this.updateFlock(flock, dt);

      const dx = flock.pos.x - focus.x;
      const dz = flock.pos.z - focus.z;
      const movingAway = dx * Math.sin(flock.heading) + dz * Math.cos(flock.heading) > 0;
      if (movingAway && Math.hypot(dx, dz) > DESPAWN_DISTANCE) {
        for (const b of flock.birds) this.group.remove(b.model.root);
        this.flocks.splice(i, 1);
      }
    }
  }

  private spawn(focus: THREE.Vector3): void {
    // The very first flock starts closer so there's something to see right away.
    const distance = this.first ? 25 : SPAWN_DISTANCE;
    this.first = false;

    const angle = Math.random() * Math.PI * 2;
    const pos = new THREE.Vector3(focus.x + Math.cos(angle) * distance, 9 + Math.random() * 4, focus.z + Math.sin(angle) * distance);
    // Aim roughly across the player's surroundings.
    const aimX = focus.x + (Math.random() - 0.5) * 40;
    const aimZ = focus.z + (Math.random() - 0.5) * 40;
    const heading = Math.atan2(aimX - pos.x, aimZ - pos.z);

    const colorsA = BIRD_COLORS[Math.floor(Math.random() * BIRD_COLORS.length)];
    const colorsB = BIRD_COLORS[Math.floor(Math.random() * BIRD_COLORS.length)];
    const count = 3 + Math.floor(Math.random() * 4);
    const birds: Bird[] = [];
    for (let i = 0; i < count; i++) {
      // Loose V: alternate sides, each rank further back.
      const rank = Math.ceil(i / 2);
      const side = i % 2 === 0 ? 1 : -1;
      const colors = Math.random() < 0.75 ? colorsA : colorsB;
      const model = createBird(colors);
      model.root.scale.setScalar(0.9 + Math.random() * 0.3);
      const alert = createAlert(1.25);
      model.root.add(alert);
      this.group.add(model.root);
      birds.push({
        model,
        species: colors.species,
        offset: new THREE.Vector3(side * rank * 1.4, (Math.random() - 0.5) * 0.8, -rank * 1.3 + (Math.random() - 0.5) * 0.4),
        phase: Math.random() * Math.PI * 2,
        flapRate: 14 + Math.random() * 4,
        alert,
        alertTime: ALERT_DURATION + 1,
        scatter: new THREE.Vector3(),
      });
    }

    const speed = 6 + Math.random() * 3;
    this.flocks.push({
      birds,
      pos,
      heading,
      turnRate: (Math.random() - 0.5) * 0.15,
      speed,
      baseSpeed: speed,
      baseY: pos.y,
      scareTime: Infinity,
      fleeHeading: heading,
      gliding: false,
      glideTimer: 1 + Math.random() * 2,
      time: 0,
    });
  }

  private updateFlock(flock: Flock, dt: number): void {
    flock.time += dt;
    flock.scareTime += dt;
    const panicking = flock.scareTime < PANIC_TIME;
    const bolting = panicking && flock.scareTime > JOLT_TIME;

    if (bolting) {
      // Swing away from the honk, speed up and climb.
      const diff = Math.atan2(Math.sin(flock.fleeHeading - flock.heading), Math.cos(flock.fleeHeading - flock.heading));
      flock.heading += diff * Math.min(1, 3 * dt);
      flock.speed += (flock.baseSpeed * 2.4 - flock.speed) * Math.min(1, 2 * dt);
      flock.pos.y += (flock.baseY + 6 - flock.pos.y) * Math.min(1, 1.2 * dt);
    } else if (!panicking) {
      // Calm again, but keep a brisk pace so they leave the area.
      const cruise = flock.scareTime === Infinity ? flock.baseSpeed : flock.baseSpeed * 1.4;
      flock.speed += (cruise - flock.speed) * Math.min(1, 0.5 * dt);
    }
    flock.heading += flock.turnRate * dt;
    const fx = Math.sin(flock.heading);
    const fz = Math.cos(flock.heading);
    flock.pos.x += fx * flock.speed * dt;
    flock.pos.z += fz * flock.speed * dt;

    // Alternate bursts of flapping with short glides (no gliding in a panic).
    flock.glideTimer -= dt;
    if (panicking) flock.gliding = false;
    else if (flock.glideTimer <= 0) {
      flock.gliding = !flock.gliding;
      flock.glideTimer = flock.gliding ? 0.8 + Math.random() * 1.2 : 1.5 + Math.random() * 2;
    }

    // Scatter: the formation spreads out after a scare and never fully regroups.
    const spread = flock.scareTime === Infinity ? 0 : Math.min(1, Math.max(0, flock.scareTime - JOLT_TIME) / 1.5);

    for (const bird of flock.birds) {
      const { root, body, wings, eyes } = bird.model;
      const t = flock.time + bird.phase;
      bird.alertTime += dt;
      animateAlert(bird.alert, bird.alertTime, 0.8);

      const ox = bird.offset.x * (1 + spread) + bird.scatter.x * spread * 3;
      const oy = bird.offset.y + bird.scatter.y * spread * 3;
      const oz = bird.offset.z * (1 + spread) + bird.scatter.z * spread * 3;
      root.position.set(flock.pos.x + ox * fz + oz * fx, flock.pos.y + oy + Math.sin(t * 2) * 0.25, flock.pos.z - ox * fx + oz * fz);
      root.rotation.y = flock.heading + Math.sin(t * (panicking ? 4 : 0.7)) * (panicking ? 0.2 : 0.08);

      const jolting = flock.scareTime < JOLT_TIME;
      let flap: number;
      if (jolting) flap = 1.1; // wings flung up in surprise
      else if (flock.gliding) flap = 0.15;
      else flap = Math.sin(t * bird.flapRate * (panicking ? 1.8 : 1)) * (panicking ? 0.95 : 0.75);
      wings[0].rotation.z = -flap;
      wings[1].rotation.z = flap;

      const jolt = jolting ? Math.sin((Math.PI * flock.scareTime) / JOLT_TIME) : 0;
      body.position.y = jolting ? jolt * 0.5 : flock.gliding ? 0 : -Math.sin(t * bird.flapRate) * 0.05;
      body.scale.set(1 - jolt * 0.15, 1 + jolt * 0.3, 1 - jolt * 0.1);
      body.rotation.x = jolting ? -0.4 * jolt : flock.gliding ? 0.05 : -0.05;
      for (const eye of eyes) eye.scale.setScalar(EYE_SIZE * (panicking ? 1.7 : 1));
    }
  }
}
