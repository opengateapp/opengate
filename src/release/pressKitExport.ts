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

async function imagesFor(v: PressKitView): Promise<Map<string, string>> {
  const ids = [...new Set([v.posterId, ...v.stills, ...v.people.map((x) => x.photoId)].filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  await Promise.all(ids.map(async (id) => { const u = await dataUrl(id, id === v.posterId ? 1400 : 1600); if (u) out.set(id, u); }));
  return out;
}

export async function exportPressKit(p: Project, kind: 'pdf' | 'html') {
  const v = pressKitView(p, getDerived());
  const images = await imagesFor(v);
  const name = `${safeName(v.title)} - press kit`;
  if (kind === 'html') { download(`${name}.html`, pressKitHtml(v, images), 'text/html'); return; }
  const { pressKitPdf } = await import('../pdf/pressKitPdf');
  download(`${name}.pdf`, pressKitPdf(v, images).output('blob'));
}
