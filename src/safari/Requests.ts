import type { BiomeId } from '../world/biomes';
import type { Journal } from './Journal';
import { SPECIES, type SpeciesId } from './species';

const STORAGE_KEY = 'drivy.requests.v1';
/** How many requests Pelly keeps on the board at once. */
const ACTIVE = 3;

/** What a request can look at in a photo. */
export interface RequestPhoto {
  species: SpeciesId;
  stars: number;
  behaviors: string[];
  goldenHour: boolean;
  night: boolean;
  rain: boolean;
}

export interface PhotoRequest {
  id: string;
  /** Pelly's note, e.g. "A duck dabbling, please!". */
  text: string;
  /** Only offered once this biome has been discovered. */
  biome: BiomeId;
  check: (p: RequestPhoto) => boolean;
}

/** Every request Pelly could ask for, built from the species list plus a few special ones. */
function allRequests(): PhotoRequest[] {
  const out: PhotoRequest[] = [];
  for (const sp of SPECIES) {
    // Legendary and mythic animals are too rare to ask for.
    const biome = sp.biome;
    if (sp.legendary || sp.mythic || biome === 'anywhere') continue;
    out.push({
      id: `portrait:${sp.id}`,
      text: `A lovely ★★★ portrait of ${article(sp.name)}.`,
      biome,
      check: (p) => p.species === sp.id && p.stars >= 3,
    });
    // Behaviour requests (skip the everyday first one and the weather-only one).
    for (const b of sp.behaviors.slice(1)) {
      if (b.id === 'rain') continue;
      out.push({
        id: `behavior:${sp.id}:${b.id}`,
        text: `${capitalize(article(sp.name))} — "${b.label}" — for the front page!`,
        biome,
        check: (p) => p.species === sp.id && p.behaviors.includes(b.id),
      });
    }
  }
  out.push(
    { id: 'golden-hour', text: 'Any animal at golden hour, ★★ or better.', biome: 'meadow', check: (p) => p.goldenHour && p.stars >= 2 },
    { id: 'night', text: 'A night-time wildlife portrait, ★★ or better.', biome: 'meadow', check: (p) => p.night && p.stars >= 2 },
    { id: 'rain', text: 'Any animal out in the rain.', biome: 'meadow', check: (p) => p.rain },
    { id: 'curious', text: 'An animal looking curiously at the camera.', biome: 'meadow', check: (p) => p.behaviors.includes('curious') },
    { id: 'legendary', text: 'A legendary animal. They do exist, I promise!', biome: 'blossom', check: (p) => !!SPECIES.find((s) => s.id === p.species)?.legendary },
  );
  return out;
}

/** "a duck", "an arctic fox". */
function article(name: string): string {
  const n = name.toLowerCase();
  return `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface Saved {
  active: string[];
  done: number;
}

/**
 * Pelly the pelican, editor of The Pastel Post, posts small optional photo
 * requests. Snap a matching photo and a new request takes its place.
 * Requests only come from biomes you've discovered, so they're always doable.
 */
export class Requests {
  private readonly all = allRequests();
  private readonly byId = new Map(this.all.map((r) => [r.id, r]));
  private active: PhotoRequest[] = [];
  private doneCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly journal: Journal) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Saved | null;
      if (saved) {
        this.active = saved.active.map((id) => this.byId.get(id)).filter((r): r is PhotoRequest => !!r);
        this.doneCount = saved.done;
      }
    } catch {
      // Start fresh if storage is unavailable or corrupt.
    }
    this.refill();
  }

  get list(): readonly PhotoRequest[] {
    return this.active;
  }

  get done(): number {
    return this.doneCount;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Check a photo against the board; completed requests are replaced. Returns what was completed. */
  submit(photo: RequestPhoto): PhotoRequest[] {
    const completed = this.active.filter((r) => r.check(photo));
    if (completed.length === 0) return completed;
    this.active = this.active.filter((r) => !completed.includes(r));
    this.doneCount += completed.length;
    this.refill(completed.map((r) => r.id));
    return completed;
  }

  /** Top the board up (e.g. after a new biome unlocks more requests). */
  refill(avoid: string[] = []): void {
    const taken = new Set([...this.active.map((r) => r.id), ...avoid]);
    const pool = this.all.filter((r) => !taken.has(r.id) && this.journal.hasVisited(r.biome));
    let changed = false;
    while (this.active.length < ACTIVE && pool.length > 0) {
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      this.active.push(pick);
      changed = true;
    }
    if (changed || avoid.length > 0) this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ active: this.active.map((r) => r.id), done: this.doneCount } satisfies Saved));
    } catch {
      // Session-only if storage is unavailable.
    }
    for (const l of this.listeners) l();
  }
}
