import * as THREE from 'three';
import {
  BIRD_COLORS,
  createBadger,
  createBird,
  createBunny,
  createCamel,
  createCrab,
  createDeer,
  createDragonfly,
  createDuck,
  createFox,
  createFrog,
  createHedgehog,
  createHeron,
  createLizard,
  createOwl,
  createPenguin,
  createSeagull,
  createSeal,
  createSnail,
  createSquirrel,
  createTurtle,
  DUCK_COLORS,
  FROG_COLORS,
  LIZARD_COLORS,
  OWL_COLORS,
  SEAL_COLORS,
  SNAIL_COLORS,
} from '../wildlife/models';
import { propDefs } from '../world/props';
import { roadMaterials } from '../world/roadMesh';
import { dizzyMaterials } from '../wildlife/bonk';

/**
 * Compile the shaders for every prop and animal up front (behind the splash
 * screen), using the real scene's lights and fog. Otherwise each one compiles
 * the first time it comes into view, which shows up as a hitch the first time
 * you drive into a new biome.
 */
export function warmUpShaders(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  /** Scene objects that start hidden (e.g. weather particles) but should be compiled too. */
  hidden: THREE.Object3D[] = [],
): void {
  const group = new THREE.Group();

  // Props render as instanced meshes with per-instance colours: compile exactly that variant.
  const white = new THREE.Color('#ffffff');
  for (const def of Object.values(propDefs())) {
    for (const part of def.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, 1);
      mesh.setMatrixAt(0, new THREE.Matrix4());
      if (part.palette) mesh.setColorAt(0, white);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // Road surfaces.
  const roadGeometry = new THREE.PlaneGeometry(1, 1);
  for (const material of Object.values(roadMaterials())) {
    const road = new THREE.Mesh(roadGeometry, material);
    road.receiveShadow = true;
    group.add(road);
  }

  // Dizzy eyes (sprites) and the swirl over a bonked animal's head.
  for (const material of dizzyMaterials()) {
    group.add(material instanceof THREE.SpriteMaterial ? new THREE.Sprite(material) : new THREE.Mesh(roadGeometry, material));
  }

  // One of each animal model (their materials are shared per colour, so this covers them all).
  group.add(
    createBird(BIRD_COLORS[0]).root,
    createSquirrel().root,
    createOwl(OWL_COLORS.lavender).root,
    createDuck(DUCK_COLORS.white).root,
    createDeer().root,
    createFox().root,
    createHedgehog().root,
    createFrog(FROG_COLORS.green).root,
    createHeron().root,
    createTurtle().root,
    createDragonfly('#8ec5ff').root,
    createCamel().root,
    createLizard(LIZARD_COLORS.mint).root,
    createCrab().root,
    createSeal(SEAL_COLORS.grey).root,
    createSeagull().root,
    createBunny().root,
    createPenguin().root,
    createSnail(SNAIL_COLORS.normal).root,
    createBadger().root,
  );

  // Compile against the real scene so light and fog setups match.
  scene.add(group);
  const wasVisible = hidden.map((o) => o.visible);
  for (const o of hidden) o.visible = true;
  renderer.compile(scene, camera);
  hidden.forEach((o, i) => (o.visible = wasVisible[i]));
  scene.remove(group);
  // Only the throwaway instance buffers need freeing: geometries and materials are shared.
  group.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  roadGeometry.dispose();
}
