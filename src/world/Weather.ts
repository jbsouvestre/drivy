/** Seconds for a shower to roll in or clear up. */
const FADE_TIME = 12;
/** Clear spells and showers last a random time within these ranges (real seconds). */
const CLEAR_TIME: [number, number] = [150, 300];
const RAIN_TIME: [number, number] = [70, 140];
/** The first spell is always clear, so a new game starts sunny. */
const FIRST_CLEAR = 90;

/**
 * Gentle weather: long clear spells broken by passing showers. `rain` fades
 * smoothly between 0 (clear) and 1 (full shower) so everything that reacts to
 * it — sky, particles, animals, sound — eases in and out together.
 */
export class Weather {
  /** 0 clear → 1 full shower. */
  rain = 0;
  private raining = false;
  private timer = FIRST_CLEAR;

  get isRaining(): boolean {
    return this.rain > 0.5;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.raining = !this.raining;
      const [min, max] = this.raining ? RAIN_TIME : CLEAR_TIME;
      this.timer = min + Math.random() * (max - min);
    }
    const target = this.raining ? 1 : 0;
    const step = dt / FADE_TIME;
    this.rain = target > this.rain ? Math.min(target, this.rain + step) : Math.max(target, this.rain - step);
  }

  /** Jump straight into (or out of) a shower. */
  set(raining: boolean): void {
    this.raining = raining;
    this.rain = raining ? 1 : 0;
    const [min, max] = raining ? RAIN_TIME : CLEAR_TIME;
    this.timer = min + Math.random() * (max - min);
  }
}
