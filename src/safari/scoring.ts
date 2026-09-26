import * as THREE from 'three';
import { species, type Subject } from './species';

export interface Lighting {
  goldenHour: boolean;
  night: boolean;
  /** A shower is on: rain-only behaviours can be captured. */
  rain: boolean;
}

export interface Shot {
  /** Best subject in the frame, or null if nothing photographable was in it. */
  subject: Subject | null;
  /** 0 = no subject (a nice view), otherwise 1–3. */
  stars: number;
  score: number;
  /** Behaviours captured for the subject's species (its own plus derived ones like "family"). */
  behaviors: string[];
}

const STAR_THRESHOLDS = [0.12, 0.38, 0.62];

const _ndc = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

interface Framed {
  subject: Subject;
  base: number;
}

/**
 * Score a photo: every subject inside the frame gets a base score from its
 * size, framing, facing and how clearly it's visible; bonuses come from
 * behaviour, rarity, light and company. The best one names the photo.
 */
export function scoreShot(
  camera: THREE.PerspectiveCamera,
  subjects: readonly Subject[],
  occluders: THREE.Object3D | null,
  light: Lighting,
): Shot {
  camera.updateMatrixWorld();
  const framed = subjects.map((s) => frame(camera, s, occluders)).filter((f): f is Framed => f !== null);
  if (framed.length === 0) return { subject: null, stars: 0, score: 0, behaviors: [] };

  let best: Framed | null = null;
  let bestTotal = -1;
  for (const f of framed) {
    const sp = species(f.subject.species);
    let bonus = 0;
    if (f.base > 0.05) {
      if (f.subject.behavior !== sp.behaviors[0].id) bonus += 0.12;
      if (sp.legendary) bonus += 0.25;
      if (sp.mythic) bonus += 0.35;
      else if (sp.rare) bonus += 0.15;
      if (light.goldenHour) bonus += 0.08;
      if (light.night) bonus += 0.05;
      if (light.rain) bonus += 0.05;
      const company = framed.filter((o) => o !== f && o.subject.species === f.subject.species).length;
      bonus += Math.min(0.1, company * 0.04);
    }
    const total = f.base + bonus;
    if (total > bestTotal) {
      bestTotal = total;
      best = f;
    }
  }

  const subject = best!.subject;
  const stars = STAR_THRESHOLDS.filter((t) => bestTotal >= t).length;
  const behaviors = stars > 0 ? derivedBehaviors(subject, framed, light) : [];
  return { subject: stars > 0 ? subject : null, stars, score: bestTotal, behaviors };
}

/** The subject's own behaviour plus group behaviours visible in the frame. */
function derivedBehaviors(subject: Subject, framed: Framed[], light: Lighting): string[] {
  const out = [subject.behavior];
  if (light.rain && species(subject.species).behaviors.some((b) => b.id === 'rain')) out.push('rain');
  const count = (id: string) => framed.filter((f) => f.subject.species === id).length;
  if (subject.species === 'duck' && count('duckling') >= 2) out.push('family');
  if (subject.species === 'firefly' && count('firefly') >= 8) out.push('swarm');
  return out;
}

/** Base score for one subject, or null if it's outside the frame. `occluders` null skips the (costly) visibility raycasts. */
function frame(camera: THREE.PerspectiveCamera, s: Subject, occluders: THREE.Object3D | null): Framed | null {
  _ndc.copy(s.position).project(camera);
  if (_ndc.z < -1 || _ndc.z > 1 || Math.abs(_ndc.x) > 1.02 || Math.abs(_ndc.y) > 1.02) return null;
  const dist = camera.position.distanceTo(s.position);
  if (dist < 0.3) return null;

  // Radius as a fraction of the frame's height.
  const halfHeight = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fill = s.radius / halfHeight;
  const size = THREE.MathUtils.smoothstep(fill, 0.03, 0.3);

  const off = Math.hypot(_ndc.x, _ndc.y);
  let framing = 1 - THREE.MathUtils.smoothstep(off, 0.15, 0.85);
  // A little bonus for rule-of-thirds placement.
  if (Math.hypot(Math.abs(_ndc.x) - 0.33, Math.abs(_ndc.y) - 0.33) < 0.12) framing = Math.min(1, framing + 0.15);

  _toCam.copy(camera.position).sub(s.position).setY(0).normalize();
  const dot = s.forward.dot(_toCam);
  const facing = s.omnidirectional ? 1 : 0.45 + 0.55 * ((dot + 1) / 2);

  const clear = occluders ? visibility(camera, s, occluders, dist) : 1;
  return { subject: s, base: size * (0.55 + 0.45 * framing) * facing * (0.25 + 0.75 * clear) };
}

/** Fraction (0–1) of sample points on the subject that the camera can see. */
function visibility(camera: THREE.PerspectiveCamera, s: Subject, occluders: THREE.Object3D, dist: number): number {
  let seen = 0;
  const samples = [0, 0.6];
  for (const lift of samples) {
    _target.copy(s.position).y += lift * s.radius;
    _dir.copy(_target).sub(camera.position).normalize();
    raycaster.set(camera.position, _dir);
    raycaster.near = 0.1;
    raycaster.far = Math.max(0.1, dist - s.radius * 0.8);
    const hit = raycaster.intersectObject(occluders, true).find((h) => !h.object.userData.water);
    if (!hit) seen++;
  }
  return seen / samples.length;
}
