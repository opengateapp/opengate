import JSZip from 'jszip';
import * as Y from 'yjs';
import type { Project, StoryboardFrame } from '../model/types';
import { getMedia, putMedia, MEDIA_EXT, EXT_TYPE } from '../store/media';
import { migrate } from '../store/migrate';
import { newId } from '../model/ids';
import { db } from '../store/db';
import { b64url, fromB64url } from '../sync/crypto';

/** A shared project's sync state (per channel), carried in linked .opengate files. */
export type SyncBundle = Record<string, { state: Uint8Array; seq: number; pending: { id: string; u: Uint8Array }[] }>;

export const PROJECT_EXT = '.opengate';
/** File types Open Gate opens (projects saved under the old name too). */
export const PROJECT_ACCEPT = '.opengate,.slateline,.json';

export function download(name: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeName(s: string): string {
  return (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Untitled';
}

export function mediaIds(p: Project): string[] {
  return [...new Set([
    ...p.storyboard.flatMap((f) => [f.imageId, f.drawingId]),
    ...p.boards.flatMap((b) => b.items.map((i) => i.imageId)),
    ...p.locations.flatMap((l) => l.photoIds ?? []),
    ...p.storyboard.flatMap((f) => [f.refImageId, f.refDrawingId]),
    ...Object.values(p.callSheets).map((c) => c.logoId),
    p.titlePage.logoId,
  ].filter((x): x is string => !!x))];
}

/** Gives a project new media ids (so a copy never shares image records with the original). */
function remapMedia(p: Project, remap: Map<string, string>): Project {
  const re = (id?: string) => (id ? remap.get(id) ?? id : id);
  return {
    ...p,
    storyboard: p.storyboard.map((f: StoryboardFrame) => ({ ...f, imageId: re(f.imageId), drawingId: re(f.drawingId), refImageId: re(f.refImageId), refDrawingId: re(f.refDrawingId) })),
    boards: p.boards.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i, imageId: re(i.imageId) })) })),
    locations: p.locations.map((l) => ({ ...l, photoIds: l.photoIds?.map((x) => re(x)!) })),
    callSheets: Object.fromEntries(Object.entries(p.callSheets).map(([k, c]) => [k, { ...c, logoId: re(c.logoId) }])),
    titlePage: { ...p.titlePage, logoId: re(p.titlePage.logoId) },
  };
}

/** The sync state saved on this device for a shared project. */
export async function loadSyncBundle(projectId: string): Promise<SyncBundle> {
  const out: SyncBundle = {};
  for (const r of await db.sync.where('projectId').equals(projectId).toArray()) out[r.key.split(':').pop()!] = { state: r.state, seq: r.seq, pending: r.pending ?? [] };
  return out;
}

/** Merges a file's sync state into this device's (Yjs merges, so nothing from either side is lost). */
export async function mergeSyncBundle(projectId: string, bundle: SyncBundle): Promise<void> {
  for (const [ch, b] of Object.entries(bundle)) {
    const key = `${projectId}:${ch}`;
    const cur = await db.sync.get(key);
    const pending = [...(cur?.pending ?? [])];
    for (const x of b.pending) if (!pending.some((y) => y.id === x.id)) pending.push(x);
    await db.sync.put({
      key, projectId,
      state: cur ? Y.mergeUpdates([cur.state, b.state]) : b.state,
      seq: cur ? Math.min(cur.seq, b.seq) : b.seq,
      pending,
    });
  }
}

export interface ExportOptions {
  /** A copy that isn't connected to the shared project: no share access, new ids. */
  independent?: boolean;
  /** Sync state to include (defaults to what's saved on this device). */
  sync?: SyncBundle;
}

/** Project bundle: a zip with project.json, media/<id>.<ext>, and for shared projects sync/ (linked files). */
export async function exportProjectFile(p: Project, loadMedia: (id: string) => Promise<Blob | null> = getMedia, opts: ExportOptions = {}): Promise<Blob> {
  const zip = new JSZip();
  let out = p;
  let mediaName = (id: string) => id;
  if (opts.independent) {
    const remap = new Map(mediaIds(p).map((id) => [id, newId()]));
    out = { ...remapMedia(p, remap), id: newId() };
    delete out.share;
    mediaName = (id) => remap.get(id) ?? id;
  }
  zip.file('project.json', JSON.stringify(out, null, 2));
  for (const id of mediaIds(p)) {
    const b = await loadMedia(id);
    if (b) zip.file(`media/${mediaName(id)}.${MEDIA_EXT[b.type] ?? 'bin'}`, b);
  }
  if (out.share) {
    const bundle = opts.sync ?? await loadSyncBundle(p.id);
    const meta: Record<string, { seq: number; pending: { id: string; u: string }[] }> = {};
    for (const [ch, b] of Object.entries(bundle)) {
      zip.file(`sync/${ch}.bin`, b.state);
      meta[ch] = { seq: b.seq, pending: b.pending.map((x) => ({ id: x.id, u: b64url(x.u) })) };
    }
    zip.file('sync/meta.json', JSON.stringify(meta));
  }
  zip.file('README.txt', 'Open Gate project file. Open it in Open Gate (File → Open project). project.json holds the full project.');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Reads a .opengate / .slateline (or bare .json) project. Media in the bundle is stored in IndexedDB under the project. */
export async function readProjectFile(
  file: File, asCopy = false,
  saveMedia: (projectId: string, blob: Blob, id: string) => Promise<unknown> = putMedia,
  saveSync: (projectId: string, bundle: SyncBundle) => Promise<void> = mergeSyncBundle,
): Promise<Project> {
  let json: unknown;
  const media = new Map<string, Blob>();
  const bundle: SyncBundle = {};
  if (file.name.toLowerCase().endsWith('.json')) json = JSON.parse(await file.text());
  else {
    const zip = await JSZip.loadAsync(file);
    const entry = zip.file('project.json');
    if (!entry) throw new Error('This file has no project.json inside.');
    json = JSON.parse(await entry.async('string'));
    for (const f of zip.file(/^media\/[^/]+$/)) {
      const m = f.name.match(/^media\/(.+)\.([a-z0-9]+)$/i);
      if (!m) continue;
      const data = await f.async('arraybuffer');
      media.set(m[1], new Blob([data], { type: EXT_TYPE[m[2].toLowerCase()] ?? 'application/octet-stream' }));
    }
    const meta = zip.file('sync/meta.json');
    if (meta) {
      const m = JSON.parse(await meta.async('string')) as Record<string, { seq: number; pending: { id: string; u: string }[] }>;
      for (const [ch, v] of Object.entries(m)) {
        const bin = zip.file(`sync/${ch}.bin`);
        if (!bin) continue;
        bundle[ch] = { state: new Uint8Array(await bin.async('arraybuffer')), seq: v.seq, pending: v.pending.map((x) => ({ id: x.id, u: fromB64url(x.u) })) };
      }
    }
  }
  const p = migrate(json);
  let out = p;
  if (asCopy) {
    // A copy gets its own media ids so deleting one project never removes the other's images,
    // and isn't connected to any shared project.
    const remap = new Map([...media.keys()].map((k) => [k, newId()]));
    out = { ...remapMedia(p, remap), id: newId() };
    delete out.share;
    for (const [k, v] of remap) { media.set(v, media.get(k)!); media.delete(k); }
  } else if (out.share && Object.keys(bundle).length) {
    // A linked file: its sync state merges with this device's, then the project reconnects.
    await saveSync(out.id, bundle);
  }
  for (const [id, blob] of media) await saveMedia(out.id, blob, id);
  return out;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
