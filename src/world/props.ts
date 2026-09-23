import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PropKind = 'roundTree' | 'pineTree' | 'stone';

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
  /** Collision radius at scale 1. */
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

  return {
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
