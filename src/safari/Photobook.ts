import type { BiomeId } from '../world/biomes';
import type { Snapshot } from './snapshot';
import type { SpeciesId } from './species';
import { getAll, PHOTOBOOK, put, remove, requestPersistence } from './storage';

/** What's stored for a kept photo. */
interface StoredBookPhoto {
  id: number;
  full: Blob;
  thumb: Blob;
  /** When it was taken (real time, ms since epoch). */
  takenAt: number;
  /** In-game time of day, e.g. "14:32". */
  clock: string;
  biome: BiomeId;
  seed: string;
  /** The animal in frame, if any. */
  subject: SpeciesId | null;
  stars: number;
}

/** A kept photo, ready to show (object URLs for its images). */
export interface BookPhoto extends Omit<StoredBookPhoto, 'full' | 'thumb'> {
  thumbUrl: string;
  fullUrl: string;
}

export type NewBookPhoto = Omit<StoredBookPhoto, 'id' | 'full' | 'thumb'> & { snapshot: Snapshot };

/**
 * The photobook: pictures the player kept on purpose (a nice view, a funny
 * moment), newest first. Stored in IndexedDB; without it, it still works for
 * the session.
 */
export class Photobook {
  private photos: BookPhoto[] = [];
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  /** Resolves once saved photos have been loaded. */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load().catch(() => {
      // No IndexedDB (private mode, old browser…): keep photos for this session only.
    });
  }

  /** All kept photos, newest first. */
  get list(): readonly BookPhoto[] {
    return this.photos;
  }

  async add(photo: NewBookPhoto): Promise<void> {
    await this.ready;
    const { snapshot, ...info } = photo;
    const stored: StoredBookPhoto = { ...info, id: this.nextId++, full: snapshot.full, thumb: snapshot.thumb };
    this.photos.unshift(show(stored));
    this.changed();
    requestPersistence();
    await put(PHOTOBOOK, stored);
  }

  async remove(id: number): Promise<void> {
    await this.ready;
    const gone = this.photos.find((p) => p.id === id);
    if (gone) {
      URL.revokeObjectURL(gone.thumbUrl);
      URL.revokeObjectURL(gone.fullUrl);
    }
    this.photos = this.photos.filter((p) => p.id !== id);
    this.changed();
    await remove(PHOTOBOOK, id);
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  private async load(): Promise<void> {
    const all = (await getAll<StoredBookPhoto>(PHOTOBOOK)).filter((p) => p.full instanceof Blob && p.thumb instanceof Blob);
    this.photos = all.sort((a, b) => b.takenAt - a.takenAt).map(show);
    this.nextId = all.reduce((max, p) => Math.max(max, p.id), 0) + 1;
    this.changed();
  }
}

function show(stored: StoredBookPhoto): BookPhoto {
  const { full, thumb, ...info } = stored;
  return { ...info, thumbUrl: URL.createObjectURL(thumb), fullUrl: URL.createObjectURL(full) };
}
