import type { Project } from '../model/types';
import type { Derived } from '../script/derive';
import { addDays, parseClock } from '../model/dates';
import { dayNumbers, dayTotals } from './engine';
import { formatEighths } from '../model/dates';

// iCalendar export so shoot days and prep events show up in Google / Apple / Outlook calendars.

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const ymd = (iso: string) => iso.replace(/-/g, '');
const hm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}${String(min % 60).padStart(2, '0')}00`;

function fold(line: string): string {
  const out: string[] = [];
  let s = line;
  while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
  out.push(s);
  return out.join('\r\n');
}

export function buildICS(p: Project, d: Derived): string {
  const nums = dayNumbers(p.schedule);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Gate//Production Schedule//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(p.title)} — Schedule`];
  const event = (uid: string, date: string, title: string, desc: string, start?: number | null, end?: number | null) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@slateline`, `DTSTAMP:${stamp}`);
    if (start != null) {
      lines.push(`DTSTART:${ymd(date)}T${hm(start)}`);
      const e = end != null && end > start ? end : start + 60;
      lines.push(`DTEND:${e >= 1440 ? ymd(addDays(date, 1)) + 'T' + hm(e - 1440) : ymd(date) + 'T' + hm(e)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`);
    }
    lines.push(fold(`SUMMARY:${esc(title)}`));
    if (desc) lines.push(fold(`DESCRIPTION:${esc(desc)}`));
    lines.push('END:VEVENT');
  };
  for (const day of p.schedule.days) {
    const n = nums.get(day.id);
    if (!n) continue;
    const t = dayTotals(p, d, day);
    const scenes = day.items
      .filter((i) => i.kind === 'scene')
      .map((i) => d.sceneById.get((i as { sceneId: string }).sceneId))
      .filter(Boolean)
      .map((s) => `Sc ${s!.number} — ${s!.heading}`);
    const desc = [`${t.scenes} scenes · ${formatEighths(t.eighths)} pages`, `Cast: ${t.cast.join(', ') || '—'}`, '', ...scenes, day.notes ?? ''].join('\n');
    const call = parseClock(day.times.generalCall) ?? parseClock(p.production.defaultCall);
    event(`day-${day.id}`, day.date, `${p.title}: Shoot Day ${n}`, desc, call, t.wrap);
  }
  for (const e of p.events) event(`ev-${e.id}`, e.date, e.title, e.notes ?? '', parseClock(e.start), parseClock(e.end));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
