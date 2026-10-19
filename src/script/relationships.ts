import type { CharacterRelationship, Project } from '../model/types';
import { newId } from '../model/ids';

// Character relationships: who is connected to whom, how, and how they feel about it.

export const RELATIONSHIP_KINDS: { id: string; label: string; color: string }[] = [
  { id: 'family', label: 'Family', color: '#0ea5e9' },
  { id: 'romance', label: 'Romance', color: '#ec4899' },
  { id: 'friend', label: 'Friends', color: '#22c55e' },
  { id: 'ally', label: 'Allies', color: '#14b8a6' },
  { id: 'mentor', label: 'Mentor / student', color: '#a855f7' },
  { id: 'work', label: 'Work', color: '#64748b' },
  { id: 'rival', label: 'Rivals', color: '#f59e0b' },
  { id: 'enemy', label: 'Enemies', color: '#ef4444' },
  { id: 'other', label: 'Other', color: '#a3a3a3' },
];

export const TONES: { v: number; label: string }[] = [
  { v: -2, label: 'Hostile' }, { v: -1, label: 'Tense' }, { v: 0, label: 'Neutral' }, { v: 1, label: 'Warm' }, { v: 2, label: 'Close' },
];

export const kindOf = (id: string) => RELATIONSHIP_KINDS.find((k) => k.id === id) ?? RELATIONSHIP_KINDS[RELATIONSHIP_KINDS.length - 1];
export const toneLabel = (v?: number) => TONES.find((t) => t.v === (v ?? 0))?.label ?? 'Neutral';

export function newRelationship(a: string, b: string, kind = 'friend'): CharacterRelationship {
  return { id: newId(), a, b, kind, tone: 0 };
}

/** A character's relationships, each seen from their side (`other` = the person on the far end). */
export function relationshipsOf(p: Project, name: string): { r: CharacterRelationship; other: string; outgoing: boolean }[] {
  return p.relationships
    .filter((r) => r.a === name || r.b === name)
    .map((r) => ({ r, other: r.a === name ? r.b : r.a, outgoing: r.a === name }));
}

/** Keeps relationships and map positions attached when a character is renamed. */
export function renameInRelationships(p: { relationships: CharacterRelationship[]; characterMap: Record<string, { x: number; y: number }> }, from: string, to: string) {
  for (const r of p.relationships) { if (r.a === from) r.a = to; if (r.b === from) r.b = to; }
  if (p.characterMap[from]) { p.characterMap[to] = p.characterMap[from]; delete p.characterMap[from]; }
}

/**
 * Positions for the map: saved ones where there are any, the rest on a circle (most connected
 * characters first, so the busiest ones sit at the top). Coordinates are 0–1000.
 */
export function mapLayout(p: Project, names: string[], fresh = false): Record<string, { x: number; y: number }> {
  const degree = new Map<string, number>();
  for (const r of p.relationships) { degree.set(r.a, (degree.get(r.a) ?? 0) + 1); degree.set(r.b, (degree.get(r.b) ?? 0) + 1); }
  const todo = names.filter((n) => fresh || !p.characterMap[n]).sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));
  const out: Record<string, { x: number; y: number }> = {};
  for (const n of names) if (!fresh && p.characterMap[n]) out[n] = p.characterMap[n];
  todo.forEach((n, i) => {
    const t = (i / Math.max(1, todo.length)) * Math.PI * 2 - Math.PI / 2;
    const r = todo.length < 3 ? 180 : 380;
    out[n] = { x: Math.round(500 + r * Math.cos(t)), y: Math.round(500 + r * Math.sin(t)) };
  });
  return out;
}
