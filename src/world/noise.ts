import { hash2 } from '../rng';

/**
 * Seeded 2D value noise. Being a pure function of (seed, x, z) it is continuous
 * across chunk borders and identical every time a chunk is regenerated.
 */
export class ValueNoise2D {
  constructor(private readonly seed: number) {}

  private lattice(ix: number, iz: number): number {
    return hash2(this.seed, ix, iz) / 4294967296;
  }

  /** Smooth noise in [0, 1). */
  sample(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    const a = this.lattice(ix, iz);
    const b = this.lattice(ix + 1, iz);
    const c = this.lattice(ix, iz + 1);
    const d = this.lattice(ix + 1, iz + 1);

    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }

  /** Fractal (fBm) noise in roughly [0, 1). */
  fbm(x: number, z: number, octaves = 3): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq + i * 17.3, z * freq - i * 9.1) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}
