import { create } from 'zustand';
import type { Channel } from './channels';
import { newId } from '../model/ids';

// Changes other people made that merged into this copy. Everything merges automatically
// (nobody's work is lost); this list lets you look them over and reject any of them.

export interface ReviewEntry {
  key: string;
  before: unknown;
  after: unknown;
  label: string;
  /** Both of you changed this while apart and your version was kept; `after` is theirs. */
  lost?: boolean;
  usedTheirs?: boolean;
}

export interface ScriptRevision {
  /** Blocks (JSON) before and after, and where they start in the script. */
  before: string[];
  after: string[];
  start: number;
  summary: string;
}

export interface ReviewChange {
  id: string;
  author: string;
  color?: string;
  time: number;
  lastTime: number;
  ch: Channel;
  kind: 'data' | 'script';
  entries: ReviewEntry[];
  script?: ScriptRevision;
  /** You had unsent edits to the same things when this arrived (e.g. you were both offline). */
  conflict?: boolean;
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
  note?: string;
}

interface ReviewState { changes: ReviewChange[] }
export const useReview = create<ReviewState>(() => ({ changes: [] }));

const GROUP_MS = 3 * 60 * 1000;
const MAX = 300;

function push(c: ReviewChange) {
  const changes = [...useReview.getState().changes, c].slice(-MAX);
  useReview.setState({ changes });
}

/** Adds a merged data change, grouping a person's run of edits in one section. */
export function recordData(author: string, color: string | undefined, ch: Channel, entry: ReviewEntry, conflict: boolean) {
  const now = Date.now();
  const list = useReview.getState().changes;
  const last = [...list].reverse().find((c) => c.status === 'pending' && c.kind === 'data' && c.author === author && c.ch === ch);
  if (last && now - last.lastTime < GROUP_MS) {
    const entries = [...last.entries];
    const i = entries.findIndex((e) => e.key === entry.key && !!e.lost === !!entry.lost);
    if (i >= 0) entries[i] = { ...entries[i], after: entry.after, label: entry.label };
    else entries.push(entry);
    useReview.setState({ changes: list.map((c) => (c === last ? { ...c, entries, lastTime: now, conflict: c.conflict || conflict } : c)) });
    return;
  }
  push({ id: newId(), author, color, time: now, lastTime: now, ch, kind: 'data', entries: [entry], conflict, status: 'pending' });
}

export function recordScript(author: string, color: string | undefined, rev: ScriptRevision, conflict: boolean) {
  if (!rev.before.length && !rev.after.length) return;
  push({ id: newId(), author, color, time: Date.now(), lastTime: Date.now(), ch: 'script', kind: 'script', entries: [], script: rev, conflict, status: 'pending' });
}

export function setStatus(id: string, status: ReviewChange['status'], note?: string) {
  useReview.setState({ changes: useReview.getState().changes.map((c) => (c.id === id ? { ...c, status, note } : c)) });
}

export function clearReviewed() {
  useReview.setState({ changes: useReview.getState().changes.filter((c) => c.status === 'pending') });
}

/** Blocks that differ between two versions of the script (common start and end trimmed). */
export function diffBlocks(before: string[], after: string[]): { start: number; before: string[]; after: string[] } {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  return { start: p, before: before.slice(p, before.length - q), after: after.slice(p, after.length - q) };
}

/** Where `slice` appears in `blocks`, preferring the spot closest to `near` (-1 if nowhere). */
export function findSlice(blocks: string[], slice: string[], near: number): number {
  if (!slice.length) return Math.min(near, blocks.length);
  let best = -1;
  for (let i = 0; i + slice.length <= blocks.length; i++) {
    let ok = true;
    for (let j = 0; j < slice.length && ok; j++) ok = blocks[i + j] === slice[j];
    if (ok && (best < 0 || Math.abs(i - near) < Math.abs(best - near))) best = i;
  }
  return best;
}

export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
