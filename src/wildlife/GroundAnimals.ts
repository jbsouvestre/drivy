import * as THREE from 'three';
import type { SpeciesId, Subject } from '../safari/species';
import type { Collider } from '../world/props';
import type { World } from '../world/World';
import { ALERT_DURATION, animateAlert, animateHold, createAlert, createNote, createWary } from './alert';
import { rareChance, updateAlert, WARY, type CarPresence } from './awareness';
import { createDeer, createFox, createHedgehog, FOX_COLORS, makeLegendary, type GroundModel } from './models';

type Kind = 'deer' | 'fox' | 'hedgehog' | 'moonFox';
/** Which behaviour/animation set an animal uses (a legendary can reuse a regular one). */
type Behaves = 'deer' | 'fox' | 'hedgehog';

interface KindDef {
  species: SpeciesId;
  behaves: Behaves;
  /** Legendaries: base chance per spawn check (scaled by difficulty) that one turns up. */
  legendaryChance?: number;
  create: () => GroundModel;
  scale: number;
  walkSpeed: number;
  fleeSpeed: number;
  /** Notice radius at full car speed (see awareness). */
  notice: number;
  groupSize: [number, number];
  maxGroups: number;
  /** Only out after dusk. */
  nocturnal: boolean;
  /** Lies down to sleep at night. */
  sleepsAtNight: boolean;
  /** Photo subject size (unscaled). */
  height: number;
  radius: number;
  /** Startled animals either run away or roll up into a ball. */
  reaction: 'flee' | 'curl';
  /** Leg swings per unit of speed. */
  gait: number;
}

const KINDS: Record<Kind, KindDef> = {
  deer: {
    species: 'deer',
    behaves: 'deer',
    create: createDeer,
    scale: 1.25,
    walkSpeed: 1.3,
    fleeSpeed: 8,
    notice: 22,
    groupSize: [2, 3],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 1.5,
    radius: 0.7,
    reaction: 'flee',
    gait: 3.4,
  },
  fox: {
    species: 'fox',
    behaves: 'fox',
    create: createFox,
    scale: 1.3,
    walkSpeed: 2,
    fleeSpeed: 6.5,
    notice: 15,
    groupSize: [1, 1],
    maxGroups: 2,
    nocturnal: false,
    sleepsAtNight: true,
    height: 0.75,
    radius: 0.45,
    reaction: 'flee',
    gait: 5,
  },
  hedgehog: {
    species: 'hedgehog',
    behaves: 'hedgehog',
    create: createHedgehog,
    scale: 1.3,
    walkSpeed: 0.6,
    fleeSpeed: 0,
    notice: 9,
    groupSize: [1, 1],
    maxGroups: 3,
    nocturnal: true,
    sleepsAtNight: false,
    height: 0.5,
    radius: 0.38,
    reaction: 'curl',
    gait: 9,
  },
  // Legendary: a glowing lilac fox that only comes out at night, and never sleeps.
  moonFox: {
    species: 'moon-fox',
    behaves: 'fox',
    legendaryChance: 0.006,
    create: () => {
      const model = createFox(FOX_COLORS.moon);
      makeLegendary(model.root, 0.45);
      return model;
    },
    scale: 1.3,
    walkSpeed: 2,
    fleeSpeed: 7,
    notice: 18,
    groupSize: [1, 1],
    maxGroups: 1,
    nocturnal: true,
    sleepsAtNight: false,
    height: 0.75,
    radius: 0.45,
    reaction: 'flee',
    gait: 5,
  },
};

/** Animals appear in this ring around the player (inside the right biome) and leave beyond DESPAWN_RADIUS. */
const SPAWN_MIN = 14;
const SPAWN_MAX = 36;
const DESPAWN_RADIUS = 55;
const SCARE_RADIUS = 18;
const CHIME_RADIUS = 22;
const CURIOUS_TIME = 4.5;
const SHOCK_TIME = 0.45;
const FLEE_TIME = 3.5;
const CURL_TIME = 4;
const APPEAR_TIME = 0.5;
const LEAVE_TIME = 0.4;
const EYE_SIZE = { deer: 0.03, fox: 0.026, hedgehog: 0.022 };

type State = 'idle' | 'walk' | 'graze' | 'sit' | 'pounce' | 'sniff' | 'sleep' | 'shock' | 'flee' | 'curl';

interface Animal {
  kind: Kind;
  def: KindDef;
  model: GroundModel;
  alert: THREE.Sprite;
  wary: THREE.Sprite;
  note: THREE.Sprite;
  pos: THREE.Vector3;
  heading: number;
  target: THREE.Vector3;
  state: State;
  stateTime: number;
  stateDuration: number;
  speed: number;
  gaitPhase: number;
  alertness: number;
  waryTime: number;
  curiousTime: number;
  alertTime: number;
  noteTime: number;
  appear: number;
  /** Seconds into leaving (shrinking away), or -1. */
  leaving: number;
  fleeDir: THREE.Vector3;
  leader: Animal | null;
  time: number;
}

const _near: Collider[] = [];

/**
 * Ground-dwelling Blossom Woods animals: deer herds that graze and bound,
 * foxes that trot, sit and pounce, and night-time hedgehogs that roll into a
 * ball when startled. All notice the car, react to the honk and the chime.
 */
export class GroundAnimals {
  readonly group = new THREE.Group();

  private readonly animals: Animal[] = [];
  private manageTimer = 0;
  private sleepy = false;

  constructor(private readonly world: World) {}

  clear(): void {
    for (const a of this.animals) this.group.remove(a.model.root);
    this.animals.length = 0;
  }

  scare(from: THREE.Vector3): void {
    for (const a of this.animals) {
      if (a.leaving >= 0 || a.appear < APPEAR_TIME) continue;
      if (Math.hypot(a.pos.x - from.x, a.pos.z - from.z) <= SCARE_RADIUS) this.startle(a, from);
    }
  }

  chime(from: THREE.Vector3): void {
    for (const a of this.animals) {
      if (a.leaving >= 0 || a.state === 'shock' || a.state === 'flee' || a.state === 'curl') continue;
      if (Math.hypot(a.pos.x - from.x, a.pos.z - from.z) > CHIME_RADIUS) continue;
      a.curiousTime = CURIOUS_TIME;
      a.noteTime = 0;
      a.alertness *= 0.3;
      if (a.state === 'sleep' || a.state === 'walk' || a.state === 'pounce') this.setState(a, 'idle', CURIOUS_TIME);
    }
  }

  collectSubjects(out: Subject[]): void {
    for (const a of this.animals) {
      if (a.appear < APPEAR_TIME || a.leaving >= 0) continue;
      const s = a.def.scale;
      out.push({
        species: a.def.species,
        position: a.model.root.position.clone().add(new THREE.Vector3(0, a.def.height * 0.5 * s, 0)),
        radius: a.def.radius * s,
        forward: new THREE.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)),
        behavior: this.behavior(a),
      });
    }
  }

  update(dt: number, focus: THREE.Vector3, darkness: number, car: CarPresence): void {
    this.sleepy = darkness > 0.75;
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 1;
      this.manage(focus, darkness);
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.leaving >= 0) {
        a.leaving += dt;
        if (a.leaving >= LEAVE_TIME) {
          this.group.remove(a.model.root);
          this.animals.splice(i, 1);
          continue;
        }
      }
      this.sense(a, dt, car);
      this.think(a, dt, focus);
      this.animate(a, dt);
    }
  }

  // ---------------------------------------------------------------- lifecycle

  private manage(focus: THREE.Vector3, darkness: number): void {
    for (const a of this.animals) {
      if (a.leaving >= 0) continue;
      const far = Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) > DESPAWN_RADIUS;
      // Night creatures slip away at dawn.
      const bedtime = a.def.nocturnal && darkness < 0.2 && a.state !== 'curl';
      if (far || bedtime) a.leaving = 0;
    }

    for (const kind of Object.keys(KINDS) as Kind[]) {
      const def = KINDS[kind];
      if (def.nocturnal && darkness < 0.4) continue;
      if (def.legendaryChance !== undefined && Math.random() > rareChance(def.legendaryChance, this.world.difficultyAt(focus.x, focus.z))) continue;
      const groups = this.animals.filter((a) => a.kind === kind && !a.leader && a.leaving < 0).length;
      if (groups >= def.maxGroups) continue;
      const spot = this.findSpot(focus);
      if (spot) this.spawnGroup(kind, spot);
    }
  }

  /** A dry, open spot deep in Blossom Woods, away from other animals. */
  private findSpot(focus: THREE.Vector3): THREE.Vector3 | null {
    for (let attempt = 0; attempt < 14; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = focus.x + Math.cos(ang) * r;
      const z = focus.z + Math.sin(ang) * r;
      if (this.world.biomeWeight(x, z, 'blossom') < 0.7) continue;
      if (!this.walkable(x, z, 1.2)) continue;
      if (this.animals.some((a) => Math.hypot(a.pos.x - x, a.pos.z - z) < 9)) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  private spawnGroup(kind: Kind, at: THREE.Vector3): void {
    const def = KINDS[kind];
    const [min, max] = def.groupSize;
    const size = min + Math.floor(Math.random() * (max - min + 1));
    const heading = Math.random() * Math.PI * 2;
    let leader: Animal | null = null;
    for (let i = 0; i < size; i++) {
      const x = at.x + (i === 0 ? 0 : (Math.random() - 0.5) * 3);
      const z = at.z + (i === 0 ? 0 : (Math.random() - 0.5) * 3);
      if (i > 0 && !this.walkable(x, z, 0.8)) continue;
      const a = this.makeAnimal(kind, x, z, heading + (Math.random() - 0.5));
      a.leader = leader;
      leader ??= a;
    }
  }

  private makeAnimal(kind: Kind, x: number, z: number, heading: number): Animal {
    const def = KINDS[kind];
    const model = def.create();
    const bubbleY = def.height + 0.45;
    const alert = createAlert(bubbleY);
    const wary = createWary(bubbleY);
    const note = createNote(bubbleY);
    model.root.add(alert, wary, note);
    model.root.scale.setScalar(0);
    this.group.add(model.root);
    const a: Animal = {
      kind,
      def,
      model,
      alert,
      wary,
      note,
      pos: new THREE.Vector3(x, this.world.heightAt(x, z), z),
      heading,
      target: new THREE.Vector3(x, 0, z),
      state: 'idle',
      stateTime: 0,
      stateDuration: 1 + Math.random() * 2,
      speed: 0,
      gaitPhase: Math.random() * 10,
      alertness: 0,
      waryTime: -1,
      curiousTime: 0,
      alertTime: ALERT_DURATION + 1,
      noteTime: ALERT_DURATION + 1,
      appear: 0,
      leaving: -1,
      fleeDir: new THREE.Vector3(),
      leader: null,
      time: Math.random() * 10,
    };
    this.animals.push(a);
    return a;
  }

  // ---------------------------------------------------------------- behaviour

  private setState(a: Animal, state: State, duration: number): void {
    a.state = state;
    a.stateTime = 0;
    a.stateDuration = duration;
  }

  /** Notice the car: wary (stop, stare, "?") when it moves close; bolt or curl up if it keeps coming. */
  private sense(a: Animal, dt: number, car: CarPresence): void {
    const busy = a.state === 'shock' || a.state === 'flee' || a.state === 'curl';
    if (busy || a.appear < APPEAR_TIME || a.leaving >= 0) {
      a.waryTime = -1;
      return;
    }
    const dist = Math.hypot(a.pos.x - car.position.x, a.pos.z - car.position.z);
    // Sleepers are harder to disturb.
    const notice = a.state === 'sleep' ? a.def.notice * 0.5 : a.def.notice;
    a.alertness = updateAlert(a.alertness, dt, dist, notice, car);
    if (a.alertness >= 1) {
      // The whole group goes when one of them does.
      const root = a.leader ?? a;
      for (const other of this.animals) if (other === root || other.leader === root) this.startle(other, car.position);
      return;
    }
    a.waryTime = a.alertness > WARY && a.state !== 'sleep' ? (a.waryTime < 0 ? 0 : a.waryTime + dt) : -1;
  }

  private startle(a: Animal, from: THREE.Vector3): void {
    a.alertness = 0;
    a.curiousTime = 0;
    a.waryTime = -1;
    a.alertTime = -Math.random() * 0.12;
    a.fleeDir.set(a.pos.x - from.x, 0, a.pos.z - from.z).normalize();
    // A little randomness so a herd fans out as it flees.
    a.fleeDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.8);
    if (a.def.reaction === 'curl') this.setState(a, 'curl', CURL_TIME);
    else this.setState(a, 'shock', SHOCK_TIME);
  }

  /** Decide what to do and move. */
  private think(a: Animal, dt: number, focus: THREE.Vector3): void {
    a.time += dt;
    a.stateTime += dt;
    a.curiousTime = Math.max(0, a.curiousTime - dt);
    const towardCar = Math.atan2(focus.x - a.pos.x, focus.z - a.pos.z);
    const carDist = Math.hypot(focus.x - a.pos.x, focus.z - a.pos.z);
    let speed = 0;
    let desired = a.heading;

    switch (a.state) {
      case 'shock':
        desired = towardCar;
        if (a.stateTime >= a.stateDuration) this.setState(a, 'flee', FLEE_TIME);
        break;
      case 'flee':
        desired = Math.atan2(a.fleeDir.x, a.fleeDir.z);
        speed = a.def.fleeSpeed * (1 - 0.5 * (a.stateTime / a.stateDuration));
        if (a.stateTime >= a.stateDuration) this.setState(a, 'idle', 1.5);
        break;
      case 'curl':
        if (a.stateTime >= a.stateDuration) this.setState(a, 'sniff', 1.5);
        break;
      case 'walk':
        desired = Math.atan2(a.target.x - a.pos.x, a.target.z - a.pos.z);
        speed = a.def.walkSpeed;
        if (Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 0.6 || a.stateTime > a.stateDuration) this.setState(a, 'idle', 0.5);
        break;
      case 'pounce': {
        // Crouch, spring forward, land.
        if (a.stateTime > 0.5 && a.stateTime < 0.9) speed = 3;
        if (a.stateTime >= a.stateDuration) this.setState(a, 'sniff', 1.2);
        break;
      }
      default:
        if (a.stateTime >= a.stateDuration) this.decide(a);
    }

    // Night: diurnal animals settle down to sleep.
    if (this.sleepy && a.def.sleepsAtNight && a.curiousTime <= 0 && (a.state === 'idle' || a.state === 'graze' || a.state === 'sit')) {
      this.setState(a, 'sleep', 999);
    }
    if (a.state === 'sleep' && !this.sleepy) this.setState(a, 'idle', 1);

    // Wary or curious: stop and look at the car. Curious hedgehogs trundle closer.
    if (a.waryTime >= 0 || a.curiousTime > 0) {
      desired = towardCar;
      speed = a.curiousTime > 0 && a.def.behaves === 'hedgehog' && carDist > 3.5 ? a.def.walkSpeed : 0;
    }

    this.steer(a, desired, speed, dt, a.state === 'flee' ? 6 : 3);
  }

  /** Pick the next idle activity (followers keep close to their leader). */
  private decide(a: Animal): void {
    const leader = a.leader;
    if (leader && Math.hypot(leader.pos.x - a.pos.x, leader.pos.z - a.pos.z) > 4) {
      a.target.set(leader.pos.x + (Math.random() - 0.5) * 2.5, 0, leader.pos.z + (Math.random() - 0.5) * 2.5);
      this.setState(a, 'walk', 8);
      return;
    }
    const r = Math.random();
    switch (a.def.behaves) {
      case 'deer':
        if (r < 0.55) this.setState(a, 'graze', 4 + Math.random() * 4);
        else if (r < 0.9 && this.pickTarget(a, 8)) this.setState(a, 'walk', 8);
        else this.setState(a, 'idle', 2 + Math.random());
        break;
      case 'fox':
        if (r < 0.4 && this.pickTarget(a, 10)) this.setState(a, 'walk', 8);
        else if (r < 0.65) this.setState(a, 'sit', 3 + Math.random() * 3);
        else if (r < 0.85) this.setState(a, 'pounce', 1.3);
        else this.setState(a, 'sniff', 2);
        break;
      case 'hedgehog':
        if (r < 0.55 && this.pickTarget(a, 5)) this.setState(a, 'walk', 8);
        else this.setState(a, 'sniff', 2 + Math.random() * 2);
        break;
    }
  }

  /** A walkable wander target within `range`, staying in the woods. */
  private pickTarget(a: Animal, range: number): boolean {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * (range - 2);
      const x = a.pos.x + Math.cos(ang) * r;
      const z = a.pos.z + Math.sin(ang) * r;
      if (this.world.biomeWeight(x, z, 'blossom') > 0.4 && this.walkable(x, z, 0.8)) {
        a.target.set(x, 0, z);
        return true;
      }
    }
    return false;
  }

  /** Dry ground with no tree or stone in the way. */
  private walkable(x: number, z: number, clearance: number): boolean {
    if (this.world.heightAt(x, z) < this.world.waterLevel + 0.2) return false;
    this.world.collidersNear(x, z, clearance + 1.5, _near);
    return _near.every((c) => Math.hypot(c.x - x, c.z - z) > c.radius + clearance);
  }

  /** Turn toward `desired` and move, veering around obstacles; stop if boxed in. */
  private steer(a: Animal, desired: number, speed: number, dt: number, turnRate: number): void {
    const diff = Math.atan2(Math.sin(desired - a.heading), Math.cos(desired - a.heading));
    a.heading += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    a.speed += (speed - a.speed) * Math.min(1, 6 * dt);
    if (a.speed < 0.02) return;
    const clearance = a.def.radius * a.def.scale * 0.6;
    for (const veer of [0, 0.6, -0.6, 1.2, -1.2, 2.2, -2.2]) {
      const h = a.heading + veer;
      const nx = a.pos.x + Math.sin(h) * a.speed * dt;
      const nz = a.pos.z + Math.cos(h) * a.speed * dt;
      if (this.walkable(nx, nz, clearance)) {
        a.pos.x = nx;
        a.pos.z = nz;
        a.heading += veer * 0.12;
        return;
      }
    }
    a.speed = 0;
  }

  private behavior(a: Animal): string {
    if (a.state === 'shock') return 'startled';
    if (a.def.behaves === 'hedgehog') {
      if (a.state === 'curl') return 'curled';
      if (a.curiousTime > 0) return 'curious';
      return a.state === 'sniff' ? 'sniffing' : 'shuffling';
    }
    if (a.state === 'flee') return a.def.behaves === 'deer' ? 'bounding' : 'startled';
    if (a.curiousTime > 0) return 'curious';
    if (a.state === 'sleep') return 'sleeping';
    if (a.def.behaves === 'deer') return a.state === 'walk' ? 'walking' : 'grazing';
    if (a.state === 'sit') return 'sitting';
    if (a.state === 'pounce') return 'pouncing';
    return 'trotting';
  }

  // ---------------------------------------------------------------- animation

  private animate(a: Animal, dt: number): void {
    const { root, body, head, neck, tail, legs, eyes } = a.model;
    const s = a.def.scale;

    // Scale: pop in, shrink away when leaving.
    a.appear = Math.min(APPEAR_TIME, a.appear + dt);
    const t = a.appear / APPEAR_TIME - 1;
    let scale = s * (1 + 2.7 * t * t * t + 1.7 * t * t);
    if (a.leaving >= 0) scale = s * Math.max(0, 1 - a.leaving / LEAVE_TIME);
    root.scale.setScalar(scale);

    // Walk cycle.
    a.gaitPhase += a.speed * a.def.gait * dt;
    const swing = Math.sin(a.gaitPhase) * Math.min(0.65, a.speed * 0.35);
    let hop = 0;
    if (a.state === 'flee' && a.def.behaves === 'deer') hop = Math.abs(Math.sin(a.gaitPhase * 0.5)) * 0.55; // bounding leaps
    if (a.state === 'shock') hop = Math.sin(Math.PI * Math.min(1, a.stateTime / 0.3)) * 0.35;
    if (a.state === 'pounce' && a.stateTime > 0.5 && a.stateTime < 0.9) hop = Math.sin(((a.stateTime - 0.5) / 0.4) * Math.PI) * 0.5;

    a.pos.y = this.world.heightAt(a.pos.x, a.pos.z);
    root.position.set(a.pos.x, a.pos.y + hop * s, a.pos.z);
    root.rotation.y = a.heading;

    // Reset pose, then layer on the current state.
    body.rotation.set(0, 0, 0);
    body.position.y = a.def.behaves === 'hedgehog' ? 0.22 : 0;
    body.scale.set(1, 1, 1);
    head.rotation.set(0, 0, 0);
    head.scale.setScalar(1);
    tail.rotation.set(0, 0, 0);
    legs.forEach((leg, i) => {
      leg.rotation.set((i === 0 || i === 3 ? 1 : -1) * swing, 0, 0);
      leg.scale.setScalar(1);
    });
    let neckDip = a.def.behaves === 'deer' ? -0.1 : 0;

    switch (a.state) {
      case 'graze':
        neckDip = 1.25;
        head.rotation.x = Math.sin(a.time * 7) * 0.08; // munching
        break;
      case 'walk':
        neckDip = 0.15;
        tail.rotation.y = Math.sin(a.time * 4) * 0.25;
        break;
      case 'sit':
        body.rotation.x = -0.5;
        body.position.y = -0.07;
        legs[2].rotation.x = legs[3].rotation.x = -1.2;
        tail.rotation.y = 1.1;
        break;
      case 'pounce':
        if (a.stateTime < 0.5) {
          body.rotation.x = 0.2; // crouch, bum wiggle
          body.position.y = -0.06;
          tail.rotation.y = Math.sin(a.time * 25) * 0.3;
        } else body.rotation.x = -0.3 * Math.sin(((a.stateTime - 0.5) / 0.8) * Math.PI);
        break;
      case 'sniff':
        head.rotation.x = 0.3 + Math.sin(a.time * 18) * 0.06;
        break;
      case 'sleep':
        // Lie down: legs tucked under, head resting.
        body.position.y = a.def.behaves === 'deer' ? -0.62 : -0.24;
        legs.forEach((leg, i) => {
          // Front legs fold back, hind legs fold forward: tucked under the body.
          leg.rotation.x = i < 2 ? 1.45 : -1.45;
          leg.scale.setScalar(0.6);
        });
        neckDip = 0.75;
        head.rotation.x = 0.3;
        tail.rotation.y = a.def.behaves === 'fox' ? 2.2 : 0;
        body.scale.y = 1 + Math.sin(a.time * 1.3) * 0.03; // slow breathing
        break;
      case 'curl':
        // Roll into a spiky ball: head and feet tucked away, a nervous little tremble.
        body.scale.set(1.05, 1.2, 0.85);
        body.rotation.x = 0.3;
        head.scale.setScalar(0.01);
        for (const leg of legs) leg.scale.setScalar(0.01);
        body.position.y = 0.2 + Math.sin(a.time * 40) * 0.008;
        break;
      case 'flee':
        neckDip = -0.2;
        body.rotation.x = a.def.behaves === 'deer' ? -Math.cos(a.gaitPhase * 0.5) * 0.25 : 0;
        break;
    }

    // Curious: head up and tilted, ears perked.
    if (a.curiousTime > 0 && a.state !== 'sleep') {
      neckDip = -0.2;
      head.rotation.z = 0.3 + Math.sin(a.time * 2) * 0.08;
      if (a.def.behaves === 'fox') {
        body.rotation.x = -0.5;
        body.position.y = -0.07;
        legs[2].rotation.x = legs[3].rotation.x = -1.2;
      }
    }
    if (a.waryTime >= 0) {
      neckDip = -0.25;
      head.rotation.set(-0.1, 0, 0);
    }
    if (neck) neck.rotation.x += (neckDip - neck.rotation.x) * Math.min(1, 6 * dt);

    const wide = a.state === 'shock' || a.state === 'flee' ? 1.7 : a.curiousTime > 0 ? 1.3 : 1;
    for (const eye of eyes) eye.scale.setScalar(EYE_SIZE[a.def.behaves] * wide);

    // Bubbles.
    a.alertTime += dt;
    a.noteTime += dt;
    const bubble = 0.45 / s;
    animateAlert(a.alert, a.alertTime, bubble);
    animateAlert(a.note, a.noteTime, bubble, 1.2);
    animateHold(a.wary, a.waryTime, bubble);
  }
}
