import * as THREE from 'three';
import { mulberry32 } from '../../rng';
import type { Collider } from '../props';
import { FIRE, Structure, type StructureContext, type StructureSound } from './builder';
import { StructureLayout, type Site, type SiteTerrain } from './layout';
import { BUILDERS, HONK_REACH } from './models';

export type { StructureContext, StructureSound } from './builder';

type SoundListener = (sound: StructureSound, volume: number) => void;

/**
 * The little human touches around the world: a windmill here, beach huts
 * there. Placed by StructureLayout, built as their chunk loads (and dropped
 * with it), animated every frame, and reacting to the car and its horn.
 */
export class Structures {
  readonly group = new THREE.Group();
  readonly layout: StructureLayout;

  private readonly byChunk = new Map<number, Structure[]>();
  private readonly listeners: SoundListener[] = [];
  private readonly sites: Site[] = [];

  constructor(terrain: SiteTerrain) {
    this.layout = new StructureLayout(terrain);
  }

  setSeed(seed: number): void {
    this.clear();
    this.layout.setSeed(seed);
  }

  /** Is (x, z) in a structure's clearing (keep trees and rocks out)? */
  blocks(x: number, z: number): boolean {
    return this.layout.blocks(x, z);
  }

  /** Build the structures standing in a chunk; their colliders join the chunk's. */
  buildChunk(key: number, x0: number, z0: number, size: number, colliders: Collider[]): void {
    const built: Structure[] = [];
    for (const site of this.layout.sitesIn(x0, z0, x0 + size, z0 + size, this.sites)) {
      const s = new Structure(site, mulberry32(site.seed), (sound, volume) => this.emit(sound, volume));
      BUILDERS[site.kind](s);
      this.group.add(s.root);
      colliders.push(...s.colliders);
      built.push(s);
    }
    if (built.length > 0) this.byChunk.set(key, built);
  }

  disposeChunk(key: number): void {
    const built = this.byChunk.get(key);
    if (!built) return;
    for (const s of built) {
      this.group.remove(s.root);
      s.dispose();
    }
    this.byChunk.delete(key);
  }

  clear(): void {
    for (const key of [...this.byChunk.keys()]) this.disposeChunk(key);
  }

  update(ctx: StructureContext, dt: number): void {
    // Campfires flicker (by day too; brighter at night).
    FIRE.emissiveIntensity = (0.9 + 0.6 * ctx.darkness) * (0.85 + 0.15 * Math.sin(ctx.time * 13) * Math.sin(ctx.time * 7.3));
    for (const built of this.byChunk.values()) for (const s of built) s.update(ctx, dt);
  }

  /** The car honked at `from`: everything within earshot reacts. */
  honk(from: THREE.Vector3): void {
    for (const built of this.byChunk.values()) {
      for (const s of built) {
        const d = Math.hypot(s.site.x - from.x, s.site.z - from.z);
        if (d < HONK_REACH) s.honk(d);
      }
    }
  }

  /** Structures make the odd sound (a foghorn, an echo…): play them here. */
  onSound(listener: SoundListener): void {
    this.listeners.push(listener);
  }

  private emit(sound: StructureSound, volume: number): void {
    if (volume <= 0.01) return;
    for (const listener of this.listeners) listener(sound, volume);
  }
}
