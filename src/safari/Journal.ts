import { SPECIES, type SpeciesId } from './species';

const STORAGE_KEY = 'drivy.journal.v1';

export interface JournalEntry {
  /** Best star rating so far (1–3). */
  stars: number;
  /** Behaviour ids photographed at least once. */
  behaviors: string[];
  /** Best photo as a JPEG data URL. */
  photo: string;
  takenAt: number;
  seed: string;
}

export interface Photo {
  species: SpeciesId;
  stars: number;
  behaviors: string[];
  image: string;
  seed: string;
}

export interface RecordResult {
  newSpecies: boolean;
  newBehaviors: string[];
  newBest: boolean;
}

/**
 * The field journal: one per player, shared across every seed. Persists to
 * localStorage; if storage is unavailable it still works for the session.
 */
export class Journal {
  private entries: Partial<Record<SpeciesId, JournalEntry>> = {};
  private readonly listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.entries = JSON.parse(raw) as typeof this.entries;
    } catch {
      this.entries = {};
    }
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

    this.entries[photo.species] = {
      stars: Math.max(prev?.stars ?? 0, photo.stars),
      behaviors: [...seen, ...newBehaviors],
      photo: newBest ? photo.image : prev!.photo,
      takenAt: newBest ? Date.now() : prev!.takenAt,
      seed: newBest ? photo.seed : prev!.seed,
    };
    this.save();
    return { newSpecies: !prev, newBehaviors, newBest: newBest && !!prev };
  }

  /** Overall progress: species found and behaviours collected. */
  progress(): { species: number; speciesTotal: number; behaviors: number; behaviorsTotal: number } {
    let species = 0;
    let behaviors = 0;
    let behaviorsTotal = 0;
    for (const s of SPECIES) {
      const e = this.entries[s.id];
      behaviorsTotal += s.behaviors.length;
      if (!e) continue;
      species++;
      behaviors += e.behaviors.length;
    }
    return { species, speciesTotal: SPECIES.length, behaviors, behaviorsTotal };
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
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
