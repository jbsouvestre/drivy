/** Stick travel (CSS px) for a full push. */
const STICK_RADIUS = 56;
/** In photo mode, touches starting in this left share of the screen drive the creep stick. */
const PHOTO_STICK_SHARE = 0.4;

export type TouchMode = 'hidden' | 'drive' | 'photo';

export interface TouchActions {
  chime(): void;
  camera(): void;
  shutter(): void;
  /** Photo mode: drag to look (CSS px moved). */
  look(dx: number, dy: number): void;
  /** Photo mode: pinch; > 1 zooms in. */
  zoom(scale: number): void;
}

type Hold = 'honk' | 'drift';

/**
 * On-screen controls for phones and tablets: a floating joystick (it appears
 * where the thumb lands), hold buttons for honk and drift, taps for chime and
 * camera, and in photo mode a shutter plus drag-to-look and pinch-to-zoom.
 *
 * They show while playing if the last input was a touch, and hide again as
 * soon as a key is pressed, so hybrid devices get whichever fits.
 */
export class TouchControls {
  /** Joystick: x right, y up, length ≤ 1; zero when not held. */
  readonly stick = { x: 0, y: 0, active: false };
  honk = false;
  drift = false;

  private readonly layer: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private mode: TouchMode = 'hidden';
  private enabled: boolean;
  private stickPointer: number | null = null;
  private readonly origin = { x: 0, y: 0 };
  /** Photo mode look/pinch pointers and their last positions. */
  private readonly lookPointers = new Map<number, { x: number; y: number }>();
  private readonly holds = new Map<number, Hold>();

  constructor(private readonly actions: TouchActions) {
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.layer.innerHTML = `
      <div class="stick" aria-hidden="true"><div class="stick-knob"></div></div>
      <div class="touch-buttons">
        <button class="tbtn tb-camera" type="button" data-act="camera" aria-label="Camera">📷</button>
        <button class="tbtn tb-chime" type="button" data-act="chime" aria-label="Chime">✨</button>
        <button class="tbtn tb-honk" type="button" data-act="honk" aria-label="Honk">📣</button>
        <button class="tbtn tb-drift" type="button" data-act="drift" aria-label="Drift">🌀</button>
        <button class="tbtn tb-shutter" type="button" data-act="shutter" aria-label="Take photo"></button>
      </div>`;
    // Under the HUD, so its pills and the polaroid stay tappable above it.
    document.querySelector('#hud')!.before(this.layer);
    this.base = this.layer.querySelector('.stick')!;
    this.knob = this.layer.querySelector('.stick-knob')!;

    // Touch-only devices start with touch controls; others switch on the first touch.
    this.enabled = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && this.setEnabled(true), { capture: true });
    window.addEventListener(
      'keydown',
      (e) => {
        // Typing in a text field (e.g. a phone's on-screen keyboard) isn't switching to keys.
        if (!(e.target instanceof HTMLInputElement)) this.setEnabled(false);
      },
      { capture: true },
    );

    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    this.layer.addEventListener('pointermove', (e) => this.onMove(e));
    for (const type of ['pointerup', 'pointercancel'] as const) this.layer.addEventListener(type, (e) => this.onUp(e));
    // No long-press menus or selection on the controls.
    this.layer.addEventListener('contextmenu', (e) => e.preventDefault());
    this.apply();
  }

  /** Whether touch controls are in use (the last input was a touch). */
  get active(): boolean {
    return this.enabled;
  }

  setMode(mode: TouchMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.releaseAll();
    this.apply();
  }

  private setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.releaseAll();
    this.apply();
  }

  private apply(): void {
    document.body.classList.toggle('touch', this.enabled);
    this.layer.dataset.mode = this.enabled ? this.mode : 'hidden';
  }

  private onDown(e: PointerEvent): void {
    if (this.mode === 'hidden') return;
    e.preventDefault();
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.tbtn');
    if (button) {
      this.press(button.dataset.act!, e.pointerId);
      button.classList.add('down');
      this.capture(e.pointerId);
      return;
    }
    const inStickZone = this.mode === 'drive' || e.clientX < window.innerWidth * PHOTO_STICK_SHARE;
    if (inStickZone && this.stickPointer === null) {
      this.stickPointer = e.pointerId;
      this.origin.x = e.clientX;
      this.origin.y = e.clientY;
      this.stick.active = true;
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.classList.add('on');
      this.moveKnob(0, 0);
    } else if (this.mode === 'photo') {
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else {
      return;
    }
    this.capture(e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.stickPointer) {
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS) {
        // The stick follows the thumb when it slides past the edge (a "floating" stick).
        this.origin.x += (dx / d) * (d - STICK_RADIUS);
        this.origin.y += (dy / d) * (d - STICK_RADIUS);
        this.base.style.transform = `translate(${this.origin.x}px, ${this.origin.y}px)`;
        dx = e.clientX - this.origin.x;
        dy = e.clientY - this.origin.y;
      }
      this.stick.x = dx / STICK_RADIUS;
      this.stick.y = -dy / STICK_RADIUS;
      this.moveKnob(dx, dy);
      return;
    }
    const last = this.lookPointers.get(e.pointerId);
    if (!last) return;
    if (this.lookPointers.size >= 2) {
      // Pinch: compare the spread of the first two fingers before and after this move.
      const [a, b] = [...this.lookPointers.entries()];
      const other = a[0] === e.pointerId ? b[1] : a[1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 10) this.actions.zoom(after / before);
    } else {
      this.actions.look(e.clientX - last.x, e.clientY - last.y);
    }
    last.x = e.clientX;
    last.y = e.clientY;
  }

  private onUp(e: PointerEvent): void {
    const hold = this.holds.get(e.pointerId);
    if (hold) {
      this.holds.delete(e.pointerId);
      if (![...this.holds.values()].includes(hold)) this[hold] = false;
    }
    this.layer.querySelectorAll('.tbtn.down').forEach((b) => {
      if (![...this.holds.values()].includes((b as HTMLElement).dataset.act as Hold)) b.classList.remove('down');
    });
    if (e.pointerId === this.stickPointer) this.releaseStick();
    this.lookPointers.delete(e.pointerId);
  }

  private press(act: string, pointer: number): void {
    if (act === 'honk' || act === 'drift') {
      this.holds.set(pointer, act);
      this[act] = true;
    } else if (act === 'chime') this.actions.chime();
    else if (act === 'camera') this.actions.camera();
    else if (act === 'shutter') this.actions.shutter();
  }

  /** Keep receiving a finger's moves even if it slides off where it started. */
  private capture(pointer: number): void {
    try {
      this.layer.setPointerCapture(pointer);
    } catch {
      // The pointer is already gone (lifted in the same instant): nothing to track.
    }
  }

  private moveKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private releaseStick(): void {
    this.stickPointer = null;
    this.stick.x = this.stick.y = 0;
    this.stick.active = false;
    this.base.classList.remove('on');
  }

  private releaseAll(): void {
    this.releaseStick();
    this.lookPointers.clear();
    this.holds.clear();
    this.honk = this.drift = false;
    this.layer.querySelectorAll('.tbtn.down').forEach((b) => b.classList.remove('down'));
  }
}
