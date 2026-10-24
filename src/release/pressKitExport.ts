import type { Project } from '../model/types';
import { getMedia } from '../store/media';
import { getDerived } from '../store/project';
import { download, safeName } from '../io/files';
import { pressKitHtml, pressKitView, type PressKitView } from './pressKit';

/** A media image as a JPEG data URL, at most `max` px on its long side (keeps the files small). */
async function dataUrl(id: string, max = 1600): Promise<string | undefined> {
  const b = await getMedia(id);
  if (!b || !b.type.startsWith('image/')) return undefined;
  const bmp = await createImageBitmap(b).catch(() => null);
  if (!bmp) return undefined;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

/** A media file as it is (no resizing or flattening), for laurels. */
async function rawDataUrl(id: string): Promise<string | undefined> {
  const b = await getMedia(id);
  if (!b || !b.type.startsWith('image/')) return undefined;
  return new Promise((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.onerror = () => done(undefined); r.readAsDataURL(b); });
}

async function svgToPng(url: string, height = 400): Promise<string | undefined> {
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { return undefined; }
  const w = img.naturalWidth || 300, h = img.naturalHeight || 150;
  const c = document.createElement('canvas');
  c.height = height; c.width = Math.round((w / h) * height);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/** A laurel as sent: SVG and PNG keep their transparency; only very large images are made smaller (still PNG). */
export async function prepareLaurel(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.type === 'image/svg+xml') return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp || (Math.max(bmp.width, bmp.height) <= 2400 && file.size < 4e6)) return file;
  const s = 2400 / Math.max(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return (await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))) ?? file;
}

async function imagesFor(v: PressKitView): Promise<Map<string, string>> {
  const ids = [...new Set([v.posterId, ...v.stills, ...v.people.map((x) => x.photoId)].filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  await Promise.all(ids.map(async (id) => { const u = await dataUrl(id, id === v.posterId ? 1400 : 1600); if (u) out.set(id, u); }));
  // Laurels keep their transparency (PNG / SVG as they are).
  const lids = [...new Set(v.laurels.flatMap((l) => [l.imageId, l.darkImageId]).filter((x): x is string => !!x))];
  await Promise.all(lids.map(async (id) => { const u = await rawDataUrl(id); if (u) out.set(id, u); }));
  return out;
}

export async function exportPressKit(p: Project, kind: 'pdf' | 'html') {
  const v = pressKitView(p, getDerived());
  const images = await imagesFor(v);
  const name = `${safeName(v.title)} - press kit`;
  if (kind === 'html') { download(`${name}.html`, pressKitHtml(v, images), 'text/html'); return; }
  // PDFs can't hold SVG: draw SVG laurels into PNGs (transparent) first.
  for (const [id, url] of images) if (url.startsWith('data:image/svg')) { const png = await svgToPng(url); if (png) images.set(id, png); else images.delete(id); }
  const { pressKitPdf } = await import('../pdf/pressKitPdf');
  download(`${name}.pdf`, pressKitPdf(v, images).output('blob'));
}
