import * as THREE from 'three';

const COUNT = 90;
/** Petals fall within this radius around the player, from up to TOP above the ground. */
const RADIUS = 22;
const TOP = 11;
const COLORS = ['#ffc8dd', '#ffafcc', '#ffe0ee', '#ffffff'];

/**
 * Blossom petals drifting down around the player. `amount` (how much of the
 * Blossom Woods biome is here) fades them in and out.
 */
export class Petals {
  readonly points: THREE.Points;

  private readonly positions = new Float32Array(COUNT * 3);
  private readonly phases = new Float32Array(COUNT);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.PointsMaterial;
  private placed = false;
  private level = 0;

  constructor() {
    const colors = new Float32Array(COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      this.phases[i] = Math.random() * Math.PI * 2;
      c.set(COLORS[i % COLORS.length]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.PointsMaterial({
      size: 0.5,
      map: petalTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      alphaTest: 0.05,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(dt: number, focus: THREE.Vector3, amount: number): void {
    this.level += (amount - this.level) * Math.min(1, dt * 1.5);
    this.material.opacity = THREE.MathUtils.smoothstep(this.level, 0.2, 0.8) * 0.95;
    this.points.visible = this.material.opacity > 0.01;
    if (!this.points.visible) return;

    const p = this.positions;
    if (!this.placed) {
      this.placed = true;
      for (let i = 0; i < COUNT; i++) this.respawn(i, focus, Math.random() * TOP);
    }
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      this.phases[i] += dt * 1.7;
      // Fall slowly with a lazy side-to-side flutter and a light breeze.
      p[k] += (Math.sin(this.phases[i]) * 0.6 + 0.35) * dt;
      p[k + 1] -= (0.7 + Math.sin(this.phases[i] * 0.7) * 0.25) * dt;
      p[k + 2] += Math.cos(this.phases[i] * 0.8) * 0.4 * dt;
      const dx = p[k] - focus.x;
      const dz = p[k + 2] - focus.z;
      if (p[k + 1] < focus.y - 1 || dx * dx + dz * dz > RADIUS * RADIUS) this.respawn(i, focus, TOP);
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  private respawn(i: number, focus: THREE.Vector3, height: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RADIUS;
    const k = i * 3;
    this.positions[k] = focus.x + Math.cos(a) * r;
    this.positions[k + 1] = focus.y + height * (0.6 + Math.random() * 0.4);
    this.positions[k + 2] = focus.z + Math.sin(a) * r;
  }
}

/** A soft white petal shape, tinted per petal through vertex colours. */
function petalTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * 0.42, size * 0.26, -0.6, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
