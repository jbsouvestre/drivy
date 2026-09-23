import * as THREE from 'three';

/** How long a bubble stays up, in seconds. */
export const ALERT_DURATION = 0.9;
const POP = 0.15;

const materials = new Map<string, THREE.SpriteMaterial>();

/** Rounded bubble with white text, drawn once per label and shared. */
function bubbleMaterial(text: string, color: string, aspect: number): THREE.SpriteMaterial {
  const key = `${text}|${color}|${aspect}`;
  const cached = materials.get(key);
  if (cached) return cached;

  const h = 128;
  const w = h * aspect;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const r = h / 2 - 8;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(8, 8, w - 16, h - 16, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${text.length > 1 ? 64 : 84}px Fredoka, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Drawn on top of everything, like a comic-book reaction.
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: false });
  materials.set(key, material);
  return material;
}

/** A hidden bubble sprite; show it by driving it with `animateAlert`. */
export function createBubble(text: string, color: string, y: number, aspect = 1): THREE.Sprite {
  const sprite = new THREE.Sprite(bubbleMaterial(text, color, aspect));
  sprite.position.y = y;
  sprite.renderOrder = 10;
  sprite.visible = false;
  sprite.userData.aspect = aspect;
  return sprite;
}

/** The pink "!" shown when an animal is startled. */
export function createAlert(y: number): THREE.Sprite {
  return createBubble('!', '#ff8fa3', y);
}

/** Pop the bubble in, wobble it, and shrink it away. `time` < 0 or past `duration` hides it. */
export function animateAlert(sprite: THREE.Sprite, time: number, size: number, duration = ALERT_DURATION): void {
  if (time < 0 || time > duration) {
    sprite.visible = false;
    return;
  }
  sprite.visible = true;
  let s: number;
  if (time < POP) {
    const t = time / POP - 1;
    s = 1 + 2.7 * t * t * t + 1.7 * t * t; // ease-out-back overshoot
  } else if (time > duration - POP) {
    s = (duration - time) / POP;
  } else {
    s = 1 + Math.sin(time * 30) * 0.06;
  }
  s = size * Math.max(0, s);
  sprite.scale.set(s * (sprite.userData.aspect as number), s, 1);
}
