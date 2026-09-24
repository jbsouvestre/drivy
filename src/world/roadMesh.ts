import * as THREE from 'three';
import { ROAD_TEXTURE_LENGTH, type RoadKind, type RoadPath } from './Roads';

/** Road surfaces sit this far above the (flattened) ground. */
const LIFT = 0.05;
/** Vertices across the road (as fractions of its width), so it hugs the terrain. */
const ACROSS = [0, 0.25, 0.5, 0.75, 1];
/** Extra vertex rows between centreline samples, so crests don't cut under the ground. */
const ALONG = 2;

let materials: Record<RoadKind, THREE.MeshStandardMaterial> | null = null;

/**
 * Shared road materials. They draw after the ground without writing depth, so
 * overlapping roads at junctions layer by render order instead of flickering.
 */
export function roadMaterials(): Record<RoadKind, THREE.MeshStandardMaterial> {
  materials ??= {
    asphalt: roadMaterial(asphaltTexture()),
    dirt: roadMaterial(dirtTexture()),
  };
  return materials;
}

/**
 * Ribbon meshes for the parts of `paths` whose samples fall inside the chunk
 * [x0, x0 + size) × [z0, z0 + size). Each run reaches one sample past the
 * border on both sides, so neighbouring chunks' pieces overlap seamlessly.
 */
export function buildRoadMeshes(
  paths: RoadPath[],
  x0: number,
  z0: number,
  size: number,
  heightAt: (x: number, z: number) => number,
): THREE.Mesh[] {
  // One merged mesh per (kind, layer): a handful of draw calls per chunk at most.
  const batches = new Map<string, { kind: RoadKind; layer: number; pos: number[]; uv: number[]; index: number[] }>();
  for (const path of paths) {
    const { xs, zs, s, halfWidth } = path;
    const last = xs.length - 1;
    let k = 0;
    while (k < last) {
      // Find the next run of segments whose midpoints are in this chunk.
      const mx = (xs[k] + xs[k + 1]) / 2 - x0;
      const mz = (zs[k] + zs[k + 1]) / 2 - z0;
      if (mx < 0 || mx >= size || mz < 0 || mz >= size) {
        k++;
        continue;
      }
      const start = Math.max(0, k - 1);
      while (k < last) {
        const nx = (xs[k] + xs[k + 1]) / 2 - x0;
        const nz = (zs[k] + zs[k + 1]) / 2 - z0;
        if (nx < 0 || nx >= size || nz < 0 || nz >= size) break;
        k++;
      }
      const end = Math.min(last, k + 1);

      const key = `${path.kind}:${path.layer}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { kind: path.kind, layer: path.layer, pos: [], uv: [], index: [] };
        batches.set(key, batch);
      }
      const base = batch.pos.length / 3;
      const cols = ACROSS.length;
      let rows = 0;
      for (let i = start; i <= end; i++) {
        for (let sub = 0; sub < (i < end ? ALONG : 1); sub++) {
          // A row of vertices at fraction f between samples i and i + 1.
          const f = sub / ALONG;
          const j = Math.min(last, i + 1);
          const cx = xs[i] + (xs[j] - xs[i]) * f;
          const cz = zs[i] + (zs[j] - zs[i]) * f;
          // Across-road direction from the averaged tangent (smooth joins at bends).
          const a = Math.max(0, i - 1);
          const b = Math.min(last, i + 1);
          const tx = xs[b] - xs[a];
          const tz = zs[b] - zs[a];
          const len = Math.hypot(tx, tz) || 1;
          const nx = -tz / len;
          const nz = tx / len;
          const v = (s[i] + (s[j] - s[i]) * f) / ROAD_TEXTURE_LENGTH;
          for (const u of ACROSS) {
            const off = (1 - 2 * u) * halfWidth; // u = 0 is the left edge
            const px = cx + nx * off;
            const pz = cz + nz * off;
            batch.pos.push(px, heightAt(px, pz) + LIFT, pz);
            batch.uv.push(u, v);
          }
          if (rows > 0) {
            const q = base + rows * cols;
            for (let c = 0; c < cols - 1; c++) {
              const p = q - cols + c; // previous row, this column
              batch.index.push(p, q + c, p + 1, p + 1, q + c, q + c + 1);
            }
          }
          rows++;
        }
      }
    }
  }

  const mats = roadMaterials();
  const meshes: THREE.Mesh[] = [];
  for (const batch of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uv, 2));
    geometry.setIndex(batch.index);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mats[batch.kind]);
    mesh.receiveShadow = true;
    mesh.renderOrder = batch.layer;
    meshes.push(mesh);
  }
  return meshes;
}

function roadMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    roughness: 0.95,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
}

/** Soft lavender-grey asphalt: solid white edge lines, a dashed centre line. */
function asphaltTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#a9a5b9';
  ctx.fillRect(0, 0, w, h);
  // A faint speckle so it doesn't look like plastic.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(60,50,80,0.07)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // Slightly darker shoulders.
  ctx.fillStyle = 'rgba(80,70,100,0.12)';
  ctx.fillRect(0, 0, 3, h);
  ctx.fillRect(w - 3, 0, 3, h);
  ctx.fillStyle = '#fbf8ff';
  ctx.fillRect(5, 0, 3, h);
  ctx.fillRect(w - 8, 0, 3, h);
  // Centre dashes: half the repeat on, half off.
  ctx.fillRect(w / 2 - 1.5, h * 0.1, 3, h * 0.45);
  return finishTexture(canvas);
}

/** Warm packed dirt with two worn tyre ruts and a few pebbles. */
function dirtTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#e2c9a0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(170,130,90,0.22)';
  ctx.fillRect(w * 0.2, 0, w * 0.14, h);
  ctx.fillRect(w * 0.66, 0, w * 0.14, h);
  // Grassy-soft edges.
  const edge = ctx.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(150,120,80,0.28)');
  edge.addColorStop(0.1, 'rgba(150,120,80,0)');
  edge.addColorStop(0.9, 'rgba(150,120,80,0)');
  edge.addColorStop(1, 'rgba(150,120,80,0.28)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(150,110,75,0.2)';
    const r = 0.6 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finishTexture(canvas);
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function finishTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
