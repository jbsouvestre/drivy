import * as THREE from 'three';

/** Total quads kept; the oldest are overwritten first. */
const MAX_SEGMENTS = 2000;
const WIDTH = 0.38;
/** Seconds before a mark has fully faded. */
const LIFETIME = 10;
/** Minimum distance between strip points. */
const MIN_STEP = 0.3;
/** Lift above the ground: avoids z-fighting and covers the ground mesh's small deviations from the true height. */
const LIFT = 0.05;

interface Track {
  active: boolean;
  last: THREE.Vector3;
  /** Edge points and alpha at the end of the previous quad, so strips stay joined. */
  lastLeft: THREE.Vector3;
  lastRight: THREE.Vector3;
  lastAlpha: number;
}

/**
 * Tyre marks drawn as continuous ribbons, one per wheel. All ribbons share a
 * single ring-buffered mesh, and fading happens in the shader by age.
 */
export class SkidMarks {
  readonly mesh: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly births: Float32Array;
  private readonly alphas: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly tracks: Track[] = [];
  private cursor = 0;
  private time = 0;

  constructor(wheelCount: number, color = '#9d8fb0') {
    const verts = MAX_SEGMENTS * 4;
    this.positions = new Float32Array(verts * 3);
    this.births = new Float32Array(verts).fill(-1e6);
    this.alphas = new Float32Array(verts);

    const indices = new Uint32Array(MAX_SEGMENTS * 6);
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      const v = i * 4;
      indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aBirth', new THREE.BufferAttribute(this.births, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLifetime: { value: LIFETIME },
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: /* glsl */ `
        attribute float aBirth;
        attribute float aAlpha;
        uniform float uTime;
        uniform float uLifetime;
        varying float vAlpha;
        void main() {
          float age = (uTime - aBirth) / uLifetime;
          vAlpha = aAlpha * clamp(1.0 - age * age, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * 0.5);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      // Quads are wound clockwise seen from above; draw both faces rather than fuss.
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // The buffer holds marks from all over the world; bounds would always be stale.
    this.mesh.frustumCulled = false;

    for (let i = 0; i < wheelCount; i++) {
      this.tracks.push({
        active: false,
        last: new THREE.Vector3(),
        lastLeft: new THREE.Vector3(),
        lastRight: new THREE.Vector3(),
        lastAlpha: 0,
      });
    }
  }

  /**
   * Advance time and extend each wheel's ribbon. `intensity` 0 lifts the
   * "pen" so the next skid starts a fresh ribbon.
   */
  update(dt: number, wheels: readonly THREE.Vector3[], intensity: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;

    wheels.forEach((p, i) => {
      const track = this.tracks[i];
      if (intensity <= 0.05) {
        track.active = false;
        return;
      }
      if (!track.active) {
        track.active = true;
        track.last.copy(p);
        track.lastAlpha = 0; // fade in at the start of a ribbon
        track.lastLeft.set(p.x, p.y + LIFT, p.z);
        track.lastRight.set(p.x, p.y + LIFT, p.z);
        return;
      }

      const dx = p.x - track.last.x;
      const dz = p.z - track.last.z;
      const len = Math.hypot(dx, dz);
      if (len < MIN_STEP) return;
      // A big jump (teleport/reset) shouldn't draw a streak across the map.
      if (len > 4) {
        track.active = false;
        return;
      }

      const half = WIDTH / 2;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const left = new THREE.Vector3(p.x + nx, p.y + LIFT, p.z + nz);
      const right = new THREE.Vector3(p.x - nx, p.y + LIFT, p.z - nz);
      // A freshly started ribbon gets proper width at its first point.
      if (track.lastAlpha === 0) {
        track.lastLeft.set(track.last.x + nx, track.last.y + LIFT, track.last.z + nz);
        track.lastRight.set(track.last.x - nx, track.last.y + LIFT, track.last.z - nz);
      }

      this.writeQuad(track.lastLeft, track.lastRight, left, right, track.lastAlpha, intensity);

      track.last.copy(p);
      track.lastLeft.copy(left);
      track.lastRight.copy(right);
      track.lastAlpha = intensity;
    });
  }

  clear(): void {
    this.births.fill(-1e6);
    this.geometry.attributes.aBirth.needsUpdate = true;
    for (const t of this.tracks) t.active = false;
  }

  private writeQuad(
    a0: THREE.Vector3,
    a1: THREE.Vector3,
    b0: THREE.Vector3,
    b1: THREE.Vector3,
    alphaA: number,
    alphaB: number,
  ): void {
    const v = this.cursor * 4;
    const pts = [a0, a1, b0, b1];
    for (let k = 0; k < 4; k++) {
      this.positions.set([pts[k].x, pts[k].y, pts[k].z], (v + k) * 3);
      this.births[v + k] = this.time;
      this.alphas[v + k] = k < 2 ? alphaA : alphaB;
    }
    this.cursor = (this.cursor + 1) % MAX_SEGMENTS;

    // Upload only the quad that changed, not the whole 2000-quad buffer.
    const attrs = this.geometry.attributes;
    for (const [attr, size] of [
      [attrs.position, 3],
      [attrs.aBirth, 1],
      [attrs.aAlpha, 1],
    ] as const) {
      (attr as THREE.BufferAttribute).addUpdateRange(v * size, 4 * size);
      attr.needsUpdate = true;
    }
  }
}
