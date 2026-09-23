import * as THREE from 'three';

/** Real seconds for one full day. */
const CYCLE_SECONDS = 360;
/** Holding fast-forward runs time this many times faster. */
const FAST_FORWARD = 24;
/** Time of day at start (0 = midnight, 0.5 = noon). */
const START_TIME = 0.34;
/** Distance of the sun/moon light from the player. */
const LIGHT_DISTANCE = 30;

interface Keyframe {
  t: number;
  sky: string;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  sun: string;
  sunI: number;
  fogFar: number;
}

/** Pastel lighting moods around the clock. The list wraps from the last key back to the first. */
const KEYS: Keyframe[] = [
  { t: 0.0, sky: '#2f3263', hemiSky: '#6e76c9', hemiGround: '#2d3b4d', hemi: 0.6, sun: '#aebcff', sunI: 0.6, fogFar: 85 },
  { t: 0.2, sky: '#54497f', hemiSky: '#8c83c6', hemiGround: '#46545f', hemi: 0.7, sun: '#c4b5ff', sunI: 0.5, fogFar: 90 },
  { t: 0.27, sky: '#ffcab8', hemiSky: '#ffdcd0', hemiGround: '#c9e2d4', hemi: 1.6, sun: '#ffbf98', sunI: 1.7, fogFar: 105 },
  { t: 0.38, sky: '#fde4ec', hemiSky: '#fff1f6', hemiGround: '#c8ead9', hemi: 1.6, sun: '#fff4e0', sunI: 1.9, fogFar: 110 },
  { t: 0.62, sky: '#fde4ec', hemiSky: '#fff1f6', hemiGround: '#c8ead9', hemi: 1.6, sun: '#fff4e0', sunI: 1.9, fogFar: 110 },
  { t: 0.72, sky: '#ffc3aa', hemiSky: '#ffd6c8', hemiGround: '#d4e2c8', hemi: 1.6, sun: '#ffab88', sunI: 1.7, fogFar: 105 },
  { t: 0.79, sky: '#8a6ea8', hemiSky: '#a58fd0', hemiGround: '#50606c', hemi: 0.8, sun: '#c9a0ff', sunI: 0.5, fogFar: 95 },
  { t: 0.86, sky: '#2f3263', hemiSky: '#6e76c9', hemiGround: '#2d3b4d', hemi: 0.6, sun: '#aebcff', sunI: 0.6, fogFar: 85 },
];

interface ParsedKey {
  t: number;
  sky: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  sun: THREE.Color;
  sunI: number;
  fogFar: number;
}

const PARSED: ParsedKey[] = KEYS.map((k) => ({
  ...k,
  sky: new THREE.Color(k.sky),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
  sun: new THREE.Color(k.sun),
}));

/**
 * Drives sky, fog and lighting through a pastel day/night cycle. The single
 * directional light plays the sun by day and the moon by night.
 */
export class DayNight {
  /** Time of day in [0, 1): 0 = midnight, 0.25 ≈ sunrise, 0.5 = noon, 0.75 ≈ sunset. */
  time = START_TIME;
  /** Where the sun/moon light sits relative to the player. */
  readonly lightOffset = new THREE.Vector3();

  private readonly sky = new THREE.Color();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
  ) {
    this.scene.background = this.sky;
    this.apply();
  }

  /** 0 in full daylight → 1 in full night, easing through dusk and dawn. */
  get darkness(): number {
    return this.time < 0.5 ? 1 - smoothstepf(0.2, 0.27, this.time) : smoothstepf(0.74, 0.81, this.time);
  }

  get isNight(): boolean {
    return this.time < 0.24 || this.time > 0.77;
  }

  /** "HH:MM" on a 24-hour clock. */
  get clock(): string {
    const minutes = Math.floor(this.time * 24 * 60);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt: number, fastForward: boolean): void {
    this.time = (this.time + (dt / CYCLE_SECONDS) * (fastForward ? FAST_FORWARD : 1)) % 1;
    this.apply();
  }

  private apply(): void {
    // Find the two keyframes around the current time (wrapping past midnight).
    let i = PARSED.length - 1;
    while (i > 0 && PARSED[i].t > this.time) i--;
    const a = PARSED[i];
    const b = PARSED[(i + 1) % PARSED.length];
    const span = (b.t > a.t ? b.t : b.t + 1) - a.t;
    const f = smooth((this.time - a.t) / span);

    this.sky.lerpColors(a.sky, b.sky, f);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky);
    fog.far = lerp(a.fogFar, b.fogFar, f);

    this.hemi.color.lerpColors(a.hemiSky, b.hemiSky, f);
    this.hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, f);
    this.hemi.intensity = lerp(a.hemi, b.hemi, f);
    this.sun.color.lerpColors(a.sun, b.sun, f);

    // The sun arcs east → overhead → west; at night the moon takes the opposite arc.
    const sunAngle = (this.time - 0.25) * Math.PI * 2;
    const moonUp = Math.sin(sunAngle) < 0;
    const angle = moonUp ? sunAngle + Math.PI : sunAngle;
    const elevation = Math.sin(angle);
    // Keep the light from getting too low: long shadows, but the ground stays bright.
    this.lightOffset.set(
      Math.cos(angle) * LIGHT_DISTANCE,
      Math.max(elevation, 0.55) * LIGHT_DISTANCE,
      LIGHT_DISTANCE * 0.3,
    );
    // Fade the light out near the horizon so the sun→moon swap never pops the shadows.
    this.sun.intensity = lerp(a.sunI, b.sunI, f) * smoothstepf(0, 0.18, elevation);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function smoothstepf(edge0: number, edge1: number, x: number): number {
  return smooth(Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0))));
}
