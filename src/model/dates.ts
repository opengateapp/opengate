import { dateLocale, prefs } from '../prefs';
import type { ISODate } from './types';

// Calendar dates are plain YYYY-MM-DD strings in local time, so schedules never
// drift across time zones (a pitfall in CineSched's Date-based model).

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86400000);
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n && i < 3660; i++) out.push(addDays(start, i));
  return out;
}

export function weekday(iso: ISODate): number {
  return fromISO(iso).getDay();
}

export function formatDate(iso: ISODate, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }): string {
  if (prefs().dateStyle === 'iso' && opts.month && opts.day) return `${opts.weekday ? `${fromISO(iso).toLocaleDateString(undefined, { weekday: opts.weekday })} ` : ''}${iso}`;
  return fromISO(iso).toLocaleDateString(dateLocale(), opts);
}

export function inRange(iso: ISODate, r: { start: ISODate; end: ISODate }): boolean {
  return iso >= r.start && iso <= r.end;
}

/** "HH:MM" (24h) ↔ minutes since midnight. Accepts "7:30 AM" style too. */
export function parseClock(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function toClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A time of day for display: 12-hour (7:00 AM) or 24-hour (07:00), per App preferences. */
export function formatClock12(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  if (prefs().clock === '24') return toClock(m);
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Eighths of a page → "1 3/8" (CineSched FractionParser output format). */
export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rem = eighths % 8;
  if (whole === 0) return rem === 0 ? '0' : `${rem}/8`;
  return rem === 0 ? `${whole}` : `${whole} ${rem}/8`;
}

/** Parses "15" (eighths), "2.5" (pages), "1 7/8", "7/8" → eighths. */
export function parseEighths(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(/^(\d+)\s+(\d+)\/8$/);
  if (m) return Number(m[1]) * 8 + Number(m[2]);
  m = s.match(/^(\d+)\/8$/);
  if (m) return Number(m[1]);
  if (/^\d+\.\d+$/.test(s)) return Math.round(Number(s) * 8);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}
