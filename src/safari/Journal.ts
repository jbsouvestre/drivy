import type { BiomeId } from '../world/biomes';
import { dataUrlToBlob, type Snapshot } from './snapshot';
import { SPECIES, type SpeciesId } from './species';
import { getAll, JOURNAL_PHOTOS, put, requestPersistence } from './storage';

const STORAGE_KEY = 'drivy.journal.v1';
const BIOMES_KEY = 'drivy.biomes.v1';

/** What the journal knows about a species (small: kept in localStorage). */
export interface JournalEntry {
  /** Best star rating so far (1–3). */
  stars: number;
  /** Behaviour ids photographed at least once. */
  behaviors: string[];
  /** When the best photo was taken. */
  takenAt: number;
  seed: string;
  /**
   * Up to 1.3, the best photo was stored right here as a base64 data URL. It's
   * moved to IndexedDB on load (and kept here only if that isn't possible).
   */
  photo?: string;
}

/** A species' best photo, ready to show: object URLs (or a legacy data URL). */
export interface JournalPhoto {
  thumb: string;
  full: string;
}

/** A best photo as stored in IndexedDB. */
interface StoredPhoto {
  species: SpeciesId;
  full: Blob;
  thumb: Blob;
  takenAt: number;
}

export interface Photo {
  species: SpeciesId;
  stars: number;
  behaviors: string[];
  snapshot: Snapshot;
  seed: string;
}

export interface RecordResult {
  newSpecies: boolean;
  newBehaviors: string[];
  newBest: boolean;
}

/**
 * The field journal: one per player, shared across every seed. Its entries live
 * in localStorage (they're small); each species' best photo lives in IndexedDB.
 * If storage is unavailable it still works for the session.
 */
export class Journal {
  private entries: Partial<Record<SpeciesId, JournalEntry>> = {};
  private readonly visited = new Set<BiomeId>(['meadow']);
  private readonly listeners = new Set<() => void>();
  private readonly photos = new Map<SpeciesId, JournalPhoto>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.entries = JSON.parse(raw) as typeof this.entries;
      const biomes = localStorage.getItem(BIOMES_KEY);
      if (biomes) for (const b of JSON.parse(biomes) as BiomeId[]) this.visited.add(b);
    } catch {
      this.entries = {};
    }
    void this.loadPhotos();
  }

  /** A species' best photo (null until it's been photographed, or while loading). */
  photo(id: SpeciesId): JournalPhoto | null {
    const stored = this.photos.get(id);
    if (stored) return stored;
    const legacy = this.entries[id]?.photo;
    return legacy ? { thumb: legacy, full: legacy } : null;
  }

  hasVisited(id: BiomeId): boolean {
    return this.visited.has(id);
  }

  /** Mark a biome as discovered; returns true the first time. */
  visitBiome(id: BiomeId): boolean {
    if (this.visited.has(id)) return false;
    this.visited.add(id);
    try {
      localStorage.setItem(BIOMES_KEY, JSON.stringify([...this.visited]));
    } catch {
      // Session-only if storage is unavailable.
    }
    for (const l of this.listeners) l();
    return true;
  }

  entry(id: SpeciesId): JournalEntry | undefined {
    return this.entries[id];
  }

  /** Add a photo; keeps the best shot per species and merges newly seen behaviours. */
  record(photo: Photo): RecordResult {
    const prev = this.entries[photo.species];
    const seen = new Set(prev?.behaviors ?? []);
    const newBehaviors = photo.behaviors.filter((b) => !seen.has(b));
    const newBest = !prev || photo.stars > prev.stars;

    const takenAt = newBest ? Date.now() : prev!.takenAt;
    this.entries[photo.species] = {
      stars: Math.max(prev?.stars ?? 0, photo.stars),
      behaviors: [...seen, ...newBehaviors],
      takenAt,
      seed: newBest ? photo.seed : prev!.seed,
      // A new best replaces any legacy inline photo.
      ...(!newBest && prev?.photo ? { photo: prev.photo } : {}),
    };
    if (newBest) this.setPhoto(photo.species, photo.snapshot.full, photo.snapshot.thumb, takenAt);
    this.save();
    return { newSpecies: !prev, newBehaviors, newBest: newBest && !!prev };
  }

  /** Progress (species found, behaviours collected), overall or for one biome. */
  progress(biome?: BiomeId): { species: number; speciesTotal: number; behaviors: number; behaviorsTotal: number } {
    let species = 0;
    let speciesTotal = 0;
    let behaviors = 0;
    let behaviorsTotal = 0;
    for (const s of SPECIES) {
      if (biome && s.biome !== biome) continue;
      speciesTotal++;
      const e = this.entries[s.id];
      behaviorsTotal += s.behaviors.length;
      if (!e) continue;
      species++;
      behaviors += e.behaviors.length;
    }
    return { species, speciesTotal, behaviors, behaviorsTotal };
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Show a new best photo right away, and store it in the background. */
  private setPhoto(id: SpeciesId, full: Blob, thumb: Blob, takenAt: number): void {
    const old = this.photos.get(id);
    if (old) {
      URL.revokeObjectURL(old.thumb);
      URL.revokeObjectURL(old.full);
    }
    this.photos.set(id, { thumb: URL.createObjectURL(thumb), full: URL.createObjectURL(full) });
    requestPersistence();
    void put(JOURNAL_PHOTOS, { species: id, full, thumb, takenAt } satisfies StoredPhoto);
  }

  /** Load stored photos, and move any legacy inline (base64) photos into IndexedDB. */
  private async loadPhotos(): Promise<void> {
    let stored: StoredPhoto[] = [];
    try {
      stored = await getAll<StoredPhoto>(JOURNAL_PHOTOS);
    } catch {
      return; // No IndexedDB: legacy photos keep showing from localStorage.
    }
    for (const r of stored) {
      // A photo taken while loading is newer: keep it.
      if (!this.photos.has(r.species)) this.photos.set(r.species, { thumb: URL.createObjectURL(r.thumb), full: URL.createObjectURL(r.full) });
    }
    let migrated = false;
    for (const [id, entry] of Object.entries(this.entries) as [SpeciesId, JournalEntry][]) {
      if (!entry.photo) continue;
      if (!this.photos.has(id)) {
        const blob = await dataUrlToBlob(entry.photo);
        const saved = await put(JOURNAL_PHOTOS, { species: id, full: blob, thumb: blob, takenAt: entry.takenAt } satisfies StoredPhoto);
        if (!saved) continue; // keep it inline for now; try again next time
        const url = URL.createObjectURL(blob);
        this.photos.set(id, { thumb: url, full: url });
      }
      delete entry.photo;
      migrated = true;
    }
    if (migrated) this.save();
    else for (const l of this.listeners) l();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // Storage full or blocked: keep the in-memory journal for this session.
    }
    for (const l of this.listeners) l();
  }
}
