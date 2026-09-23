import * as THREE from 'three';

/** Height of every pond's surface. Ground dug below this fills with water. */
export const WATER_LEVEL = -0.45;

const SHALLOW = new THREE.Color('#c4f5ee');
const DEEP = new THREE.Color('#9dd6f7');
const FOAM = new THREE.Color('#ffffff');
/** Water shallower than this at the shore shows a foam line. */
const FOAM_DEPTH = 0.14;
/** Depth at which the water reaches its deepest colour. */
const FULL_DEPTH = 1.1;

const uniforms = { uTime: { value: 0 } };

/**
 * Shared pond material: lit like everything else (so it follows day/night and
 * headlights), with per-vertex shallow→deep colour/alpha and moving ripples
 * that make the highlights shimmer.
 */
const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  transparent: true,
  roughness: 0.25,
  metalness: 0,
  depthWrite: false,
  // A touch of self-glow keeps the pastel water bright instead of greying out.
  emissive: '#5fa8c8',
  emissiveIntensity: 0.18,
});
material.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = uniforms.uTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWaterPos;')
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      // Two crossing ripple trains tilt the normal a little, so highlights wobble.
      vec2 p = vWaterPos.xz;
      vec3 ripple = vec3(
        sin(p.x * 1.4 + uTime * 1.6) * 0.5 + sin(p.y * 0.9 - uTime * 1.1) * 0.5,
        0.0,
        cos(p.y * 1.3 + uTime * 1.3) * 0.5 + cos(p.x * 0.8 + uTime * 0.9) * 0.5
      ) * 0.12;
      normal = normalize(normal + (viewMatrix * vec4(ripple, 0.0)).xyz);`,
    );
};

export function updateWater(dt: number): void {
  uniforms.uTime.value += dt;
}

/**
 * Water surface for one chunk, or null if no ground in the chunk dips below
 * the water level. `heightAt` must be the terrain function.
 */
export function buildWater(
  cx: number,
  cz: number,
  chunkSize: number,
  segments: number,
  heightAt: (x: number, z: number) => number,
): THREE.Mesh | null {
  const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const originX = cx * chunkSize + chunkSize / 2;
  const originZ = cz * chunkSize + chunkSize / 2;

  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  const c = new THREE.Color();
  let wet = false;
  for (let i = 0; i < pos.count; i++) {
    const depth = WATER_LEVEL - heightAt(pos.getX(i) + originX, pos.getZ(i) + originZ);
    if (depth > 0) wet = true;
    c.lerpColors(SHALLOW, DEEP, THREE.MathUtils.smoothstep(depth, 0, FULL_DEPTH));
    // Foam where the water meets the shore (depth near zero, either side of it).
    const foam = 1 - THREE.MathUtils.smoothstep(Math.abs(depth), 0, FOAM_DEPTH);
    c.lerp(FOAM, foam * 0.85);
    const alpha = THREE.MathUtils.lerp(0.7, 0.96, THREE.MathUtils.smoothstep(depth, 0, FULL_DEPTH)) + foam * 0.1;
    colors.set([c.r, c.g, c.b, Math.min(1, alpha)], i * 4);
  }
  if (!wet) {
    geometry.dispose();
    return null;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(originX, WATER_LEVEL, originZ);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
