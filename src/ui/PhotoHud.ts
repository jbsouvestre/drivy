import type { RecordResult } from '../safari/Journal';
import { behaviorLabel, species, type SpeciesId } from '../safari/species';

const TOAST_TIME = 3600;

export interface ToastInfo {
  image: string;
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
      </div>`;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), TOAST_TIME);
  }
}

export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

function el(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}
