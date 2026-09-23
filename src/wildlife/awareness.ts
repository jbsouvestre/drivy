import type * as THREE from 'three';

/** What animals can sense about the car. */
export interface CarPresence {
  position: THREE.Vector3;
  /** Ground speed, units/sec. */
  speed: number;
  /** 0 near spawn → 1 far away: animals out there are shyer. */
  difficulty: number;
}

/** Alertness above this makes an animal wary: it stops and stares, with a "?". */
export const WARY = 0.35;
/** Car speed at which it counts as at its noisiest. */
const LOUD_SPEED = 12;
/** Below this speed the car counts as stopped, and animals calm down. */
const STILL_SPEED = 0.8;
/** How fast alertness fills (per second, at point-blank range, for a quiet car; noise multiplies it). */
const FILL_RATE = 1.8;
const CALM_RATE = 0.35;
/** A still car calms animals faster than a distant one. */
const STILL_CALM_RATE = 0.6;

/**
 * How far away an animal notices the car. Creeping shrinks it to about a
 * third; the far-off, shyer world stretches it by up to 80%.
 */
export function noticeRadius(base: number, car: CarPresence): number {
  const noise = Math.min(1, car.speed / LOUD_SPEED);
  return base * (0.35 + 0.65 * noise) * (1 + 0.8 * car.difficulty);
}

/**
 * Advance an animal's alertness (0–1). It fills while the car moves within the
 * notice radius (faster the closer it is) and drains otherwise. A stopped car
 * reads as harmless, so waiting quietly always calms animals down.
 */
export function updateAlert(alert: number, dt: number, distance: number, base: number, car: CarPresence): number {
  if (car.speed < STILL_SPEED) return Math.max(0, alert - STILL_CALM_RATE * dt);
  const radius = noticeRadius(base, car);
  // A roaring car is far scarier than a creeping one: noise speeds up how fast the meter fills.
  const noise = Math.min(1, car.speed / LOUD_SPEED);
  if (distance < radius) return Math.min(1, alert + FILL_RATE * (1 - distance / radius) * (0.4 + 6 * noise) * dt);
  return Math.max(0, alert - CALM_RATE * dt);
}

/** Chance of a rare/legendary spawn: grows with distance from home (difficulty 0–1). */
export function rareChance(base: number, difficulty: number): number {
  return base * (0.4 + 1.6 * difficulty);
}
