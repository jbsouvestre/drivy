import * as THREE from 'three';

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
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export interface BirdModel {
  root: THREE.Group;
  body: THREE.Group;
  wings: [THREE.Group, THREE.Group];
  eyes: THREE.Mesh[];
}

export const BIRD_COLORS = [
  { body: '#a0c4ff', wing: '#8ab0f0' }, // bluebird
  { body: '#fdf0a0', wing: '#f2dc7a' }, // canary
  { body: '#ffc6e0', wing: '#f5a8cb' }, // pink finch
  { body: '#c8f0dc', wing: '#a6dcc2' }, // mint tit
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

export const OWL_COLORS = [
  { body: '#b8a9d9', belly: '#efe6fa', face: '#fbf5ea' }, // lavender
  { body: '#c9a98f', belly: '#f5e6d6', face: '#fff6ea' }, // cocoa
  { body: '#dcdcec', belly: '#ffffff', face: '#ffffff' }, // snowy
];

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
