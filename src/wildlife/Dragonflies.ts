import * as THREE from 'three';
import type { Subject } from '../safari/species';
import type { World } from '../world/World';
import { createDragonfly, type DragonflyModel } from './models';

const MAX = 8;
const SCALE = 1.4;
const SPAWN_MIN = 6;
const SPAWN_MAX = 28;
const DESPAWN_RADIUS = 45;
/** A honk within this distance sends them zipping off. */
const SCARE_RADIUS = 14;
const COLORS = ['#8ec5ff', '#ffa8d0', '#8fe3c0', '#c5a8ff'];

interface Dragonfly {
  model: DragonflyModel;
  pos: THREE.Vector3;
  /** Patch of reeds it patrols. */
  home: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  heading: number;
  darting: boolean;
  /** Seconds left in the current hover or dart. */
  timer: number;
  dartTime: number;
  phase: number;
  fleeing: boolean;
}

/**
 * Dragonflies over the wetland shallows on sunny days: they hover, then dart
 * to a new spot in a blink. Ambient, but photographable.
 */
export class Dragonflies {
  readonly group = new THREE.Group();

  private readonly flies: Dragonfly[] = [];
  private manageTimer = 0;

  constructor(private readonly world: World) {}

  clear(): void {
    for (const f of this.flies) this.group.remove(f.model.root);
    this.flies.length = 0;
  }

  scare(from: THREE.Vector3): void {
    for (const f of this.flies) {
      if (Math.hypot(f.pos.x - from.x, f.pos.z - from.z) > SCARE_RADIUS) continue;
      const away = new THREE.Vector3(f.pos.x - from.x, 0, f.pos.z - from.z).normalize();
      this.dart(f, f.pos.clone().addScaledVector(away, 12).setY(f.pos.y + 2));
      f.fleeing = true;
    }
  }

  collectSubjects(out: Subject[]): void {
    for (const f of this.flies) {
      out.push({
        species: 'dragonfly',
        position: f.pos.clone(),
        radius: 0.3 * SCALE,
        forward: new THREE.Vector3(Math.sin(f.heading), 0, Math.cos(f.heading)),
        behavior: f.darting ? 'darting' : 'hovering',
        omnidirectional: true,
      });
    }
  }

  update(dt: number, focus: THREE.Vector3, daylight: boolean): void {
    this.manageTimer -= dt;
    if (this.manageTimer <= 0) {
      this.manageTimer = 1;
      this.manage(focus, daylight);
    }
    for (const f of this.flies) this.animate(f, dt);
  }

  private manage(focus: THREE.Vector3, daylight: boolean): void {
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      const far = Math.hypot(f.pos.x - focus.x, f.pos.z - focus.z) > DESPAWN_RADIUS;
      // Fled ones leave once they've zipped away; everyone turns in at night.
      if (far || !daylight || (f.fleeing && !f.darting)) {
        this.group.remove(f.model.root);
        this.flies.splice(i, 1);
      }
    }
    if (!daylight || this.flies.length >= MAX) return;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      const x = focus.x + Math.cos(ang) * r;
      const z = focus.z + Math.sin(ang) * r;
      if (this.world.biomeWeight(x, z, 'wetlands') < 0.6) continue;
      // Near the water's edge, where the reeds grow.
      const depth = this.world.waterLevel - this.world.heightAt(x, z);
      if (depth < -0.8 || depth > 0.8) continue;
      this.spawn(x, z);
      return;
    }
  }

  private spawn(x: number, z: number): void {
    const model = createDragonfly(COLORS[Math.floor(Math.random() * COLORS.length)]);
    model.root.scale.setScalar(SCALE);
    this.group.add(model.root);
    const y = Math.max(this.world.heightAt(x, z), this.world.waterLevel) + 0.9 + Math.random() * 0.8;
    const pos = new THREE.Vector3(x, y, z);
    this.flies.push({
      model,
      pos,
      home: pos.clone(),
      from: pos.clone(),
      to: pos.clone(),
      heading: Math.random() * Math.PI * 2,
      darting: false,
      timer: 0.5 + Math.random(),
      dartTime: 0.3,
      phase: Math.random() * 10,
      fleeing: false,
    });
  }

  private dart(f: Dragonfly, to: THREE.Vector3): void {
    f.from.copy(f.pos);
    f.to.copy(to);
    f.darting = true;
    f.dartTime = Math.max(0.25, f.from.distanceTo(to) / 14);
    f.timer = f.dartTime;
    f.heading = Math.atan2(to.x - f.pos.x, to.z - f.pos.z);
  }

  private animate(f: Dragonfly, dt: number): void {
    f.phase += dt;
    f.timer -= dt;
    if (f.darting) {
      const t = 1 - Math.max(0, f.timer) / f.dartTime;
      f.pos.lerpVectors(f.from, f.to, t * t * (3 - 2 * t));
      if (f.timer <= 0) {
        f.darting = false;
        f.timer = 0.6 + Math.random() * 1.6;
      }
    } else if (f.timer <= 0) {
      // Zip to a new spot around home.
      const ang = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 3.5;
      const x = f.home.x + Math.cos(ang) * r;
      const z = f.home.z + Math.sin(ang) * r;
      const y = Math.max(this.world.heightAt(x, z), this.world.waterLevel) + 0.8 + Math.random() * 0.9;
      this.dart(f, new THREE.Vector3(x, y, z));
    }
    const { root, wings } = f.model;
    root.position.set(f.pos.x, f.pos.y + (f.darting ? 0 : Math.sin(f.phase * 5) * 0.05), f.pos.z);
    root.rotation.y = f.heading;
    // A blur of wingbeats.
    const beat = Math.sin(f.phase * 70) * 0.35;
    wings[0].rotation.z = -beat;
    wings[1].rotation.z = beat;
  }
}
