import * as THREE from 'three';

const COLOR = '#fff1c4';
/** SpotLight intensity at full power (candela, physically based lighting). */
const INTENSITY = 22;
const RANGE = 32;
const CONE_ANGLE = 0.5;
/** Visible beam cone length and far-end radius. */
const BEAM_LENGTH = 13;
const BEAM_RADIUS = 3.4;
const BEAM_OPACITY = 0.1;
/** How quickly lights fade on/off (1/s). */
const FADE_SPEED = 14;

/**
 * A pair of real spotlights (with shadows) plus soft visible beam cones.
 * Attach to the car's root; local +Z is forward.
 */
export class Headlights {
  on = false;

  private level = 0;
  private readonly lights: THREE.SpotLight[] = [];
  private readonly beamMaterial: THREE.ShaderMaterial;
  private readonly bulbs: THREE.MeshStandardMaterial[];

  /**
   * @param lamps local positions of the two headlamps
   * @param bulbs the lamp materials, made to glow when on
   */
  constructor(parent: THREE.Object3D, lamps: THREE.Vector3[], bulbs: THREE.MeshStandardMaterial[]) {
    this.bulbs = bulbs;

    this.beamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(COLOR) },
        uOpacity: { value: 0 },
        uLength: { value: BEAM_LENGTH },
      },
      vertexShader: /* glsl */ `
        uniform float uLength;
        varying float vAlong;
        varying float vFacing;
        void main() {
          // Geometry runs from the lamp (z = 0) to the open end (z = uLength).
          vAlong = clamp(position.z / uLength, 0.0, 1.0);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vFacing = abs(dot(n, normalize(-mvPosition.xyz)));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vAlong;
        varying float vFacing;
        void main() {
          // Brightest at the lamp, fading out along the beam and at its silhouette edges.
          float a = uOpacity * pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.6, vFacing);
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const beamGeometry = new THREE.ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 24, 1, true)
      .rotateX(-Math.PI / 2) // tip toward -Z …
      .translate(0, 0, BEAM_LENGTH / 2); // … then tip at the lamp, opening forward

    for (const lamp of lamps) {
      const light = new THREE.SpotLight(COLOR, 0, RANGE, CONE_ANGLE, 0.7, 1);
      light.position.copy(lamp);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = RANGE;
      light.shadow.bias = -0.002;
      light.target.position.set(lamp.x * 1.4, 0, lamp.z + 16);
      parent.add(light, light.target);
      this.lights.push(light);

      const beam = new THREE.Mesh(beamGeometry, this.beamMaterial);
      beam.position.copy(lamp);
      beam.rotation.x = 0.08; // aim slightly down so the beam meets the ground
      beam.renderOrder = 1;
      parent.add(beam);
    }
  }

  toggle(): boolean {
    this.on = !this.on;
    return this.on;
  }

  update(dt: number): void {
    const target = this.on ? 1 : 0;
    this.level += (target - this.level) * Math.min(1, FADE_SPEED * dt);
    if (Math.abs(this.level - target) < 0.001) this.level = target;

    for (const light of this.lights) {
      light.intensity = this.level * INTENSITY;
      // No point re-rendering shadow maps for lights that are off. (castShadow itself
      // stays on: toggling it changes every shader's light setup and forces recompiles.)
      // The shadow map must be rendered at least once to exist, or every shader sampling it fails.
      light.shadow.autoUpdate = this.level > 0.001 || light.shadow.map === null;
    }
    this.beamMaterial.uniforms.uOpacity.value = this.level * BEAM_OPACITY;
    for (const bulb of this.bulbs) bulb.emissiveIntensity = 0.4 + this.level * 2.6;
  }
}
