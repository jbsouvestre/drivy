import { distribution } from '../analytics';

/** Seconds of play between frame-rate samples. */
const FPS_SAMPLE = 30;

/**
 * Session-level metrics: active play time (driving, not in menus or dialogs)
 * and a periodic frame-rate sample. Play time is reported whenever the tab is
 * hidden (which covers closing it), so each stretch of play is counted once.
 */
export class SessionMetrics {
  private playTime = 0;
  private fpsTime = 0;
  private fpsFrames = 0;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  /** Call every frame with the real (unclamped) frame time. */
  tick(dt: number, active: boolean): void {
    if (!active || dt <= 0) return;
    this.playTime += dt;
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime >= FPS_SAMPLE) {
      distribution('perf.fps', Math.round(this.fpsFrames / this.fpsTime));
      this.fpsTime = 0;
      this.fpsFrames = 0;
    }
  }

  private flush(): void {
    if (this.playTime >= 1) distribution('session.play_time', Math.round(this.playTime), 'second');
    this.playTime = 0;
    // A partial frame-rate window would mostly measure the tab being backgrounded.
    this.fpsTime = 0;
    this.fpsFrames = 0;
  }
}
