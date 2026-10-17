import type { Draft } from 'immer';
import type { ColorSlot, DerivedScene, ISODate, Project, Schedule, ShootDay, StripItem } from '../model/types';
import { DEFAULT_STRIP_COLORS } from '../model/defaults';
import { dateRange, diffDays, addDays, parseClock, inRange } from '../model/dates';
import { newId } from '../model/ids';
import { sceneCast, sceneEighths, sceneMinutes, sceneTime, type Derived } from '../script/derive';

// Scheduling logic ported from CineSched (StripboardView cascade, ConflictScanner,
// ScheduleLockScanner, updateShootDays) onto id-referenced strips.

/** Rebuilds the day list for the schedule's date range. Days outside the range keep their
 *  strips only if they have content (so nothing is ever dropped); empty ones are removed. */
export function syncDays(s: Draft<Schedule> | Schedule): void {
  const existing = new Map(s.days.map((d) => [d.date, d]));
  const days: ShootDay[] = [];
  for (const date of dateRange(s.startDate, s.endDate)) {
    days.push((existing.get(date) as ShootDay) ?? { id: newId(), date, items: [], times: {} });
    existing.delete(date);
  }
  for (const d of existing.values()) if (d.items.length) days.push(d as ShootDay);
  days.sort((a, b) => a.date.localeCompare(b.date));
  s.days = days as Draft<ShootDay>[];
}

/** Changes the date range. Shift mode moves every day's strips by the start-date offset. */
export function setRange(s: Draft<Schedule>, start: ISODate, end: ISODate, mode: 'shift' | 'merge') {
  if (end < start) end = start;
  if (mode === 'shift') {
    const delta = diffDays(s.startDate, start);
    for (const d of s.days) d.date = addDays(d.date, delta);
  }
  s.startDate = start;
  s.endDate = end;
  syncDays(s);
}

export function placements(s: Schedule): Map<string, { dayIndex: number; itemIndex: number }> {
  const m = new Map<string, { dayIndex: number; itemIndex: number }>();
  s.days.forEach((d, di) => d.items.forEach((it, ii) => { if (it.kind === 'scene') m.set(it.sceneId, { dayIndex: di, itemIndex: ii }); }));
  return m;
}

export function boneyard(p: Project, d: Derived): DerivedScene[] {
  const placed = placements(p.schedule);
  return d.scenes.filter((s) => !placed.has(s.id));
}

/** Shoot day number = Nth non-blackout day (in date order) that has at least one scene. */
export function dayNumbers(s: Schedule): Map<string, number> {
  const m = new Map<string, number>();
  let n = 0;
  for (const d of s.days) {
    if (d.blackout || !d.items.some((i) => i.kind === 'scene')) continue;
    m.set(d.id, ++n);
  }
  return m;
}

export function colorSlot(intExt: string, time: string): ColorSlot {
  const ext = intExt === 'EXT';
  switch (time) {
    case 'DAY': return ext ? 'extDay' : 'intDay';
    case 'NIGHT': return ext ? 'extNight' : 'intNight';
    case 'DAWN': return ext ? 'extDawn' : 'intDawn';
    case 'DUSK': return ext ? 'extDusk' : 'intDusk';
    case 'AFTERNOON': return ext ? 'extAfternoon' : 'intAfternoon';
    default: return 'custom';
  }
}

export function stripColor(p: Project, s: DerivedScene): string {
  const slot = colorSlot(s.intExt, sceneTime(p, s));
  return p.schedule.colors[slot] ?? DEFAULT_STRIP_COLORS[slot];
}

export interface TimedItem { item: StripItem; start: number; end: number; minutes: number }

/** Timeline cascade: ready-to-shoot (or general call, else 07:00) → each strip's start/end.
 *  Fixed start times reset the clock. Board, PDFs and calendar all use this one function. */
export function cascade(p: Project, d: Derived, day: ShootDay): TimedItem[] {
  let clock = parseClock(day.times.readyToShoot) ?? parseClock(day.times.generalCall) ?? parseClock(p.production.defaultCall) ?? 420;
  return day.items.map((item) => {
    const fixed = parseClock(item.customStart);
    if (fixed !== null) clock = fixed;
    let minutes: number;
    if (item.kind === 'banner') minutes = item.minutes;
    else {
      const sc = d.sceneById.get(item.sceneId);
      minutes = sc ? sceneMinutes(p, sc) : 0;
    }
    const start = clock;
    clock += minutes;
    return { item, start, end: clock, minutes };
  });
}

export interface DayTotals { scenes: number; eighths: number; minutes: number; cast: string[]; wrap: number | null }

export function dayTotals(p: Project, d: Derived, day: ShootDay): DayTotals {
  let eighths = 0;
  let scenes = 0;
  const cast = new Set<string>();
  for (const it of day.items) {
    if (it.kind !== 'scene') continue;
    const sc = d.sceneById.get(it.sceneId);
    if (!sc) continue;
    scenes++;
    eighths += sceneEighths(p, sc);
    sceneCast(p, sc).forEach((c) => cast.add(c));
  }
  const timed = cascade(p, d, day);
  const minutes = timed.reduce((a, t) => a + t.minutes, 0);
  const wrap = parseClock(day.times.wrap) ?? (timed.length ? timed[timed.length - 1].end : null);
  return { scenes, eighths, minutes, cast: [...cast].sort(), wrap };
}

// ---- Conflicts (CineSched ConflictScanner) ----

export interface Conflicts {
  /** sceneId → reasons */
  scenes: Map<string, string[]>;
  /** dayId → reasons */
  days: Map<string, string[]>;
  duplicateNumbers: Set<string>; // sceneIds
  orphans: { dayId: string; sceneId: string }[];
}

export function scanConflicts(p: Project, d: Derived): Conflicts {
  const res: Conflicts = { scenes: new Map(), days: new Map(), duplicateNumbers: new Set(), orphans: [] };
  const add = (m: Map<string, string[]>, k: string, r: string) => m.set(k, [...(m.get(k) ?? []), r]);
  const roster = new Map(p.cast.map((c) => [c.characterName.toUpperCase(), c]));
  for (const day of p.schedule.days) {
    for (const it of day.items) {
      if (it.kind !== 'scene') continue;
      const sc = d.sceneById.get(it.sceneId);
      if (!sc) { res.orphans.push({ dayId: day.id, sceneId: it.sceneId }); add(res.days, day.id, 'A scheduled scene was deleted from the script'); continue; }
      if (day.blackout) { add(res.scenes, sc.id, 'Scheduled on a blackout day'); add(res.days, day.id, 'Scenes on a blackout day'); }
      for (const ch of sceneCast(p, sc)) {
        const m = roster.get(ch);
        if (m && m.unavailable.some((r) => inRange(day.date, r))) {
          const who = m.actorName ? `${m.actorName} (${ch})` : ch;
          add(res.scenes, sc.id, `${who} is unavailable`);
          add(res.days, day.id, `${who} is unavailable`);
        }
      }
    }
  }
  const byNumber = new Map<string, string[]>();
  for (const s of d.scenes) {
    const m = s.number.match(/^0*(\d+)([A-Z]*)$/i);
    const key = m ? `${m[1]}${m[2].toUpperCase()}` : s.number.toUpperCase();
    if (!key) continue;
    byNumber.set(key, [...(byNumber.get(key) ?? []), s.id]);
  }
  for (const ids of byNumber.values()) if (ids.length > 1) ids.forEach((i) => res.duplicateNumbers.add(i));
  return res;
}

// ---- Schedule lock (CineSched ScheduleLockScanner) ----

export function workingDays(p: Project, d: Derived): Record<string, ISODate[]> {
  const out: Record<string, Set<ISODate>> = {};
  for (const day of p.schedule.days) {
    for (const it of day.items) {
      if (it.kind !== 'scene') continue;
      const sc = d.sceneById.get(it.sceneId);
      if (!sc) continue;
      for (const c of sceneCast(p, sc)) (out[c] ??= new Set()).add(day.date);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

export interface LockChange { character: string; added: ISODate[]; removed: ISODate[] }

export function lockReport(p: Project, d: Derived): LockChange[] {
  const lock = p.schedule.lock;
  if (!lock) return [];
  const now = workingDays(p, d);
  const names = new Set([...Object.keys(lock.workingDays), ...Object.keys(now)]);
  const out: LockChange[] = [];
  for (const n of [...names].sort()) {
    const was = new Set(lock.workingDays[n] ?? []);
    const is = new Set(now[n] ?? []);
    const added = [...is].filter((x) => !was.has(x));
    const removed = [...was].filter((x) => !is.has(x));
    if (added.length || removed.length) out.push({ character: n, added, removed });
  }
  return out;
}

// ---- Strip moves ----

/** Removes the given scenes from wherever they are scheduled. */
export function unschedule(s: Draft<Schedule>, sceneIds: string[]) {
  const ids = new Set(sceneIds);
  for (const d of s.days) d.items = d.items.filter((i) => !(i.kind === 'scene' && ids.has(i.sceneId)));
}

/** Moves scenes (from boneyard or other days) into a day at an index. */
export function moveScenes(s: Draft<Schedule>, sceneIds: string[], dayId: string, index?: number) {
  const target = s.days.find((d) => d.id === dayId);
  if (!target) return;
  // Preserve strip state (completed / fixed time) when moving.
  const prev = new Map<string, StripItem>();
  for (const d of s.days) for (const i of d.items) if (i.kind === 'scene' && sceneIds.includes(i.sceneId)) prev.set(i.sceneId, { ...i });
  let at = index ?? target.items.length;
  // Adjust insertion index for strips removed above it in the same day.
  const before = target.items.slice(0, at).filter((i) => i.kind === 'scene' && sceneIds.includes(i.sceneId)).length;
  at -= before;
  unschedule(s, sceneIds);
  const items = sceneIds.map((id) => prev.get(id) ?? { kind: 'scene' as const, sceneId: id });
  target.items.splice(Math.max(0, Math.min(at, target.items.length)), 0, ...(items as Draft<StripItem>[]));
}

/** Moves a banner within/between days. */
export function moveBanner(s: Draft<Schedule>, bannerId: string, dayId: string, index?: number) {
  let banner: Draft<StripItem> | undefined;
  let fromDay: Draft<ShootDay> | undefined;
  let fromIdx = -1;
  for (const d of s.days) {
    const k = d.items.findIndex((i) => i.kind === 'banner' && i.id === bannerId);
    if (k >= 0) { banner = d.items[k]; fromDay = d; fromIdx = k; break; }
  }
  const target = s.days.find((d) => d.id === dayId);
  if (!banner || !fromDay || !target) return;
  fromDay.items.splice(fromIdx, 1);
  let at = index ?? target.items.length;
  if (fromDay === target && fromIdx < at) at--;
  target.items.splice(Math.max(0, Math.min(at, target.items.length)), 0, banner);
}

/** Swaps the content (strips, times, notes) of two days; dates stay put. */
export function swapDays(s: Draft<Schedule>, a: string, b: string) {
  const da = s.days.find((d) => d.id === a);
  const db = s.days.find((d) => d.id === b);
  if (!da || !db || da === db) return;
  [da.items, db.items] = [db.items, da.items];
  [da.times, db.times] = [db.times, da.times];
  [da.notes, db.notes] = [db.notes, da.notes];
}
