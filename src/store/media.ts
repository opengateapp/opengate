import { useEffect, useState } from 'react';
import { db } from './db';
import { newId } from '../model/ids';

// Media blobs (storyboard images and drawings) live in IndexedDB, not in the project JSON,
// so autosave stays small. Project files carry them in a media/ folder (io/files.ts).

export async function putMedia(projectId: string, blob: Blob, id: string = newId()): Promise<string> {
  await db.media.put({ id, projectId, type: blob.type || 'image/png', blob });
  bump(id);
  return id;
}

export async function getMedia(id: string): Promise<Blob | null> {
  return (await db.media.get(id))?.blob ?? null;
}

export async function deleteMedia(ids: string[]): Promise<void> {
  await db.media.bulkDelete(ids);
}

export const MEDIA_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' };
export const EXT_TYPE: Record<string, string> = Object.fromEntries(Object.entries(MEDIA_EXT).map(([t, e]) => [e, t]));

// Small in-memory version counter so every thumbnail of a blob refreshes when it's rewritten.
const versions = new Map<string, number>();
const listeners = new Set<() => void>();
function bump(id: string) {
  versions.set(id, (versions.get(id) ?? 0) + 1);
  listeners.forEach((l) => l());
}

/** Object URL for a media blob, revoked on unmount / change. */
export function useMediaUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [, setV] = useState(0);
  useEffect(() => {
    const l = () => setV((x) => x + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const ver = id ? versions.get(id) ?? 0 : 0;
  useEffect(() => {
    if (!id) { setUrl(null); return; }
    let alive = true;
    let made: string | null = null;
    void getMedia(id).then((b) => {
      if (!alive || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [id, ver]);
  return url;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function blobToImage(b: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(b);
  try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
