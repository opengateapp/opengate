import { create } from 'zustand';
import type { SpeciesPack } from '../model/types';
import { newId } from '../model/ids';

// Custom species packs: a named list of species (each with an optional note) that a user builds
// by picking from the built-in packs, their own species or other packs, or by typing new ones.
// A project keeps the packs it uses (so they travel in .opengate files and sharing); this device
// also keeps a library of every pack made or imported, ready to add to other projects.

export const PACK_EXT = '.ogspecies';

const KEY = 'opengate.speciesPacks';

export function cleanPack(raw: unknown): SpeciesPack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : '';
  if (!name || !Array.isArray(r.entries)) return null;
  const seen = new Set<string>();
  const entries: SpeciesPack['entries'] = [];
  for (const e of r.entries) {
    const n = (typeof e === 'string' ? e : e && typeof e === 'object' && typeof (e as { name?: unknown }).name === 'string' ? (e as { name: string }).name : '').trim().slice(0, 60);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    const note = e && typeof e === 'object' && typeof (e as { note?: unknown }).note === 'string' ? (e as { note: string }).note.trim().slice(0, 200) : '';
    entries.push(note ? { name: n, note } : { name: n });
    if (entries.length >= 500) break;
  }
  const author = typeof r.author === 'string' && r.author.trim() ? r.author.trim().slice(0, 80) : undefined;
  return { id: typeof r.id === 'string' && /^[\w-]{4,64}$/.test(r.id) ? r.id : newId(), name, ...(author ? { author } : {}), entries };
}

/** The file someone else can import. */
export function exportPack(p: SpeciesPack): string {
  return JSON.stringify({ app: 'open-gate', kind: 'species-pack', version: 1, name: p.name, ...(p.author ? { author: p.author } : {}), entries: p.entries }, null, 2);
}

/** Reads an .ogspecies file (or a list of packs); throws with a readable message. */
export function parsePackFile(text: string): SpeciesPack[] {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error("That file isn't a species pack."); }
  const list = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as { packs?: unknown }).packs) ? (j as { packs: unknown[] }).packs : [j];
  const packs = list.map(cleanPack).filter((x): x is SpeciesPack => !!x).map((x) => ({ ...x, id: newId() }));
  if (!packs.length) throw new Error("That file isn't a species pack.");
  return packs;
}

const sameEntries = (a: SpeciesPack, b: SpeciesPack) =>
  JSON.stringify(a.entries.map((e) => e.name.toLowerCase()).sort()) === JSON.stringify(b.entries.map((e) => e.name.toLowerCase()).sort());

/**
 * Adds incoming packs to a list: exact duplicates (same name and entries) are skipped,
 * a different pack with a taken name gets a number. Returns the new list and what was added.
 */
export function mergePacks(existing: SpeciesPack[], incoming: SpeciesPack[]): { packs: SpeciesPack[]; added: SpeciesPack[] } {
  const packs = [...existing];
  const added: SpeciesPack[] = [];
  for (const p of incoming) {
    if (packs.some((x) => x.name === p.name && sameEntries(x, p))) continue;
    let name = p.name; let i = 2;
    while (packs.some((x) => x.name === name)) name = `${p.name} ${i++}`;
    const next = { ...p, name };
    packs.push(next);
    added.push(next);
  }
  return { packs, added };
}

// ---------- this device's library ----------

function load(): SpeciesPack[] {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown[]).map(cleanPack).filter((x): x is SpeciesPack => !!x); } catch { return []; }
}

export const usePackLibrary = create<{ packs: SpeciesPack[] }>(() => ({ packs: load() }));

/** Saves (or updates, by id) a pack in this device's library. */
export function rememberPack(p: SpeciesPack) {
  const packs = usePackLibrary.getState().packs;
  const next = packs.some((x) => x.id === p.id) ? packs.map((x) => (x.id === p.id ? p : x)) : [...packs, p];
  usePackLibrary.setState({ packs: next });
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or blocked */ }
}

export function forgetPack(id: string) {
  const next = usePackLibrary.getState().packs.filter((x) => x.id !== id);
  usePackLibrary.setState({ packs: next });
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
}
