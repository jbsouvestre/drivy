import type { Journal } from '../safari/Journal';
import { SPECIES } from '../safari/species';
import { starText } from './PhotoHud';

/** The field journal overlay: one card per species, silhouettes until photographed. */
export class JournalView {
  readonly dialog: HTMLDialogElement;
  private readonly body: HTMLElement;
  private readonly progress: HTMLElement;

  constructor(private readonly journal: Journal) {
    this.dialog = document.querySelector<HTMLDialogElement>('#journal')!;
    this.body = this.dialog.querySelector<HTMLElement>('.journal-grid')!;
    this.progress = this.dialog.querySelector<HTMLElement>('.journal-progress')!;
    journal.onChange(() => {
      if (this.dialog.open) this.render();
    });
  }

  get open(): boolean {
    return this.dialog.open;
  }

  toggle(): void {
    if (this.dialog.open) this.dialog.close();
    else {
      this.render();
      this.dialog.showModal();
    }
  }

  private render(): void {
    const p = this.journal.progress();
    this.progress.textContent = `${p.species} / ${p.speciesTotal} species · ${p.behaviors} / ${p.behaviorsTotal} behaviours`;

    this.body.innerHTML = SPECIES.map((sp) => {
      const e = this.journal.entry(sp.id);
      const seen = new Set(e?.behaviors ?? []);
      const chips = sp.behaviors
        .map((b) => `<span class="chip${seen.has(b.id) ? ' seen' : ''}">${seen.has(b.id) ? b.label : '?'}</span>`)
        .join('');
      if (!e) {
        return `
          <article class="card unknown">
            <div class="card-photo"><span class="silhouette">${sp.emoji}</span></div>
            <div class="card-body">
              <h3>???${sp.rare ? ' <span class="rare">rare</span>' : ''}</h3>
              <p class="hint">${sp.hint}</p>
              <div class="chips">${chips}</div>
            </div>
          </article>`;
      }
      const file = `drivy-${sp.id}.jpg`;
      return `
        <article class="card">
          <div class="card-photo">
            <img src="${e.photo}" alt="${sp.name}" />
            <a class="save" href="${e.photo}" download="${file}" title="Save photo">⤓</a>
          </div>
          <div class="card-body">
            <h3>${sp.emoji} ${sp.name}${sp.rare ? ' <span class="rare">rare</span>' : ''}</h3>
            <p class="stars">${starText(e.stars)}</p>
            <div class="chips">${chips}</div>
            <p class="meta">seed · ${escapeHtml(e.seed)}</p>
          </div>
        </article>`;
    }).join('');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
