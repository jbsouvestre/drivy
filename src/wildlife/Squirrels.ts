import * as THREE from 'three';
import { propPoint, type Collider, type Prop } from '../world/props';
import type { World } from '../world/World';
import type { Subject } from '../safari/species';
import { ALERT_DURATION, animateAlert, animateHold, createAlert, createNote, createWary } from './alert';
import { updateAlert, WARY, type CarPresence } from './awareness';
import { createSquirrel, type SquirrelModel } from './models';

const MAX_SQUIRRELS = 6;
/** Squirrels live on round trees within this distance of the player. */
const SPAWN_RADIUS = 34;
const DESPAWN_RADIUS = 50;
/** Neighbouring trees a squirrel will leap to. */
const LEAP_MIN = 2.5;
const LEAP_MAX = 8;
/** Top of the round tree's upper foliage ball, in the tree's own (unscaled) space. */
const PERCH_LOCAL = new THREE.Vector3(0.45, 4.07, 0.2);
const APPEAR_TIME = 0.45;
const SCALE = 1.35;
const EYE_SIZE = 0.035;

/** A honk within this distance startles a squirrel. */
const SCARE_RADIUS = 16;
/** Seconds spent frozen in shock before bolting. */
const SHOCK_TIME = 0.55;
const HIDE_TIME = 0.35;
/** No new squirrels appear near a honk for a while. */
const SCARE_MEMORY = 8;
const SCARE_KEEP_OUT = 18;
/** Notice radius at full car speed (creeping shrinks it; see awareness). */
const NOTICE = 14;
/** The chime reaches squirrels within this distance; they stay curious this long. */
const CHIME_RADIUS = 20;
const CURIOUS_TIME = 3.5;

type Action = 'idle' | 'nibble' | 'flick';
type Mood = 'calm' | 'shocked' | 'fleeing' | 'hiding';

interface Squirrel {
  model: SquirrelModel;
  alert: THREE.Sprite;
  wary: THREE.Sprite;
  note: THREE.Sprite;
  /** 0–1: how bothered it is by the car. Fills when the car moves nearby. */
  alertness: number;
  /** Seconds spent wary so far, or -1 when not wary. */
  waryTime: number;
  /** Seconds of curiosity left after a chime. */
  curiousTime: number;
  noteTime: number;
  tree: Prop;
  heading: number;
  targetHeading: number;
  /** Seconds until the next idle decision. */
  timer: number;
  action: Action;
  actionTime: number;
  appear: number;
  time: number;
  jump: { from: THREE.Vector3; to: Prop; t: number; duration: number; height: number } | null;
  landSquash: number;
  mood: Mood;
  moodTime: number;
  alertTime: number;
  leapsLeft: number;
  scareFrom: THREE.Vector3;
}

const _to = new THREE.Vector3();

/** World position of a round tree's perch point, following its live (wobbling) transform. */
function perchPoint(tree: Prop, out: THREE.Vector3): THREE.Vector3 {
  return propPoint(tree, PERCH_LOCAL, out);
}

/**
 * Squirrels perched on round tree tops. They look around, nibble, flick
 * their tails and now and then leap to a neighbouring tree. A nearby honk
 * startles them: a wide-eyed "!" moment, then a leaping escape.
 */
export class Squirrels {
  readonly group = new THREE.Group();

  private readonly squirrels: Squirrel[] = [];
  private readonly occupied = new Set<Prop>();
  private readonly nearby: Collider[] = [];
  private manageTimer = 0;
  /** At night squirrels doze: heads down, no leaping. */
  private sleepy = false;
  private readonly lastScare = new THREE.Vector3();
  private scareMemory = 0;

  constructor(private readonly world: World) {}

  /** Drop every squirrel (e.g. when the world is regenerated). */
  clear(): void {
    for (const s of this.squirrels) this.group.remove(s.model.root);
    this.squirrels.length = 0;
    this.occupied.clear();
  }

  /** A honk at `from`: startle every squirrel within range. */
  scare(from: THREE.Vector3): void {
    this.lastScare.copy(from);
    this.scareMemory = SCARE_MEMORY;
    for (const s of this.squirrels) {
      if (s.mood === 'hiding' || s.appear < APPEAR_TIME) continue;
      if (Math.hypot(s.tree.x - from.x, s.tree.z - from.z) > SCARE_RADIUS) continue;
      this.startle(s, from);
    }
  }

  /** A chime at `from`: calm squirrels nearby turn to look, curious. */
  chime(from: THREE.Vector3): void {
    for (const s of this.squirrels) {
      if (s.mood !== 'calm' || s.appear < APPEAR_TIME) continue;
      if (Math.hypot(s.tree.x - from.x, s.tree.z - from.z) > CHIME_RADIUS) continue;
      s.curiousTime = CURIOUS_TIME;
      s.noteTime = 0;
      s.alertness *= 0.3;
      s.action = 'idle';
      s.targetHeading = Math.atan2(from.x - s.tree.x, from.z - s.tree.z);
    }
  }

  /** "!" moment, then a leaping escape away from `from`. */
  private startle(s: Squirrel, from: THREE.Vector3): void {
    s.scareFrom.copy(from);
    s.alertTime = 0;
    s.alertness = 0;
    s.curiousTime = 0;
    if (s.mood === 'fleeing') return; // already running: just another "!"
    s.mood = 'shocked';
    s.moodTime = 0;
    s.action = 'idle';
    s.leapsLeft = 2 + Math.floor(Math.random() * 2);
    // Whip round to stare at the noise.
    s.targetHeading = Math.atan2(from.x - s.tree.x, from.z - s.tree.z);
  }

  /** Notice the car: wary when it gets close while moving, bolt if it keeps coming. */
  private sense(s: Squirrel, dt: number, car: CarPresence): void {
    if (s.mood !== 'calm' || s.jump || s.appear < APPEAR_TIME) {
      s.waryTime = -1;
      return;
    }
    const dist = Math.hypot(s.tree.x - car.position.x, s.tree.z - car.position.z);
    s.alertness = updateAlert(s.alertness, dt, dist, NOTICE, car);
    if (s.alertness >= 1) {
      this.startle(s, car.position);
      s.waryTime = -1;
      return;
    }
    if (s.alertness > WARY) {
      s.waryTime = s.waryTime < 0 ? 0 : s.waryTime + dt;
      // Freeze and stare; no leaping off while on guard.
      s.targetHeading = Math.atan2(car.position.x - s.tree.x, car.position.z - s.tree.z);
      s.action = 'idle';
      s.timer = Math.max(s.timer, 0.5);
    } else {
      s.waryTime = -1;
    }
  }

  /** Report every visible squirrel as a photo subject. */
  collectSubjects(out: Subject[]): void {
    for (const s of this.squirrels) {
      if (s.mood === 'hiding' || s.appear < APPEAR_TIME) continue;
      let behavior = 'perched';
      if (s.mood === 'shocked' || s.mood === 'fleeing') behavior = s.jump ? 'leaping' : 'startled';
      else if (s.jump) behavior = 'leaping';
      else if (s.curiousTime > 0) behavior = 'curious';
      else if (this.sleepy) behavior = 'sleeping';
      else if (s.action === 'nibble') behavior = 'nibbling';
      out.push({
        species: 'squirrel',
        position: s.model.root.position.clone().add(new THREE.Vector3(0, 0.55 * SCALE, 0)),
        radius: 0.55 * SCALE,
        forward: new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)),
        behavior,
      });
    }
  }

  update(dt: number, focus: THREE.Vector3, sleepy: boolean, car: CarPresence): void {
    this.sleepy = sleepy;
    this.scareMemory = Math.max(0, this.scareMemory - dt);
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 0.5;
      this.manage(focus);
    }
    for (let i = this.squirrels.length - 1; i >= 0; i--) {
      const s = this.squirrels[i];
      this.sense(s, dt, car);
      this.animate(s, dt);
      if (s.mood === 'hiding' && s.moodTime >= HIDE_TIME) this.remove(i);
    }
  }

  private remove(index: number): void {
    const s = this.squirrels[index];
    this.group.remove(s.model.root);
    this.occupied.delete(s.tree);
    if (s.jump) this.occupied.delete(s.jump.to);
    this.squirrels.splice(index, 1);
  }

  /** Despawn far squirrels and top up the population on nearby trees. */
  private manage(focus: THREE.Vector3): void {
    for (let i = this.squirrels.length - 1; i >= 0; i--) {
      const s = this.squirrels[i];
      if (s.jump) continue;
      if (Math.hypot(s.tree.x - focus.x, s.tree.z - focus.z) > DESPAWN_RADIUS) this.remove(i);
    }

    if (this.squirrels.length >= MAX_SQUIRRELS) return;
    const trees = this.freeTreesNear(focus.x, focus.z, SPAWN_RADIUS, 0).filter(
      (t) => this.scareMemory <= 0 || Math.hypot(t.x - this.lastScare.x, t.z - this.lastScare.z) > SCARE_KEEP_OUT,
    );
    while (this.squirrels.length < MAX_SQUIRRELS && trees.length > 0) {
      const tree = trees.splice(Math.floor(Math.random() * trees.length), 1)[0];
      this.spawn(tree);
    }
  }

  private freeTreesNear(x: number, z: number, max: number, min: number): Prop[] {
    this.world.collidersNear(x, z, max, this.nearby);
    const out: Prop[] = [];
    for (const c of this.nearby) {
      const tree = c.prop;
      if (tree?.kind !== 'roundTree' || this.occupied.has(tree)) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d <= max && d >= min) out.push(tree);
    }
    return out;
  }

  private spawn(tree: Prop): void {
    const model = createSquirrel();
    model.root.scale.setScalar(0);
    const alert = createAlert(1.45);
    const wary = createWary(1.45);
    const note = createNote(1.45);
    model.root.add(alert, wary, note);
    this.group.add(model.root);
    this.occupied.add(tree);
    const heading = Math.random() * Math.PI * 2;
    this.squirrels.push({
      model,
      alert,
      wary,
      note,
      alertness: 0,
      waryTime: -1,
      curiousTime: 0,
      noteTime: ALERT_DURATION + 1,
      tree,
      heading,
      targetHeading: heading,
      timer: 0.5 + Math.random() * 2,
      action: 'idle',
      actionTime: 0,
      appear: 0,
      time: Math.random() * 10,
      jump: null,
      landSquash: 0,
      mood: 'calm',
      moodTime: 0,
      alertTime: ALERT_DURATION + 1,
      leapsLeft: 0,
      scareFrom: new THREE.Vector3(),
    });
  }

  private leapTo(s: Squirrel, to: Prop, speed: number): void {
    const from = perchPoint(s.tree, new THREE.Vector3());
    const dist = Math.hypot(to.x - s.tree.x, to.z - s.tree.z);
    this.occupied.delete(s.tree);
    this.occupied.add(to);
    s.jump = { from, to, t: 0, duration: (0.4 + dist * 0.05) / speed, height: 1.2 + dist * 0.15 };
    s.targetHeading = Math.atan2(to.x - s.tree.x, to.z - s.tree.z);
    s.heading = s.targetHeading;
  }

  /** Next escape leap: the free tree that gets furthest from the scare. Hide if there's none. */
  private fleeLeap(s: Squirrel): void {
    const here = Math.hypot(s.tree.x - s.scareFrom.x, s.tree.z - s.scareFrom.z);
    let best: Prop | null = null;
    let bestDist = here + 1;
    for (const t of this.freeTreesNear(s.tree.x, s.tree.z, LEAP_MAX + 2, LEAP_MIN)) {
      const d = Math.hypot(t.x - s.scareFrom.x, t.z - s.scareFrom.z);
      if (d > bestDist) {
        bestDist = d;
        best = t;
      }
    }
    if (best) {
      this.leapTo(s, best, 1.5);
    } else {
      s.mood = 'hiding';
      s.moodTime = 0;
    }
  }

  private decide(s: Squirrel): void {
    s.timer = 1 + Math.random() * 2.5;
    const roll = Math.random();
    if (this.sleepy) {
      // The odd sleepy tail twitch, nothing more.
      if (roll < 0.25) this.startAction(s, 'flick');
      return;
    }
    if (roll < 0.22) {
      const perch = perchPoint(s.tree, _to);
      const options = this.freeTreesNear(perch.x, perch.z, LEAP_MAX, LEAP_MIN);
      if (options.length > 0) {
        this.leapTo(s, options[Math.floor(Math.random() * options.length)], 1);
        return;
      }
    }
    if (roll < 0.5) s.targetHeading = s.heading + (Math.random() - 0.5) * 2.5;
    else if (roll < 0.75) this.startAction(s, 'nibble');
    else this.startAction(s, 'flick');
  }

  private startAction(s: Squirrel, action: Action): void {
    s.action = action;
    s.actionTime = 0;
  }

  private animate(s: Squirrel, dt: number): void {
    const { root, body, head, tail, eyes } = s.model;
    s.time += dt;
    s.moodTime += dt;
    s.alertTime += dt;
    animateAlert(s.alert, s.alertTime, 0.55);

    // Pop in with a little overshoot, toy-style; hiding shrinks back into the leaves.
    let scale = SCALE;
    if (s.appear < APPEAR_TIME) {
      s.appear = Math.min(APPEAR_TIME, s.appear + dt);
      const t = s.appear / APPEAR_TIME;
      scale = SCALE * (1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2));
    }
    if (s.mood === 'hiding') scale = SCALE * Math.max(0, 1 - s.moodTime / HIDE_TIME);
    root.scale.setScalar(scale);

    let stretch = 0;
    let shockHop = 0;
    if (s.jump) {
      const j = s.jump;
      j.t = Math.min(1, j.t + dt / j.duration);
      const target = perchPoint(j.to, _to);
      root.position.lerpVectors(j.from, target, j.t);
      root.position.y += 4 * j.height * j.t * (1 - j.t);
      stretch = Math.sin(Math.PI * j.t) * 0.25;
      body.rotation.x = 0.5 * Math.sin(Math.PI * j.t); // lean into the leap
      if (j.t >= 1) {
        s.tree = j.to;
        s.jump = null;
        s.landSquash = 1;
        body.rotation.x = 0;
        if (s.mood === 'fleeing') {
          s.leapsLeft--;
          if (s.leapsLeft > 0) this.fleeLeap(s);
          else {
            s.mood = 'calm';
            s.timer = 1.5;
          }
        }
      }
    } else {
      perchPoint(s.tree, root.position);
      if (s.mood === 'shocked') {
        // Startled hop on the spot.
        const t = Math.min(1, s.moodTime / 0.3);
        shockHop = Math.sin(Math.PI * t) * 0.6;
        stretch = Math.sin(Math.PI * t) * 0.3;
        if (s.moodTime >= SHOCK_TIME) {
          s.mood = 'fleeing';
          this.fleeLeap(s);
        }
      } else if (s.mood === 'calm') {
        s.timer -= dt;
        // Curious squirrels just watch; no wandering off mid-portrait.
        if (s.curiousTime > 0) s.timer = Math.max(s.timer, 0.5);
        if (s.timer <= 0) this.decide(s);
      }
    }
    root.position.y += shockHop;

    // Turn smoothly toward where it wants to look (snappier when startled).
    const diff = Math.atan2(Math.sin(s.targetHeading - s.heading), Math.cos(s.targetHeading - s.heading));
    s.heading += diff * Math.min(1, (s.mood === 'calm' ? 6 : 20) * dt);
    root.rotation.y = s.heading + (s.mood === 'hiding' ? s.moodTime * 25 : 0);

    // Breathing, plus a squash when landing.
    const dozing = this.sleepy && s.mood === 'calm';
    s.landSquash = Math.max(0, s.landSquash - dt * 4);
    const squash = s.landSquash * Math.sin(s.landSquash * Math.PI) * 0.3;
    const breathe = dozing ? Math.sin(s.time * 1.4) * 0.04 : Math.sin(s.time * 3) * 0.025;
    body.scale.set(1 + squash * 0.6 - stretch * 0.3, 1 + breathe - squash + stretch, 1 - stretch * 0.2);

    // Shock: saucer eyes and a bottle-brush tail that settle back while fleeing.
    const fright = s.mood === 'shocked' ? 1 : s.mood === 'fleeing' ? 0.5 : 0;
    for (const eye of eyes) eye.scale.setScalar(EYE_SIZE * (1 + 0.8 * fright));
    const puff = 1 + 0.35 * fright + (s.mood === 'shocked' ? Math.sin(s.moodTime * 60) * 0.05 : 0);
    tail.scale.setScalar(puff);

    // Idle actions.
    s.actionTime += dt;
    head.rotation.x = dozing ? 0.5 : s.mood === 'shocked' ? -0.25 : 0;
    tail.rotation.x = Math.sin(s.time * 1.8) * 0.06;
    tail.rotation.z = s.mood === 'shocked' ? Math.sin(s.moodTime * 45) * 0.15 : 0;
    if (s.action === 'nibble') {
      head.rotation.x = 0.35 + Math.sin(s.actionTime * 30) * 0.12;
      if (s.actionTime > 0.9) s.action = 'idle';
    } else if (s.action === 'flick') {
      tail.rotation.z = Math.sin(s.actionTime * 22) * 0.35 * (1 - s.actionTime / 0.7);
      if (s.actionTime > 0.7) s.action = 'idle';
    }
    head.rotation.y = dozing || s.mood !== 'calm' ? 0 : Math.sin(s.time * 0.9) * 0.25;

    // Curious: sit up, perk up, tilt the head at the chime.
    s.curiousTime = Math.max(0, s.curiousTime - dt);
    if (s.curiousTime > 0 && s.mood === 'calm') {
      head.rotation.set(-0.15, 0, Math.sin(s.time * 2) * 0.12 + 0.28);
      tail.rotation.z = Math.sin(s.time * 5) * 0.1;
    }
    // Wary: ears-up freeze (no idle head sway).
    if (s.waryTime >= 0) head.rotation.set(-0.1, 0, 0);

    s.noteTime += dt;
    animateAlert(s.note, s.noteTime, 0.5, 1.2);
    animateHold(s.wary, s.alertTime < ALERT_DURATION ? -1 : s.waryTime, 0.5);
  }
}
