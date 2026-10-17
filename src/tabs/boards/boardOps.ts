import type { Board, BoardItem, BoardItemType } from '../../model/types';
import { newId } from '../../model/ids';
import { putMedia, blobToImage, loadImage } from '../../store/media';
import { prepareImage } from '../storyboard/images';
import { useStore } from '../../store/project';

// Board helpers shared by the canvas, drag-and-drop, paste and Pinterest import.

export const NOTE_COLORS = ['#FEF08A', '#FBCFE8', '#BFDBFE', '#BBF7D0', '#FED7AA', '#E9D5FF', '#F5F5F4'];
export const INK_COLORS = ['#111827', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#FFFFFF'];
export const IMAGE_WIDTH = 260;

export function nextZ(board: Board): number {
  return board.items.reduce((m, i) => Math.max(m, i.z), 0) + 1;
}

export function makeItem(type: BoardItemType, x: number, y: number, extra: Partial<BoardItem> = {}): BoardItem {
  const size: Record<BoardItemType, [number, number]> = {
    image: [IMAGE_WIDTH, 180], note: [200, 160], text: [260, 48], link: [260, 96], swatch: [120, 140],
    shape: [200, 140], frame: [640, 420], stroke: [1, 1],
  };
  const [w, h] = size[type];
  const base: BoardItem = { id: newId(), type, x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h, z: 0 };
  if (type === 'note') Object.assign(base, { color: NOTE_COLORS[0], text: '' });
  if (type === 'text') Object.assign(base, { text: 'Text', color: '#111827' });
  if (type === 'swatch') Object.assign(base, { color: '#C2410C', caption: '' });
  if (type === 'shape') Object.assign(base, { shape: 'rect', color: '#2563EB', strokeWidth: 3 });
  if (type === 'frame') Object.assign(base, { caption: 'Section', color: '#E4E4E7' });
  return { ...base, ...extra };
}

/** Adds items to a board as one undoable step; z-order continues above existing items. */
export function addItems(boardId: string, items: BoardItem[], label = 'Add to board') {
  if (!items.length) return;
  useStore.getState().update((d) => {
    const b = d.boards.find((x) => x.id === boardId);
    if (!b) return;
    let z = nextZ(b as Board);
    // Frames go to the back so they act as sections behind their images.
    for (const it of items) b.items.push({ ...it, z: it.type === 'frame' ? -(z++) : z++ });
    b.updatedAt = new Date().toISOString();
  }, label);
}

export function updateItems(boardId: string, ids: string[], fn: (it: BoardItem) => void, label: string | null = 'Edit board') {
  useStore.getState().update((d) => {
    const b = d.boards.find((x) => x.id === boardId);
    if (!b) return;
    for (const it of b.items) if (ids.includes(it.id)) fn(it as BoardItem);
    b.updatedAt = new Date().toISOString();
  }, label);
}

export function removeItems(boardId: string, ids: string[]) {
  useStore.getState().update((d) => {
    const b = d.boards.find((x) => x.id === boardId);
    if (b) b.items = b.items.filter((i) => !ids.includes(i.id));
  }, ids.length > 1 ? `Delete ${ids.length} items` : 'Delete item');
}

function sizeFor(w: number, h: number): [number, number] {
  const width = IMAGE_WIDTH;
  return [width, Math.max(40, Math.round((h / Math.max(1, w)) * width))];
}

/** Stores an image file in the project and returns a board item centered at (x, y). */
export async function imageItemFromBlob(blob: Blob, x: number, y: number, extra: Partial<BoardItem> = {}): Promise<BoardItem> {
  const projectId = useStore.getState().project!.id;
  const prepared = await prepareImage(blob);
  const img = await blobToImage(prepared);
  const imageId = await putMedia(projectId, prepared);
  const [w, h] = sizeFor(img.naturalWidth, img.naturalHeight);
  return makeItem('image', x, y, { imageId, w, h, x: Math.round(x - w / 2), y: Math.round(y - h / 2), ...extra });
}

/** Copies a web image into the project when the host allows it; otherwise keeps the remote URL. */
export async function imageItemFromUrl(url: string, x: number, y: number, extra: Partial<BoardItem> = {}): Promise<BoardItem> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('not an image');
    return await imageItemFromBlob(blob, x, y, { sourceUrl: url, ...extra });
  } catch {
    // Blocked by CORS (or offline): show it from the web and keep the link.
    let w = IMAGE_WIDTH;
    let h = 180;
    try {
      const img = await loadImage(url);
      [w, h] = sizeFor(img.naturalWidth, img.naturalHeight);
    } catch { /* unknown size */ }
    return makeItem('image', x, y, { imageUrl: url, w, h, x: Math.round(x - w / 2), y: Math.round(y - h / 2), sourceUrl: url, ...extra });
  }
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;

export function isProbablyImageUrl(u: string): boolean {
  return IMAGE_EXT.test(u) || /(pinimg\.com|images\.unsplash\.com|googleusercontent\.com|cdninstagram|imgur\.com\/\w+\.)/i.test(u);
}

export interface DropContent {
  files: File[];
  /** Images by URL, with the page they came from when the browser tells us. */
  images: { url: string; source?: string; caption?: string }[];
  links: string[];
  text: string;
}

/** Reads what was dropped or pasted: files, images dragged from web pages, links and plain text. */
export function readTransfer(dt: DataTransfer): DropContent {
  const out: DropContent = { files: [], images: [], links: [], text: '' };
  for (const f of Array.from(dt.files)) if (f.type.startsWith('image/')) out.files.push(f);
  if (out.files.length) return out;
  const html = dt.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const img of Array.from(doc.querySelectorAll('img'))) {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:') && src.length < 200) continue;
      const a = img.closest('a')?.getAttribute('href') ?? undefined;
      out.images.push({ url: src, source: a && /^https?:/.test(a) ? a : undefined, caption: img.getAttribute('alt') || undefined });
    }
  }
  const uris = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
  const plain = dt.getData('text/plain').trim();
  if (!out.images.length) {
    for (const u of uris.length ? uris : /^https?:\/\/\S+$/.test(plain) ? [plain] : []) {
      if (isProbablyImageUrl(u)) out.images.push({ url: u, source: u });
      else out.links.push(u);
    }
  }
  if (!out.images.length && !out.links.length && plain) out.text = plain;
  return out;
}

/** Turns dropped/pasted content into board items laid out in a loose grid around (x, y). */
export async function itemsFromTransfer(c: DropContent, x: number, y: number): Promise<BoardItem[]> {
  const items: BoardItem[] = [];
  const cols = 4;
  let i = 0;
  const at = () => {
    const k = i++;
    return [x + (k % cols) * (IMAGE_WIDTH + 24), y + Math.floor(k / cols) * 240] as const;
  };
  for (const f of c.files) {
    const [px, py] = at();
    items.push(await imageItemFromBlob(f, px, py, { caption: f.name.replace(/\.[^.]+$/, '') }));
  }
  for (const im of c.images) {
    const [px, py] = at();
    items.push(await imageItemFromUrl(im.url, px, py, { sourceUrl: im.source ?? im.url, caption: im.caption }));
  }
  for (const l of c.links) {
    const [px, py] = at();
    items.push(makeItem('link', px, py, { sourceUrl: l, caption: hostOf(l) }));
  }
  if (c.text) {
    const [px, py] = at();
    items.push(makeItem('note', px, py, { text: c.text.slice(0, 2000) }));
  }
  return items;
}

export function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
}

export function newBoard(kind: Board['kind'], title?: string): Board {
  return { id: newId(), title: title ?? (kind === 'mood' ? 'Mood board' : 'Whiteboard'), kind, items: [], updatedAt: new Date().toISOString() };
}

/** Bounding box of items (for zoom-to-fit). */
export function bounds(items: BoardItem[]): { x: number; y: number; w: number; h: number } | null {
  if (!items.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of items) {
    x0 = Math.min(x0, i.x); y0 = Math.min(y0, i.y);
    x1 = Math.max(x1, i.x + i.w); y1 = Math.max(y1, i.y + i.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
