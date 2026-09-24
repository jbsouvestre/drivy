import { track } from '../analytics';

/**
 * Session-level analytics, summed up in one `play_session` event whenever the
 * tab is hidden (which covers closing it): active play time (driving, not in
 * menus or dialogs), average frame rate, and how often the player honked and
 * chimed. Each stretch of play is reported once.
 */
export class SessionMetrics {
  honks = 0;
  chimes = 0;
  private playTime = 0;
  private frames = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  /** Call every frame with the real (unclamped) frame time. */
  tick(dt: number, active: boolean): void {
    if (!active || dt <= 0) return;
    this.playTime += dt;
    this.frames++;
  }

  private flush(): void {
    if (this.playTime >= 1) {
      track('play_session', {
        play_seconds: Math.round(this.playTime),
        avg_fps: Math.round(this.frames / this.playTime),
        honks: this.honks,
        chimes: this.chimes,
      });
    }
    this.playTime = 0;
    this.frames = 0;
    this.honks = 0;
    this.chimes = 0;
  }
}
