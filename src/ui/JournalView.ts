import type { Journal } from '../safari/Journal';
import type { Requests } from '../safari/Requests';
import { SPECIES, type Species } from '../safari/species';
import { BIOMES } from '../world/biomes';
import { starText } from './PhotoHud';

/** The field journal overlay: one card per species, silhouettes until photographed. */
export class JournalView {
  readonly dialog: HTMLDialogElement;
  private readonly body: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly post: HTMLElement;

  constructor(
    private readonly journal: Journal,
    private readonly requests: Requests,
  ) {
    this.dialog = document.querySelector<HTMLDialogElement>('#journal')!;
    this.body = this.dialog.querySelector<HTMLElement>('.journal-grid')!;
    this.progress = this.dialog.querySelector<HTMLElement>('.journal-progress')!;
    this.post = this.dialog.querySelector<HTMLElement>('.post')!;
    const rerender = () => {
      if (this.dialog.open) this.render();
    };
    journal.onChange(rerender);
    requests.onChange(rerender);
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

    // Pelly's board of photo requests.
    const items = this.requests.list.map((r) => `<li>${escapeHtml(r.text)}</li>`).join('');
    this.post.innerHTML = `
      <div class="post-head">
        <span class="pelly" aria-hidden="true">📰</span>
        <div>
          <strong>The Pastel Post</strong>
          <small>Requests from Pelly the pelican, editor · ${this.requests.done} delivered</small>
        </div>
      </div>
      <ul class="post-list">${items || '<li>Nothing needed right now. Explore somewhere new!</li>'}</ul>`;

    // One section per biome; undiscovered biomes stay a mystery.
    this.body.innerHTML = BIOMES.map((biome) => {
      if (!this.journal.hasVisited(biome.id)) {
        return `
          <section class="biome-section locked">
            <h3 class="biome-title"><span class="silhouette-emoji">${biome.emoji}</span> ??? <small>Not discovered yet · keep exploring further from home</small></h3>
          </section>`;
      }
      const bp = this.journal.progress(biome.id);
      const cards = SPECIES.filter((sp) => sp.biome === biome.id).map((sp) => this.card(sp)).join('');
      return `
        <section class="biome-section">
          <h3 class="biome-title">${biome.emoji} ${biome.name} <small>${bp.species} / ${bp.speciesTotal} species · ${bp.behaviors} / ${bp.behaviorsTotal} behaviours</small></h3>
          <div class="journal-cards">${cards}</div>
        </section>`;
    }).join('');
  }

  /** One species card: its best photo, or a silhouette and a hint until photographed. */
  private card(sp: Species): string {
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
            <h3>???${badge(sp)}</h3>
            <p class="hint">${sp.hint}</p>
            <div class="chips">${chips}</div>
          </div>
        </article>`;
    }
    const file = `drivy-${sp.id}.jpg`;
    return `
      <article class="card${sp.legendary ? ' legendary-found' : ''}">
        <div class="card-photo">
          <img src="${e.photo}" alt="${sp.name}" />
          <a class="save" href="${e.photo}" download="${file}" title="Save photo">⤓</a>
        </div>
        <div class="card-body">
          <h3>${sp.emoji} ${sp.name}${badge(sp)}</h3>
          <p class="stars">${starText(e.stars)}</p>
          <div class="chips">${chips}</div>
          <p class="meta">seed · ${escapeHtml(e.seed)}</p>
        </div>
      </article>`;
  }
}

function badge(sp: Species): string {
  if (sp.legendary) return ' <span class="rare legendary">✨ legendary</span>';
  return sp.rare ? ' <span class="rare">rare</span>' : '';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
