import type { Project, StoryboardFrame } from '../../model/types';
import { blobToImage, getMedia } from '../../store/media';
import { getDerived } from '../../store/project';
import { download, safeName } from '../../io/files';

export const FRAME_W = 1280;
export const FRAME_H = 720;

/** Draws an image scaled to fit (letterboxed) into a canvas of the frame size. */
export function drawContain(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w = FRAME_W, h = FRAME_H) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Flattens a frame (white paper + image + drawing) to a JPEG data URL for the board PDF. */
export async function renderFrame(f: StoryboardFrame, width = 960, layer: 'frame' | 'ref' = 'frame'): Promise<string> {
  const imageId = layer === 'ref' ? f.refImageId : f.imageId;
  const drawingId = layer === 'ref' ? f.refDrawingId : f.drawingId;
  const h = Math.round((width * 9) / 16);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, h);
  for (const id of [imageId, drawingId]) {
    if (!id) continue;
    const b = await getMedia(id);
    if (!b) continue;
    try {
      const img = await blobToImage(b);
      if (id === drawingId) ctx.drawImage(img, 0, 0, width, h);
      else drawContain(ctx, img, width, h);
    } catch { /* skip unreadable */ }
  }
  return c.toDataURL('image/jpeg', 0.85);
}

export async function exportStoryboardPdf(p: Project) {
  const images = new Map<string, string>();
  for (const f of p.storyboard) {
    images.set(f.id, await renderFrame(f));
    if (f.refImageId || f.refDrawingId) images.set('ref:' + f.id, await renderFrame(f, 720, 'ref'));
  }
  const { storyboardPdf } = await import('../../pdf/storyboardPdf');
  download(`${safeName(p.title)} - storyboard.pdf`, storyboardPdf(p, getDerived(), images, p.storyboardSettings).output('blob'));
}
