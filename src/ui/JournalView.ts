import type { Journal } from '../safari/Journal';
import type { BookPhoto, Photobook } from '../safari/Photobook';
import type { Requests } from '../safari/Requests';
import { species, SPECIES, type Species } from '../safari/species';
import { biome, BIOMES } from '../world/biomes';
import { starText } from './PhotoHud';

type Tab = 'journal' | 'photobook';

/** A delete button asks "sure?" for this long before a second tap deletes. */
const CONFIRM_TIME = 3000;

/**
 * The journal overlay, in two tabs: the field journal (one card per species,
 * silhouettes until photographed) and the photobook (photos kept on purpose).
 */
export class JournalView {
  readonly dialog: HTMLDialogElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly post: HTMLElement;
  private readonly bookGrid: HTMLElement;
  private readonly tabCount: HTMLElement;
  private tab: Tab = 'journal';
  /** The photo whose delete button is waiting for a confirming tap. */
  private confirming: number | null = null;
  private confirmTimer = 0;

  constructor(
    private readonly journal: Journal,
    private readonly requests: Requests,
    private readonly photobook: Photobook,
  ) {
    this.dialog = document.querySelector<HTMLDialogElement>('#journal')!;
    this.body = this.dialog.querySelector<HTMLElement>('.journal-grid')!;
    this.title = this.dialog.querySelector<HTMLElement>('#journal-title')!;
    this.subtitle = this.dialog.querySelector<HTMLElement>('.journal-sub')!;
    this.post = this.dialog.querySelector<HTMLElement>('.post')!;
    this.bookGrid = this.dialog.querySelector<HTMLElement>('.photobook-grid')!;
    this.tabCount = this.dialog.querySelector<HTMLElement>('.tab-count')!;
    const rerender = () => {
      if (this.dialog.open) this.render();
    };
    journal.onChange(rerender);
    requests.onChange(rerender);
    photobook.onChange(rerender);

    for (const button of this.dialog.querySelectorAll<HTMLButtonElement>('.journal-tab')) {
      button.addEventListener('click', () => {
        this.tab = button.dataset.tab as Tab;
        this.render();
      });
    }
    this.bookGrid.addEventListener('click', (e) => {
      const del = (e.target as HTMLElement).closest<HTMLButtonElement>('.delete');
      if (del) this.onDelete(Number(del.dataset.id));
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
    for (const button of this.dialog.querySelectorAll<HTMLButtonElement>('.journal-tab')) {
      button.setAttribute('aria-selected', String(button.dataset.tab === this.tab));
    }
    const count = this.photobook.list.length;
    this.tabCount.textContent = count > 0 ? String(count) : '';
    this.dialog.querySelector<HTMLElement>('.tab-journal')!.hidden = this.tab !== 'journal';
    this.dialog.querySelector<HTMLElement>('.tab-photobook')!.hidden = this.tab !== 'photobook';
    if (this.tab === 'journal') this.renderJournal();
    else this.renderPhotobook();
  }

  private renderJournal(): void {
    const p = this.journal.progress();
    this.title.textContent = 'Field Journal';
    this.subtitle.textContent = `All biomes · ${p.species} / ${p.speciesTotal} species · ${p.behaviors} / ${p.behaviorsTotal} behaviours`;

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

  private renderPhotobook(): void {
    const photos = this.photobook.list;
    this.title.textContent = 'Photobook';
    this.subtitle.textContent =
      photos.length === 0 ? 'Photos you chose to keep' : `${photos.length} photo${photos.length === 1 ? '' : 's'} · newest first`;
    if (photos.length === 0) {
      this.bookGrid.innerHTML = `
        <p class="photobook-empty">
          No photos kept yet. After snapping a picture, press <kbd>F</kbd> while it's showing to keep it here:
          a lovely view, a funny moment, anything you like.
        </p>`;
      return;
    }
    this.bookGrid.innerHTML = photos.map((photo) => this.bookCard(photo)).join('');
  }

  private bookCard(photo: BookPhoto): string {
    const sp = photo.subject ? species(photo.subject) : null;
    const place = biome(photo.biome);
    const date = new Date(photo.takenAt);
    const when = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const stamp = date.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    const confirming = this.confirming === photo.id;
    return `
      <article class="card book-card">
        <div class="card-photo">
          <img src="${photo.thumbUrl}" alt="${sp ? sp.name : 'A kept photo'}" loading="lazy" />
          <a class="save" href="${photo.fullUrl}" download="drivy-photo-${stamp}.jpg" title="Save photo">⤓</a>
          <button class="delete${confirming ? ' confirm' : ''}" type="button" data-id="${photo.id}" title="Remove from photobook">${confirming ? 'Delete?' : '🗑'}</button>
        </div>
        <div class="card-body">
          <h3>${sp ? `${sp.emoji} ${sp.name}` : 'A lovely view'}</h3>
          ${sp ? `<p class="stars">${starText(photo.stars)}</p>` : ''}
          <p class="meta">${place.emoji} ${place.name} · 🕐 ${escapeHtml(photo.clock)}</p>
          <p class="meta">${escapeHtml(when)} · seed ${escapeHtml(photo.seed)}</p>
        </div>
      </article>`;
  }

  /** First tap arms the delete button ("Delete?"), a second tap within a few seconds deletes. */
  private onDelete(id: number): void {
    window.clearTimeout(this.confirmTimer);
    if (this.confirming === id) {
      this.confirming = null;
      void this.photobook.remove(id);
      return;
    }
    this.confirming = id;
    this.render();
    this.confirmTimer = window.setTimeout(() => {
      this.confirming = null;
      if (this.dialog.open) this.render();
    }, CONFIRM_TIME);
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
    const photo = this.journal.photo(sp.id);
    // The photo loads from storage a moment after the journal opens.
    const picture = photo
      ? `<img src="${photo.thumb}" alt="${sp.name}" />
          <a class="save" href="${photo.full}" download="${file}" title="Save photo">⤓</a>`
      : `<span class="silhouette">${sp.emoji}</span>`;
    return `
      <article class="card${sp.legendary ? ' legendary-found' : ''}">
        <div class="card-photo">
          ${picture}
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
