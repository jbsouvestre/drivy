import { audioContext } from './audio';

/** Two square waves a major third apart: a classic, slightly silly toy horn. */
const PITCHES = [370, 466];
const VOLUME = 0.14;
/** Even a quick tap sounds for at least this long, so it reads as a honk. */
const MIN_LENGTH = 0.14;
const RELEASE = 0.06;

interface Voice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  startedAt: number;
}

/** Synthesised car horn (no audio files), played on the shared AudioContext. */
export class Horn {
  private voice: Voice | null = null;

  start(): void {
    if (this.voice) return;
    const ctx = audioContext();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(VOLUME, now + 0.015);

    // Soften the square waves' fizz and add a little honky resonance.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    filter.Q.value = 4;
    filter.connect(gain).connect(ctx.destination);

    const oscillators = PITCHES.map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      // A tiny downward bend at the start gives it that squeezed-bulb "meep".
      osc.frequency.setValueAtTime(freq * 1.06, now);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 0.06);
      osc.connect(filter);
      osc.start(now);
      return osc;
    });

    this.voice = { oscillators, gain, startedAt: now };
  }

  stop(): void {
    if (!this.voice) return;
    const { oscillators, gain, startedAt } = this.voice;
    this.voice = null;

    const releaseAt = Math.max(audioContext().currentTime, startedAt + MIN_LENGTH);
    gain.gain.cancelScheduledValues(releaseAt);
    gain.gain.setValueAtTime(VOLUME, releaseAt);
    gain.gain.linearRampToValueAtTime(0, releaseAt + RELEASE);
    for (const osc of oscillators) osc.stop(releaseAt + RELEASE + 0.02);
  }
}
