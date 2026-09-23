import * as THREE from 'three';
import { playHoot } from '../game/audio';
import { propPoint, type Collider, type Prop } from '../world/props';
import type { World } from '../world/World';
import { ALERT_DURATION, animateAlert, createAlert, createBubble } from './alert';
import { createOwl, OWL_COLORS, type OwlModel } from './models';

const MAX_OWLS = 3;
/** Owls pick pine trees in this ring around the player. */
const SPAWN_MIN = 6;
const SPAWN_MAX = 24;
const DESPAWN_RADIUS = 50;
/** Just below the top pine cone's tip, in the tree's own (unscaled) space. */
const PERCH_LOCAL = new THREE.Vector3(0, 3.72, 0);
const SCALE = 1.25;
const APPEAR_TIME = 0.5;
/** Darkness needed for owls to show up, and below which they leave. */
const ARRIVE_DARKNESS = 0.6;
const LEAVE_DARKNESS = 0.35;
const SCARE_RADIUS = 18;
const SHOCK_TIME = 0.5;
const FLY_TIME = 4;
const HOOT_TIME = 1.1;
/** Hoots are audible within this distance, louder the closer. */
const HOOT_RANGE = 40;
const HOOT_VOLUME = 0.12;

type State = 'perched' | 'shocked' | 'flying';

interface Owl {
  model: OwlModel;
  alert: THREE.Sprite;
  hootBubble: THREE.Sprite;
  tree: Prop;
  state: State;
  stateTime: number;
  appear: number;
  heading: number;
  headYaw: number;
  headTarget: number;
  headTilt: number;
  headTimer: number;
  blinkTimer: number;
  blinkTime: number;
  hootTimer: number;
  hootTime: number;
  alertTime: number;
  /** Seconds before taking off at dawn, so they don't all leave at once. */
  leaveDelay: number;
  flyDir: THREE.Vector3;
}

/**
 * Night owls perched on pine tips: head swivels, slow blinks and the odd
 * "hoo-hoo". A honk startles them into flapping away; they also leave at dawn.
 */
export class Owls {
  readonly group = new THREE.Group();

  private readonly owls: Owl[] = [];
  private readonly occupied = new Set<Prop>();
  private readonly nearby: Collider[] = [];
  private manageTimer = 0;

  constructor(private readonly world: World) {}

  clear(): void {
    for (const o of this.owls) this.group.remove(o.model.root);
    this.owls.length = 0;
    this.occupied.clear();
  }

  scare(from: THREE.Vector3): void {
    for (const o of this.owls) {
      if (o.state !== 'perched' || o.appear < APPEAR_TIME) continue;
      if (Math.hypot(o.tree.x - from.x, o.tree.z - from.z) > SCARE_RADIUS) continue;
      o.state = 'shocked';
      o.stateTime = 0;
      o.alertTime = 0;
      o.hootTime = HOOT_TIME; // cut any hoot short
      // Stare straight at the noise, then flee directly away from it.
      o.heading = Math.atan2(from.x - o.tree.x, from.z - o.tree.z);
      o.headTarget = 0;
      o.flyDir.set(o.tree.x - from.x, 0, o.tree.z - from.z).normalize();
    }
  }

  update(dt: number, focus: THREE.Vector3, darkness: number): void {
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 0.5;
      this.manage(focus, darkness);
    }
    for (let i = this.owls.length - 1; i >= 0; i--) {
      const o = this.owls[i];
      this.animate(o, dt, focus, darkness);
      if (o.state === 'flying' && o.stateTime > FLY_TIME) this.remove(i);
    }
  }

  private remove(index: number): void {
    const o = this.owls[index];
    this.group.remove(o.model.root);
    this.occupied.delete(o.tree);
    this.owls.splice(index, 1);
  }

  private manage(focus: THREE.Vector3, darkness: number): void {
    for (let i = this.owls.length - 1; i >= 0; i--) {
      const o = this.owls[i];
      if (o.state === 'perched' && Math.hypot(o.tree.x - focus.x, o.tree.z - focus.z) > DESPAWN_RADIUS) this.remove(i);
    }
    if (darkness < ARRIVE_DARKNESS) return;

    const perched = this.owls.filter((o) => o.state !== 'flying').length;
    if (perched >= MAX_OWLS) return;
    this.world.collidersNear(focus.x, focus.z, SPAWN_MAX, this.nearby);
    const pines = this.nearby
      .filter((c) => c.prop.kind === 'pineTree' && !this.occupied.has(c.prop))
      .filter((c) => {
        const d = Math.hypot(c.x - focus.x, c.z - focus.z);
        return d >= SPAWN_MIN && d <= SPAWN_MAX;
      });
    // Arrive one at a time so they trickle in as night falls.
    if (pines.length > 0) this.spawn(pines[Math.floor(Math.random() * pines.length)].prop);
  }

  private spawn(tree: Prop): void {
    const model = createOwl(OWL_COLORS[Math.floor(Math.random() * OWL_COLORS.length)]);
    model.root.scale.setScalar(0);
    const alert = createAlert(1.65);
    const hootBubble = createBubble('hoo~', '#a58fd0', 1.65, 1.8);
    model.root.add(alert, hootBubble);
    this.group.add(model.root);
    this.occupied.add(tree);
    this.owls.push({
      model,
      alert,
      hootBubble,
      tree,
      state: 'perched',
      stateTime: 0,
      appear: 0,
      heading: Math.random() * Math.PI * 2,
      headYaw: 0,
      headTarget: 0,
      headTilt: 0,
      headTimer: 1 + Math.random() * 2,
      blinkTimer: 1 + Math.random() * 4,
      blinkTime: 1,
      hootTimer: 3 + Math.random() * 12,
      hootTime: HOOT_TIME,
      alertTime: ALERT_DURATION + 1,
      leaveDelay: Math.random() * 3,
      flyDir: new THREE.Vector3(),
    });
  }

  private takeOff(o: Owl): void {
    o.state = 'flying';
    o.stateTime = 0;
    this.occupied.delete(o.tree);
    o.heading = Math.atan2(o.flyDir.x, o.flyDir.z);
  }

  private animate(o: Owl, dt: number, focus: THREE.Vector3, darkness: number): void {
    const { root, body, head, eyes, wings } = o.model;
    o.stateTime += dt;
    o.alertTime += dt;
    animateAlert(o.alert, o.alertTime, 0.6);

    // Pop in, toy-style.
    let scale = SCALE;
    if (o.appear < APPEAR_TIME) {
      o.appear = Math.min(APPEAR_TIME, o.appear + dt);
      const t = o.appear / APPEAR_TIME - 1;
      scale = SCALE * (1 + 2.7 * t * t * t + 1.7 * t * t);
    }
    root.scale.setScalar(scale);

    let wingSpread = 0;
    let puff = 0;
    let wide = 0;

    if (o.state === 'flying') {
      // Flap up and away, accelerating, tipping forward.
      const t = o.stateTime;
      const speed = Math.min(9, 3 + t * 4);
      root.position.x += o.flyDir.x * speed * dt;
      root.position.z += o.flyDir.z * speed * dt;
      root.position.y += (2.5 + t * 0.8) * dt;
      wingSpread = 1.2 + Math.sin(t * 16) * 0.8;
      body.rotation.x = Math.min(0.5, t * 1.5);
      o.headYaw = 0;
      // Shrink away at the very end so the removal isn't a pop.
      if (t > FLY_TIME - 0.4) root.scale.setScalar(scale * Math.max(0, (FLY_TIME - t) / 0.4));
    } else {
      propPoint(o.tree, PERCH_LOCAL, root.position);

      if (o.state === 'shocked') {
        // Feathers puff up, eyes go huge, a startled hop — then off it goes.
        const t = o.stateTime / SHOCK_TIME;
        root.position.y += Math.sin(Math.PI * Math.min(1, t * 1.6)) * 0.5;
        puff = 1;
        wide = 1;
        wingSpread = Math.sin(Math.PI * Math.min(1, t * 2)) * 0.9;
        if (o.stateTime >= SHOCK_TIME) this.takeOff(o);
      } else {
        this.idle(o, dt, focus);
        if (darkness < LEAVE_DARKNESS) {
          o.leaveDelay -= dt;
          if (o.leaveDelay <= 0) {
            const a = Math.random() * Math.PI * 2;
            o.flyDir.set(Math.cos(a), 0, Math.sin(a));
            this.takeOff(o);
          }
        }
      }
    }

    root.rotation.y = o.heading;
    wings[0].rotation.z = -wingSpread;
    wings[1].rotation.z = wingSpread;

    // Hoot: body swells and the head bobs with each "hoo".
    const hooting = o.hootTime < HOOT_TIME;
    const hootPulse = hooting ? Math.max(0, Math.sin((o.hootTime / HOOT_TIME) * Math.PI * 2)) : 0;
    animateAlert(o.hootBubble, hooting ? o.hootTime : -1, 0.55, HOOT_TIME);

    const breathe = Math.sin(o.stateTime * 1.6) * 0.02;
    body.scale.set(1 + puff * 0.18 + hootPulse * 0.06, 1 + breathe + puff * 0.12 + hootPulse * 0.08, 1 + puff * 0.18);
    head.position.y = 0.86 + hootPulse * 0.05;
    head.rotation.y = o.headYaw;
    head.rotation.z = o.headTilt;

    // Blink by squashing the eyes; go saucer-eyed when startled.
    const blink = o.blinkTime < 0.18 ? Math.abs(Math.cos((o.blinkTime / 0.18) * Math.PI)) : 1;
    const eyeScale = 1 + wide * 0.6;
    for (const eye of eyes) eye.scale.set(eyeScale, eyeScale * Math.max(0.08, blink), eyeScale);
  }

  /** Perched behaviour: owl-style head swivels, curious tilts, slow blinks and hoots. */
  private idle(o: Owl, dt: number, focus: THREE.Vector3): void {
    o.headTimer -= dt;
    if (o.headTimer <= 0) {
      o.headTimer = 1.5 + Math.random() * 3;
      // Owls can look almost all the way round.
      o.headTarget = (Math.random() - 0.5) * 3.6;
      o.headTilt = Math.random() < 0.3 ? (Math.random() - 0.5) * 0.6 : 0;
    }
    // Swivel in a quick, owl-like snap.
    o.headYaw += (o.headTarget - o.headYaw) * Math.min(1, 7 * dt);

    o.blinkTimer -= dt;
    o.blinkTime += dt;
    if (o.blinkTimer <= 0) {
      o.blinkTimer = 2.5 + Math.random() * 4;
      o.blinkTime = 0;
    }

    o.hootTime += dt;
    o.hootTimer -= dt;
    if (o.hootTimer <= 0) {
      o.hootTimer = 9 + Math.random() * 14;
      o.hootTime = 0;
      const d = Math.hypot(o.tree.x - focus.x, o.tree.z - focus.z);
      playHoot(HOOT_VOLUME * Math.max(0, 1 - d / HOOT_RANGE));
    }
  }
}
