import * as THREE from 'three';

/** Fixed-orientation 3/4 top-down offset from the target. */
const FOLLOW_OFFSET = new THREE.Vector3(0, 17, 14);
const LOOK_AHEAD = 0.35;

/**
 * Smooth-follow camera. In "menu" mode it slowly orbits the target instead,
 * giving the splash screen a living backdrop.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: 'menu' | 'follow' = 'menu';

  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  /** Camera position before shake is applied. */
  private readonly base = new THREE.Vector3();
  private orbit = 0;
  private trauma = 0;
  private time = 0;

  constructor(aspect: number) {
    // Far plane just past the fog (~110): nothing beyond it can be seen anyway.
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 130);
    this.base.copy(FOLLOW_OFFSET);
    this.camera.position.copy(FOLLOW_OFFSET);
    this.camera.lookAt(0, 0, 0);
  }

  /** Jump straight to the target without easing. */
  snap(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.base.copy(target).add(FOLLOW_OFFSET);
    this.camera.position.copy(this.base);
    this.camera.lookAt(this.focus);
  }

  /** Add screen shake; `amount` in [0, 1] stacks up to a cap. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number, target: THREE.Vector3, velocity: THREE.Vector3): void {
    if (this.mode === 'menu') {
      this.orbit += dt * 0.15;
      const radius = 11;
      this.focus.lerp(target, Math.min(1, 3 * dt));
      this.desired.set(
        target.x + Math.sin(this.orbit) * radius,
        target.y + 6,
        target.z + Math.cos(this.orbit) * radius,
      );
      this.base.lerp(this.desired, Math.min(1, 2 * dt));
    } else {
      // Look slightly ahead of where the car is going.
      this.desired.copy(target).addScaledVector(velocity, LOOK_AHEAD);
      this.focus.lerp(this.desired, Math.min(1, 4 * dt));
      this.desired.copy(this.focus).add(FOLLOW_OFFSET);
      this.base.lerp(this.desired, Math.min(1, 5 * dt));
    }

    // Shake falls off with trauma², so small bumps stay subtle.
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const k = this.trauma * this.trauma * 0.7;
    this.camera.position.set(
      this.base.x + Math.sin(this.time * 41) * k,
      this.base.y + Math.sin(this.time * 47 + 1.3) * k,
      this.base.z + Math.sin(this.time * 37 + 2.1) * k,
    );
    this.camera.lookAt(this.focus);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
