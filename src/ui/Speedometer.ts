/** Game units/sec → displayed km/h. Top speed (24) reads ~108. */
const KMH_PER_UNIT = 4.5;
const DIAL_MAX = 120;
/** The dial arc covers 270° of the circle, starting bottom-left. */
const SWEEP = 270;
const START_ANGLE = 135;
const ARC_RADIUS = 50;
/** Seconds parked before the face dozes off. */
const SLEEP_AFTER = 2;
/** Seconds the face stays dizzy after a crash. */
const DIZZY_FOR = 1.2;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Mood = 'sleepy' | 'happy' | 'excited' | 'drift' | 'dizzy';

/**
 * Round speedometer with a little face in the middle whose mood follows the
 * driving: asleep when parked, happy cruising, thrilled at top speed,
 * squinting through drifts, and dizzy after a crash.
 */
export class Speedometer {
  private readonly root: HTMLElement;
  private readonly progress: SVGCircleElement;
  private readonly knob: SVGCircleElement;
  private readonly cheeks: SVGGElement;
  private readonly value: SVGTextElement;
  private readonly gear: HTMLElement;
  private readonly brake: HTMLElement;
  private readonly lights: HTMLElement;
  private shownKmh = -1;
  private needleKmh = 0;
  private idleTime = SLEEP_AFTER;
  private dizzyTime = 0;
  private mood: Mood | null = null;
  /** Last values written to the DOM, so unchanged frames touch nothing. */
  private shownDial = -1;
  private shownGear = '';
  private shownBrake = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <svg class="speedo-dial" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="speedo-track" cx="60" cy="60" r="${ARC_RADIUS}" pathLength="360"
          stroke-dasharray="${SWEEP} 360" transform="rotate(${START_ANGLE} 60 60)" />
        <circle class="speedo-progress" cx="60" cy="60" r="${ARC_RADIUS}" pathLength="360"
          stroke-dasharray="0 360" transform="rotate(${START_ANGLE} 60 60)" />
        <g class="speedo-ticks"></g>
        <circle class="speedo-knob" r="5.5" />

        <g class="speedo-face">
          <g class="speedo-cheeks">
            <ellipse cx="40" cy="52" rx="5" ry="3" />
            <ellipse cx="80" cy="52" rx="5" ry="3" />
          </g>

          <g class="mood m-sleepy">
            <path class="line" d="M43 45 q5 4 10 0 M67 45 q5 4 10 0" />
            <ellipse class="fill" cx="60" cy="56" rx="2.2" ry="1.8" />
            <text class="zzz z1" x="80" y="40">z</text>
            <text class="zzz z2" x="86" y="33">z</text>
          </g>

          <g class="mood m-happy">
            <g class="blink">
              <circle class="fill" cx="48" cy="45" r="3.8" />
              <circle class="fill" cx="72" cy="45" r="3.8" />
              <circle class="shine" cx="49.3" cy="43.6" r="1.3" />
              <circle class="shine" cx="73.3" cy="43.6" r="1.3" />
            </g>
            <path class="line" d="M54 53 q6 5 12 0" />
          </g>

          <g class="mood m-excited">
            <circle class="fill" cx="48" cy="44" r="5" />
            <circle class="fill" cx="72" cy="44" r="5" />
            <circle class="shine" cx="49.8" cy="42.2" r="1.8" />
            <circle class="shine" cx="73.8" cy="42.2" r="1.8" />
            <circle class="shine" cx="46.4" cy="46" r="0.9" />
            <circle class="shine" cx="70.4" cy="46" r="0.9" />
            <path class="fill" d="M52 52 h16 q0 9 -8 9 q-8 0 -8 -9 z" />
            <ellipse class="tongue" cx="60" cy="58.6" rx="4" ry="2" />
          </g>

          <g class="mood m-drift">
            <path class="line" d="M44 41 l7 4 l-7 4 M76 41 l-7 4 l7 4" />
            <path class="fill" d="M50 52 h20 q-2 8 -10 8 q-8 0 -10 -8 z" />
            <path class="teeth" d="M52 52.6 h16 v1.8 h-16 z" />
          </g>

          <g class="mood m-dizzy">
            <path class="line" d="M44 41 l7 7 M51 41 l-7 7 M69 41 l7 7 M76 41 l-7 7" />
            <path class="line" d="M49 57 q2.75 -3 5.5 0 t5.5 0 t5.5 0 t5.5 0" />
          </g>
        </g>

        <text class="speedo-value" x="60" y="80">0</text>
        <text class="speedo-unit" x="60" y="89">km/h</text>
      </svg>
      <div class="speedo-badges">
        <span class="speedo-gear">D</span>
        <span class="speedo-brake" title="Handbrake">P</span>
        <span class="speedo-lights" title="Headlights">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M7 3.5c-2.5 0-4 2-4 4.5s1.5 4.5 4 4.5z" />
            <path class="rays" d="M9.5 5h4M9.5 8h4.5M9.5 11h4" />
          </svg>
        </span>
      </div>
    `;

    const ticks = root.querySelector<SVGGElement>('.speedo-ticks')!;
    for (let kmh = 0; kmh <= DIAL_MAX; kmh += 20) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      const [x, y] = arcPoint(kmh / DIAL_MAX, ARC_RADIUS - 10);
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', y.toFixed(2));
      dot.setAttribute('r', '1.6');
      ticks.appendChild(dot);
    }

    this.progress = root.querySelector('.speedo-progress')!;
    this.knob = root.querySelector('.speedo-knob')!;
    this.cheeks = root.querySelector('.speedo-cheeks')!;
    this.value = root.querySelector('.speedo-value')!;
    this.gear = root.querySelector('.speedo-gear')!;
    this.brake = root.querySelector('.speedo-brake')!;
    this.lights = root.querySelector('.speedo-lights')!;
    this.setMood('sleepy');
  }

  setHeadlights(on: boolean): void {
    this.lights.classList.toggle('on', on);
  }

  /** A honk wakes the face up if it has dozed off. */
  wake(): void {
    this.idleTime = 0;
  }

  /** Trigger the dizzy face after a hard crash. */
  bump(): void {
    this.dizzyTime = DIZZY_FOR;
  }

  /**
   * `groundSpeed` is the car's total speed (so drifting sideways still counts);
   * `forwardSpeed` only decides the gear letter.
   */
  update(dt: number, groundSpeed: number, forwardSpeed: number, handbrake: boolean, skid: number): void {
    const kmh = groundSpeed * KMH_PER_UNIT;
    // A little lag makes the dial feel springy and mechanical.
    this.needleKmh += (kmh - this.needleKmh) * Math.min(1, 10 * dt);
    const frac = Math.min(1, this.needleKmh / DIAL_MAX);

    // The dial only redraws when it visibly moves (a fraction of a degree).
    const dial = Math.round(frac * SWEEP * 2) / 2;
    if (dial !== this.shownDial) {
      this.shownDial = dial;
      this.progress.setAttribute('stroke-dasharray', `${dial.toFixed(1)} 360`);
      const [kx, ky] = arcPoint(frac, ARC_RADIUS);
      this.knob.setAttribute('cx', kx.toFixed(2));
      this.knob.setAttribute('cy', ky.toFixed(2));
      this.cheeks.style.opacity = (0.25 + 0.75 * frac).toFixed(2);
    }

    const rounded = Math.round(kmh);
    if (rounded !== this.shownKmh) {
      this.shownKmh = rounded;
      this.value.textContent = String(rounded);
    }

    const gear = forwardSpeed < -0.5 ? 'R' : 'D';
    if (gear !== this.shownGear) {
      this.shownGear = gear;
      this.gear.textContent = gear;
      this.gear.classList.toggle('reverse', gear === 'R');
    }
    if (handbrake !== this.shownBrake) {
      this.shownBrake = handbrake;
      this.brake.classList.toggle('on', handbrake);
    }

    this.idleTime = kmh < 1 ? this.idleTime + dt : 0;
    this.dizzyTime = Math.max(0, this.dizzyTime - dt);
    if (this.dizzyTime > 0) this.setMood('dizzy');
    else if (skid > 0.5) this.setMood('drift');
    else if (kmh > 80) this.setMood('excited');
    else if (this.idleTime > SLEEP_AFTER) this.setMood('sleepy');
    else this.setMood('happy');
  }

  private setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.root.dataset.mood = mood;
  }
}

/** Point on the dial arc at fraction `frac` of the sweep. */
function arcPoint(frac: number, radius: number): [number, number] {
  const a = ((START_ANGLE + frac * SWEEP) * Math.PI) / 180;
  return [60 + Math.cos(a) * radius, 60 + Math.sin(a) * radius];
}
