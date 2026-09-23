let ctx: AudioContext | null = null;

/**
 * The shared AudioContext, created on first use. Call it from a user gesture
 * (click / key press) at least once so browsers allow sound.
 */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** The context if sound is already unlocked and running, else null (ambient sounds just skip). */
export function runningAudio(): AudioContext | null {
  return ctx && ctx.state === 'running' ? ctx : null;
}

/** A soft owl "hoo-hoo": two breathy sine notes with a little vibrato. */
export function playHoot(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;

  const notes = [
    { at: 0, length: 0.32, from: 400, to: 370 },
    { at: 0.42, length: 0.55, from: 380, to: 330 },
  ];
  for (const n of notes) {
    const start = ac.currentTime + n.at;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.from, start);
    osc.frequency.exponentialRampToValueAtTime(n.to, start + n.length);

    const vibrato = ac.createOscillator();
    const vibratoDepth = ac.createGain();
    vibrato.frequency.value = 6;
    vibratoDepth.gain.value = 5;
    vibrato.connect(vibratoDepth).connect(osc.frequency);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.06);
    gain.gain.setValueAtTime(volume, start + n.length * 0.6);
    gain.gain.linearRampToValueAtTime(0, start + n.length);

    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    vibrato.start(start);
    osc.stop(start + n.length + 0.02);
    vibrato.stop(start + n.length + 0.02);
  }
}

/** A short, soft, slightly nasal toy "quack". */
export function playQuack(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  const start = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(620, start);
  osc.frequency.exponentialRampToValueAtTime(380, start + 0.14);

  // A resonant band-pass gives it the quacky "nasal" colour.
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1100;
  filter.Q.value = 3;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + 0.2);
}

let noise: AudioBuffer | null = null;

/** A crisp little camera "ka-chik": two short filtered noise clicks. */
export function playShutter(): void {
  const ac = runningAudio() ?? audioContext();
  if (!noise) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  for (const [delay, freq, volume] of [
    [0, 3200, 0.22],
    [0.07, 2200, 0.16],
  ] as const) {
    const start = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = noise;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.5;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.045);
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start(start);
    src.stop(start + 0.05);
  }
}
