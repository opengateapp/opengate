import type { Draft } from 'immer';
import type { Project, Task } from '../model/types';
import { newId } from '../model/ids';
import { addDays, todayISO } from '../model/dates';

// The marketing & festival checklist (Plan → Tasks). Each task is timed from the first shoot day
// or from picture lock, so it lands on the calendar where it actually has to happen; some of it
// (unit stills, behind the scenes) can only happen during the shoot.

interface MTask { title: string; from: 'shoot' | 'lock'; weeks: number; priority?: Task['priority']; notes?: string }

export const MARKETING_TASKS: MTask[] = [
  { title: 'Pick your audience: who is this film for, and where are they online?', from: 'shoot', weeks: -6, notes: 'Reference → Budget & Funding → Marketing your film.' },
  { title: 'Start the film’s website / socials and collect emails', from: 'shoot', weeks: -5 },
  { title: 'Book a unit stills photographer for key scenes', from: 'shoot', weeks: -3, priority: 'high', notes: 'Stills can only be taken on set. Budget line: Unit stills photographer (5100).' },
  { title: 'Assign someone to shoot behind-the-scenes / EPK', from: 'shoot', weeks: -2, priority: 'high' },
  { title: 'Get releases that cover marketing use (cast, crew, locations)', from: 'shoot', weeks: -1 },
  { title: 'Film short cast and crew interviews for the EPK', from: 'shoot', weeks: 0 },
  { title: 'Festival strategy: list of festivals by tier, premiere status, deadlines', from: 'lock', weeks: -6, priority: 'high', notes: 'Top festivals want premieres: plan where you screen first. Build the list in Budget → Festivals.' },
  { title: 'Key art / poster brief to a designer', from: 'lock', weeks: -4 },
  { title: 'Cut a trailer (60–90 s) and a 15 s teaser', from: 'lock', weeks: 1 },
  { title: 'Press kit: synopsis, director’s statement, bios, credits, stills', from: 'lock', weeks: 2 },
  { title: 'Captions / subtitles file', from: 'lock', weeks: 2 },
  { title: 'Make a DCP and screening copies (or price it with the first festival)', from: 'lock', weeks: 3 },
  { title: 'First festival submissions (early deadlines are cheaper)', from: 'lock', weeks: 3, priority: 'high', notes: 'Most festivals take submissions through FilmFreeway. Keep the list, deadlines and fees in Budget → Festivals.' },
  { title: 'Screening Q&A prep and festival travel plan', from: 'lock', weeks: 10 },
  { title: 'After the run: online release plan (Vimeo, YouTube, curated channels)', from: 'lock', weeks: 40 },
];

/** First shoot day and assumed picture lock (12 weeks after the last shoot day), from the schedule or today. */
export function marketingAnchors(p: Project): { shoot: string; lock: string; fromSchedule: boolean } {
  const days = p.schedule.days.filter((d) => d.items.some((i) => i.kind === 'scene')).map((d) => d.date).sort();
  if (days.length) return { shoot: days[0], lock: addDays(days[days.length - 1], 84), fromSchedule: true };
  const shoot = addDays(todayISO(), 42);
  return { shoot, lock: addDays(shoot, 90), fromSchedule: false };
}

/** Adds the checklist tasks that aren't there yet (matched by title). Returns how many it added. */
export function addMarketingTasks(dr: Draft<Project>): number {
  const { shoot, lock } = marketingAnchors(dr as Project);
  const have = new Set(dr.tasks.map((t) => t.title.trim().toLowerCase()));
  let order = Math.max(-1, ...dr.tasks.map((t) => t.order)) + 1;
  let n = 0;
  for (const m of MARKETING_TASKS) {
    if (have.has(m.title.toLowerCase())) continue;
    dr.tasks.push({ id: newId(), title: m.title, done: false, due: addDays(m.from === 'shoot' ? shoot : lock, m.weeks * 7), department: 'Marketing', order: order++, ...(m.priority ? { priority: m.priority } : {}), ...(m.notes ? { notes: m.notes } : {}) });
    n++;
  }
  return n;
}
