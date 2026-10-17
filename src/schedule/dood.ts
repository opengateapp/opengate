import type { Project, ShootDay } from '../model/types';
import { inRange } from '../model/dates';
import { sceneCast, type Derived } from '../script/derive';
import { dayNumbers } from './engine';

// Day Out of Days, ported from CineSched's DaysOutOfDaysExporter.buildRows.
// Columns are shoot days only (numbered days with at least one scene), so every column
// is a day someone works and a gap inside a character's span is a true hold.

export type DoodCode = 'SW' | 'W' | 'WF' | 'SWF' | 'H' | 'X' | '';

export const DOOD_LEGEND: { code: Exclude<DoodCode, ''>; label: string }[] = [
  { code: 'SW', label: 'Start work' },
  { code: 'W', label: 'Work' },
  { code: 'WF', label: 'Work finish' },
  { code: 'SWF', label: 'Start / work / finish' },
  { code: 'H', label: 'Hold' },
  { code: 'X', label: 'Unavailable' },
];

export const isWorkCode = (c: DoodCode) => c === 'SW' || c === 'W' || c === 'WF' || c === 'SWF';

export interface DoodRow {
  character: string;
  castNumber?: number;
  actorName: string;
  /** One code per shoot day column. */
  codes: DoodCode[];
  work: number;
  hold: number;
  /** First to last work day, inclusive (TOT). */
  total: number;
}

export interface Dood {
  days: { day: ShootDay; number: number }[];
  rows: DoodRow[];
}

export function shootDays(p: Project): { day: ShootDay; number: number }[] {
  const nums = dayNumbers(p.schedule);
  return p.schedule.days.filter((d) => nums.has(d.id)).map((day) => ({ day, number: nums.get(day.id)! }));
}

/** Rows: roster characters first (by cast number), then any other scheduled character A–Z. */
export function buildDood(p: Project, d: Derived, includeHold = true): Dood {
  const days = shootDays(p);
  const worksOn = days.map(({ day }) => {
    const s = new Set<string>();
    for (const it of day.items) {
      if (it.kind !== 'scene') continue;
      const sc = d.sceneById.get(it.sceneId);
      if (sc) sceneCast(p, sc).forEach((c) => s.add(c.toUpperCase()));
    }
    return s;
  });
  const roster = [...p.cast].sort((a, b) => a.castNumber - b.castNumber);
  const seen = new Set<string>();
  const order: string[] = [];
  for (const m of roster) {
    const n = m.characterName.trim().toUpperCase();
    if (n && !seen.has(n)) { seen.add(n); order.push(n); }
  }
  const others = [...new Set(worksOn.flatMap((s) => [...s]))].filter((n) => !seen.has(n)).sort();
  order.push(...others);

  const rows: DoodRow[] = [];
  for (const character of order) {
    const idx = worksOn.flatMap((s, i) => (s.has(character) ? [i] : []));
    if (!idx.length) continue;
    const first = idx[0];
    const last = idx[idx.length - 1];
    const codes: DoodCode[] = days.map(() => '');
    if (first === last) codes[first] = 'SWF';
    else {
      codes[first] = 'SW';
      codes[last] = 'WF';
      for (let i = first + 1; i < last; i++) codes[i] = idx.includes(i) ? 'W' : includeHold ? 'H' : '';
    }
    const member = roster.find((m) => m.characterName.trim().toUpperCase() === character);
    // Unavailable dates override holds and blanks, never an actual work day (that's a conflict, flagged elsewhere).
    if (member?.unavailable.length) {
      days.forEach(({ day }, i) => {
        if ((codes[i] === '' || codes[i] === 'H') && member.unavailable.some((r) => inRange(day.date, r))) codes[i] = 'X';
      });
    }
    rows.push({
      character,
      castNumber: member?.castNumber,
      actorName: member?.actorName ?? '',
      codes,
      work: codes.filter(isWorkCode).length,
      hold: codes.filter((c) => c === 'H').length,
      total: last - first + 1,
    });
  }
  return { days, rows };
}

/** The DOOD code for one character on one day ("" if they don't work it). Used by call sheets. */
export function doodCodeFor(dood: Dood, character: string, dayId: string): DoodCode {
  const col = dood.days.findIndex((x) => x.day.id === dayId);
  const row = dood.rows.find((r) => r.character === character.toUpperCase());
  return col >= 0 && row ? row.codes[col] : '';
}

export function doodRowLabel(r: DoodRow): string {
  const name = r.castNumber !== undefined ? `${r.castNumber}. ${r.character}` : r.character;
  return r.actorName ? `${name} (${r.actorName})` : name;
}
