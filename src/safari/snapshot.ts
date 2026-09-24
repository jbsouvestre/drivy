/**
 * Turning a rendered frame into a photo: a full-size image (for downloads) and
 * a small thumbnail (for the polaroid and the journal grids), both JPEG Blobs.
 * Raise PHOTO_WIDTH to take sharper pictures; the thumbnail stays light.
 */

/** Full-size photos (4:3). Never upscaled past what the screen rendered. */
const PHOTO_WIDTH = 1280;
/** Thumbnails, shown in the polaroid and the journal. */
const THUMB_WIDTH = 480;
const ASPECT = 4 / 3;
const QUALITY = 0.88;
const THUMB_QUALITY = 0.82;

/** A photo as stored: full-size and thumbnail JPEGs. */
export interface Snapshot {
  full: Blob;
  thumb: Blob;
}

/** A frame grabbed but not yet encoded. */
export interface Frame {
  full: HTMLCanvasElement;
  thumb: HTMLCanvasElement;
}

/**
 * Copy the centre 4:3 of a just-rendered WebGL canvas. Must run right after
 * rendering (in the same task), before the browser presents and clears it.
 */
export function grabFrame(src: HTMLCanvasElement): Frame {
  let w = src.width;
  let h = w / ASPECT;
  if (h > src.height) {
    h = src.height;
    w = h * ASPECT;
  }
  const sx = (src.width - w) / 2;
  const sy = (src.height - h) / 2;
  const fullWidth = Math.round(Math.min(PHOTO_WIDTH, w));
  const full = canvas(fullWidth, Math.round(fullWidth / ASPECT));
  full.getContext('2d')!.drawImage(src, sx, sy, w, h, 0, 0, full.width, full.height);
  const thumbWidth = Math.min(THUMB_WIDTH, fullWidth);
  const thumb = canvas(thumbWidth, Math.round(thumbWidth / ASPECT));
  const ctx = thumb.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, thumb.width, thumb.height);
  return { full, thumb };
}

/** Encode a grabbed frame (off the render path). */
export async function encodeFrame(frame: Frame): Promise<Snapshot> {
  const [full, thumb] = await Promise.all([toJpeg(frame.full, QUALITY), toJpeg(frame.thumb, THUMB_QUALITY)]);
  return { full, thumb };
}

/** A data URL → Blob (to move legacy base64 photos into IndexedDB). */
export async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality),
  );
}
