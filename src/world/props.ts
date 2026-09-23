import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PropKind = 'roundTree' | 'pineTree' | 'stone' | 'blossomTree' | 'flowers' | 'reeds' | 'lilyPad' | 'waterLily';

/** One placed prop. Its instance matrices are recomposed when it wobbles. */
export interface Prop {
  kind: PropKind;
  x: number;
  /** Base height: the ground under the prop, sunk slightly so it never floats on slopes. */
  y: number;
  z: number;
  rotY: number;
  scale: number;
  /** Instance slots across the chunk's meshes that share this prop's transform. */
  slots: { mesh: THREE.InstancedMesh; index: number }[];
}

/** Static circle obstacle on the ground plane. */
export interface Collider {
  x: number;
  z: number;
  radius: number;
  prop: Prop;
}

interface PartDef {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Per-instance tints; one is picked by the placement rng. Omit for a fixed color. */
  palette?: string[];
}

interface PropDef {
  parts: PartDef[];
  /** Collision radius at scale 1 (0 = decoration you can drive through). */
  radius: number;
  /** How far the prop tilts when bumped, in radians at full impact. */
  wobble: number;
}

function mat(color: string, flat = false): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, flatShading: flat });
}

function trunk(height: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.2, 0.3, height, 8).translate(0, height / 2, 0);
}

function buildDefs(): Record<PropKind, PropDef> {
  const trunkMat = mat('#c9a88a');

  const roundFoliage = mergeGeometries([
    new THREE.SphereGeometry(1.3, 20, 14).translate(0, 2.4, 0),
    new THREE.SphereGeometry(0.85, 16, 12).translate(0.45, 3.25, 0.2),
  ]);

  const pineFoliage = mergeGeometries([
    new THREE.ConeGeometry(1.2, 1.6, 10).translate(0, 1.9, 0),
    new THREE.ConeGeometry(0.9, 1.3, 10).translate(0, 2.75, 0),
    new THREE.ConeGeometry(0.6, 1.0, 10).translate(0, 3.45, 0),
  ]);

  const stone = new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.7, 1).translate(0, 0.3, 0);

  // Blossom tree: a slender trunk under a fluffy cloud of blossom balls.
  const blossomTrunk = mergeGeometries([
    trunk(2),
    new THREE.CylinderGeometry(0.08, 0.13, 0.9, 7).translate(0, 0.45, 0).rotateZ(0.7).translate(0.05, 1.3, 0),
  ]);
  const blossomCanopy = mergeGeometries(
    [
      [0, 2.45, 0, 1.05],
      [0.85, 2.25, 0.3, 0.72],
      [-0.75, 2.3, -0.2, 0.78],
      [0.1, 3.0, -0.35, 0.72],
      [-0.25, 2.85, 0.6, 0.62],
      [0.55, 2.9, -0.55, 0.5],
    ].map(([x, y, z, r]) => new THREE.SphereGeometry(r, 12, 9).translate(x, y, z)),
  );

  // Flower patch: a few little blooms on short stems (a fixed, pleasing layout).
  const layout = [
    [0, 0],
    [0.35, 0.18],
    [-0.3, 0.25],
    [0.15, -0.35],
    [-0.28, -0.22],
    [0.45, -0.15],
    [-0.05, 0.42],
  ];
  const stems = mergeGeometries(
    layout.map(([x, z], i) => new THREE.CylinderGeometry(0.018, 0.018, 0.28 + (i % 3) * 0.06, 3, 1, true).translate(x, 0.14 + (i % 3) * 0.03, z)),
  );
  const blooms = mergeGeometries(
    layout.map(([x, z], i) => new THREE.SphereGeometry(0.085, 6, 4).scale(1, 0.7, 1).translate(x, 0.3 + (i % 3) * 0.06, z)),
  );

  // Reed bed: a clump of slim stalks, a few topped with fluffy cattails.
  const reedLayout = [
    [0, 0, 1.3],
    [0.22, 0.12, 1.05],
    [-0.2, 0.15, 1.15],
    [0.1, -0.22, 0.95],
    [-0.14, -0.18, 1.2],
    [0.3, -0.08, 0.85],
  ];
  const reedStalks = mergeGeometries(
    reedLayout.map(([x, z, h]) => new THREE.ConeGeometry(0.05, h, 4, 1, true).translate(x, h / 2, z)),
  );
  const cattails = mergeGeometries(
    reedLayout
      .filter((_, i) => i % 2 === 0)
      .map(([x, z, h]) => new THREE.SphereGeometry(1, 6, 4).scale(0.065, 0.16, 0.065).translate(x, h * 0.78, z)),
  );

  // Lily pads: flat discs with the classic notch, one big and one small.
  const pad = (r: number, x: number, z: number, turn: number) =>
    new THREE.CylinderGeometry(r, r, 0.03, 14, 1, false, 0.25, Math.PI * 2 - 0.5).rotateY(turn).translate(x, 0, z);
  const lilyPads = mergeGeometries([pad(0.5, 0, 0, 0), pad(0.3, 0.62, 0.25, 2)]);
  const lilyPadSingle = pad(0.5, 0, 0, 0);
  const lilyPetals = mergeGeometries(
    Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return new THREE.SphereGeometry(1, 6, 4)
        .scale(0.07, 0.035, 0.14)
        .rotateX(-0.5)
        .translate(0, 0.02, 0.1)
        .rotateY(a)
        .translate(0.05, 0.06, 0.05);
    }),
  );
  const lilyHeart = new THREE.SphereGeometry(0.05, 6, 4).translate(0.05, 0.08, 0.05);

  return {
    reeds: {
      radius: 0,
      wobble: 0,
      parts: [
        { geometry: reedStalks, material: mat('#ffffff'), palette: ['#9fd4a0', '#b3dd9a', '#8fcbb0'] },
        { geometry: cattails, material: mat('#c79a8f') },
      ],
    },
    lilyPad: {
      radius: 0,
      wobble: 0,
      parts: [{ geometry: lilyPads, material: mat('#ffffff'), palette: ['#8fd19e', '#a3dca4', '#9ad7b6'] }],
    },
    waterLily: {
      radius: 0,
      wobble: 0,
      parts: [
        { geometry: lilyPadSingle, material: mat('#9ad7a8') },
        { geometry: lilyPetals, material: mat('#ffffff'), palette: ['#ffc8dd', '#ffffff', '#e6d4ff', '#ffd6e8'] },
        { geometry: lilyHeart, material: mat('#ffe27a') },
      ],
    },
    blossomTree: {
      radius: 0.8,
      wobble: 0.24,
      parts: [
        { geometry: blossomTrunk, material: mat('#b89094') },
        { geometry: blossomCanopy, material: mat('#ffffff'), palette: ['#ffc8dd', '#ffafcc', '#ffd6e8', '#fff0f6', '#f7c6e6'] },
      ],
    },
    flowers: {
      radius: 0,
      wobble: 0,
      parts: [
        { geometry: stems, material: mat('#9fd8a4') },
        { geometry: blooms, material: mat('#ffffff'), palette: ['#ffafcc', '#cdb4db', '#fff1a8', '#a0c4ff', '#ffffff'] },
      ],
    },
    roundTree: {
      radius: 0.9,
      wobble: 0.22,
      parts: [
        { geometry: trunk(1.6), material: trunkMat },
        {
          geometry: roundFoliage,
          material: mat('#ffffff'),
          palette: ['#a8e6cf', '#b9e8b0', '#cdeac0', '#ffc8dd', '#ffd8b1'],
        },
      ],
    },
    pineTree: {
      radius: 0.8,
      wobble: 0.26,
      parts: [
        { geometry: trunk(1.3), material: trunkMat },
        { geometry: pineFoliage, material: mat('#ffffff'), palette: ['#95d5b2', '#a3d9c9', '#b7e4c7'] },
      ],
    },
    stone: {
      radius: 0.75,
      wobble: 0.04,
      parts: [{ geometry: stone, material: mat('#ffffff', true), palette: ['#c4bbdb', '#b7c3d6', '#d9cbb8', '#e0c3cf'] }],
    },
  };
}

let defs: Record<PropKind, PropDef> | null = null;

/** Shared, lazily-built geometries and materials for every prop kind. */
export function propDefs(): Record<PropKind, PropDef> {
  return (defs ??= buildDefs());
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

const _instance = new THREE.Matrix4();

/**
 * World position of a point given in a prop's own (unscaled) space, following
 * its live instance transform, so it sways along when the prop wobbles.
 */
export function propPoint(prop: Prop, local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const slot = prop.slots[0];
  slot.mesh.getMatrixAt(slot.index, _instance);
  return out.copy(local).applyMatrix4(_instance);
}

/**
 * Write a prop's transform into all its instance slots. `tiltAngle` rotates
 * the prop about its base, leaning its top toward (tiltX, tiltZ).
 */
export function writePropMatrix(prop: Prop, tiltX = 0, tiltZ = 0, tiltAngle = 0): void {
  _pos.set(prop.x, prop.y, prop.z);
  _quat.setFromAxisAngle(UP, prop.rotY);
  if (tiltAngle !== 0) {
    _axis.set(tiltZ, 0, -tiltX).normalize();
    _tilt.setFromAxisAngle(_axis, tiltAngle);
    _quat.premultiply(_tilt);
  }
  _scale.setScalar(prop.scale);
  _mat.compose(_pos, _quat, _scale);
  for (const slot of prop.slots) {
    slot.mesh.setMatrixAt(slot.index, _mat);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }
}
