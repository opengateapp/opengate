import type { Project, StoryboardFrame, StoryboardSettings } from '../../model/types';
import { drawGuides, drawLayer, formatOf, ghostAlpha } from './formats';
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
export async function renderFrame(f: StoryboardFrame, size = 960, layer: 'frame' | 'ref' = 'frame', settings?: StoryboardSettings): Promise<string> {
  const imageId = layer === 'ref' ? f.refImageId : f.imageId;
  const drawingId = layer === 'ref' ? f.refDrawingId : f.drawingId;
  // Frames take the storyboard's format (long side = size); set plans stay 16:9.
  const fmt = formatOf(settings);
  const ratio = layer === 'ref' ? 16 / 9 : fmt.ratio;
  const width = ratio >= 1 ? size : Math.round(size * ratio);
  const h = ratio >= 1 ? Math.round(size / ratio) : size;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, h);
  // Image, then onion-skin ghost poses (faded, oldest faintest), then the drawing on top.
  const ghosts = layer === 'frame' ? f.ghosts ?? [] : [];
  const layers: { id?: string; kind: 'image' | 'drawing'; alpha: number }[] = [
    { id: imageId, kind: 'image', alpha: 1 },
    ...ghosts.map((g, i) => ({ id: g.drawingId, kind: 'drawing' as const, alpha: ghostAlpha(i, ghosts.length, f.ghostFade) })),
    { id: drawingId, kind: 'drawing', alpha: 1 },
  ];
  for (const l of layers) {
    if (!l.id) continue;
    const b = await getMedia(l.id);
    if (!b) continue;
    try {
      const img = await blobToImage(b);
      ctx.globalAlpha = l.alpha;
      if (l.kind === 'drawing') drawLayer(ctx, img, width, h);
      else drawContain(ctx, img, width, h);
    } catch { /* skip unreadable */ }
    ctx.globalAlpha = 1;
  }
  const guides = layer === 'frame' && settings?.guidesInPrint !== false ? (settings?.guides ?? []).filter((g) => g !== fmt.id) : [];
  if (guides.length) drawGuides(ctx, width, h, guides);
  return c.toDataURL('image/jpeg', 0.85);
}

export async function exportStoryboardPdf(p: Project) {
  const images = new Map<string, string>();
  for (const f of p.storyboard) {
    images.set(f.id, await renderFrame(f, 960, 'frame', p.storyboardSettings));
    if (f.refImageId || f.refDrawingId) images.set('ref:' + f.id, await renderFrame(f, 720, 'ref'));
  }
  const { storyboardPdf } = await import('../../pdf/storyboardPdf');
  download(`${safeName(p.title)} - storyboard.pdf`, storyboardPdf(p, getDerived(), images, p.storyboardSettings).output('blob'));
}
