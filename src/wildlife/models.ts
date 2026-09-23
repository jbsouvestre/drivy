import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SpeciesId } from '../safari/species';

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Shared toy-plastic material per color. */
function mat(color: string): THREE.MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
    materials.set(color, m);
  }
  return m;
}

const geo = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  smallSphere: new THREE.SphereGeometry(1, 8, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  // Rounded leaf-shaped wing, pivoting at its inner edge.
  wing: new THREE.SphereGeometry(1, 12, 8).scale(0.38, 0.06, 0.2).translate(0.34, 0, 0),
  tail: new THREE.SphereGeometry(1, 10, 6).scale(0.14, 0.04, 0.22),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
};

function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  color: string,
  pos: [number, number, number],
  scale: [number, number, number] | number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.position.set(...pos);
  if (typeof scale === 'number') mesh.scale.setScalar(scale);
  else mesh.scale.set(...scale);
  // Tiny details (eyes, noses, spots) cast no visible shadow: skip them to save a
  // shadow draw call each.
  const size = typeof scale === 'number' ? scale : Math.max(...scale);
  mesh.castShadow = size >= 0.06;
  parent.add(mesh);
  return mesh;
}

export interface BirdModel {
  root: THREE.Group;
  body: THREE.Group;
  wings: [THREE.Group, THREE.Group];
  eyes: THREE.Mesh[];
}

export const BIRD_COLORS: { species: SpeciesId; body: string; wing: string }[] = [
  { species: 'bluebird', body: '#a0c4ff', wing: '#8ab0f0' },
  { species: 'canary', body: '#fdf0a0', wing: '#f2dc7a' },
  { species: 'pink-finch', body: '#ffc6e0', wing: '#f5a8cb' },
  { species: 'mint-tit', body: '#c8f0dc', wing: '#a6dcc2' },
];

/** Round little bird, facing +Z, wings pivoting at the shoulders. */
export function createBird(colors: { body: string; wing: string }): BirdModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  part(body, geo.sphere, colors.body, [0, 0, 0], [0.34, 0.3, 0.44]);
  part(body, geo.sphere, colors.body, [0, 0.18, 0.36], 0.24);
  part(body, geo.cone, '#ffb870', [0, 0.15, 0.64], [0.08, 0.18, 0.08]).rotation.x = Math.PI / 2;
  const eyes = [-0.12, 0.12].map((x) => part(body, geo.smallSphere, '#5b4e6b', [x, 0.24, 0.54], 0.04));
  part(body, geo.tail, colors.wing, [0, 0.04, -0.46], 1).rotation.x = -0.3;

  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.22 * side, 0.08, 0.02);
    pivot.scale.x = side; // mirror the wing for the left side
    part(pivot, geo.wing, colors.wing, [0, 0, 0], 1);
    body.add(pivot);
    return pivot;
  }) as [THREE.Group, THREE.Group];

  return { root, body, wings, eyes };
}

export interface SquirrelModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  eyes: THREE.Mesh[];
}

const SQUIRREL = {
  fur: '#ee9a6e',
  belly: '#fff4e6',
  tail: '#f5b48c',
  ear: '#dd8660',
  nose: '#ff8fa3',
  eye: '#5b4e6b',
};

/** Sitting squirrel with a big curled tail. Feet at y = 0, facing +Z. */
export function createSquirrel(): SquirrelModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  part(body, geo.sphere, SQUIRREL.fur, [0, 0.3, 0], [0.28, 0.32, 0.3]);
  part(body, geo.sphere, SQUIRREL.belly, [0, 0.28, 0.12], [0.2, 0.24, 0.2]);
  for (const x of [-0.12, 0.12]) part(body, geo.smallSphere, SQUIRREL.fur, [x, 0.05, 0.14], [0.08, 0.05, 0.12]);

  const head = new THREE.Group();
  head.position.set(0, 0.64, 0.08);
  body.add(head);
  part(head, geo.sphere, SQUIRREL.fur, [0, 0, 0], 0.22);
  part(head, geo.sphere, SQUIRREL.belly, [0, -0.06, 0.12], [0.13, 0.1, 0.12]);
  part(head, geo.smallSphere, SQUIRREL.nose, [0, -0.02, 0.24], 0.04);
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.09, 0.09]) {
    eyes.push(part(head, geo.smallSphere, SQUIRREL.eye, [x, 0.05, 0.18], 0.035));
    part(head, geo.cone, SQUIRREL.ear, [x * 1.3, 0.22, -0.02], [0.06, 0.14, 0.05]);
  }

  // Tail: a fluffy question mark of spheres, pivoting at the base.
  const tail = new THREE.Group();
  tail.position.set(0, 0.15, -0.2);
  body.add(tail);
  part(tail, geo.sphere, SQUIRREL.tail, [0, 0.12, -0.12], 0.18);
  part(tail, geo.sphere, SQUIRREL.tail, [0, 0.42, -0.26], 0.22);
  part(tail, geo.sphere, SQUIRREL.tail, [0, 0.74, -0.2], 0.21);
  part(tail, geo.sphere, SQUIRREL.tail, [0, 0.9, 0.02], 0.15);

  return { root, body, head, tail, eyes };
}

export interface OwlModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  /** Eye groups: scale their y to blink, their whole scale to go wide-eyed. */
  eyes: [THREE.Group, THREE.Group];
  /** Wing pivots at the shoulders: rotation.z spreads them (right +, left −). */
  wings: [THREE.Group, THREE.Group];
}

export const OWL_COLORS = {
  lavender: { body: '#b8a9d9', belly: '#efe6fa', face: '#fbf5ea' },
  cocoa: { body: '#c9a98f', belly: '#f5e6d6', face: '#fff6ea' },
  snowy: { body: '#dcdcec', belly: '#ffffff', face: '#ffffff' },
};

let owlEyeMaterial: THREE.MeshStandardMaterial | null = null;

/** Round owl with big glowing eyes and ear tufts. Feet at y = 0, facing +Z. */
export function createOwl(colors: { body: string; belly: string; face: string }): OwlModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  part(body, geo.sphere, colors.body, [0, 0.42, 0], [0.36, 0.42, 0.34]);
  part(body, geo.sphere, colors.belly, [0, 0.38, 0.19], [0.24, 0.28, 0.17]);
  for (const x of [-0.1, 0.1]) part(body, geo.smallSphere, '#ffb870', [x, 0.03, 0.14], [0.07, 0.04, 0.08]);

  const head = new THREE.Group();
  head.position.set(0, 0.86, 0);
  body.add(head);
  part(head, geo.sphere, colors.body, [0, 0, 0], [0.33, 0.29, 0.3]);
  part(head, geo.cone, '#ffb870', [0, -0.08, 0.3], [0.05, 0.1, 0.05]).rotation.x = Math.PI * 0.85;
  for (const side of [-1, 1]) {
    part(head, geo.sphere, colors.face, [0.12 * side, 0.01, 0.24], [0.14, 0.14, 0.07]);
    const tuft = part(head, geo.cone, colors.body, [0.2 * side, 0.26, -0.02], [0.07, 0.18, 0.06]);
    tuft.rotation.z = -0.35 * side;
  }

  // Irises glow softly so owls are easy to spot at night.
  owlEyeMaterial ??= new THREE.MeshStandardMaterial({
    color: '#ffe27a',
    emissive: '#ffd34d',
    emissiveIntensity: 0.9,
    roughness: 0.4,
  });
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(0.12 * side, 0.02, 0.29);
    head.add(eye);
    const iris = new THREE.Mesh(geo.sphere, owlEyeMaterial!);
    iris.scale.set(0.085, 0.085, 0.04);
    eye.add(iris);
    part(eye, geo.smallSphere, '#3d3350', [0, 0, 0.03], [0.045, 0.045, 0.02]);
    part(eye, geo.smallSphere, '#ffffff', [0.02, 0.025, 0.045], 0.015);
    return eye;
  }) as [THREE.Group, THREE.Group];

  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * side, 0.62, -0.02);
    body.add(pivot);
    part(pivot, geo.sphere, colors.body, [0.02 * side, -0.24, 0], [0.09, 0.3, 0.22]);
    return pivot;
  }) as [THREE.Group, THREE.Group];

  return { root, body, head, eyes, wings };
}

export interface DuckModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  /** Wing pivots: rotation.z lifts them (right +, left −). */
  wings: [THREE.Group, THREE.Group];
  eyes: THREE.Mesh[];
}

export const DUCK_COLORS = {
  white: { body: '#fff8ee', head: '#fff8ee', wing: '#f1e8dc' },
  mallard: { body: '#eadfcf', head: '#a6e3cc', wing: '#d9ccb8' },
  duckling: { body: '#fff0a0', head: '#fff0a0', wing: '#f7e089' },
};

/** Round bath-toy duck. The waterline is y = 0; facing +Z. */
export function createDuck(colors: { body: string; head: string; wing: string }): DuckModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  part(body, geo.sphere, colors.body, [0, 0.14, 0], [0.32, 0.22, 0.42]);
  part(body, geo.sphere, colors.body, [0, 0.27, -0.36], [0.12, 0.08, 0.15]).rotation.x = 0.6;

  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.27);
  body.add(head);
  part(head, geo.sphere, colors.head, [0, 0, 0], 0.17);
  part(head, geo.sphere, '#ffb870', [0, -0.03, 0.17], [0.09, 0.035, 0.12]);
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.08, 0.08]) {
    eyes.push(part(head, geo.smallSphere, '#5b4e6b', [x, 0.04, 0.13], 0.025));
    part(head, geo.smallSphere, '#ffb3c6', [x * 1.35, -0.03, 0.09], [0.035, 0.02, 0.02]);
  }

  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.27 * side, 0.24, -0.02);
    body.add(pivot);
    part(pivot, geo.sphere, colors.wing, [0.02 * side, -0.06, 0], [0.06, 0.13, 0.27]);
    return pivot;
  }) as [THREE.Group, THREE.Group];

  return { root, body, head, wings, eyes };
}

/** Four-legged ground animal: legs swing from hip pivots; `neck` (if any) bends down to graze. */
export interface GroundModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  neck: THREE.Group | null;
  tail: THREE.Group;
  /** Front-left, front-right, back-left, back-right hip pivots. */
  legs: THREE.Group[];
  eyes: THREE.Mesh[];
}

function leg(parent: THREE.Object3D, x: number, y: number, z: number, length: number, radius: number, color: string, hoof?: string): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  parent.add(pivot);
  part(pivot, geo.cylinder, color, [0, -length / 2, 0], [radius, length, radius]);
  if (hoof) part(pivot, geo.smallSphere, hoof, [0, -length + 0.02, 0.01], [radius * 1.1, radius * 0.7, radius * 1.3]);
  return pivot;
}

const DEER = { coat: '#e9b893', cream: '#fff3e6', leg: '#d9a47f', hoof: '#8a6f64', nose: '#6e5a5a', eye: '#4a3f58' };

/** Gentle toy deer with a spotted back. Feet at y = 0, facing +Z. */
export function createDeer(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  part(body, geo.sphere, DEER.coat, [0, 0.95, 0], [0.27, 0.27, 0.55]);
  part(body, geo.sphere, DEER.cream, [0, 0.86, 0.05], [0.2, 0.18, 0.42]);
  for (const [x, z] of [[0.1, 0.15], [-0.12, -0.05], [0.08, -0.25], [-0.06, 0.3], [0.14, -0.1]]) {
    part(body, geo.smallSphere, DEER.cream, [x, 1.19, z], 0.045);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.05, -0.52);
  body.add(tail);
  part(tail, geo.sphere, DEER.cream, [0, 0, -0.03], [0.07, 0.09, 0.06]);

  const legs = [
    leg(body, -0.13, 0.78, 0.33, 0.76, 0.045, DEER.leg, DEER.hoof),
    leg(body, 0.13, 0.78, 0.33, 0.76, 0.045, DEER.leg, DEER.hoof),
    leg(body, -0.13, 0.78, -0.33, 0.76, 0.045, DEER.leg, DEER.hoof),
    leg(body, 0.13, 0.78, -0.33, 0.76, 0.045, DEER.leg, DEER.hoof),
  ];

  // Neck pivots at the shoulders so the whole head can dip down to graze.
  const neck = new THREE.Group();
  neck.position.set(0, 1.08, 0.38);
  body.add(neck);
  part(neck, geo.cylinder, DEER.coat, [0, 0.2, 0.08], [0.08, 0.45, 0.08]).rotation.x = 0.35;
  const head = new THREE.Group();
  head.position.set(0, 0.44, 0.2);
  neck.add(head);
  part(head, geo.sphere, DEER.coat, [0, 0, 0], [0.14, 0.14, 0.18]);
  part(head, geo.sphere, DEER.cream, [0, -0.04, 0.15], [0.08, 0.07, 0.1]);
  part(head, geo.smallSphere, DEER.nose, [0, -0.02, 0.25], 0.03);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, geo.smallSphere, DEER.eye, [0.09 * side, 0.04, 0.1], 0.03));
    const ear = part(head, geo.sphere, DEER.coat, [0.14 * side, 0.1, -0.04], [0.1, 0.045, 0.05]);
    ear.rotation.z = 0.5 * side;
  }
  return { root, body, head, neck, tail, legs, eyes };
}

const FOX = { coat: '#ffac7d', white: '#fff6ee', dark: '#6e5a66', eye: '#4a3f58' };

/** Little fox with a big fluffy tail. Feet at y = 0, facing +Z. */
export function createFox(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  part(body, geo.sphere, FOX.coat, [0, 0.38, 0], [0.18, 0.18, 0.36]);
  part(body, geo.sphere, FOX.white, [0, 0.34, 0.24], [0.13, 0.14, 0.12]);
  const legs = [
    leg(body, -0.09, 0.3, 0.2, 0.3, 0.04, FOX.coat, FOX.dark),
    leg(body, 0.09, 0.3, 0.2, 0.3, 0.04, FOX.coat, FOX.dark),
    leg(body, -0.09, 0.3, -0.2, 0.3, 0.04, FOX.coat, FOX.dark),
    leg(body, 0.09, 0.3, -0.2, 0.3, 0.04, FOX.coat, FOX.dark),
  ];

  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.36);
  body.add(head);
  part(head, geo.sphere, FOX.coat, [0, 0, 0], [0.15, 0.13, 0.14]);
  for (const side of [-1, 1]) part(head, geo.sphere, FOX.white, [0.07 * side, -0.04, 0.07], [0.07, 0.06, 0.07]);
  part(head, geo.cone, FOX.coat, [0, -0.02, 0.17], [0.07, 0.16, 0.06]).rotation.x = Math.PI / 2;
  part(head, geo.smallSphere, FOX.dark, [0, -0.02, 0.26], 0.028);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, geo.smallSphere, FOX.eye, [0.07 * side, 0.04, 0.12], 0.026));
    const ear = part(head, geo.cone, FOX.coat, [0.08 * side, 0.15, -0.02], [0.06, 0.15, 0.04]);
    ear.rotation.z = -0.25 * side;
    part(head, geo.cone, FOX.dark, [0.095 * side, 0.215, -0.02], [0.028, 0.05, 0.02]).rotation.z = -0.25 * side;
  }

  // Tail pivots at its base so it can swish and curl.
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, -0.32);
  body.add(tail);
  const brush = part(tail, geo.sphere, FOX.coat, [0, 0.06, -0.24], [0.13, 0.13, 0.3]);
  brush.rotation.x = -0.4;
  part(tail, geo.sphere, FOX.white, [0, 0.16, -0.5], [0.09, 0.09, 0.1]);

  return { root, body, head, neck: null, tail, legs, eyes };
}

const HOG = { spikes: '#a48f99', belly: '#e8d6c6', face: '#f3e2cf', nose: '#ff9fb5', eye: '#4a3f58', feet: '#d9bfae' };

let spikeGeometry: THREE.BufferGeometry | null = null;

/** A dome of little cones: the hedgehog's spiky coat (built once, shared). */
function spikes(): THREE.BufferGeometry {
  if (spikeGeometry) return spikeGeometry;
  const cones: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const n = 46;
  for (let i = 0; i < n; i++) {
    // Fibonacci sphere, keeping the top/back half (the face stays smooth).
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (dir.y < -0.1 || dir.z > 0.55) continue;
    const cone = new THREE.ConeGeometry(0.055, 0.15, 5);
    cone.translate(0, 0.075, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    cone.scale(1, 1, 1.15);
    cone.translate(dir.x * 0.26, dir.y * 0.2, dir.z * 0.3);
    cones.push(cone);
  }
  spikeGeometry = mergeGeometries(cones);
  return spikeGeometry;
}

/** Round little hedgehog. `body` holds the spiky coat (it curls into a ball). */
export function createHedgehog(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.22;
  root.add(body);

  part(body, geo.sphere, HOG.belly, [0, -0.02, 0], [0.27, 0.2, 0.33]);
  const coat = new THREE.Mesh(spikes(), mat(HOG.spikes));
  coat.castShadow = true;
  body.add(coat);
  part(body, geo.sphere, HOG.spikes, [0, 0.02, -0.02], [0.26, 0.2, 0.3]);

  const head = new THREE.Group();
  head.position.set(0, -0.01, 0.27);
  body.add(head);
  part(head, geo.cone, HOG.face, [0, 0, 0.08], [0.12, 0.22, 0.11]).rotation.x = Math.PI / 2;
  part(head, geo.smallSphere, HOG.nose, [0, 0, 0.2], 0.035);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, geo.smallSphere, HOG.eye, [0.06 * side, 0.05, 0.05], 0.022));
    part(head, geo.smallSphere, HOG.spikes, [0.08 * side, 0.09, -0.02], [0.035, 0.03, 0.02]);
  }
  const legs = [
    leg(body, -0.12, -0.12, 0.13, 0.12, 0.035, HOG.feet),
    leg(body, 0.12, -0.12, 0.13, 0.12, 0.035, HOG.feet),
    leg(body, -0.12, -0.12, -0.13, 0.12, 0.035, HOG.feet),
    leg(body, 0.12, -0.12, -0.13, 0.12, 0.035, HOG.feet),
  ];
  const tail = new THREE.Group();
  body.add(tail);
  return { root, body, head, neck: null, tail, legs, eyes };
}
