import type { BiomeId } from '../world/biomes';
import { runningAudio } from './audio';

const MUTE_KEY = 'drivy.ambienceMuted';
/** Overall ambience loudness (everything else is relative to it). */
const MASTER = 0.55;
/** Seconds for layers to glide to new levels. */
const GLIDE = 1.5;

export interface AmbienceState {
  /** How much of each biome surrounds the player, 0–1. */
  biomes: Record<BiomeId, number>;
  /** 0 day → 1 night. */
  darkness: number;
  /** 0 clear → 1 shower. */
  rain: number;
}

interface Bed {
  gain: GainNode;
}

/**
 * A soft, synthesised soundscape: wind, water, waves and rain as filtered
 * noise beds, plus little scheduled events — birdsong by day, crickets at
 * night, sparkly chimes in Mushroom Hollow. Everything crossfades with the
 * biome mix, time of day and weather. No audio files.
 */
export class Ambience {
  private master: GainNode | null = null;
  private wind: Bed | null = null;
  private water: Bed | null = null;
  private rainBed: Bed | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private birdTimer = 1;
  private cricketTimer = 1;
  private sparkleTimer = 2;
  private time = 0;
  muted: boolean;

  constructor() {
    let muted = false;
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Default to sound on.
    }
    this.muted = muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Session-only.
    }
    return this.muted;
  }

  /** Call every frame. Silently waits until sound has been unlocked by a click. */
  update(dt: number, s: AmbienceState, active: boolean): void {
    const ac = runningAudio();
    if (!ac) return;
    if (!this.master) this.build(ac);
    this.time += dt;
    const now = ac.currentTime;
    const on = active && !this.muted ? 1 : 0;
    this.master!.gain.setTargetAtTime(MASTER * on, now, 0.4);
    if (!on) return;

    const b = s.biomes;
    const day = 1 - s.darkness;

    // Wind: strongest out in the open dunes and snowy hills, a breeze elsewhere.
    const wind = 0.12 + 0.45 * (b.dunes + b.snow) + 0.2 * b.coast + 0.1 * s.rain;
    // Slow gusts: swell and sweep the filter.
    const gust = 0.75 + 0.25 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.13 + 1);
    this.set(this.wind!, wind * gust, now);
    this.windFilter!.frequency.setTargetAtTime(320 + 380 * gust, now, GLIDE);

    // Water: gentle lapping in the wetlands, rolling waves on the coast.
    const waves = 0.55 + 0.45 * Math.sin(this.time * (Math.PI * 2 / 7));
    this.set(this.water!, 0.35 * b.wetlands + 0.5 * b.coast * waves + 0.12 * b.meadow, now);

    // Rain: a soft hiss while it pours.
    this.set(this.rainBed!, 0.17 * s.rain * (1 - b.snow), now);

    // Birdsong by day in the green biomes (hushed by rain).
    this.birdTimer -= dt;
    const birdy = day * (b.meadow + b.blossom + 0.6 * b.wetlands + 0.4 * b.coast) * (1 - 0.8 * s.rain);
    if (this.birdTimer <= 0) {
      this.birdTimer = 0.8 + Math.random() * 3.5;
      if (Math.random() < birdy) this.chirp(ac);
    }

    // Crickets on warm nights (not in the snow).
    this.cricketTimer -= dt;
    const crickets = s.darkness * (1 - b.snow) * (1 - 0.6 * s.rain);
    if (this.cricketTimer <= 0) {
      this.cricketTimer = 0.9 + Math.random() * 1.4;
      if (Math.random() < crickets) this.cricket(ac);
    }

    // Twinkly chimes in Mushroom Hollow, more at night.
    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = 1.5 + Math.random() * 3;
      if (Math.random() < b.mushroom * (0.35 + 0.65 * s.darkness)) this.sparkle(ac);
    }
  }

  private set(bed: Bed, level: number, now: number): void {
    bed.gain.gain.setTargetAtTime(Math.max(0, level), now, GLIDE);
  }

  /** Create the noise beds (once). */
  private build(ac: AudioContext): void {
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(ac.destination);

    // Two seconds of noise, looped by each bed at slightly different rates so they don't phase.
    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const bed = (filters: BiquadFilterNode[], rate: number): Bed => {
      const src = ac.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = rate;
      const gain = ac.createGain();
      gain.gain.value = 0;
      let node: AudioNode = src;
      for (const f of filters) node = node.connect(f);
      node.connect(gain).connect(this.master!);
      src.start();
      return { gain };
    };
    const filter = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      f.Q.value = q;
      return f;
    };

    this.windFilter = filter('bandpass', 500, 0.6);
    this.wind = bed([this.windFilter], 0.8);
    this.water = bed([filter('lowpass', 450), filter('peaking', 180, 1)], 0.6);
    this.rainBed = bed([filter('highpass', 1400), filter('lowpass', 7000)], 1.1);
  }

  /** A little bird phrase: 2–5 quick, bright sweeps. */
  private chirp(ac: AudioContext): void {
    const base = 2200 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    let t = ac.currentTime;
    for (let i = 0; i < notes; i++) {
      const len = 0.06 + Math.random() * 0.08;
      const osc = ac.createOscillator();
      osc.type = 'sine';
      const f0 = base * (0.85 + Math.random() * 0.3);
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.75), t + len);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + len + 0.02);
      t += len + 0.03 + Math.random() * 0.06;
    }
  }

  /** A cricket: a short train of high, trilling pulses. */
  private cricket(ac: AudioContext): void {
    const freq = 4200 + Math.random() * 900;
    let t = ac.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const trill = ac.createOscillator();
      const depth = ac.createGain();
      trill.frequency.value = 45;
      depth.gain.value = 0.012;
      const g = ac.createGain();
      g.gain.value = 0;
      trill.connect(depth).connect(g.gain);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      trill.start(t);
      osc.stop(t + 0.09);
      trill.stop(t + 0.09);
      t += 0.14;
    }
  }

  /** A soft, twinkly bell (Mushroom Hollow). */
  private sparkle(ac: AudioContext): void {
    const scale = [1318.5, 1568, 1760, 2093, 2349];
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = scale[Math.floor(Math.random() * scale.length)];
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 1.65);
  }
}
