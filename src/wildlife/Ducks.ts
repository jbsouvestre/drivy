import * as THREE from 'three';
import { playQuack } from '../game/audio';
import type { Splashes } from '../game/Splashes';
import type { World } from '../world/World';
import type { SpeciesId, Subject } from '../safari/species';
import { ALERT_DURATION, animateAlert, animateHold, createAlert, createBubble, createNote, createWary } from './alert';
import { rareChance, updateAlert, WARY, type CarPresence } from './awareness';
import { createDuck, DUCK_COLORS, makeLegendary, type DuckModel } from './models';

const MAX_FAMILIES = 2;
/** Families appear on water in this ring around the player, and leave beyond DESPAWN_RADIUS. */
const SPAWN_MIN = 10;
const SPAWN_MAX = 36;
const DESPAWN_RADIUS = 55;
/** Water must be at least this deep where a duck swims (keeps them off the beach). */
const SWIM_DEPTH = 0.3;
const MOTHER_SCALE = 1.3;
const DUCKLING_SCALE = 0.7;
/** Gap between ducks in the family line. */
const SPACING = 1.0;
const SWIM_SPEED = 1.1;
const FLEE_SPEED = 3.8;
const TURN_RATE = 2.2;
/** A honk within this distance scares the family. */
const SCARE_RADIUS = 16;
const PANIC_TIME = 3;
const HOP_TIME = 0.4;
/** The car wading closer than this makes ducks paddle out of its way. */
const PERSONAL_SPACE = 5;
const QUACK_RANGE = 35;
const QUACK_VOLUME = 0.09;
const EYE_SIZE = 0.025;
/** Base chance (scaled up by difficulty) that a family's mother is the legendary Golden Duck. */
const GOLDEN_DUCK_CHANCE = 0.05;
/** Notice radius at full car speed (creeping shrinks it; see awareness). */
const NOTICE = 16;
/** The chime reaches families within this distance; they come to have a look for this long. */
const CHIME_RADIUS = 22;
const CURIOUS_TIME = 6;

const MAX_RINGS = 40;
const RING_LIFE = 1.4;

interface Duck {
  model: DuckModel;
  alert: THREE.Sprite;
  pos: THREE.Vector3;
  heading: number;
  scale: number;
  phase: number;
  alertTime: number;
  hopTime: number;
  dabbleTime: number;
  ringTimer: number;
  /** Sideways offset while panicking, so ducklings scatter a little. */
  scatter: number;
}

interface Family {
  ducks: Duck[];
  target: THREE.Vector3;
  retarget: number;
  scareTime: number;
  fleeHeading: number;
  quackTimer: number;
  quackTime: number;
  quackBubble: THREE.Sprite;
  appear: number;
  /** The mother's species: usually a duck, very occasionally the Golden Duck. */
  motherSpecies: SpeciesId;
  /** 0–1: how bothered the family is by the car (judged by the mother). */
  alertness: number;
  /** Seconds spent wary so far, or -1 when not wary. */
  waryTime: number;
  curiousTime: number;
  noteTime: number;
  wary: THREE.Sprite;
  note: THREE.Sprite;
}

interface Ring {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  size: number;
}

/**
 * Duck families paddling around ponds: a mother leading a line of ducklings.
 * They dabble, quack, leave ripples, tuck in at night, keep clear of a wading
 * car, and scatter in a flappy panic when honked at.
 */
export class Ducks {
  readonly group = new THREE.Group();

  private readonly families: Family[] = [];
  private readonly rings: Ring[] = [];
  private ringCursor = 0;
  private spawnTimer = 0;
  private sleepy = false;

  constructor(
    private readonly terrain: World,
    private readonly splashes: Splashes,
  ) {
    const ringGeometry = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_RINGS; i++) {
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.rings.push({ mesh, material, life: 0, size: 1 });
    }
  }

  clear(): void {
    for (const f of this.families) for (const d of f.ducks) this.group.remove(d.model.root);
    this.families.length = 0;
  }

  scare(from: THREE.Vector3): void {
    for (const f of this.families) {
      const mother = f.ducks[0];
      if (Math.hypot(mother.pos.x - from.x, mother.pos.z - from.z) > SCARE_RADIUS) continue;
      this.startle(f, from);
    }
  }

  /** A chime at `from`: families nearby paddle over for a curious look. */
  chime(from: THREE.Vector3): void {
    for (const f of this.families) {
      const m = f.ducks[0].pos;
      if (f.scareTime < PANIC_TIME || Math.hypot(m.x - from.x, m.z - from.z) > CHIME_RADIUS) continue;
      f.curiousTime = CURIOUS_TIME;
      f.noteTime = 0;
      f.alertness *= 0.3;
    }
  }

  /** Flappy "!" hop, a panicked quack, then paddle hard away from `from`. */
  private startle(f: Family, from: THREE.Vector3): void {
    const mother = f.ducks[0];
    f.alertness = 0;
    f.curiousTime = 0;
    f.scareTime = 0;
    f.fleeHeading = Math.atan2(mother.pos.x - from.x, mother.pos.z - from.z);
    f.quackTime = 0;
    this.quack(f, from);
    for (const d of f.ducks) {
      d.alertTime = -Math.random() * 0.15;
      d.hopTime = 0;
      d.dabbleTime = Infinity;
      d.scatter = (Math.random() - 0.5) * 2.5;
      this.splashes.burst(d.pos.x, d.pos.z, 6, 0.8 * d.scale);
    }
  }

  update(dt: number, focus: THREE.Vector3, darkness: number, car: CarPresence): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1;
      this.manage(focus);
    }
    const sleepy = darkness > 0.7;
    this.sleepy = sleepy;
    for (const f of this.families) this.updateFamily(f, dt, focus, sleepy, car);
    this.updateRings(dt);
  }

  /** Report every duck and duckling as a photo subject. */
  collectSubjects(out: Subject[]): void {
    for (const f of this.families) {
      if (f.appear < 1) continue;
      const panicking = f.scareTime < PANIC_TIME;
      f.ducks.forEach((d, i) => {
        const mother = i === 0;
        let behavior = 'swimming';
        if (panicking) behavior = 'startled';
        else if (f.curiousTime > 0) behavior = 'curious';
        else if (d.dabbleTime < 1.4) behavior = 'dabbling';
        else if (this.sleepy) behavior = 'sleeping';
        else if (mother && f.quackTime < 1) behavior = 'quacking';
        out.push({
          species: mother ? f.motherSpecies : 'duckling',
          position: d.model.root.position.clone().add(new THREE.Vector3(0, 0.22 * d.scale, 0)),
          radius: 0.42 * d.scale,
          forward: new THREE.Vector3(Math.sin(d.heading), 0, Math.cos(d.heading)),
          behavior,
        });
      });
    }
  }

  private isWater(x: number, z: number, depth = SWIM_DEPTH): boolean {
    return this.terrain.heightAt(x, z) < this.terrain.waterLevel - depth;
  }

  private manage(focus: THREE.Vector3): void {
    for (let i = this.families.length - 1; i >= 0; i--) {
      const m = this.families[i].ducks[0].pos;
      if (Math.hypot(m.x - focus.x, m.z - focus.z) > DESPAWN_RADIUS) {
        for (const d of this.families[i].ducks) this.group.remove(d.model.root);
        this.families.splice(i, 1);
      }
    }
    if (this.families.length >= MAX_FAMILIES) return;

    // Look for a roomy patch of water, away from any other family.
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = focus.x + Math.cos(a) * r;
      const z = focus.z + Math.sin(a) * r;
      if (!this.isWater(x, z, 0.7)) continue;
      const roomy = [0, 1, 2, 3].every((k) => this.isWater(x + Math.cos((k * Math.PI) / 2) * 2.5, z + Math.sin((k * Math.PI) / 2) * 2.5));
      const crowded = this.families.some((f) => Math.hypot(f.ducks[0].pos.x - x, f.ducks[0].pos.z - z) < 10);
      if (roomy && !crowded) {
        this.spawn(x, z);
        return;
      }
    }
  }

  private spawn(x: number, z: number): void {
    const heading = Math.random() * Math.PI * 2;
    const golden = Math.random() < rareChance(GOLDEN_DUCK_CHANCE, this.terrain.difficultyAt(x, z));
    const colors = golden ? DUCK_COLORS.golden : Math.random() < 0.5 ? DUCK_COLORS.white : DUCK_COLORS.mallard;
    const mother = this.makeDuck(colors, MOTHER_SCALE, x, z, heading);
    if (golden) makeLegendary(mother.model.root, 0.4);
    const ducks = [mother];
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 1; i <= count; i++) {
      const bx = x - Math.sin(heading) * SPACING * i;
      const bz = z - Math.cos(heading) * SPACING * i;
      ducks.push(this.makeDuck(DUCK_COLORS.duckling, DUCKLING_SCALE, bx, bz, heading));
    }
    const quackBubble = createBubble('quack!', '#ffb870', 1.15, 2.4);
    const wary = createWary(1.15);
    const note = createNote(1.15);
    mother.model.root.add(quackBubble, wary, note);
    this.families.push({
      ducks,
      target: new THREE.Vector3(x, 0, z),
      retarget: 0,
      scareTime: Infinity,
      fleeHeading: 0,
      quackTimer: 6 + Math.random() * 12,
      quackTime: Infinity,
      quackBubble,
      appear: 0,
      motherSpecies: golden ? 'golden-duck' : 'duck',
      alertness: 0,
      waryTime: -1,
      curiousTime: 0,
      noteTime: ALERT_DURATION + 1,
      wary,
      note,
    });
  }

  private makeDuck(colors: { body: string; head: string; wing: string }, scale: number, x: number, z: number, heading: number): Duck {
    const model = createDuck(colors);
    const alert = createAlert(0.95);
    model.root.add(alert);
    model.root.scale.setScalar(0);
    this.group.add(model.root);
    return {
      model,
      alert,
      pos: new THREE.Vector3(x, this.terrain.waterLevel, z),
      heading,
      scale,
      phase: Math.random() * 10,
      alertTime: ALERT_DURATION + 1,
      hopTime: Infinity,
      dabbleTime: Infinity,
      ringTimer: Math.random(),
      scatter: 0,
    };
  }

  /** A new wander target: some deep-enough water within reach of the mother. */
  private pickTarget(f: Family): void {
    const m = f.ducks[0].pos;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 9;
      const x = m.x + Math.cos(a) * r;
      const z = m.z + Math.sin(a) * r;
      if (this.isWater(x, z, 0.5)) {
        f.target.set(x, 0, z);
        break;
      }
    }
    f.retarget = 5 + Math.random() * 6;
  }

  private updateFamily(f: Family, dt: number, focus: THREE.Vector3, sleepy: boolean, car: CarPresence): void {
    f.appear = Math.min(1, f.appear + dt / 0.5);
    f.scareTime += dt;
    const mother = f.ducks[0];
    const carDist = Math.hypot(mother.pos.x - focus.x, mother.pos.z - focus.z);

    // Notice the car: wary when it moves close, paddle off in a fluster if it keeps coming.
    if (f.scareTime >= PANIC_TIME && f.appear >= 1) {
      f.alertness = updateAlert(f.alertness, dt, carDist, NOTICE, car);
      if (f.alertness >= 1) this.startle(f, car.position);
    }
    const panicking = f.scareTime < PANIC_TIME;
    const wary = !panicking && f.alertness > WARY;
    f.waryTime = wary ? (f.waryTime < 0 ? 0 : f.waryTime + dt) : -1;
    f.curiousTime = Math.max(0, f.curiousTime - dt);
    const curious = !panicking && f.curiousTime > 0;

    // --- Mother: wander to targets, dodge the car, flee from honks. ---
    f.retarget -= dt;
    if (f.retarget <= 0 || Math.hypot(f.target.x - mother.pos.x, f.target.z - mother.pos.z) < 1) this.pickTarget(f);

    let desired = Math.atan2(f.target.x - mother.pos.x, f.target.z - mother.pos.z);
    let speed = sleepy ? SWIM_SPEED * 0.25 : SWIM_SPEED;
    const towardCar = Math.atan2(focus.x - mother.pos.x, focus.z - mother.pos.z);
    if (panicking) {
      desired = f.fleeHeading;
      speed = FLEE_SPEED * (1 - (f.scareTime / PANIC_TIME) * 0.5);
    } else if (curious) {
      // Paddle over for a look, stopping at a polite distance.
      desired = towardCar;
      speed = carDist > PERSONAL_SPACE + 1.5 ? SWIM_SPEED * 1.2 : 0;
    } else if (wary) {
      // Stop and keep an eye on the car.
      desired = towardCar;
      speed = 0;
    } else if (carDist < PERSONAL_SPACE) {
      desired = Math.atan2(mother.pos.x - focus.x, mother.pos.z - focus.z);
      speed = SWIM_SPEED * 2;
    }
    this.steer(mother, desired, speed, dt, TURN_RATE * (panicking ? 2 : 1));

    // --- Ducklings: follow the duck in front, keeping a little gap. ---
    for (let i = 1; i < f.ducks.length; i++) {
      const d = f.ducks[i];
      const lead = f.ducks[i - 1];
      const dx = lead.pos.x - d.pos.x;
      const dz = lead.pos.z - d.pos.z;
      const dist = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz) + (panicking ? d.scatter * Math.max(0, 1 - f.scareTime / 1.2) : 0);
      const follow = dist > SPACING ? Math.min((dist - SPACING) * 3, FLEE_SPEED * 1.3) : 0;
      this.steer(d, heading, follow, dt, 8);
    }

    // --- Quacks. ---
    f.quackTimer -= dt;
    f.quackTime += dt;
    if (f.quackTimer <= 0 && !sleepy) {
      f.quackTimer = 10 + Math.random() * 18;
      f.quackTime = 0;
      this.quack(f, focus);
    }
    animateAlert(f.quackBubble, f.quackTime, 0.45, 1);
    f.noteTime += dt;
    animateAlert(f.note, f.noteTime, 0.4, 1.2);
    animateHold(f.wary, f.waryTime, 0.4);

    for (const d of f.ducks) this.animateDuck(f, d, dt, sleepy, panicking);
  }

  private quack(f: Family, focus: THREE.Vector3): void {
    const m = f.ducks[0].pos;
    const volume = QUACK_VOLUME * Math.max(0, 1 - Math.hypot(m.x - focus.x, m.z - focus.z) / QUACK_RANGE);
    playQuack(volume);
    if (f.scareTime < 0.1) setTimeout(() => playQuack(volume * 0.8), 170); // panicked double quack
  }

  /** Turn toward `desired` and paddle forward, never onto land. */
  private steer(d: Duck, desired: number, speed: number, dt: number, turnRate: number): void {
    const diff = Math.atan2(Math.sin(desired - d.heading), Math.cos(desired - d.heading));
    d.heading += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    if (speed <= 0) return;
    // Try straight ahead, then veer left/right to follow the shoreline.
    for (const veer of [0, 0.5, -0.5, 1.1, -1.1]) {
      const h = d.heading + veer;
      const nx = d.pos.x + Math.sin(h) * speed * dt;
      const nz = d.pos.z + Math.cos(h) * speed * dt;
      if (this.isWater(nx, nz)) {
        d.pos.x = nx;
        d.pos.z = nz;
        if (veer !== 0) d.heading += veer * 0.2;
        d.ringTimer -= dt * (0.6 + speed * 0.4);
        return;
      }
    }
  }

  private animateDuck(f: Family, d: Duck, dt: number, sleepy: boolean, panicking: boolean): void {
    const { root, body, head, wings, eyes } = d.model;
    d.phase += dt;
    d.alertTime += dt;
    d.hopTime += dt;
    animateAlert(d.alert, d.alertTime, 0.5 / (d.scale / MOTHER_SCALE));

    // Bob on the water; pop out of it in a startled hop.
    let y = this.terrain.waterLevel + Math.sin(d.phase * 2.2) * 0.03;
    let flap = 0;
    if (d.hopTime < HOP_TIME) {
      const t = d.hopTime / HOP_TIME;
      y += Math.sin(Math.PI * t) * 0.5 * d.scale;
      flap = 0.9 + Math.sin(d.hopTime * 40) * 0.5;
      if (t + dt / HOP_TIME >= 1) this.splashes.burst(d.pos.x, d.pos.z, 5, 0.6 * d.scale);
    } else if (panicking) {
      flap = 0.3 + Math.sin(d.phase * 30) * 0.3; // frantic flapping while paddling off
    }
    root.position.set(d.pos.x, y, d.pos.z);
    root.rotation.y = d.heading;
    root.scale.setScalar(d.scale * backOut(f.appear));
    wings[0].rotation.z = -flap;
    wings[1].rotation.z = flap;
    for (const eye of eyes) eye.scale.setScalar(EYE_SIZE * (panicking ? 1.7 : 1));

    // Dabbling: tip forward, head under, tail up.
    if (!panicking && !sleepy && d.dabbleTime === Infinity && Math.random() < dt / 9) d.dabbleTime = 0;
    d.dabbleTime += dt;
    const dab = d.dabbleTime < 1.4 ? Math.sin((Math.PI * d.dabbleTime) / 1.4) : 0;
    if (d.dabbleTime >= 1.4) d.dabbleTime = Infinity;
    body.rotation.x = dab * 1.1 + (panicking ? -0.15 : 0);

    // Head: gentle bob, or tucked back to sleep at night.
    if (sleepy && !panicking) {
      head.rotation.set(0.3, 2.4, 0);
      head.position.set(0, 0.34, 0.12);
    } else {
      head.rotation.set(Math.sin(d.phase * 3) * 0.08, Math.sin(d.phase * 0.7) * 0.3, 0);
      head.position.set(0, 0.44, 0.27);
    }

    // Ripple rings while paddling.
    if (d.ringTimer <= 0) {
      d.ringTimer = 1;
      this.emitRing(d.pos.x, d.pos.z, d.scale);
    }
  }

  private emitRing(x: number, z: number, size: number): void {
    const ring = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % MAX_RINGS;
    ring.life = RING_LIFE;
    ring.size = size;
    ring.mesh.position.set(x, this.terrain.waterLevel + 0.02, z);
    ring.mesh.visible = true;
  }

  private updateRings(dt: number): void {
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      if (ring.life <= 0) {
        ring.mesh.visible = false;
        continue;
      }
      const t = 1 - ring.life / RING_LIFE;
      ring.mesh.scale.setScalar(ring.size * (0.3 + t * 0.9));
      ring.material.opacity = 0.55 * (1 - t);
    }
  }
}

/** Ease-out with a little overshoot, for pop-in. */
function backOut(t: number): number {
  const u = t - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}
