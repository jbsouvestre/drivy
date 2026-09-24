import type { DriveInput } from './Car';

/** Below this stick deflection the car is left to coast. */
const DEADZONE = 0.15;
/** Steering gain: how hard to turn per radian of heading error. */
const STEER_GAIN = 2.2;
/** Normal top speed and reverse speed (units/s), to hold a partial-stick target speed. */
const TOP_SPEED = 24;
const REVERSE_SPEED = 9;
/** Pulling the stick this far behind the car (radians)… */
const REVERSE_ENTER = 2.5;
/** …at below this speed backs up; turning back toward this angle drives forward again. */
const REVERSE_MAX_SPEED = 2.5;
const REVERSE_EXIT = 1.8;

/**
 * "Point where you want to go": turns a screen-space joystick into throttle
 * and steering. The follow camera never rotates, so up the screen is always
 * world -Z and right is +X, whichever way the car faces. The car steers toward
 * the stick's direction and holds a speed set by how far it's pushed; pulling
 * back while nearly stopped reverses toward the stick instead of U-turning.
 */
export class StickDriver {
  private reversing = false;

  drive(stickX: number, stickY: number, car: { heading: number; speed: number }, handbrake: boolean): DriveInput {
    const amount = Math.min(1, Math.hypot(stickX, stickY));
    if (amount < DEADZONE) {
      this.reversing = false;
      return { throttle: 0, steer: 0, handbrake };
    }
    // Screen → world: up is -Z, right is +X. Car heading 0 faces +Z.
    const target = Math.atan2(stickX, -stickY);
    const error = wrap(target - car.heading);

    if (!this.reversing && Math.abs(error) > REVERSE_ENTER && car.speed < REVERSE_MAX_SPEED) this.reversing = true;
    else if (this.reversing && Math.abs(error) < REVERSE_EXIT) this.reversing = false;

    if (this.reversing) {
      // Back the rear of the car toward the stick (steering flips when reversing).
      const rearError = wrap(target - car.heading - Math.PI);
      return {
        throttle: -car.speed < amount * REVERSE_SPEED ? -1 : 0,
        steer: -clamp(rearError * STEER_GAIN),
        handbrake,
      };
    }
    // Full stick asks for everything the surface allows (e.g. asphalt's extra speed).
    const wantsMore = amount > 0.95 || car.speed < amount * TOP_SPEED;
    return { throttle: wantsMore ? 1 : 0, steer: clamp(error * STEER_GAIN), handbrake };
  }
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
