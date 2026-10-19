import type { Project, RevisionColor, ScriptDraft } from '../model/types';
import type { Derived } from './derive';
import { derive } from './derive';
import { docToBlocks, type Block } from './schema';
import { newId } from '../model/ids';

// Script drafts: named frozen copies of the script, compared block by block. Production
// revisions mark what changed since a base draft (asterisks, revision colour, locked pages).

export const REVISION_COLORS: { id: RevisionColor; label: string; hex: string }[] = [
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'blue', label: 'Blue', hex: '#9ec5ff' },
  { id: 'pink', label: 'Pink', hex: '#ffb8d2' },
  { id: 'yellow', label: 'Yellow', hex: '#fff27a' },
  { id: 'green', label: 'Green', hex: '#a8e6a1' },
  { id: 'goldenrod', label: 'Goldenrod', hex: '#e8c35a' },
  { id: 'buff', label: 'Buff', hex: '#f0dcb4' },
  { id: 'salmon', label: 'Salmon', hex: '#ffa38a' },
  { id: 'cherry', label: 'Cherry', hex: '#e8526e' },
];
export const colorInfo = (c?: RevisionColor) => REVISION_COLORS.find((x) => x.id === c) ?? REVISION_COLORS[0];
/** The colour after this one (cherry goes back round to white, as productions do). */
export const nextColor = (c: RevisionColor): RevisionColor => REVISION_COLORS[(REVISION_COLORS.findIndex((x) => x.id === c) + 1) % REVISION_COLORS.length].id;

// ---------- storage ----------

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function packDoc(doc: unknown): Promise<string> {
  const json = JSON.stringify(doc ?? null);
  if (typeof CompressionStream === 'undefined') return `j:${json}`;
  return `z:${toB64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip')))}`;
}

const unpacked = new Map<string, unknown>();

export async function unpackDoc(data: string): Promise<unknown> {
  if (unpacked.has(data)) return unpacked.get(data);
  let doc: unknown = null;
  if (data.startsWith('j:')) doc = JSON.parse(data.slice(2));
  else if (data.startsWith('z:')) doc = JSON.parse(new TextDecoder().decode(await pipe(fromB64(data.slice(2)), new DecompressionStream('gzip'))));
  unpacked.set(data, doc);
  if (unpacked.size > 12) unpacked.delete(unpacked.keys().next().value!);
  return doc;
}

/** Already-unpacked doc, if it's in the cache (for synchronous use, e.g. editor margins). */
export const cachedDoc = (data: string): unknown => unpacked.get(data);

export async function makeDraft(p: Project, name: string, extra: Partial<ScriptDraft> = {}): Promise<ScriptDraft> {
  const d = derive(p.scriptDoc, p.sceneNumbersLocked);
  const data = await packDoc(p.scriptDoc);
  unpacked.set(data, p.scriptDoc);
  return { id: newId(), name, createdAt: new Date().toISOString(), data, pages: d.pageCount, scenes: d.scenes.length, words: d.wordCount, ...(p.revision ? { color: p.revision.color } : {}), ...extra };
}

/** Whether an automatic daily draft is due: none in the last 20 hours and the script changed since the latest draft. */
export async function dailyDraftDue(p: Project, now = Date.now()): Promise<boolean> {
  if (p.autoDrafts === false || !p.scriptDoc) return false;
  const drafts = p.drafts ?? [];
  const latest = drafts.reduce<ScriptDraft | null>((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null);
  if (latest && now - Date.parse(latest.createdAt) < 20 * 3600_000) return false;
  if (!latest) return docToBlocks(p.scriptDoc).some((b) => b.text.trim());
  return JSON.stringify(await unpackDoc(latest.data)) !== JSON.stringify(p.scriptDoc);
}

/** Keeps every named draft and only the 10 newest automatic ones. */
export function pruneAuto(drafts: ScriptDraft[]): ScriptDraft[] {
  const autos = drafts.filter((x) => x.auto).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(10).map((x) => x.id);
  return drafts.filter((x) => !autos.includes(x.id));
}

// ---------- comparing ----------

const key = (b: Block) => `${b.type}\u0001${b.text.trim()}`;

export type BlockOp = { op: 'same'; a: number; b: number } | { op: 'del'; a: number } | { op: 'add'; b: number };

/** Longest-common-subsequence diff of two block lists (by element type and text). */
export function diffBlocks(a: Block[], b: Block[]): BlockOp[] {
  const ka = a.map(key), kb = b.map(key);
  // Trim the shared start and end, so typical edits compare only the middle.
  let s = 0;
  while (s < ka.length && s < kb.length && ka[s] === kb[s]) s++;
  let e = 0;
  while (e < ka.length - s && e < kb.length - s && ka[ka.length - 1 - e] === kb[kb.length - 1 - e]) e++;
  const n = ka.length - s - e, m = kb.length - s - e;
  const ops: BlockOp[] = [];
  for (let i = 0; i < s; i++) ops.push({ op: 'same', a: i, b: i });
  if (n * m > 25_000_000) {
    // Too big to compare line by line: treat the middle as replaced.
    for (let i = 0; i < n; i++) ops.push({ op: 'del', a: s + i });
    for (let j = 0; j < m; j++) ops.push({ op: 'add', b: s + j });
  } else {
    const w = m + 1;
    const L = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = ka[s + i] === kb[s + j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && ka[s + i] === kb[s + j]) { ops.push({ op: 'same', a: s + i, b: s + j }); i++; j++; }
      else if (j < m && (i >= n || L[i * w + j + 1] >= L[(i + 1) * w + j])) { ops.push({ op: 'add', b: s + j }); j++; }
      else { ops.push({ op: 'del', a: s + i }); i++; }
    }
  }
  for (let i = 0; i < e; i++) ops.push({ op: 'same', a: ka.length - e + i, b: kb.length - e + i });
  return ops;
}

/** Block indexes in `b` that are new or changed compared with `a` (revision asterisks). */
export function changedBlocks(a: Block[], b: Block[]): Set<number> {
  const out = new Set<number>();
  for (const o of diffBlocks(a, b)) if (o.op === 'add' && (b[o.b].text.trim() || b[o.b].type === 'pageBreak')) out.add(o.b);
  return out;
}

export interface SceneChange { id: string; number: string; heading: string; kind: 'added' | 'removed' | 'changed' | 'moved' }

/** Scene-level comparison: which scenes were added, cut, rewritten or moved between two versions. */
export function compareScenes(from: Derived, to: Derived): SceneChange[] {
  const ops = diffBlocks(from.blocks, to.blocks);
  const touchedTo = new Set<string>(), touchedFrom = new Set<string>();
  const sceneAt = (d: Derived) => {
    const starts = d.scenes.map((s) => ({ id: s.id, block: d.pagination.scenes[s.index].blockIndex }));
    return (bi: number) => { let id = ''; for (const st of starts) { if (st.block <= bi) id = st.id; else break; } return id; };
  };
  const inFrom = sceneAt(from), inTo = sceneAt(to);
  for (const o of ops) {
    if (o.op === 'add') touchedTo.add(inTo(o.b));
    if (o.op === 'del') touchedFrom.add(inFrom(o.a));
  }
  const fromIds = from.scenes.map((s) => s.id), toIds = to.scenes.map((s) => s.id);
  const out: SceneChange[] = [];
  const common = toIds.filter((id) => fromIds.includes(id));
  const fromOrder = fromIds.filter((id) => common.includes(id));
  // Moved: a common scene whose position among the common scenes changed, not explained by neighbours.
  const moved = new Set<string>();
  const lcs = (x: string[], y: string[]) => {
    const dp = x.map(() => new Array(y.length + 1).fill(0));
    for (let i = x.length - 1; i >= 0; i--) { dp[i] = dp[i] ?? []; for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? (dp[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(dp[i + 1]?.[j] ?? 0, dp[i][j + 1] ?? 0); }
    const keep = new Set<string>(); let i = 0, j = 0;
    while (i < x.length && j < y.length) { if (x[i] === y[j]) { keep.add(x[i]); i++; j++; } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i][j + 1] ?? 0)) i++; else j++; }
    return keep;
  };
  const stay = lcs(fromOrder, common);
  for (const id of common) if (!stay.has(id)) moved.add(id);
  for (const s of to.scenes) {
    if (!fromIds.includes(s.id)) out.push({ id: s.id, number: s.number, heading: s.heading, kind: 'added' });
    else if (moved.has(s.id)) out.push({ id: s.id, number: s.number, heading: s.heading, kind: 'moved' });
    else if (touchedTo.has(s.id) || touchedFrom.has(s.id)) out.push({ id: s.id, number: s.number, heading: s.heading, kind: 'changed' });
  }
  for (const s of from.scenes) if (!toIds.includes(s.id)) out.push({ id: s.id, number: s.number, heading: s.heading, kind: 'removed' });
  return out;
}

/**
 * Locked page numbers: pages that start where a base-draft page started keep its number; pages
 * pushed in between get letters (12A, 12B). Returns a label per current page (1-based index).
 */
export function lockedPageLabels(base: Derived, cur: Derived): string[] {
  const map = new Map<number, number>(); // current block → base block
  for (const o of diffBlocks(base.blocks, cur.blocks)) if (o.op === 'same') map.set(o.b, o.a);
  const basePageAt = new Map<number, number>(); // base block that starts a page (at row 0) → page number
  for (const pg of base.pagination.pages) { const first = pg.lines[0]; if (first) basePageAt.set(first.blockIndex, pg.number); }
  const labels: string[] = [];
  let last = 0, suffix = 0;
  for (const pg of cur.pagination.pages) {
    const first = pg.lines[0];
    const b = first ? map.get(first.blockIndex) : undefined;
    const n = b != null ? basePageAt.get(b) : undefined;
    // A page keeps its number only if it also starts at the top of the same block (not mid-dialogue continuing).
    if (n != null && n > last && first && cur.pagination.blockStart[first.blockIndex]?.page === pg.number - 1) { labels.push(String(n)); last = n; suffix = 0; }
    else if (last === 0) { labels.push(String(pg.number)); last = pg.number; }
    else { labels.push(`${last}${String.fromCharCode(65 + suffix)}`); suffix = Math.min(25, suffix + 1); }
  }
  return labels;
}

/** The base draft's blocks for the current revision, if loaded (see loadRevisionBase). */
let base: { id: string; derived: Derived } | null = null;
export function revisionBase(p: Project): Derived | null {
  return p.revision && base?.id === p.revision.baseDraftId ? base.derived : null;
}
export async function loadRevisionBase(p: Project): Promise<Derived | null> {
  if (!p.revision) return null;
  if (base?.id === p.revision.baseDraftId) return base.derived;
  const dr = (p.drafts ?? []).find((x) => x.id === p.revision!.baseDraftId);
  if (!dr) return null;
  base = { id: dr.id, derived: derive(await unpackDoc(dr.data), true) };
  return base.derived;
}
