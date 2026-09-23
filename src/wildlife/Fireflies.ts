import * as THREE from 'three';
import type { Subject } from '../safari/species';
import type { Terrain } from '../world/World';

const COUNT = 80;
/** Fireflies live within this ground distance of the player and wrap around when outside it. Heights are above the local ground. */
const RADIUS = 30;
const MIN_HEIGHT = 0.5;
const MAX_HEIGHT = 3.2;
const MAX_SPEED = 1.1;
/** A honk within this distance makes fireflies flash and dart away. */
const SCARE_RADIUS = 12;
/** A chime draws in fireflies from this far away. */
const ATTRACT_RADIUS = 16;

const COLORS = ['#eaff9e', '#eaff9e', '#fff3a3', '#c8ffe0', '#ffd1ea'];

/**
 * Glowing, blinking fireflies drifting near the ground around the player at
 * night. Rendered as a single additive point cloud; `darkness` fades them in/out.
 */
export class Fireflies {
  readonly points: THREE.Points;

  private readonly positions = new Float32Array(COUNT * 3);
  private readonly velocities = new Float32Array(COUNT * 3);
  private readonly flashes = new Float32Array(COUNT);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private placed = false;

  constructor() {
    const phases = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      phases[i] = Math.random();
      c.set(COLORS[i % COLORS.length]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aFlash', new THREE.BufferAttribute(this.flashes, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmount: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute float aFlash;
        attribute vec3 color;
        uniform float uTime;
        uniform float uAmount;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          // Slow pulse with long dim gaps, each firefly on its own rhythm.
          float pulse = pow(0.5 + 0.5 * sin(uTime * (1.2 + aPhase) + aPhase * 6.2832), 3.0);
          vGlow = (0.2 + 0.8 * pulse + aFlash) * uAmount;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (0.5 + 0.5 * pulse + aFlash * 0.8) * 900.0 * uPixelRatio / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          // Wide soft halo in the firefly's colour around a small bright core.
          float halo = pow(smoothstep(0.5, 0.0, d), 2.5) * 0.9;
          float core = smoothstep(0.08, 0.0, d);
          vec3 col = vColor * (halo + core) + vec3(1.0) * core * 0.4;
          gl_FragColor = vec4(col * vGlow, 1.0);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    // They follow the player around; bounds are never meaningful.
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Report glowing fireflies as photo subjects (only once it's dark enough to see them). */
  collectSubjects(out: Subject[]): void {
    if (this.material.uniforms.uAmount.value < 0.4) return;
    for (let i = 0; i < COUNT; i++) {
      out.push({
        species: 'firefly',
        position: new THREE.Vector3(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]),
        radius: 0.4,
        forward: new THREE.Vector3(0, 0, 1),
        behavior: 'glowing',
        omnidirectional: true,
      });
    }
  }

  /** A chime at `from`: nearby fireflies brighten and drift in to hover around it. */
  attract(from: THREE.Vector3): void {
    if (!this.points.visible) return;
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      const dx = from.x - this.positions[k];
      const dy = from.y + 2 - this.positions[k + 1];
      const dz = from.z - this.positions[k + 2];
      const d = Math.hypot(dx, dz);
      if (d > ATTRACT_RADIUS || d < 1.5) continue;
      const pull = 2.2 / Math.hypot(dx, dy, dz);
      this.velocities[k] += dx * pull;
      this.velocities[k + 1] += dy * pull;
      this.velocities[k + 2] += dz * pull;
      this.flashes[i] = Math.max(this.flashes[i], 0.5);
    }
  }

  /** A honk at `from`: nearby fireflies flash bright and dart away. */
  scare(from: THREE.Vector3): void {
    if (!this.points.visible) return;
    for (let i = 0; i < COUNT; i++) {
      const dx = this.positions[i * 3] - from.x;
      const dz = this.positions[i * 3 + 2] - from.z;
      const d = Math.hypot(dx, dz);
      if (d > SCARE_RADIUS) continue;
      const push = 5 * (1 - d / SCARE_RADIUS) + 2;
      this.velocities[i * 3] += (dx / (d || 1)) * push;
      this.velocities[i * 3 + 1] += 1.5 + Math.random() * 1.5;
      this.velocities[i * 3 + 2] += (dz / (d || 1)) * push;
      this.flashes[i] = 1;
    }
  }

    update(dt: number, focus: THREE.Vector3, darkness: number, terrain: Terrain): void {
    const amount = THREE.MathUtils.smoothstep(darkness, 0.35, 0.9);
    this.material.uniforms.uAmount.value = amount;
    this.points.visible = amount > 0.001;
    if (!this.points.visible) return;
    this.material.uniforms.uTime.value += dt;

    const p = this.positions;
    const v = this.velocities;
    if (!this.placed) {
      this.placed = true;
      for (let i = 0; i < COUNT; i++) this.respawn(i, focus, Math.random() * RADIUS, terrain);
    }

    const damping = Math.exp(-1.5 * dt);
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      // Lazy wandering: small random nudges, damped, with a soft pull toward a comfy height.
      v[k] += (Math.random() - 0.5) * 3 * dt;
      v[k + 1] += (Math.random() - 0.5) * 2 * dt;
      v[k + 2] += (Math.random() - 0.5) * 3 * dt;
      // Heights are measured from the ground, or from the surface over ponds.
      const above = p[k + 1] - Math.max(terrain.heightAt(p[k], p[k + 2]), terrain.waterLevel);
      if (above < MIN_HEIGHT) v[k + 1] += (above < 0 ? 6 : 2) * dt;
      if (above > MAX_HEIGHT) v[k + 1] -= 2 * dt;

      const speed = Math.hypot(v[k], v[k + 1], v[k + 2]);
      const limit = MAX_SPEED + this.flashes[i] * 6;
      const s = speed > limit ? (limit / speed) * damping : damping;
      v[k] *= s;
      v[k + 1] *= s;
      v[k + 2] *= s;

      p[k] += v[k] * dt;
      p[k + 1] += v[k + 1] * dt;
      p[k + 2] += v[k + 2] * dt;
      this.flashes[i] = Math.max(0, this.flashes[i] - dt * 1.2);

      // Wrap around the player so the swarm always surrounds them.
      if (Math.hypot(p[k] - focus.x, p[k + 2] - focus.z) > RADIUS) this.respawn(i, focus, RADIUS * (0.7 + Math.random() * 0.3), terrain);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aFlash.needsUpdate = true;
  }

  private respawn(i: number, focus: THREE.Vector3, distance: number, terrain: Terrain): void {
    const a = Math.random() * Math.PI * 2;
    const k = i * 3;
    const x = focus.x + Math.cos(a) * distance;
    const z = focus.z + Math.sin(a) * distance;
    this.positions[k] = x;
    this.positions[k + 1] = Math.max(terrain.heightAt(x, z), terrain.waterLevel) + MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);
    this.positions[k + 2] = z;
    this.velocities.fill(0, k, k + 3);
  }
}
