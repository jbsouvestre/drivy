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

/** A soft two-note bell: the "come and look" chime that curious animals like. */
export function playChime(): void {
  const ac = audioContext();
  const notes = [
    { at: 0, freq: 1318.5 },
    { at: 0.13, freq: 1760 },
  ];
  for (const n of notes) {
    const start = ac.currentTime + n.at;
    for (const [mult, vol] of [
      [1, 0.1],
      [2.01, 0.025], // a faint overtone gives it a glassy ring
    ] as const) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = n.freq * mult;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 1.35);
    }
  }
}

/** A soft little "ribbit": two quick low blips. */
export function playRibbit(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  for (const at of [0, 0.11]) {
    const start = ac.currentTime + at;
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(330, start);
    osc.frequency.exponentialRampToValueAtTime(190, start + 0.08);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
    osc.connect(filter).connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.1);
  }
}

/** A soft, squelchy "sproing" for a cartoon squash: a quick bouncy drop in pitch. */
export function playSquash(): void {
  const ac = runningAudio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.22);
  // A fast wobble on the pitch makes it springy.
  const wobble = ac.createOscillator();
  const depth = ac.createGain();
  wobble.frequency.value = 28;
  depth.gain.value = 40;
  wobble.connect(depth).connect(osc.frequency);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  wobble.start(t);
  osc.stop(t + 0.36);
  wobble.stop(t + 0.36);
}

/** A bright rising "boing!" for a cartoon launch. */
export function playLaunch(): void {
  const ac = runningAudio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.3);
  const wobble = ac.createOscillator();
  const depth = ac.createGain();
  wobble.frequency.value = 18;
  depth.gain.value = 60;
  wobble.connect(depth).connect(osc.frequency);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.11, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  wobble.start(t);
  osc.stop(t + 0.46);
  wobble.stop(t + 0.46);
}

/** A soft tone with a quick attack and an exponential fade. */
function tone(ac: AudioContext, type: OscillatorType, freq: number, start: number, length: number, volume: number, destination: AudioNode = ac.destination): void {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** A lighthouse answering a honk: a deep, mellow two-note foghorn. */
export function playFoghorn(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.connect(ac.destination);
  const t = ac.currentTime;
  for (const [at, freq] of [
    [0, 110],
    [0.95, 87],
  ]) {
    tone(ac, 'sawtooth', freq, t + at, 1.0, 0.16 * volume, filter);
    tone(ac, 'sine', freq / 2, t + at, 1.0, 0.12 * volume, filter);
  }
}

/** The honk bouncing back off a pyramid or down a well: two fading "meep"s. */
export function playEcho(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.connect(ac.destination);
  const t = ac.currentTime;
  [0.35, 0.75].forEach((at, i) => {
    const v = 0.05 * volume * (i === 0 ? 1 : 0.45);
    tone(ac, 'square', 392, t + at, 0.22, v, filter);
    tone(ac, 'square', 494, t + at, 0.22, v, filter);
  });
}

/** Little temple bells tinkling on a pagoda. */
export function playBells(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  const notes = [1568, 1760, 2093, 2349, 2637];
  const t = ac.currentTime;
  for (let i = 0; i < 5; i++) {
    const freq = notes[Math.floor(Math.random() * notes.length)];
    const at = t + i * 0.09 + Math.random() * 0.05;
    tone(ac, 'sine', freq, at, 0.9, 0.05 * volume);
    tone(ac, 'sine', freq * 2.76, at, 0.4, 0.012 * volume);
  }
}

/** A magical rising twinkle (driving through a fairy ring). */
export function playTwinkle(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  const t = ac.currentTime;
  [1318.5, 1661, 1976, 2637, 3136].forEach((freq, i) => tone(ac, 'sine', freq, t + i * 0.07, 0.6, 0.05 * volume));
}

/** A soft sandy "poof" (a sandcastle collapsing). */
export function playPoof(volume: number): void {
  const ac = runningAudio();
  if (!ac || volume <= 0.001) return;
  const t = ac.currentTime;
  const length = 0.35;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * length), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(300, t + length);
  const gain = ac.createGain();
  gain.gain.value = 0.18 * volume;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}
