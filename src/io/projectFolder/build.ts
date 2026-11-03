import JSZip from 'jszip';
import type { Project } from '../../model/types';
import type { Derived } from '../../script/derive';
import { getMedia } from '../../store/media';
import { renderFrame } from '../../tabs/storyboard/render';
import { DOCUMENT_FOLDERS, type FolderLayout } from './layouts';
import { availableItems, limitedAccess, visibleItems, type BuildContext, type FolderItem, type ItemState } from './items';

// Builds the Export everything ZIP: runs the ticked items, one at a time, into a Project Folders
// layout. An item that fails is skipped and listed; the rest still build.

export const WARN_BYTES = 500 * 1024 * 1024;
const MAX_NAME = 80;

export class Cancelled extends Error { constructor() { super('Cancelled'); } }

const UNSAFE = /[\u0000-\u001f\u007f\\/:*?"<>|]+/g;
const edges = (s: string) => s.replace(/^[. ]+|[. ]+$/g, '');
const clip = (s: string, n: number) => edges([...s].slice(0, n).join(''));

/** One folder or file name that's safe on every system and can't leave its folder. */
export function safeSegment(name: string, fallback = 'Untitled', isFile = false): string {
  const clean = name.normalize('NFC').replace(UNSAFE, '').replace(/\s+/g, ' ').trim();
  const m = isFile ? clean.match(/^(.*)(\.[a-zA-Z0-9]{1,8})$/) : null;
  const ext = m ? m[2] : '';
  const base = clip(edges(m ? m[1] : clean), MAX_NAME - ext.length) || fallback;
  // Windows won't create CON, AUX and friends, with or without an extension.
  const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(base);
  return `${reserved ? `${base}_` : base}${ext}`;
}

export const projectFolderName = (title: string) => safeSegment(title, 'Untitled Project');

/** Adds files under a top folder, keeping every name safe and unique (`Notes (2).html`). */
class Tree {
  private used = new Map<string, Set<string>>();
  zip = new JSZip();
  constructor(readonly top: string) { this.zip.folder(top); }

  folder(path: string) {
    this.zip.folder([this.top, ...path.split('/').map((s) => safeSegment(s))].join('/'));
  }
  add(segments: string[], data: Blob | string) {
    const clean = segments.map((s, i) => (i === segments.length - 1 ? s : safeSegment(s)));
    const dir = [this.top, ...clean.slice(0, -1)].join('/');
    const taken = this.used.get(dir.toLowerCase()) ?? new Set<string>();
    this.used.set(dir.toLowerCase(), taken);
    const name = safeSegment(clean[clean.length - 1], 'Untitled', true);
    const dot = name.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? '';
    const base = name.slice(0, name.length - dot.length);
    let out = name;
    for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${base} (${n})${dot}`;
    taken.add(out.toLowerCase());
    // Text is worth compressing; PDFs, images and project files already are.
    this.zip.file(`${dir}/${out}`, data, { compression: typeof data === 'string' ? 'DEFLATE' : 'STORE' });
    return `${dir}/${out}`;
  }
}

export interface FolderProgress { done: number; total: number; label: string }
export interface FolderResult { blob: Blob; name: string; included: { label: string; files: number }[]; skipped: { label: string; reason: string }[]; paths: string[] }

export interface FolderOptions {
  layout: FolderLayout;
  selected: ReadonlySet<string>;
  signal?: AbortSignal;
  onProgress?: (p: FolderProgress) => void;
  media?: BuildContext['media'];
  render?: BuildContext['render'];
  now?: Date;
}

const nextFrame = () => new Promise<void>((r) => { setTimeout(r, 0); });

function readMe(o: FolderOptions, top: string, states: ItemState[], ran: FolderResult['included'], skipped: FolderResult['skipped']): string {
  const date = (o.now ?? new Date()).toISOString().slice(0, 10);
  const unticked = states.filter((s) => !s.empty && !o.selected.has(s.item.id)).map((s) => s.item.label);
  const lines = [
    `${top}`,
    `Exported from Open Gate on ${date}.`,
    `Folder layout: ${o.layout.label}. Open Gate's paperwork is in ${o.layout.documents}/; the other folders are empty and ready for the shoot.`,
    '',
  ];
  if (ran.some((r) => r.label.startsWith('Project file'))) lines.push(`${top}.opengate is a separate copy of the project. Open it in Open Gate (File > Open project). It isn't connected to the original, and it holds your budget and paperwork.`, '');
  else if (limitedAccess()) lines.push('The project file was left out: your access to this project is limited, and a project file holds more than these folders do.', '');
  if (skipped.length) lines.push('These couldn\'t be built and are missing:', ...skipped.map((s) => `- ${s.label}: ${s.reason}`), '');
  if (unticked.length) lines.push('Left out because they were unticked:', ...unticked.map((x) => `- ${x}`), '');
  lines.push('Shot Designer plans and story maps have no file of their own yet. They\'re kept in the project file.', '');
  return lines.join('\r\n');
}

/** Builds the ZIP. Throws Cancelled if the signal fires. */
export async function buildProjectFolder(p: Project, d: Derived, o: FolderOptions): Promise<FolderResult> {
  const check = () => { if (o.signal?.aborted) throw new Cancelled(); };
  const tick = async () => { await nextFrame(); check(); };
  const top = projectFolderName(p.title);
  const tree = new Tree(top);
  for (const f of o.layout.folders) tree.folder(f);
  for (const f of DOCUMENT_FOLDERS) tree.folder(`${o.layout.documents}/${f}`);

  const states = availableItems(p, d);
  const run = states.filter((s) => !s.empty && o.selected.has(s.item.id)).map((s) => s.item);
  const included: FolderResult['included'] = [];
  const skipped: FolderResult['skipped'] = [];
  const paths: string[] = [];
  const ctx: BuildContext = { p, d, media: o.media ?? getMedia, render: o.render ?? renderFrame, tick };

  for (const [i, item] of run.entries()) {
    o.onProgress?.({ done: i, total: run.length, label: `Building ${item.label.toLowerCase()}` });
    await tick();
    try {
      const files = await item.build(ctx);
      for (const f of files) paths.push(tree.add(placeOf(item, f.path, o.layout, top), f.data));
      if (files.length) included.push({ label: item.label, files: files.length });
    } catch (e) {
      if (e instanceof Cancelled) throw e;
      console.error(e);
      skipped.push({ label: item.label, reason: (e as Error).message || 'Something went wrong' });
    }
  }
  check();
  paths.push(tree.add(['READ ME.txt'], readMe(o, top, states, included, skipped)));

  o.onProgress?.({ done: run.length, total: run.length, label: 'Packing the ZIP' });
  check();
  const blob = await pack(tree.zip, o.signal);
  return { blob, name: `${top}.zip`, included, skipped, paths };
}

/** Where an item's file goes. The project file takes the project's name at the top. */
function placeOf(item: FolderItem, path: string[], layout: FolderLayout, top: string): string[] {
  if (item.folder === null) return [`${top}${path[path.length - 1]}`];
  return [...layout.documents.split('/'), ...item.folder.split('/'), ...path];
}

function pack(zip: JSZip, signal?: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const stream = zip.generateInternalStream({ type: 'blob', mimeType: 'application/zip' });
    signal?.addEventListener('abort', () => { stream.pause(); reject(new Cancelled()); }, { once: true });
    stream.accumulate().then((b) => resolve(b as Blob), reject);
  });
}

/** Bytes of each media file an item copies, once per item (a file in two items is in the ZIP twice). */
export async function mediaSizes(p: Project, media: BuildContext['media'] = getMedia): Promise<Map<string, number>> {
  const sizes = new Map<string, number>();
  for (const item of visibleItems()) {
    let n = 0;
    for (const id of new Set(item.media?.(p).filter((x): x is string => !!x) ?? [])) n += (await media(id))?.size ?? 0;
    if (n) sizes.set(item.id, n);
  }
  return sizes;
}

export const likelySize = (sizes: ReadonlyMap<string, number>, selected: ReadonlySet<string>) => [...sizes].reduce((a, [id, n]) => (selected.has(id) ? a + n : a), 0);

/** What's ticked to begin with: everything with something in it, except auto-saved drafts and any deliverables that would push the ZIP past the warning size. */
export function defaultSelection(states: ItemState[], sizes: ReadonlyMap<string, number>): Set<string> {
  const on = new Set(states.filter((s) => !s.empty && !s.item.offByDefault).map((s) => s.item.id));
  if (likelySize(sizes, on) > WARN_BYTES) on.delete('deliverables');
  return on;
}
