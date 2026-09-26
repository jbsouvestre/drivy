import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
  /** For big, close-up-worthy shapes where facets would show (the cats' heads). */
  fineSphere: new THREE.SphereGeometry(1, 32, 24),
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
  golden: { body: '#ffd66b', head: '#ffe9a3', wing: '#f5c24a' },
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
  /** Mythic animals: a ring of sparkles orbiting them (spun by the animation). */
  aura?: THREE.Group;
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

export const FOX_COLORS = {
  red: FOX,
  moon: { coat: '#ddd6ff', white: '#ffffff', dark: '#8f84c9', eye: '#6b5fb8' },
  fennec: { coat: '#f7dcb4', white: '#fffaf0', dark: '#c9a07e', eye: '#4a3f58' },
  arctic: { coat: '#fbfbff', white: '#ffffff', dark: '#b8c0d8', eye: '#4a3f58' },
  aurora: { coat: '#c8f5ea', white: '#ffffff', dark: '#8fb8ff', eye: '#5f6ab8' },
};

/** Little fox with a big fluffy tail. Feet at y = 0, facing +Z. */
export function createFox(colors: typeof FOX = FOX): GroundModel {
  const FOX = colors;
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

export interface FrogModel {
  root: THREE.Group;
  body: THREE.Group;
  /** Eye groups: scale y to blink, whole scale to go wide-eyed. */
  eyes: THREE.Group[];
  /** Puffs out when croaking. */
  throat: THREE.Mesh;
  /** Back legs: extend (rotate) during a hop. */
  legs: THREE.Group[];
}

export const FROG_COLORS = {
  green: { skin: '#9fdca0', belly: '#f4f9d8', throat: '#e6f5c6' },
  golden: { skin: '#ffd66e', belly: '#fff4cf', throat: '#ffedb0' },
};

/** Squat little frog with big bubble eyes. Feet at y = 0, facing +Z. */
export function createFrog(colors: { skin: string; belly: string; throat: string }): FrogModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, colors.skin, [0, 0.13, 0], [0.2, 0.13, 0.22]);
  part(body, geo.sphere, colors.belly, [0, 0.1, 0.06], [0.16, 0.09, 0.17]);
  part(body, geo.sphere, colors.skin, [0, 0.2, 0.13], [0.17, 0.11, 0.13]);
  const throat = part(body, geo.sphere, colors.throat, [0, 0.12, 0.22], [0.08, 0.06, 0.05]);
  part(body, geo.smallSphere, '#5b4e6b', [0, 0.19, 0.255], [0.08, 0.008, 0.012]); // smile
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    eye.position.set(0.085 * side, 0.3, 0.14);
    body.add(eye);
    part(eye, geo.sphere, colors.skin, [0, -0.01, 0], 0.065);
    part(eye, geo.sphere, '#ffffff', [0, 0.005, 0.03], 0.05);
    part(eye, geo.smallSphere, '#3d3350', [0, 0.005, 0.07], 0.026);
    part(body, geo.smallSphere, '#ffb3c6', [0.12 * side, 0.17, 0.2], [0.035, 0.02, 0.015]);
    return eye;
  });
  const legs = [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(0.15 * side, 0.07, -0.08);
    body.add(leg);
    part(leg, geo.sphere, colors.skin, [0.02 * side, 0, 0], [0.07, 0.055, 0.12]);
    part(leg, geo.sphere, colors.skin, [0.05 * side, -0.05, 0.1], [0.06, 0.015, 0.07]);
    return leg;
  });
  for (const side of [-1, 1]) part(body, geo.sphere, colors.skin, [0.1 * side, 0.03, 0.17], [0.04, 0.03, 0.06]);
  return { root, body, eyes, throat, legs };
}

export interface HeronModel {
  root: THREE.Group;
  body: THREE.Group;
  /** Pivots at the shoulders: bends forward to fish. */
  neck: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  /** Spread wings, only shown while flying (scale them up). */
  wings: THREE.Group[];
  eyes: THREE.Mesh[];
}

const HERON = { body: '#c8d0ef', wing: '#aebbe3', head: '#f1f2fb', beak: '#ffcf6b', leg: '#f1b79c', crest: '#6e6a8a', eye: '#3d3350' };

/** Tall, elegant toy heron. Feet at y = 0, facing +Z. */
export function createHeron(): HeronModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.08 * side, 0.86, 0);
    body.add(pivot);
    part(pivot, geo.cylinder, HERON.leg, [0, -0.43, 0], [0.022, 0.86, 0.022]);
    part(pivot, geo.sphere, HERON.leg, [0, -0.85, 0.06], [0.05, 0.012, 0.09]);
    return pivot;
  });
  part(body, geo.sphere, HERON.body, [0, 1.06, 0], [0.22, 0.24, 0.42]).rotation.x = -0.25;
  part(body, geo.sphere, HERON.wing, [0, 1.12, -0.06], [0.24, 0.13, 0.4]).rotation.x = -0.25;
  part(body, geo.cone, HERON.wing, [0, 1.02, -0.42], [0.1, 0.25, 0.05]).rotation.x = -1.9;

  const neck = new THREE.Group();
  neck.position.set(0, 1.16, 0.3);
  body.add(neck);
  part(neck, geo.cylinder, HERON.head, [0, 0.18, 0.06], [0.055, 0.4, 0.055]).rotation.x = 0.35;
  part(neck, geo.cylinder, HERON.head, [0, 0.52, 0.1], [0.05, 0.34, 0.05]).rotation.x = -0.15;
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.1);
  neck.add(head);
  part(head, geo.sphere, HERON.head, [0, 0, 0], [0.08, 0.08, 0.11]);
  part(head, geo.cone, HERON.beak, [0, -0.01, 0.22], [0.03, 0.28, 0.025]).rotation.x = Math.PI / 2;
  part(head, geo.sphere, HERON.crest, [0, 0.04, -0.13], [0.02, 0.02, 0.1]).rotation.x = 0.4;
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, HERON.eye, [0.06 * side, 0.02, 0.05], 0.018));

  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.18 * side, 1.15, 0);
    body.add(pivot);
    part(pivot, geo.sphere, HERON.wing, [0.5 * side, 0, 0], [0.5, 0.04, 0.26]);
    pivot.visible = false; // spread wings only show while flying
    return pivot;
  });
  return { root, body, neck, head, legs, wings, eyes };
}

export interface TurtleModel {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  /** Flippers: paddle while swimming, tuck in to hide. */
  legs: THREE.Group[];
  eyes: THREE.Mesh[];
}

const TURTLE = { shell: '#8fcfb8', plate: '#b8e6d0', rim: '#7cbfa6', skin: '#dfe8a8', eye: '#3d3350' };

/** Round pond turtle. Shell base at y = 0, facing +Z. */
export function createTurtle(): TurtleModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, TURTLE.rim, [0, 0.05, 0], [0.32, 0.05, 0.38]);
  part(body, geo.sphere, TURTLE.shell, [0, 0.1, 0], [0.29, 0.17, 0.35]);
  for (const [x, z] of [[0, 0], [0.13, 0.13], [-0.13, 0.13], [0.13, -0.13], [-0.13, -0.13]]) {
    part(body, geo.sphere, TURTLE.plate, [x, 0.22 - Math.hypot(x, z) * 0.35, z], [0.085, 0.03, 0.085]);
  }
  const head = new THREE.Group();
  head.position.set(0, 0.08, 0.36);
  body.add(head);
  part(head, geo.sphere, TURTLE.skin, [0, 0.02, 0.06], [0.09, 0.075, 0.11]);
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, TURTLE.eye, [0.055 * side, 0.06, 0.12], 0.02));
  const legs = [
    [-0.26, 0.2],
    [0.26, 0.2],
    [-0.24, -0.22],
    [0.24, -0.22],
  ].map(([x, z]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.04, z);
    body.add(pivot);
    part(pivot, geo.sphere, TURTLE.skin, [Math.sign(x) * 0.05, 0, 0], [0.09, 0.03, 0.06]);
    return pivot;
  });
  return { root, body, head, legs, eyes };
}

export interface DragonflyModel {
  root: THREE.Group;
  wings: THREE.Group[];
}

let dragonflyWingMaterial: THREE.MeshStandardMaterial | null = null;

/** Tiny dragonfly: slim body and two pairs of glassy wings. Facing +Z. */
export function createDragonfly(color: string): DragonflyModel {
  const root = new THREE.Group();
  part(root, geo.sphere, color, [0, 0, -0.08], [0.028, 0.028, 0.24]);
  part(root, geo.sphere, color, [0, 0.005, 0.14], 0.05);
  dragonflyWingMaterial ??= new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.2 });
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.02 * side, 0.02, 0.05);
    root.add(pivot);
    for (const z of [0.03, -0.05]) {
      const wing = new THREE.Mesh(geo.sphere, dragonflyWingMaterial!);
      wing.scale.set(0.17, 0.006, 0.04);
      wing.position.set(0.17 * side, 0, z);
      pivot.add(wing);
    }
    return pivot;
  });
  return { root, wings };
}

/** Give a legendary animal a soft inner glow (its own materials, lit from within). */
export function makeLegendary(root: THREE.Object3D, intensity = 0.35): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !(o.material instanceof THREE.MeshStandardMaterial)) return;
    const m = o.material.clone();
    m.emissive.copy(m.color);
    m.emissiveIntensity = intensity;
    o.material = m;
  });
}

const CAMEL = { coat: '#f3cfa2', light: '#fbe4c4', leg: '#e8bd8f', hoof: '#a88a74', eye: '#4a3f58' };

/** Lanky toy camel with a big round hump. Feet at y = 0, facing +Z. */
export function createCamel(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, CAMEL.coat, [0, 1.35, 0], [0.34, 0.3, 0.6]);
  part(body, geo.sphere, CAMEL.coat, [0, 1.68, -0.05], [0.26, 0.24, 0.3]);
  part(body, geo.sphere, CAMEL.light, [0, 1.25, 0.05], [0.26, 0.2, 0.45]);
  const legs = [
    leg(body, -0.16, 1.15, 0.38, 1.12, 0.06, CAMEL.leg, CAMEL.hoof),
    leg(body, 0.16, 1.15, 0.38, 1.12, 0.06, CAMEL.leg, CAMEL.hoof),
    leg(body, -0.16, 1.15, -0.38, 1.12, 0.06, CAMEL.leg, CAMEL.hoof),
    leg(body, 0.16, 1.15, -0.38, 1.12, 0.06, CAMEL.leg, CAMEL.hoof),
  ];
  const tail = new THREE.Group();
  tail.position.set(0, 1.4, -0.58);
  body.add(tail);
  part(tail, geo.cylinder, CAMEL.coat, [0, -0.15, -0.02], [0.03, 0.3, 0.03]);
  const neck = new THREE.Group();
  neck.position.set(0, 1.45, 0.5);
  body.add(neck);
  part(neck, geo.cylinder, CAMEL.coat, [0, 0.25, 0.18], [0.1, 0.6, 0.1]).rotation.x = 0.7;
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.42);
  neck.add(head);
  part(head, geo.sphere, CAMEL.coat, [0, 0, 0.05], [0.13, 0.13, 0.2]);
  part(head, geo.sphere, CAMEL.light, [0, -0.04, 0.2], [0.1, 0.08, 0.1]);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, geo.smallSphere, CAMEL.eye, [0.1 * side, 0.05, 0.1], 0.028));
    part(head, geo.sphere, CAMEL.coat, [0.12 * side, 0.12, -0.05], [0.04, 0.06, 0.03]);
  }
  return { root, body, head, neck, tail, legs, eyes };
}

export const LIZARD_COLORS = {
  mint: { body: '#a8e3c4', belly: '#e8f7e0', spots: '#ffd27a' },
  rainbow: { body: '#c5a8ff', belly: '#fff3c4', spots: '#ff9fc0' },
};

/** Low, long little lizard with a curly tail. Feet at y = 0, facing +Z. */
export function createLizard(colors: { body: string; belly: string; spots: string }): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, colors.body, [0, 0.12, 0], [0.11, 0.07, 0.3]);
  part(body, geo.sphere, colors.belly, [0, 0.09, 0.02], [0.08, 0.04, 0.24]);
  for (const [x, z] of [[0.05, 0.1], [-0.05, -0.05], [0.04, -0.15]]) part(body, geo.smallSphere, colors.spots, [x, 0.18, z], 0.03);
  const legs = [
    [-0.1, 0.12],
    [0.1, 0.12],
    [-0.1, -0.12],
    [0.1, -0.12],
  ].map(([x, z]) => leg(body, x, 0.1, z, 0.1, 0.022, colors.body));
  legs.forEach((l, i) => (l.rotation.z = (i % 2 ? -1 : 1) * 0.5));
  const head = new THREE.Group();
  head.position.set(0, 0.14, 0.32);
  body.add(head);
  part(head, geo.sphere, colors.body, [0, 0, 0.04], [0.09, 0.07, 0.12]);
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, '#3d3350', [0.06 * side, 0.04, 0.07], 0.022));
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.28);
  body.add(tail);
  part(tail, geo.cone, colors.body, [0, 0, -0.22], [0.06, 0.45, 0.04]).rotation.x = -Math.PI / 2;
  part(tail, geo.smallSphere, colors.spots, [0, 0.03, -0.12], 0.025);
  return { root, body, head, neck: null, tail, legs, eyes };
}

const CRAB = { shell: '#ff9f9a', light: '#ffc6bf', claw: '#ff8a86', eye: '#3d3350' };

/** Round beach crab with eye stalks and big claws (part of the head, so they tuck in). */
export function createCrab(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.16;
  root.add(body);
  part(body, geo.sphere, CRAB.shell, [0, 0, 0], [0.26, 0.12, 0.19]);
  part(body, geo.sphere, CRAB.light, [0, -0.04, 0.02], [0.2, 0.06, 0.15]);
  const legs = [
    [-0.2, 0.06],
    [0.2, 0.06],
    [-0.2, -0.08],
    [0.2, -0.08],
  ].map(([x, z]) => {
    const l = leg(body, x, -0.02, z, 0.16, 0.02, CRAB.claw);
    l.rotation.z = Math.sign(x) * 0.7;
    return l;
  });
  const head = new THREE.Group();
  head.position.set(0, 0.02, 0.16);
  body.add(head);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    part(head, geo.cylinder, CRAB.shell, [0.06 * side, 0.1, 0], [0.012, 0.14, 0.012]);
    eyes.push(part(head, geo.smallSphere, CRAB.eye, [0.06 * side, 0.18, 0.01], 0.03));
    part(head, geo.sphere, CRAB.claw, [0.22 * side, -0.01, 0.08], [0.09, 0.06, 0.08]);
    part(head, geo.sphere, CRAB.light, [0.26 * side, 0.01, 0.13], [0.04, 0.03, 0.05]);
  }
  const tail = new THREE.Group();
  body.add(tail);
  return { root, body, head, neck: null, tail, legs, eyes };
}

export const SEAL_COLORS = {
  grey: { body: '#c9cfe0', belly: '#e8ebf5', nose: '#6e6a8a' },
  pearl: { body: '#fbf7ff', belly: '#ffffff', nose: '#c9a8e8' },
};

/** Chubby seal lounging on its belly; flippers act as its "legs". Facing +Z. */
export function createSeal(colors: { body: string; belly: string; nose: string }): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, colors.body, [0, 0.28, 0], [0.32, 0.27, 0.55]);
  part(body, geo.sphere, colors.belly, [0, 0.2, 0.08], [0.26, 0.18, 0.42]);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.45);
  body.add(head);
  part(head, geo.sphere, colors.body, [0, 0, 0], [0.2, 0.18, 0.2]);
  part(head, geo.sphere, colors.belly, [0, -0.04, 0.13], [0.11, 0.08, 0.1]);
  part(head, geo.smallSphere, colors.nose, [0, -0.01, 0.22], 0.035);
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, '#3d3350', [0.09 * side, 0.06, 0.14], 0.035));
  for (const side of [-1, 1]) part(head, geo.cylinder, '#ffffff', [0.08 * side, -0.05, 0.2], [0.004, 0.12, 0.004]).rotation.z = Math.PI / 2;
  const flipper = (x: number, z: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.12, z);
    body.add(p);
    part(p, geo.sphere, colors.body, [Math.sign(x) * 0.06, -0.06, 0], [0.12, 0.03, 0.09]);
    return p;
  };
  const legs = [flipper(-0.26, 0.22), flipper(0.26, 0.22), flipper(-0.08, -0.55), flipper(0.08, -0.55)];
  const tail = new THREE.Group();
  body.add(tail);
  return { root, body, head, neck: null, tail, legs, eyes };
}

/** Beach seagull standing on orange legs. Feet at y = 0, facing +Z. */
export function createSeagull(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, '#ffffff', [0, 0.42, 0], [0.18, 0.17, 0.3]);
  for (const side of [-1, 1]) part(body, geo.sphere, '#c9cfe0', [0.15 * side, 0.46, -0.04], [0.05, 0.12, 0.26]);
  part(body, geo.sphere, '#8a8fa8', [0, 0.47, -0.3], [0.1, 0.04, 0.12]);
  const legs = [
    leg(body, -0.06, 0.28, 0.02, 0.28, 0.018, '#ffb870'),
    leg(body, 0.06, 0.28, 0.02, 0.28, 0.018, '#ffb870'),
    leg(body, -0.06, 0.28, 0.0, 0.28, 0.018, '#ffb870'),
    leg(body, 0.06, 0.28, 0.0, 0.28, 0.018, '#ffb870'),
  ];
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.22);
  body.add(head);
  part(head, geo.sphere, '#ffffff', [0, 0, 0], 0.11);
  part(head, geo.cone, '#ffd27a', [0, -0.02, 0.15], [0.03, 0.14, 0.025]).rotation.x = Math.PI / 2;
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, '#3d3350', [0.07 * side, 0.03, 0.06], 0.02));
  const tail = new THREE.Group();
  body.add(tail);
  return { root, body, head, neck: null, tail, legs, eyes };
}

/** Round snow bunny with long ears. Feet at y = 0, facing +Z. */
export function createBunny(): GroundModel {
  const c = { fur: '#ffffff', inner: '#ffc8dd', eye: '#4a3f58' };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, c.fur, [0, 0.22, -0.03], [0.2, 0.19, 0.24]);
  const legs = [
    [-0.09, 0.1],
    [0.09, 0.1],
    [-0.11, -0.12],
    [0.11, -0.12],
  ].map(([x, z]) => leg(body, x, 0.1, z, 0.09, 0.045, c.fur));
  const head = new THREE.Group();
  head.position.set(0, 0.38, 0.14);
  body.add(head);
  part(head, geo.sphere, c.fur, [0, 0, 0], [0.15, 0.13, 0.13]);
  part(head, geo.smallSphere, c.inner, [0, -0.02, 0.13], 0.025);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    eyes.push(part(head, geo.smallSphere, c.eye, [0.07 * side, 0.03, 0.1], 0.024));
    const ear = part(head, geo.sphere, c.fur, [0.06 * side, 0.2, -0.03], [0.045, 0.16, 0.035]);
    ear.rotation.z = -0.2 * side;
    part(head, geo.sphere, c.inner, [0.062 * side, 0.2, -0.005], [0.025, 0.12, 0.015]).rotation.z = -0.2 * side;
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, -0.26);
  body.add(tail);
  part(tail, geo.sphere, c.fur, [0, 0, 0], 0.07);
  return { root, body, head, neck: null, tail, legs, eyes };
}

/** Tubby toy penguin. Feet at y = 0, facing +Z. */
export function createPenguin(): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, '#5f6a8c', [0, 0.38, 0], [0.24, 0.34, 0.22]);
  part(body, geo.sphere, '#ffffff', [0, 0.35, 0.08], [0.19, 0.28, 0.16]);
  for (const side of [-1, 1]) part(body, geo.sphere, '#5f6a8c', [0.23 * side, 0.4, 0], [0.04, 0.18, 0.1]).rotation.z = 0.25 * side;
  const legs = [
    leg(body, -0.08, 0.06, 0.06, 0.05, 0.03, '#ffb870'),
    leg(body, 0.08, 0.06, 0.06, 0.05, 0.03, '#ffb870'),
    leg(body, -0.08, 0.06, 0.04, 0.05, 0.03, '#ffb870'),
    leg(body, 0.08, 0.06, 0.04, 0.05, 0.03, '#ffb870'),
  ];
  for (const l of legs) part(l, geo.sphere, '#ffb870', [0, -0.05, 0.05], [0.05, 0.015, 0.07]);
  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.02);
  body.add(head);
  part(head, geo.sphere, '#5f6a8c', [0, 0, 0], 0.16);
  part(head, geo.sphere, '#ffffff', [0, -0.02, 0.07], [0.12, 0.1, 0.1]);
  part(head, geo.cone, '#ffb870', [0, -0.03, 0.18], [0.035, 0.08, 0.03]).rotation.x = Math.PI / 2;
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, '#3d3350', [0.06 * side, 0.03, 0.13], 0.024));
  for (const side of [-1, 1]) part(head, geo.smallSphere, '#ffb3c6', [0.1 * side, -0.04, 0.1], [0.03, 0.018, 0.01]);
  const tail = new THREE.Group();
  body.add(tail);
  return { root, body, head, neck: null, tail, legs, eyes };
}

export const SNAIL_COLORS = {
  normal: { body: '#e8dcc8', shell: '#f4b8c8', swirl: '#d894b0' },
  glow: { body: '#d8f0ff', shell: '#b8f0ff', swirl: '#8fd8ff' },
};

/** Little snail with a spiral shell; the "head" group holds its body and eye stalks, so it can retract into the shell. */
export function createSnail(colors: { body: string; shell: string; swirl: string }): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, colors.shell, [0, 0.22, -0.05], [0.16, 0.18, 0.18]);
  part(body, geo.sphere, colors.swirl, [0.12, 0.23, -0.05], [0.05, 0.1, 0.1]);
  part(body, geo.sphere, colors.swirl, [-0.12, 0.23, -0.05], [0.05, 0.1, 0.1]);
  const head = new THREE.Group();
  body.add(head);
  part(head, geo.sphere, colors.body, [0, 0.05, 0.05], [0.1, 0.05, 0.26]);
  part(head, geo.sphere, colors.body, [0, 0.12, 0.24], [0.07, 0.08, 0.07]);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    part(head, geo.cylinder, colors.body, [0.035 * side, 0.22, 0.26], [0.012, 0.13, 0.012]).rotation.z = -0.2 * side;
    eyes.push(part(head, geo.smallSphere, '#3d3350', [0.05 * side, 0.29, 0.26], 0.022));
  }
  const legs = [0, 1, 2, 3].map(() => {
    const g = new THREE.Group();
    body.add(g);
    return g;
  });
  const tail = new THREE.Group();
  body.add(tail);
  return { root, body, head, neck: null, tail, legs, eyes };
}

/** Plump, sleepy toy badger with a striped face. Feet at y = 0, facing +Z. */
export function createBadger(): GroundModel {
  const c = { coat: '#9a93ad', white: '#ffffff', dark: '#5b5570', eye: '#3d3350' };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  part(body, geo.sphere, c.coat, [0, 0.3, 0], [0.26, 0.2, 0.38]);
  const legs = [
    [-0.13, 0.2],
    [0.13, 0.2],
    [-0.13, -0.2],
    [0.13, -0.2],
  ].map(([x, z]) => leg(body, x, 0.2, z, 0.18, 0.055, c.dark));
  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.36);
  body.add(head);
  part(head, geo.sphere, c.white, [0, 0, 0], [0.15, 0.13, 0.16]);
  for (const side of [-1, 1]) part(head, geo.sphere, c.dark, [0.07 * side, 0.02, 0.02], [0.05, 0.1, 0.15]);
  part(head, geo.smallSphere, c.dark, [0, -0.03, 0.16], 0.035);
  const eyes = [-1, 1].map((side) => part(head, geo.smallSphere, '#ffffff', [0.07 * side, 0.04, 0.11], 0.02));
  for (const side of [-1, 1]) part(head, geo.sphere, c.coat, [0.11 * side, 0.1, -0.05], [0.04, 0.04, 0.02]);
  const tail = new THREE.Group();
  tail.position.set(0, 0.34, -0.36);
  body.add(tail);
  part(tail, geo.sphere, c.coat, [0, 0, -0.03], [0.05, 0.05, 0.08]);
  return { root, body, head, neck: null, tail, legs, eyes };
}

// ---------------------------------------------------------------- the cats (mythic)

/** How a cat is built: body shape, colours and quirks. */
export interface CatSpec {
  build: 'loaf' | 'eggplant' | 'slim';
  /** Main coat, and the lighter chest/belly/muzzle/paws. */
  coat: string;
  light: string;
  /** Tabby stripes, on the body, face and tail. */
  stripes?: string;
  /** A tail that goes up, then bends at a right angle. */
  brokenTail?: boolean;
  /** Pupil colour; with `iris`, big coloured eyes (otherwise simple dark eyes). */
  eye: string;
  iris?: string;
  /**
   * Face markings painted over a light head: a `hood` over the head, ears and around the eyes; two
   * forehead `patches` from the ears to above the eyes; or a `tabby` mask down past the eyes, leaving
   * the muzzle and chin light (with `stripes` lines on the forehead and from the eyes).
   */
  markings?: { pattern: 'hood' | 'patches' | 'tabby'; color: string };
  /** A light stripe down the forehead, between the eyes (or between the patches). */
  blaze?: boolean;
  /** Tail colour (defaults to the coat), and dark rings around it (defaults to `stripes`). */
  tail?: string;
  tailRings?: string;
}

export const CATS: Record<'crochePatte' | 'kiki' | 'chablis', CatSpec> = {
  // Fat and rectangle-shaped, all white, with grey tabby patches on the forehead either side of a white
  // stripe, big yellow-green eyes and a grey tabby tail.
  crochePatte: {
    build: 'loaf',
    coat: '#fbfaf6',
    light: '#ffffff',
    eye: '#3a3346',
    iris: '#cfd184',
    markings: { pattern: 'patches', color: '#9a96a0' },
    blaze: true,
    tail: '#a8a4ac',
    tailRings: '#5a5562',
  },
  // Slate grey and white, eggplant-shaped, with a broken tail making a right angle; a grey hood with a
  // white blaze between big yellow-olive eyes, over a white muzzle.
  kiki: {
    build: 'eggplant',
    coat: '#7d7a88',
    light: '#fbfaf6',
    brokenTail: true,
    eye: '#3a3346',
    iris: '#e0c878',
    markings: { pattern: 'hood', color: '#7d7a88' },
    blaze: true,
  },
  // Slim, a warm grey tabby with a white chest, belly, legs and chin; a tabby mask with dark forehead
  // lines, pale blue eyes and a ringed tail.
  chablis: {
    build: 'slim',
    coat: '#b9b1aa',
    light: '#fbfaf6',
    stripes: '#6f6862',
    eye: '#2f3340',
    iris: '#bcd5e2',
    markings: { pattern: 'tabby', color: '#b9b1aa' },
  },
};

const CAT_PINK = '#ffb3c1';
const CAT_WHISKER = '#d8d2de';
const SPARKLE_GOLD = new THREE.MeshBasicMaterial({ color: '#ffe38a' });
const sparkleGeo = new THREE.OctahedronGeometry(0.035);
const paintedHeads = new Map<string, THREE.BufferGeometry>();

/**
 * A unit head sphere painted with vertex colours (see CatSpec.markings), with
 * an optional light blaze up the forehead. Soft edges, no seams.
 */
function paintedHead(pattern: 'hood' | 'patches' | 'tabby', dark: string, light: string, blaze: boolean, lines?: string): THREE.BufferGeometry {
  const key = `${pattern}|${dark}|${light}|${blaze}|${lines}`;
  let g = paintedHeads.get(key);
  if (g) return g;
  g = new THREE.SphereGeometry(1, 96, 72);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const darkColor = new THREE.Color(dark);
  const pale = new THREE.Color(light);
  const lineColor = new THREE.Color(lines ?? dark);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let hooded: number;
    if (pattern === 'hood') {
      // The hood's lower edge runs across the eyes at the front and drops away round the sides and back.
      hooded = smooth(-0.04, 0.04, y - 0.1 + 0.5 * (0.85 - z));
      if (blaze && z > 0.3) {
        // A light stripe, a point at the top of the forehead, widening down between the eyes.
        hooded *= smooth(-0.03, 0.03, Math.abs(x) - (0.04 + 0.55 * (0.82 - y)));
      }
    } else if (pattern === 'tabby') {
      // A mask down past the eyes and over the nose bridge; the muzzle either side of the nose and the
      // chin stay light.
      const ax = Math.abs(x);
      hooded = smooth(-0.04, 0.04, y + 0.12 + 0.6 * (0.85 - z));
      hooded = Math.max(hooded, smooth(-0.03, 0.03, 0.12 - ax) * smooth(-0.04, 0.04, y + 0.1) * smooth(0.5, 0.7, z));
    } else {
      // Patches over the top of the forehead, dipping to just above the outer corners of the eyes;
      // the back of the head stays light.
      hooded = smooth(-0.04, 0.04, y - 0.46 + 0.3 * Math.abs(x)) * smooth(-0.05, 0.2, z);
      // A wide light stripe between them, widening a little toward the eyes.
      if (blaze) hooded *= smooth(-0.03, 0.03, Math.abs(x) - (0.13 + 0.2 * (0.9 - y)));
    }
    c.copy(pale).lerp(darkColor, hooded);
    if (pattern === 'tabby' && lines && z > 0.2) {
      // Thin dark lines up the forehead (an "M"), and one from the outer corner of each eye.
      const ax = Math.abs(x);
      const forehead = Math.max(smooth(0.035, 0.02, Math.abs(ax - 0.09)), smooth(0.03, 0.017, Math.abs(ax - 0.25 + 0.15 * (y - 0.5))));
      const line = forehead * smooth(0.42, 0.5, y) * smooth(0.98, 0.85, y);
      const cheek = smooth(0.045, 0.025, Math.abs(y - 0.02 + 0.45 * (ax - 0.62))) * smooth(0.6, 0.66, ax) * smooth(0.95, 0.85, ax);
      c.lerp(lineColor, Math.max(line, cheek) * 0.85);
    }
    c.toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  paintedHeads.set(key, g);
  return g;
}

function smooth(e0: number, e1: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const paintedBodies = new Map<string, THREE.BufferGeometry>();

/**
 * A unit body sphere (+Z forward) painted as a tabby: dark stripes down the back
 * and sides over the coat, a light chest and belly.
 */
function tabbyBody(coat: string, light: string, stripes: string): THREE.BufferGeometry {
  const key = `${coat}|${light}|${stripes}`;
  let g = paintedBodies.get(key);
  if (g) return g;
  g = new THREE.SphereGeometry(1, 128, 64);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(coat);
  const pale = new THREE.Color(light);
  const dark = new THREE.Color(stripes);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Stripes wrap down from the spine, wavy and fading toward the belly.
    const wave = Math.sin((z + 0.05 * Math.sin(y * 4 + x * 2)) * 20);
    const stripe = smooth(0.1, 0.9, wave) * smooth(-0.35, 0.25, y) * smooth(0.75, 0.5, z);
    c.copy(base).lerp(dark, stripe * 0.6);
    // Light below the flanks, and up the chest at the front.
    c.lerp(pale, smooth(-0.3, -0.45, y - 0.9 * smooth(0.55, 0.95, z)));
    c.toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  paintedBodies.set(key, g);
  return g;
}

const vertexColored = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.6, metalness: 0 });

/** Cat tails, one shared tube per build and colouring. */
const tailGeometries = new Map<string, THREE.TubeGeometry>();

/** A tail tube, optionally painted with dark rings and a dark tip (vertex colours, so no seams). */
function tailTube(curve: THREE.Curve<THREE.Vector3>, radius: number, key: string, base: string, rings?: string, count = 3): THREE.TubeGeometry {
  let g = tailGeometries.get(key);
  if (g) return g;
  g = new THREE.TubeGeometry(curve, 48, radius, 10);
  if (rings) {
    const uv = g.attributes.uv;
    const colors = new Float32Array(uv.count * 3);
    const light = new THREE.Color(base);
    const dark = new THREE.Color(rings);
    const c = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i); // 0 at the base, 1 at the tip
      // Soft rings, getting a touch wider toward the tip, which ends dark.
      const phase = (u * count + 0.35) % 1;
      const ring = Math.max(0, 1 - Math.abs(phase - 0.5) / (0.16 + 0.08 * u)) ** 0.5;
      const t = Math.min(1, Math.max(ring > 0.35 ? 1 : 0, (u - 0.9) / 0.05));
      c.copy(light).lerp(dark, t).toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  tailGeometries.set(key, g);
  return g;
}

/**
 * A house cat, in one of three builds: a big square "loaf" (Croche-Patte),
 * an eggplant with a small front and big round rear (Kiki), or a slim, long-
 * legged cat (Chablis). Feet at y = 0, facing +Z, with a sparkle aura.
 */
export function createCat(spec: CatSpec): GroundModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const { coat, light } = spec;

  // Body, legs and where the head and tail attach, per build.
  let legs: THREE.Group[];
  let headAt: [number, number, number];
  let tailAt: [number, number, number];
  let headSize: number;
  if (spec.build === 'loaf') {
    const loaf = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.36, 0.74, 4, 0.15), mat(coat));
    loaf.position.set(0, 0.32, 0);
    loaf.castShadow = true;
    body.add(loaf);
    part(body, geo.sphere, light, [0, 0.26, 0.2], [0.2, 0.15, 0.2]);
    const y = 0.2;
    legs = [[-0.15, 0.25], [0.15, 0.25], [-0.15, -0.25], [0.15, -0.25]].map(([x, z]) => leg(body, x, y, z, 0.2, 0.07, coat, light));
    headAt = [0, 0.52, 0.36];
    tailAt = [0, 0.38, -0.37];
    headSize = 0.19;
  } else if (spec.build === 'eggplant') {
    // Big round bottom at the back, a narrower front: an eggplant lying down.
    part(body, geo.fineSphere, coat, [0, 0.36, -0.1], [0.25, 0.25, 0.27]);
    // A light chest under a coloured saddle over the shoulders.
    part(body, geo.fineSphere, light, [0, 0.4, 0.17], [0.17, 0.18, 0.2]);
    part(body, geo.fineSphere, coat, [0, 0.47, 0.1], [0.16, 0.12, 0.2]);
    part(body, geo.fineSphere, light, [0, 0.31, 0.06], [0.2, 0.17, 0.3]);
    legs = [[-0.09, 0.3, 0.2], [0.09, 0.3, 0.2], [-0.13, 0.24, -0.16], [0.13, 0.24, -0.16]].map(([x, y, z]) => leg(body, x, y, z, y - 0.02, 0.05, light, light));
    headAt = [0, 0.58, 0.32];
    tailAt = [0, 0.46, -0.34];
    headSize = 0.16;
  } else {
    if (spec.stripes) {
      const torso = new THREE.Mesh(tabbyBody(coat, light, spec.stripes), vertexColored);
      torso.position.set(0, 0.36, 0);
      torso.scale.set(0.14, 0.15, 0.38);
      torso.castShadow = true;
      body.add(torso);
    } else {
      part(body, geo.sphere, coat, [0, 0.36, 0], [0.14, 0.15, 0.38]);
    }
    part(body, geo.sphere, light, [0, 0.31, 0.12], [0.11, 0.11, 0.2]);
    // A neck up to the head: coat behind, a light throat in front.
    part(body, geo.fineSphere, coat, [0, 0.47, 0.3], [0.1, 0.13, 0.11]);
    part(body, geo.fineSphere, light, [0, 0.44, 0.34], [0.085, 0.11, 0.08]);
    // White legs and paws.
    legs = [[-0.07, 0.29, 0.22], [0.07, 0.29, 0.22], [-0.07, 0.29, -0.22], [0.07, 0.29, -0.22]].map(([x, y, z]) => leg(body, x, y, z, 0.29, 0.043, light, light));
    headAt = [0, 0.56, 0.38];
    tailAt = [0, 0.4, -0.36];
    headSize = 0.14;
  }

  // Head: round, with a white muzzle, pink nose, whiskers and pointy ears.
  const head = new THREE.Group();
  head.position.set(...headAt);
  body.add(head);
  const r = headSize;
  const { markings } = spec;
  if (markings) {
    // One painted sphere: markings (and blaze) over a light face, a little wide at the cheeks.
    const skull = new THREE.Mesh(paintedHead(markings.pattern, markings.color, light, !!spec.blaze, spec.stripes), vertexColored);
    skull.scale.set(r * 1.05, r * 0.9, r * 0.92);
    skull.castShadow = true;
    head.add(skull);
  } else {
    part(head, geo.fineSphere, coat, [0, 0, 0], [r, r * 0.9, r * 0.92]);
  }
  // Muzzle puffs (subtler on a painted face, which is already light there).
  const puff = markings ? 0.8 : 1;
  for (const side of [-1, 1]) part(head, geo.fineSphere, light, [r * 0.27 * side, -r * 0.36, r * 0.64], [r * 0.36 * puff, r * 0.3 * puff, r * 0.34 * puff]);
  part(head, geo.smallSphere, CAT_PINK, [0, -r * 0.12, r * 0.9], [r * 0.14, r * 0.1, r * 0.1]);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    if (spec.iris) {
      // Big round coloured eyes with a dark pupil (the pupil rides along when the eye blinks shut).
      const eye = part(head, geo.sphere, spec.iris, [r * 0.4 * side, r * 0.14, r * 0.8], [r * 0.22, r * 0.22, r * 0.12]);
      eye.rotation.y = 0.28 * side; // faces a touch outward, like a real cat's
      const pupil = new THREE.Mesh(geo.sphere, mat(spec.eye));
      pupil.position.set(0, 0, 0.72);
      pupil.scale.set(0.5, 0.64, 0.4);
      const glint = new THREE.Mesh(geo.smallSphere, mat('#ffffff'));
      glint.position.set(-0.28, 0.3, 0.98);
      glint.scale.setScalar(0.17);
      eye.add(pupil, glint);
      eyes.push(eye);
    } else {
      eyes.push(part(head, geo.smallSphere, spec.eye, [r * 0.42 * side, r * 0.12, r * 0.78], r * 0.15));
    }
    const ear = part(head, geo.cone, markings && markings.pattern !== 'patches' ? markings.color : coat, [r * 0.55 * side, r * 0.9, -r * 0.05], [r * 0.4, r * 0.72, r * 0.24]);
    ear.rotation.z = -0.35 * side;
    const inner = part(head, geo.cone, CAT_PINK, [r * 0.55 * side, r * 0.86, r * 0.06], [r * 0.24, r * 0.48, r * 0.1]);
    inner.rotation.z = -0.35 * side;
    // Three whiskers per side.
    for (let w = -1; w <= 1; w++) {
      const whisker = part(head, geo.cylinder, CAT_WHISKER, [r * 0.62 * side, -r * 0.3 + w * r * 0.1, r * 0.72], [0.004, r * 0.8, 0.004]);
      whisker.rotation.z = (Math.PI / 2) * side + w * 0.18 * side;
    }
  }

  // Tail: pivots at its base so it can swish and curl.
  const tail = new THREE.Group();
  tail.position.set(...tailAt);
  body.add(tail);
  const tailColor = spec.tail ?? coat;
  const rings = spec.tailRings ?? spec.stripes;
  if (spec.brokenTail) {
    // Straight up, then a sharp right-angle bend backward.
    part(tail, geo.cylinder, tailColor, [0, 0.16, -0.02], [0.045, 0.32, 0.045]);
    part(tail, geo.sphere, tailColor, [0, 0.32, -0.02], 0.047);
    part(tail, geo.cylinder, tailColor, [0, 0.32, -0.13], [0.043, 0.22, 0.043]).rotation.x = Math.PI / 2;
    part(tail, geo.sphere, tailColor, [0, 0.32, -0.25], 0.046);
  } else {
    // A smooth tail curving up and back (thick and short for a fat cat, long and thin for a slim one).
    const fat = spec.build === 'loaf';
    const radius = fat ? 0.06 : 0.036;
    const curve = new THREE.CatmullRomCurve3(
      (fat
        ? [[0, 0, 0], [0, 0.08, -0.12], [0, 0.22, -0.2], [0, 0.36, -0.17]]
        : [[0, 0, 0], [0, 0.07, -0.14], [0, 0.22, -0.26], [0, 0.4, -0.26], [0, 0.5, -0.18]]
      ).map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    // Dark rings painted around the tail (more of them on a tabby tail), ending in a dark tip.
    const count = 5;
    const tubeGeo = tailTube(curve, radius, `${spec.build}|${tailColor}|${rings}|${count}`, tailColor, rings, count);
    const tube = new THREE.Mesh(tubeGeo, rings ? vertexColored : mat(tailColor));
    tube.castShadow = true;
    tail.add(tube);
    part(tail, geo.sphere, rings ?? tailColor, curve.getPoint(1).toArray() as [number, number, number], radius);
  }

  // A slow ring of golden sparkles: the mark of a mythic animal.
  const aura = new THREE.Group();
  aura.position.y = headAt[1] * 0.75;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sparkle = new THREE.Mesh(sparkleGeo, SPARKLE_GOLD);
    sparkle.position.set(Math.cos(a) * 0.5, (i % 2) * 0.12, Math.sin(a) * 0.5);
    aura.add(sparkle);
  }
  root.add(aura);

  return { root, body, head, neck: null, tail, legs, eyes, aura };
}
