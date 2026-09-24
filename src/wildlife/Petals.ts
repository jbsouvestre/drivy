import * as THREE from 'three';

export interface DriftStyle {
  count: number;
  colors: string[];
  size: number;
  /** Units/sec downward; negative makes particles rise (like spores). */
  fall: number;
  /** Side-to-side flutter strength. */
  flutter: number;
  shape: 'petal' | 'dot';
  /** Additive glow (for spores). */
  glow?: boolean;
}

/** Blossom petals drifting down in Blossom Woods. */
export const PETALS: DriftStyle = { count: 90, colors: ['#ffc8dd', '#ffafcc', '#ffe0ee', '#ffffff'], size: 0.5, fall: 0.7, flutter: 0.6, shape: 'petal' };
/** Soft snowflakes in Snowdrop Hills. */
export const SNOW: DriftStyle = { count: 160, colors: ['#ffffff', '#f2f4ff', '#eef8ff'], size: 0.45, fall: 1.1, flutter: 0.35, shape: 'dot' };
/** Glowing spores rising lazily in Mushroom Hollow. */
export const SPORES: DriftStyle = { count: 70, colors: ['#e6c8ff', '#c8f0ff', '#ffd6f0', '#fff3b0'], size: 0.3, fall: -0.35, flutter: 0.5, shape: 'dot', glow: true };

/** Particles live within this radius around the player, up to TOP above the ground. */
const RADIUS = 22;
const TOP = 11;

/**
 * Ambient particles drifting around the player (petals, snow, spores).
 * `amount` (how much of the matching biome is here) fades them in and out.
 */
export class Drift {
  readonly points: THREE.Points;

  private readonly positions: Float32Array;
  private readonly phases: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.PointsMaterial;
  private placed = false;
  private level = 0;

  constructor(private readonly style: DriftStyle) {
    const n = style.count;
    this.positions = new Float32Array(n * 3);
    this.phases = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.phases[i] = Math.random() * Math.PI * 2;
      c.set(style.colors[i % style.colors.length]);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.PointsMaterial({
      size: style.size,
      map: style.shape === 'petal' ? petalTexture() : dotTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      alphaTest: style.glow ? 0 : 0.05,
      blending: style.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: !style.glow,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(dt: number, focus: THREE.Vector3, amount: number, brightness = 1): void {
    this.level += (amount - this.level) * Math.min(1, dt * 1.5);
    this.material.opacity = THREE.MathUtils.smoothstep(this.level, 0.2, 0.8) * 0.95 * brightness;
    this.points.visible = this.material.opacity > 0.01;
    if (!this.points.visible) return;

    const { fall, flutter } = this.style;
    const p = this.positions;
    if (!this.placed) {
      this.placed = true;
      for (let i = 0; i < this.style.count; i++) this.respawn(i, focus, Math.random() * TOP);
    }
    for (let i = 0; i < this.style.count; i++) {
      const k = i * 3;
      this.phases[i] += dt * 1.7;
      p[k] += (Math.sin(this.phases[i]) * flutter + 0.35 * Math.sign(fall)) * dt;
      p[k + 1] -= (fall + Math.sin(this.phases[i] * 0.7) * 0.25 * Math.abs(fall)) * dt;
      p[k + 2] += Math.cos(this.phases[i] * 0.8) * flutter * 0.7 * dt;
      const dx = p[k] - focus.x;
      const dz = p[k + 2] - focus.z;
      const out = fall > 0 ? p[k + 1] < focus.y - 1 : p[k + 1] > focus.y + TOP;
      if (out || dx * dx + dz * dz > RADIUS * RADIUS) this.respawn(i, focus, fall > 0 ? TOP : 0);
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  private respawn(i: number, focus: THREE.Vector3, height: number): void {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RADIUS;
    const k = i * 3;
    this.positions[k] = focus.x + Math.cos(a) * r;
    this.positions[k + 1] = focus.y + (this.style.fall > 0 ? height * (0.6 + Math.random() * 0.4) : height + Math.random() * 3 - 1);
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

/** A soft round dot (snowflake, spore). */
function dotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
