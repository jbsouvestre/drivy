import type { RecordResult } from '../safari/Journal';
import type { Snapshot } from '../safari/snapshot';
import { behaviorLabel, species, type SpeciesId } from '../safari/species';

/** How long the polaroid stays up after a shot: the window for keeping it in the photobook. */
const TOAST_TIME = 5000;
/** After keeping a photo, the polaroid lingers at least this long, to show it worked. */
const KEPT_LINGER = 1200;
/** Keep-ring circumference (r = 15). */
const RING = 2 * Math.PI * 15;

export interface ToastInfo {
  /** Photo requests this shot completed (their texts). */
  requests?: string[];
  /** URL of the thumbnail to show. */
  image: string;
  /** The photo itself, in case it's kept. */
  snapshot: Snapshot;
  species: SpeciesId | null;
  stars: number;
  behaviors: string[];
  result: RecordResult | null;
}

/** Viewfinder overlay, shutter flash and the polaroid that pops up after each shot. */
export class PhotoHud {
  private readonly viewfinder = el('#viewfinder');
  private readonly zoom = el('#vf-zoom');
  private readonly subject = el('#vf-subject');
  private readonly lockHint = el('#vf-lock');
  private readonly flash = el('#flash');
  private readonly toast = el('#photo-toast');
  private toastTimer = 0;
  private hideAt = 0;
  /** The photo on show, while it can still be kept (null once kept or gone). */
  private keepable: ToastInfo | null = null;
  /** Called when the player keeps the photo on show. */
  onKeep: ((info: ToastInfo) => void) | null = null;

  constructor() {
    // The keep button is also clickable (when the mouse isn't captured by the camera).
    this.toast.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.keep')) this.keep();
    });
  }

  /** Keep the photo on show in the photobook. Returns false if there's nothing to keep. */
  keep(): boolean {
    const info = this.keepable;
    if (!info) return false;
    this.keepable = null;
    const button = this.toast.querySelector<HTMLElement>('.keep');
    button?.classList.add('kept');
    const label = this.toast.querySelector<HTMLElement>('.keep-label');
    if (label) label.textContent = '✓ Kept in photobook';
    // Linger a little so the "kept" state is seen.
    const remaining = this.hideAt - performance.now();
    if (remaining < KEPT_LINGER) this.hideIn(KEPT_LINGER);
    this.onKeep?.(info);
    return true;
  }

  show(on: boolean): void {
    this.viewfinder.classList.toggle('hidden', !on);
    document.body.classList.toggle('photo-mode', on);
    if (!on) this.setHint(null, 0, false);
  }

  setLocked(locked: boolean): void {
    this.lockHint.classList.toggle('hidden', locked);
  }

  setZoom(zoom: number): void {
    const text = `${zoom.toFixed(1)}×`;
    if (this.zoom.textContent !== text) this.zoom.textContent = text;
  }

  /** Live "what's in frame" hint. Unknown species show as a mystery. */
  setHint(id: SpeciesId | null, stars: number, known: boolean): void {
    if (!id) {
      this.subject.textContent = '';
      this.subject.classList.add('hidden');
      return;
    }
    const sp = species(id);
    const label = known ? `${sp.emoji} ${sp.name}` : '❔ Something new!';
    this.subject.textContent = `${label}  ${starText(stars)}`;
    this.subject.classList.remove('hidden');
  }

  shutter(): void {
    this.flash.classList.remove('go');
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add('go');
  }

  showPhoto(info: ToastInfo): void {
    const sp = info.species ? species(info.species) : null;
    const tags: string[] = [];
    if (sp?.legendary) tags.push(`<span class="tag legendary">✨ Legendary!</span>`);
    for (let i = 0; i < (info.requests?.length ?? 0); i++) tags.push(`<span class="tag post">📮 Request done!</span>`);
    if (info.result?.newSpecies) tags.push(`<span class="tag new">New species!</span>`);
    else if (info.result?.newBest) tags.push(`<span class="tag new">New best!</span>`);
    if (sp) {
      for (const b of info.behaviors) {
        const isNew = info.result?.newBehaviors.includes(b) && !info.result.newSpecies;
        tags.push(`<span class="tag${isNew ? ' new' : ''}">${isNew ? 'New: ' : ''}${behaviorLabel(sp.id, b)}</span>`);
      }
    }
    this.toast.innerHTML = `
      <div class="polaroid">
        <img src="${info.image}" alt="" />
        <div class="pl-caption">
          <strong>${sp ? `${sp.emoji} ${sp.name}` : 'A lovely view'}</strong>
          <span class="stars">${sp ? starText(info.stars) : ''}</span>
        </div>
        <div class="pl-tags">${sp ? tags.join('') : '<span class="tag">No animals in this one</span>'}</div>
        <button class="keep" type="button" style="--keep-time: ${TOAST_TIME}ms" title="Keep this photo in the photobook">
          <span class="keep-key">
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle class="keep-track" cx="18" cy="18" r="15" />
              <circle class="keep-ring" cx="18" cy="18" r="15" stroke-dasharray="${RING.toFixed(2)}" />
            </svg>
            <kbd>F</kbd>
          </span>
          <span class="keep-label">Keep in photobook</span>
        </button>
      </div>`;
    this.keepable = info;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    this.hideIn(TOAST_TIME);
  }

  private hideIn(ms: number): void {
    window.clearTimeout(this.toastTimer);
    this.hideAt = performance.now() + ms;
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('show');
      this.keepable = null; // gone: too late to keep it
    }, ms);
  }
}

export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

function el(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}
