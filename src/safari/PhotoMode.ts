import * as THREE from 'three';

/** Where the photographer's eye sits, in the car's local space: just above the roof. */
const EYE = new THREE.Vector3(0, 2.35, 0.15);
const FOV_WIDE = 55;
const FOV_TELE = 15;
/** Seconds to glide between the follow camera and the photo view. */
const TRANSITION = 0.45;
const LOOK_SPEED = 0.0024;
const PITCH_MIN = -1.05;
const PITCH_MAX = 0.75;
/** Minimum seconds between shots. */
const SHUTTER_COOLDOWN = 0.6;

const _eye = new THREE.Vector3();
const _look = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * First-person-ish photo camera riding on the car's roof. Handles the glide in
 * and out, mouse look (pointer lock), scroll zoom and shutter requests.
 */
export class PhotoMode {
  readonly camera: THREE.PerspectiveCamera;
  active = false;

  private blend = 0;
  private yaw = 0;
  private pitch = 0;
  private fov = FOV_WIDE;
  private fovTarget = FOV_WIDE;
  private cooldown = 0;
  private shotRequested = false;
  private readonly lockListeners = new Set<(locked: boolean) => void>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.camera = new THREE.PerspectiveCamera(FOV_WIDE, window.innerWidth / window.innerHeight, 0.2, 400);

    document.addEventListener('mousemove', (e) => {
      if (!this.active || !this.locked) return;
      // Look slower when zoomed in, so aiming stays precise.
      const k = LOOK_SPEED * (this.fov / FOV_WIDE);
      this.yaw -= e.movementX * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * k, PITCH_MIN, PITCH_MAX);
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.fovTarget = THREE.MathUtils.clamp(this.fovTarget * Math.exp(e.deltaY * 0.0012), FOV_TELE, FOV_WIDE);
      },
      { passive: false },
    );
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active || e.button !== 0) return;
      if (this.locked) this.requestShot();
      else this.lockPointer();
    });
    document.addEventListener('pointerlockchange', () => {
      for (const l of this.lockListeners) l(this.locked);
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Current zoom factor relative to the widest view (1× … ~3.7×). */
  get zoom(): number {
    return FOV_WIDE / this.fov;
  }

  /** Whether the photo camera should be the one rendering (including mid-glide). */
  get showing(): boolean {
    return this.blend > 0;
  }

  /** Fully settled into the photo view. */
  get ready(): boolean {
    return this.active && this.blend >= 1;
  }

  onLockChange(listener: (locked: boolean) => void): void {
    this.lockListeners.add(listener);
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    this.yaw = 0;
    this.pitch = -0.06;
    this.fovTarget = FOV_WIDE;
    this.lockPointer();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.releasePointer();
  }

  lockPointer(): void {
    // Browsers may refuse (e.g. right after leaving pointer lock); a click retries.
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Ignored: the "click to look around" hint covers it.
    }
  }

  releasePointer(): void {
    if (this.locked) document.exitPointerLock();
  }

  requestShot(): void {
    if (!this.ready || this.cooldown > 0) return;
    this.shotRequested = true;
    this.cooldown = SHUTTER_COOLDOWN;
  }

  /** True once per shutter press; the caller then scores and captures the frame. */
  takeShot(): boolean {
    const s = this.shotRequested;
    this.shotRequested = false;
    return s;
  }

  /**
   * Glide between `from` (the follow camera) and the roof-top view, which
   * turns with the car and looks where the mouse points.
   */
  update(dt: number, car: THREE.Object3D, from: THREE.PerspectiveCamera): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.blend = THREE.MathUtils.clamp(this.blend + (this.active ? dt : -dt) / TRANSITION, 0, 1);
    if (this.blend === 0) return;
    this.fov += (this.fovTarget - this.fov) * Math.min(1, 12 * dt);

    car.updateMatrixWorld();
    _eye.copy(EYE).applyMatrix4(car.matrixWorld);
    // Keep the horizon level even when the car tilts on a slope; the camera looks down -Z.
    _euler.set(this.pitch, car.rotation.y + Math.PI + this.yaw, 0);
    _look.setFromEuler(_euler);

    const k = this.blend * this.blend * (3 - 2 * this.blend);
    this.camera.position.lerpVectors(from.position, _eye, k);
    this.camera.quaternion.slerpQuaternions(from.quaternion, _look, k);
    this.camera.fov = THREE.MathUtils.lerp(from.fov, this.fov, k);
    this.camera.updateProjectionMatrix();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
