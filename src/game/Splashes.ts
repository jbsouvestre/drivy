import * as THREE from 'three';

const MAX_DROPS = 160;
const GRAVITY = 18;

interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

/** Little round water droplets thrown up when the car wades through ponds. */
export class Splashes {
  readonly mesh: THREE.InstancedMesh;

  private readonly drops: Drop[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private cursor = 0;
  private emitDebt = 0;

  constructor(private readonly waterLevel: number) {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ color: '#e9f9ff', roughness: 0.3, transparent: true, opacity: 0.9 });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_DROPS);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0 });
      this.mesh.setMatrixAt(i, this.hidden);
    }
  }

  /** Throw `count` droplets from a point, spraying out sideways and up. */
  burst(x: number, z: number, count: number, strength: number): void {
    for (let n = 0; n < count; n++) {
      const d = this.drops[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_DROPS;
      const a = Math.random() * Math.PI * 2;
      const out = (0.5 + Math.random()) * strength;
      d.pos.set(x, this.waterLevel + 0.05, z);
      d.vel.set(Math.cos(a) * out, 3 + Math.random() * 3 * strength, Math.sin(a) * out);
      d.maxLife = d.life = 0.6 + Math.random() * 0.4;
      d.size = 0.07 + Math.random() * 0.08;
    }
  }

  /**
   * Keep a steady spray going at the given points (e.g. the wheels) while the
   * car moves through water. `rate` is droplets per second per point.
   */
  spray(dt: number, points: readonly THREE.Vector3[], rate: number): void {
    this.emitDebt += rate * dt;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      for (const p of points) this.burst(p.x, p.z, 1, 0.8);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.drops[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vel.y -= GRAVITY * dt;
      d.pos.addScaledVector(d.vel, dt);
      // Gone once it plops back into the pond or runs out of time.
      if (d.life <= 0 || (d.pos.y < this.waterLevel && d.vel.y < 0)) {
        d.life = 0;
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      const s = d.size * Math.min(1, (d.life / d.maxLife) * 2);
      this.matrix.makeScale(s, s, s).setPosition(d.pos);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
