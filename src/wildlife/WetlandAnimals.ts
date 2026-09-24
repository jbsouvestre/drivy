import * as THREE from 'three';
import { playRibbit } from '../game/audio';
import type { Splashes } from '../game/Splashes';
import type { SpeciesId, Subject } from '../safari/species';
import type { Prop } from '../world/props';
import type { World } from '../world/World';
import { ALERT_DURATION, animateAlert, animateHold, createAlert, createNote, createWary } from './alert';
import { rareChance, updateAlert, WARY, type CarPresence } from './awareness';
import {
  createFrog,
  createHeron,
  createTurtle,
  FROG_COLORS,
  makeLegendary,
  type FrogModel,
  type HeronModel,
  type TurtleModel,
} from './models';

type Kind = 'frog' | 'heron' | 'turtle';

interface KindDef {
  max: number;
  scale: number;
  /** Notice radius at full car speed (see awareness). */
  notice: number;
  /** Photo subject size (unscaled). */
  height: number;
  radius: number;
}

const KINDS: Record<Kind, KindDef> = {
  frog: { max: 6, scale: 1.4, notice: 10, height: 0.36, radius: 0.3 },
  heron: { max: 2, scale: 1.2, notice: 24, height: 1.8, radius: 0.7 },
  turtle: { max: 3, scale: 1.3, notice: 12, height: 0.25, radius: 0.42 },
};

const SPAWN_MIN = 10;
const SPAWN_MAX = 34;
const DESPAWN_RADIUS = 55;
const SCARE_RADIUS = 18;
const CHIME_RADIUS = 22;
const CURIOUS_TIME = 4.5;
const APPEAR_TIME = 0.5;
const LEAVE_TIME = 0.5;
const HOP_TIME = 0.45;
const CROAK_TIME = 0.9;
const RIBBIT_RANGE = 30;
const RIBBIT_VOLUME = 0.08;
/** Base chance (before difficulty scaling) that a new frog is the legendary golden one. */
const GOLDEN_FROG_CHANCE = 0.06;

type State = 'sit' | 'hop' | 'leap' | 'dive' | 'stand' | 'wade' | 'fish' | 'shock' | 'fly' | 'swim' | 'float' | 'hide';

type Model = { kind: 'frog'; m: FrogModel } | { kind: 'heron'; m: HeronModel } | { kind: 'turtle'; m: TurtleModel };

interface Animal {
  kind: Kind;
  def: KindDef;
  species: SpeciesId;
  model: Model;
  root: THREE.Group;
  alert: THREE.Sprite;
  wary: THREE.Sprite;
  note: THREE.Sprite;
  pos: THREE.Vector3;
  heading: number;
  state: State;
  stateTime: number;
  stateDuration: number;
  target: THREE.Vector3;
  speed: number;
  /** Frog seat (lily pad), if sitting on one. */
  pad: Prop | null;
  hopFrom: THREE.Vector3;
  hopTo: THREE.Vector3;
  alertness: number;
  waryTime: number;
  curiousTime: number;
  alertTime: number;
  noteTime: number;
  croakTime: number;
  croakTimer: number;
  oneLeg: boolean;
  appear: number;
  leaving: number;
  flyDir: THREE.Vector3;
  time: number;
}

const _pads: Prop[] = [];
/** States where an animal is mid-action and ignores the car and the chime. */
const BUSY_STATES = new Set<State>(['hop', 'leap', 'dive', 'shock', 'fly', 'hide']);

/**
 * Lily Wetlands wildlife: frogs on lily pads and shores, herons wading and
 * fishing in the shallows, and turtles paddling across the lakes.
 */
export class WetlandAnimals {
  readonly group = new THREE.Group();

  private readonly animals: Animal[] = [];
  private manageTimer = 0;
  private focus = new THREE.Vector3();
  /** 0 clear → 1 shower: frogs come out and sing in the rain. */
  private rain = 0;

  constructor(
    private readonly world: World,
    private readonly splashes: Splashes,
  ) {}

  clear(): void {
    for (const a of this.animals) this.group.remove(a.root);
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
      if (a.leaving >= 0 || this.busy(a)) continue;
      if (Math.hypot(a.pos.x - from.x, a.pos.z - from.z) > CHIME_RADIUS) continue;
      a.curiousTime = CURIOUS_TIME;
      a.noteTime = 0;
      a.alertness *= 0.3;
      if (a.kind === 'frog') this.croak(a);
    }
  }

  collectSubjects(out: Subject[]): void {
    for (const a of this.animals) {
      if (a.appear < APPEAR_TIME || a.leaving >= 0 || a.state === 'dive') continue;
      const s = a.def.scale;
      out.push({
        species: a.species,
        position: a.root.position.clone().add(new THREE.Vector3(0, a.def.height * 0.5 * s, 0)),
        radius: a.def.radius * s,
        forward: new THREE.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)),
        behavior: this.behavior(a),
      });
    }
  }

  update(dt: number, focus: THREE.Vector3, car: CarPresence, rain = 0): void {
    this.focus.copy(focus);
    this.rain = rain;
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 1;
      this.manage(focus);
    }
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (a.leaving >= 0) {
        a.leaving += dt;
        if (a.leaving >= LEAVE_TIME) {
          this.group.remove(a.root);
          this.animals.splice(i, 1);
          continue;
        }
      }
      this.sense(a, dt, car);
      this.think(a, dt, focus);
      this.animate(a, dt);
    }
  }

  // ---------------------------------------------------------------- habitat

  private depth(x: number, z: number): number {
    return this.world.waterLevel - this.world.heightAt(x, z);
  }

  private inWetlands(x: number, z: number): boolean {
    return this.world.biomeWeight(x, z, 'wetlands') > 0.6;
  }

  private occupied(pad: Prop): boolean {
    return this.animals.some((a) => a.pad === pad);
  }

  /** A dry spot right at the water's edge. */
  private isShore(x: number, z: number): boolean {
    const d = this.depth(x, z);
    if (d > -0.05 || d < -0.6) return false;
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2;
      if (this.depth(x + Math.cos(ang) * 1.6, z + Math.sin(ang) * 1.6) > 0.1) return true;
    }
    return false;
  }

  private randomPoint(focus: THREE.Vector3, min: number, max: number): THREE.Vector3 {
    const ang = Math.random() * Math.PI * 2;
    const r = min + Math.random() * (max - min);
    return new THREE.Vector3(focus.x + Math.cos(ang) * r, 0, focus.z + Math.sin(ang) * r);
  }

  // ---------------------------------------------------------------- lifecycle

  private manage(focus: THREE.Vector3): void {
    for (const a of this.animals) {
      if (a.leaving < 0 && Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z) > DESPAWN_RADIUS) a.leaving = 0;
    }
    if (!this.inWetlands(focus.x, focus.z) && this.world.biomeWeight(focus.x, focus.z, 'wetlands') < 0.2) return;

    for (const kind of Object.keys(KINDS) as Kind[]) {
      const count = this.animals.filter((a) => a.kind === kind && a.leaving < 0).length;
      const max = KINDS[kind].max + (kind === 'frog' ? Math.round(this.rain * 5) : 0);
      if (count >= max) continue;
      if (kind === 'frog') this.spawnFrog(focus);
      else if (kind === 'heron') this.spawnIn(kind, focus, 0.1, 0.5);
      else this.spawnIn(kind, focus, 0.7, 99);
    }
  }

  private spawnFrog(focus: THREE.Vector3): void {
    // Prefer an empty lily pad; otherwise a spot on the shore.
    this.world.padsNear(focus.x, focus.z, SPAWN_MAX, _pads);
    const pads = _pads.filter(
      (p) => Math.hypot(p.x - focus.x, p.z - focus.z) >= SPAWN_MIN && this.inWetlands(p.x, p.z) && !this.occupied(p),
    );
    if (pads.length > 0 && Math.random() < 0.65) {
      const pad = pads[Math.floor(Math.random() * pads.length)];
      const a = this.make('frog', pad.x, pad.z);
      a.pad = pad;
      return;
    }
    for (let i = 0; i < 12; i++) {
      const p = this.randomPoint(focus, SPAWN_MIN, SPAWN_MAX);
      if (this.inWetlands(p.x, p.z) && this.isShore(p.x, p.z)) {
        this.make('frog', p.x, p.z);
        return;
      }
    }
  }

  /** Spawn where the water depth is within [minDepth, maxDepth]. */
  private spawnIn(kind: Kind, focus: THREE.Vector3, minDepth: number, maxDepth: number): void {
    for (let i = 0; i < 14; i++) {
      const p = this.randomPoint(focus, SPAWN_MIN, SPAWN_MAX);
      const d = this.depth(p.x, p.z);
      if (d < minDepth || d > maxDepth || !this.inWetlands(p.x, p.z)) continue;
      if (this.animals.some((a) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) < 6)) continue;
      this.make(kind, p.x, p.z);
      return;
    }
  }

  private make(kind: Kind, x: number, z: number): Animal {
    const def = KINDS[kind];
    let model: Model;
    let species: SpeciesId = kind;
    if (kind === 'frog') {
      const golden = Math.random() < rareChance(GOLDEN_FROG_CHANCE, this.world.difficultyAt(x, z));
      model = { kind, m: createFrog(golden ? FROG_COLORS.golden : FROG_COLORS.green) };
      if (golden) {
        species = 'golden-frog';
        makeLegendary(model.m.root);
      }
    } else if (kind === 'heron') model = { kind, m: createHeron() };
    else model = { kind, m: createTurtle() };

    const root = model.m.root;
    const bubbleY = def.height + 0.45;
    const alert = createAlert(bubbleY);
    const wary = createWary(bubbleY);
    const note = createNote(bubbleY);
    root.add(alert, wary, note);
    root.scale.setScalar(0);
    this.group.add(root);
    const initial: State = kind === 'frog' ? 'sit' : kind === 'heron' ? 'stand' : 'float';
    const a: Animal = {
      kind,
      def,
      species,
      model,
      root,
      alert,
      wary,
      note,
      pos: new THREE.Vector3(x, 0, z),
      heading: Math.random() * Math.PI * 2,
      state: initial,
      stateTime: 0,
      stateDuration: 1 + Math.random() * 3,
      target: new THREE.Vector3(x, 0, z),
      speed: 0,
      pad: null,
      hopFrom: new THREE.Vector3(),
      hopTo: new THREE.Vector3(),
      alertness: 0,
      waryTime: -1,
      curiousTime: 0,
      alertTime: ALERT_DURATION + 1,
      noteTime: ALERT_DURATION + 1,
      croakTime: CROAK_TIME,
      croakTimer: 3 + Math.random() * 8,
      oneLeg: false,
      appear: 0,
      leaving: -1,
      flyDir: new THREE.Vector3(),
      time: Math.random() * 10,
    };
    this.animals.push(a);
    return a;
  }

  // ---------------------------------------------------------------- behaviour

  private busy(a: Animal): boolean {
    return BUSY_STATES.has(a.state);
  }

  private setState(a: Animal, state: State, duration: number): void {
    a.state = state;
    a.stateTime = 0;
    a.stateDuration = duration;
  }

  private sense(a: Animal, dt: number, car: CarPresence): void {
    if (this.busy(a) || a.appear < APPEAR_TIME || a.leaving >= 0) {
      a.waryTime = -1;
      return;
    }
    const dist = Math.hypot(a.pos.x - car.position.x, a.pos.z - car.position.z);
    a.alertness = updateAlert(a.alertness, dt, dist, a.def.notice, car);
    if (a.alertness >= 1) {
      this.startle(a, car.position);
      return;
    }
    a.waryTime = a.alertness > WARY ? (a.waryTime < 0 ? 0 : a.waryTime + dt) : -1;
  }

  private startle(a: Animal, from: THREE.Vector3): void {
    a.alertness = 0;
    a.curiousTime = 0;
    a.waryTime = -1;
    a.alertTime = -Math.random() * 0.12;
    a.flyDir.set(a.pos.x - from.x, 0, a.pos.z - from.z).normalize();
    if (a.kind === 'frog') {
      // Leap for the water: off the lily pad, or from the shore toward the lake.
      a.hopFrom.copy(a.pos);
      let to = a.pos.clone().addScaledVector(a.flyDir, 2.2);
      for (let k = 0; k < 8 && this.depth(to.x, to.z) < 0.1; k++) {
        const ang = (k / 8) * Math.PI * 2;
        to = a.pos.clone().add(new THREE.Vector3(Math.cos(ang) * 2.2, 0, Math.sin(ang) * 2.2));
      }
      a.hopTo.copy(to);
      a.pad = null;
      a.heading = Math.atan2(to.x - a.pos.x, to.z - a.pos.z);
      this.setState(a, 'leap', HOP_TIME * 1.2);
    } else if (a.kind === 'heron') {
      this.setState(a, 'shock', 0.45);
    } else {
      this.setState(a, 'hide', 4);
    }
  }

  private croak(a: Animal): void {
    a.croakTime = 0;
    const d = Math.hypot(a.pos.x - this.focus.x, a.pos.z - this.focus.z);
    playRibbit(RIBBIT_VOLUME * Math.max(0, 1 - d / RIBBIT_RANGE));
  }

  private think(a: Animal, dt: number, focus: THREE.Vector3): void {
    a.time += dt;
    a.stateTime += dt;
    a.curiousTime = Math.max(0, a.curiousTime - dt);
    a.croakTime += dt;
    const towardCar = Math.atan2(focus.x - a.pos.x, focus.z - a.pos.z);
    const carDist = Math.hypot(focus.x - a.pos.x, focus.z - a.pos.z);
    const watching = a.waryTime >= 0 || a.curiousTime > 0;

    if (a.kind === 'frog') this.thinkFrog(a, dt, towardCar, watching);
    else if (a.kind === 'heron') this.thinkHeron(a, dt, towardCar, watching);
    else this.thinkTurtle(a, dt, towardCar, carDist, watching);
  }

  private thinkFrog(a: Animal, dt: number, towardCar: number, watching: boolean): void {
    switch (a.state) {
      case 'hop':
      case 'leap': {
        const t = Math.min(1, a.stateTime / a.stateDuration);
        a.pos.lerpVectors(a.hopFrom, a.hopTo, t);
        if (t >= 1) {
          if (a.state === 'leap' && this.depth(a.pos.x, a.pos.z) > 0.1) {
            this.splashes.burst(a.pos.x, a.pos.z, 10, 0.9);
            this.setState(a, 'dive', 0.45);
          } else this.setState(a, 'sit', 2 + Math.random() * 3);
        }
        return;
      }
      case 'dive':
        if (a.stateTime >= a.stateDuration && a.leaving < 0) a.leaving = LEAVE_TIME; // gone under
        return;
    }
    if (watching) {
      a.heading = turn(a.heading, towardCar, 5 * dt);
      return;
    }
    a.croakTimer -= dt;
    if (a.croakTimer <= 0) {
      // A rain chorus: much chattier in a shower.
      a.croakTimer = (5 + Math.random() * 10) * (1 - 0.7 * this.rain);
      this.croak(a);
    }
    if (a.stateTime >= a.stateDuration) {
      a.stateTime = 0;
      a.stateDuration = 3 + Math.random() * 4;
      if (Math.random() < 0.4) this.hopSomewhere(a);
      else a.heading += (Math.random() - 0.5) * 1.5;
    }
  }

  /** Hop to a nearby free lily pad or shore spot. */
  private hopSomewhere(a: Animal): void {
    this.world.padsNear(a.pos.x, a.pos.z, 3.5, _pads);
    const pads = _pads.filter((p) => p !== a.pad && !this.occupied(p));
    let to: THREE.Vector3 | null = null;
    let pad: Prop | null = null;
    if (pads.length > 0) {
      pad = pads[Math.floor(Math.random() * pads.length)];
      to = new THREE.Vector3(pad.x, 0, pad.z);
    } else {
      for (let i = 0; i < 6 && !to; i++) {
        const ang = Math.random() * Math.PI * 2;
        const x = a.pos.x + Math.cos(ang) * (1 + Math.random() * 1.5);
        const z = a.pos.z + Math.sin(ang) * (1 + Math.random() * 1.5);
        if (this.isShore(x, z)) to = new THREE.Vector3(x, 0, z);
      }
    }
    if (!to) return;
    a.hopFrom.copy(a.pos);
    a.hopTo.copy(to);
    a.pad = pad;
    a.heading = Math.atan2(to.x - a.pos.x, to.z - a.pos.z);
    this.setState(a, 'hop', HOP_TIME);
  }

  private thinkHeron(a: Animal, dt: number, towardCar: number, watching: boolean): void {
    switch (a.state) {
      case 'shock':
        a.heading = turn(a.heading, Math.atan2(a.flyDir.x, a.flyDir.z), 6 * dt);
        if (a.stateTime >= a.stateDuration) this.setState(a, 'fly', 6);
        return;
      case 'fly': {
        const t = a.stateTime;
        const speed = Math.min(7, 2 + t * 2.5);
        a.pos.x += a.flyDir.x * speed * dt;
        a.pos.z += a.flyDir.z * speed * dt;
        if (t > a.stateDuration - LEAVE_TIME && a.leaving < 0) a.leaving = 0;
        return;
      }
      case 'fish':
        if (a.stateTime > 0.95 && a.stateTime - dt <= 0.95) this.splashes.burst(a.pos.x + Math.sin(a.heading) * 1.1, a.pos.z + Math.cos(a.heading) * 1.1, 4, 0.5);
        if (a.stateTime >= a.stateDuration) this.setState(a, 'stand', 2 + Math.random() * 3);
        return;
      case 'wade': {
        const desired = Math.atan2(a.target.x - a.pos.x, a.target.z - a.pos.z);
        a.heading = turn(a.heading, desired, 1.5 * dt);
        const nx = a.pos.x + Math.sin(a.heading) * 0.5 * dt;
        const nz = a.pos.z + Math.cos(a.heading) * 0.5 * dt;
        const d = this.depth(nx, nz);
        if (d > 0.02 && d < 0.6) {
          a.pos.x = nx;
          a.pos.z = nz;
          a.speed = 0.5;
        } else a.stateTime = a.stateDuration;
        if (Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 0.4 || a.stateTime >= a.stateDuration) {
          a.speed = 0;
          this.setState(a, 'stand', 2 + Math.random() * 3);
        }
        return;
      }
    }
    if (watching) {
      a.oneLeg = false;
      a.heading = turn(a.heading, towardCar, 3 * dt);
      return;
    }
    if (a.stateTime >= a.stateDuration) {
      const r = Math.random();
      a.oneLeg = false;
      if (r < 0.35) this.setState(a, 'fish', 1.4);
      else if (r < 0.65 && this.pickShallow(a)) this.setState(a, 'wade', 8);
      else {
        a.oneLeg = Math.random() < 0.5;
        this.setState(a, 'stand', 3 + Math.random() * 4);
      }
    }
  }

  private pickShallow(a: Animal): boolean {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 3.5;
      const x = a.pos.x + Math.cos(ang) * r;
      const z = a.pos.z + Math.sin(ang) * r;
      const d = this.depth(x, z);
      if (d > 0.08 && d < 0.5) {
        a.target.set(x, 0, z);
        return true;
      }
    }
    return false;
  }

  private thinkTurtle(a: Animal, dt: number, towardCar: number, carDist: number, watching: boolean): void {
    if (a.state === 'hide') {
      if (a.stateTime >= a.stateDuration) this.setState(a, 'float', 2);
      return;
    }
    let desired = a.heading;
    let speed = 0;
    if (a.curiousTime > 0) {
      // Paddle over for a look.
      desired = towardCar;
      speed = carDist > 4 ? 0.6 : 0;
    } else if (watching) {
      desired = towardCar;
    } else if (a.state === 'swim') {
      desired = Math.atan2(a.target.x - a.pos.x, a.target.z - a.pos.z);
      speed = 0.55;
      if (Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z) < 0.6 || a.stateTime >= a.stateDuration) this.setState(a, 'float', 3 + Math.random() * 4);
    } else if (a.stateTime >= a.stateDuration) {
      // Pick somewhere to paddle to in open water.
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * 5;
        const x = a.pos.x + Math.cos(ang) * r;
        const z = a.pos.z + Math.sin(ang) * r;
        if (this.depth(x, z) > 0.6) {
          a.target.set(x, 0, z);
          this.setState(a, 'swim', 12);
          break;
        }
      }
      if ((a.state as State) !== 'swim') a.stateTime = 0; // nowhere to go: try again later
    }
    a.heading = turn(a.heading, desired, 1.8 * dt);
    a.speed += (speed - a.speed) * Math.min(1, 3 * dt);
    if (a.speed > 0.02) {
      const nx = a.pos.x + Math.sin(a.heading) * a.speed * dt;
      const nz = a.pos.z + Math.cos(a.heading) * a.speed * dt;
      if (this.depth(nx, nz) > 0.5) {
        a.pos.x = nx;
        a.pos.z = nz;
      } else if (a.state === 'swim') this.setState(a, 'float', 2);
    }
  }

  private behavior(a: Animal): string {
    if (a.kind === 'frog') {
      if (a.state === 'leap' || a.state === 'dive') return 'startled';
      if (a.state === 'hop') return 'hopping';
      if (a.curiousTime > 0) return 'curious';
      return a.croakTime < CROAK_TIME ? 'croaking' : 'sitting';
    }
    if (a.kind === 'heron') {
      if (a.state === 'fly' || a.state === 'shock') return 'flying';
      if (a.curiousTime > 0) return 'curious';
      if (a.state === 'fish') return 'fishing';
      if (a.state === 'wade') return 'wading';
      return a.oneLeg ? 'one-leg' : 'standing';
    }
    if (a.state === 'hide') return 'hiding';
    if (a.curiousTime > 0) return 'curious';
    return a.state === 'swim' ? 'swimming' : 'sunbathing';
  }

  // ---------------------------------------------------------------- animation

  private animate(a: Animal, dt: number): void {
    const s = a.def.scale;
    a.appear = Math.min(APPEAR_TIME, a.appear + dt);
    const u = a.appear / APPEAR_TIME - 1;
    let scale = s * (1 + 2.7 * u * u * u + 1.7 * u * u);
    if (a.leaving >= 0) scale = s * Math.max(0, 1 - a.leaving / LEAVE_TIME);
    a.root.scale.setScalar(scale);
    a.root.rotation.y = a.heading;

    const water = this.world.waterLevel;
    const wide = a.state === 'shock' || a.state === 'leap' ? 1.6 : a.curiousTime > 0 ? 1.25 : 1;

    if (a.model.kind === 'frog') {
      const m = a.model.m;
      let y = a.pad ? water + 0.035 : Math.max(this.world.heightAt(a.pos.x, a.pos.z), water);
      let stretch = 0;
      if (a.state === 'hop' || a.state === 'leap') {
        const t = Math.min(1, a.stateTime / a.stateDuration);
        y += Math.sin(Math.PI * t) * (a.state === 'leap' ? 0.8 : 0.5);
        stretch = Math.sin(Math.PI * t);
      }
      if (a.state === 'dive') y = water - (a.stateTime / a.stateDuration) * 0.5;
      a.root.position.set(a.pos.x, y, a.pos.z);
      m.body.scale.set(1 - stretch * 0.1, 1 + stretch * 0.15, 1 + stretch * 0.25);
      for (const leg of m.legs) leg.rotation.x = -stretch * 1.1;
      // Croak: the throat balloons in three quick puffs.
      const c = a.croakTime < CROAK_TIME ? Math.max(0, Math.sin((a.croakTime / CROAK_TIME) * Math.PI * 3)) : 0;
      m.throat.scale.set(0.08 * (1 + c * 1.2), 0.06 * (1 + c * 1.1), 0.05 * (1 + c * 1.4));
      const blink = (a.time % 4.3) < 0.12 ? 0.15 : 1;
      for (const eye of m.eyes) eye.scale.set(wide, wide * blink, wide);
    } else if (a.model.kind === 'heron') {
      const m = a.model.m;
      let y = this.world.heightAt(a.pos.x, a.pos.z);
      let neckDip = 0;
      if (a.state === 'fly') {
        y += Math.min(9, a.stateTime * 2.4);
        const flap = Math.sin(a.stateTime * 6) * 0.7;
        m.wings.forEach((w, i) => {
          w.visible = true;
          w.scale.setScalar(1);
          w.rotation.z = (i === 0 ? -1 : 1) * flap;
        });
        for (const leg of m.legs) leg.rotation.x = -1.3; // legs trail behind
        m.body.rotation.x = 0.25;
      } else {
        // Folded wings are hidden outright rather than drawn at a tiny scale.
        m.wings.forEach((w) => {
          w.visible = a.state === 'shock';
          w.scale.setScalar(0.6);
        });
        m.body.rotation.x = 0;
        m.legs[0].rotation.x = a.speed > 0.1 ? Math.sin(a.time * 3) * 0.4 : 0;
        m.legs[1].rotation.x = a.oneLeg ? -1.6 : a.speed > 0.1 ? -Math.sin(a.time * 3) * 0.4 : 0;
        m.legs[1].scale.y = a.oneLeg ? 0.55 : 1;
      }
      if (a.state === 'fish') {
        // Slowly lean in… then strike.
        const t = a.stateTime;
        neckDip = t < 0.8 ? (t / 0.8) * 0.55 : t < 1.0 ? 0.55 + ((t - 0.8) / 0.2) * 0.8 : Math.max(0, 1.35 - ((t - 1.0) / 0.4) * 1.35);
      }
      if (a.waryTime >= 0) neckDip = -0.15;
      m.neck.rotation.x = neckDip;
      m.head.rotation.z = a.curiousTime > 0 ? 0.35 : 0;
      a.root.position.set(a.pos.x, y, a.pos.z);
      for (const eye of m.eyes) eye.scale.setScalar(0.018 * wide);
    } else {
      const m = a.model.m;
      const hiding = a.state === 'hide';
      const y = water - 0.12 - (hiding ? Math.min(1, a.stateTime * 3) * 0.18 : 0) + Math.sin(a.time * 1.5) * 0.015;
      a.root.position.set(a.pos.x, y, a.pos.z);
      const tuck = hiding ? 0.15 : 1;
      m.head.scale.setScalar(tuck);
      m.head.rotation.x = a.state === 'float' || a.curiousTime > 0 ? -0.35 : 0;
      m.legs.forEach((leg, i) => {
        leg.scale.setScalar(tuck);
        leg.rotation.y = a.speed > 0.05 ? Math.sin(a.time * 4 + (i % 2) * Math.PI) * 0.5 : 0;
      });
      for (const eye of m.eyes) eye.scale.setScalar(0.02 * wide);
    }

    a.alertTime += dt;
    a.noteTime += dt;
    const bubble = 0.45 / s;
    animateAlert(a.alert, a.alertTime, bubble);
    animateAlert(a.note, a.noteTime, bubble, 1.2);
    animateHold(a.wary, a.waryTime, bubble);
  }
}

/** Turn `from` toward `to` by at most `max` radians. */
function turn(from: number, to: number, max: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + THREE.MathUtils.clamp(diff, -max, max);
}
