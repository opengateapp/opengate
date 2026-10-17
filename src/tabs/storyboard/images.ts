import { blobToImage } from '../../store/media';

const MAX = 1920;

/** Downscales large uploads (keeps IndexedDB and project files small); small images pass through. */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  const img = await blobToImage(file);
  if (img.width <= MAX && img.height <= MAX && file.size < 1.5e6) return file;
  const s = Math.min(1, MAX / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88));
  return out ?? file;
}
