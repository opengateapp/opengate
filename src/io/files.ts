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

/** Files that belong to the budget (receipts, licenses, paperwork, clearances): synced with the budget's own key. */
export function budgetMediaIds(p: Project): string[] {
  const b = p.budget;
  return [
    ...(b?.expenses ?? []).map((e) => e.receiptId),
    ...(b?.licenses ?? []).map((l) => l.fileId),
    ...(b?.paperwork ?? []).flatMap((x) => [x.fileId, x.signature?.mediaId]),
    ...(b?.clearances ?? []).map((c) => c.fileId),
    ...(b?.agreements ?? []).map((a) => a.fileId),
  ].filter((x): x is string => !!x);
}

export function mediaIds(p: Project): string[] {
  return [...new Set([
    ...p.storyboard.flatMap((f) => [f.imageId, f.drawingId, ...(f.ghosts ?? []).map((g) => g.drawingId)]),
    ...p.boards.flatMap((b) => b.items.map((i) => i.imageId)),
    ...p.locations.flatMap((l) => l.photoIds ?? []),
    ...p.storyboard.flatMap((f) => [f.refImageId, f.refDrawingId]),
    ...Object.values(p.callSheets).map((c) => c.logoId),
    p.titlePage.logoId,
    ...(p.budget?.expenses ?? []).map((e) => e.receiptId),
    ...budgetMediaIds(p),
    ...(p.characters ?? []).flatMap((c) => [c.portraitId, ...c.continuity.map((x) => x.imageId)]),
    ...(p.plans ?? []).map((pl) => pl.backgroundId),
    ...releaseMediaIds(p),
  ].filter((x): x is string => !!x))];
}

/** Release: poster, stills and headshots in the press kit, social photos, deliverable files. */
export function releaseMediaIds(p: Project): string[] {
  const k = p.pressKit;
  return [
    k?.posterId, ...(k?.stills ?? []), ...Object.values(k?.photos ?? {}), ...(k?.laurels ?? []).flatMap((l) => [l.imageId, l.darkImageId]),
    ...(p.socialPosts ?? []).flatMap((x) => x.mediaIds),
    ...(p.deliverables ?? []).map((x) => x.fileId),
  ].filter((x): x is string => !!x);
}

/** Gives a project new media ids (so a copy never shares image records with the original). */
function remapMedia(p: Project, remap: Map<string, string>): Project {
  const re = (id?: string) => (id ? remap.get(id) ?? id : id);
  return {
    ...p,
    storyboard: p.storyboard.map((f: StoryboardFrame) => ({ ...f, imageId: re(f.imageId), drawingId: re(f.drawingId), ...(f.ghosts ? { ghosts: f.ghosts.map((g) => ({ ...g, drawingId: re(g.drawingId)! })) } : {}), refImageId: re(f.refImageId), refDrawingId: re(f.refDrawingId) })),
    boards: p.boards.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i, imageId: re(i.imageId) })) })),
    locations: p.locations.map((l) => ({ ...l, photoIds: l.photoIds?.map((x) => re(x)!) })),
    callSheets: Object.fromEntries(Object.entries(p.callSheets).map(([k, c]) => [k, { ...c, logoId: re(c.logoId) }])),
    titlePage: { ...p.titlePage, logoId: re(p.titlePage.logoId) },
    budget: p.budget && {
      ...p.budget, expenses: p.budget.expenses.map((e) => ({ ...e, receiptId: re(e.receiptId) })), licenses: (p.budget.licenses ?? []).map((l) => ({ ...l, fileId: re(l.fileId) })),
      paperwork: (p.budget.paperwork ?? []).map((x) => ({ ...x, fileId: re(x.fileId), signature: x.signature && { ...x.signature, mediaId: re(x.signature.mediaId) } })),
      clearances: (p.budget.clearances ?? []).map((c) => ({ ...c, fileId: re(c.fileId) })),
      agreements: (p.budget.agreements ?? []).map((a) => ({ ...a, fileId: re(a.fileId)! })),
    },
    plans: p.plans?.map((pl) => ({ ...pl, backgroundId: re(pl.backgroundId) })),
    characters: (p.characters ?? []).map((c) => ({ ...c, portraitId: re(c.portraitId), continuity: c.continuity.map((x) => ({ ...x, imageId: re(x.imageId)! })) })),
    pressKit: p.pressKit && { ...p.pressKit, posterId: re(p.pressKit.posterId), stills: p.pressKit.stills.map((x) => re(x)!), photos: p.pressKit.photos && Object.fromEntries(Object.entries(p.pressKit.photos).map(([k, v]) => [k, re(v)!])), laurels: p.pressKit.laurels?.map((l) => ({ ...l, imageId: re(l.imageId), darkImageId: re(l.darkImageId) })) },
    socialPosts: p.socialPosts?.map((x) => ({ ...x, mediaIds: x.mediaIds.map((m) => re(m)!) })),
    deliverables: p.deliverables?.map((x) => ({ ...x, fileId: re(x.fileId) })),
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
