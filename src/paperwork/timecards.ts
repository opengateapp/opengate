import type { PayrollRules, PersonRef, Project, ShootDay, TimeCard } from '../model/types';
import type { Derived } from '../script/derive';
import { newId } from '../model/ids';
import { parseClock, toClock } from '../model/dates';
import { csv } from '../io/reports';
import { resolveCallSheet } from '../schedule/callsheet';
import { dayPeople, docsFor, personOf, refKey } from './paperwork';
import { unionBadge } from './unions';

// Time cards: the hours people actually worked each shoot day, from the call sheet's times and
// what you type in. Open Gate tracks and exports; payroll services do the paying.

export const DEFAULT_RULES: PayrollRules = { otAfter: 8, dtAfter: 12, mealEvery: 6, mealPenalty: 0 };
export const rulesOf = (p: Project): PayrollRules => ({ ...DEFAULT_RULES, ...p.budget.payrollRules });

export interface Hours { worked: number; straight: number; ot: number; dt: number; meals: number; penalties: number; complete: boolean }

/** Minutes after `start`, wrapping past midnight. */
const after = (start: number, t: number) => (t >= start ? t - start : t + 1440 - start);

/** Hours, overtime, double time and meal penalties for one card (meal break unpaid). */
export function cardHours(c: TimeCard, rules: PayrollRules, otAfter = rules.otAfter): Hours {
  const tin = parseClock(c.in), tout = parseClock(c.out);
  if (tin === null || tout === null) return { worked: 0, straight: 0, ot: 0, dt: 0, meals: 0, penalties: 0, complete: false };
  const span = after(tin, tout);
  const mo = parseClock(c.mealOut), mi = parseClock(c.mealIn);
  const hasMeal = mo !== null && mi !== null;
  const meal = hasMeal ? Math.max(0, after(mo!, mi!)) : 0;
  const worked = Math.max(0, span - meal) / 60;
  const dt = Math.max(0, worked - rules.dtAfter);
  const ot = Math.max(0, Math.min(worked, rules.dtAfter) - otAfter);
  const straight = worked - ot - dt;
  // Meal penalties: each block of `mealEvery` hours worked without a break.
  const every = rules.mealEvery * 60;
  let penalties = 0;
  if (every > 0) {
    if (hasMeal) {
      const first = after(tin, mo!);
      if (first > every) penalties += Math.ceil((first - every) / 30);
      const second = after(mi!, tout);
      if (second > every) penalties += Math.ceil((second - every) / 30);
    } else if (span > every) penalties += Math.ceil((span - every) / 30);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { worked: r(worked), straight: r(straight), ot: r(ot), dt: r(dt), meals: hasMeal ? 1 : 0, penalties, complete: true };
}

/** Cards for everyone on a day's call sheet who doesn't have one yet, pre-filled with call, lunch and wrap. */
export function cardsFromCallSheet(p: Project, d: Derived, day: ShootDay): TimeCard[] {
  const have = new Set((p.budget.timecards ?? []).filter((c) => c.dayId === day.id).map((c) => refKey(c.person)));
  const r = resolveCallSheet(p, d, day);
  const lunch = r.clock.lunch, wrap = r.clock.wrap;
  const out: TimeCard[] = [];
  for (const person of dayPeople(p, d, day)) {
    if (have.has(refKey(person))) continue;
    let call = '';
    if (person.kind === 'cast') {
      const m = p.cast.find((x) => x.id === person.id);
      const row = r.cast.find((x) => m && x.characterName.trim().toUpperCase() === m.characterName.trim().toUpperCase());
      call = row?.hmu || row?.onSet || '';
    } else {
      const m = p.crew.find((x) => x.id === person.id);
      call = r.crew.find((x) => x.crewId === person.id || (m?.name && x.name === m.name))?.call ?? '';
    }
    if (!call && r.clock.generalCall !== null) call = toClock(r.clock.generalCall);
    out.push({
      id: newId(), dayId: day.id, person, in: call || undefined,
      mealOut: lunch !== null ? toClock(lunch) : undefined, mealIn: lunch !== null ? toClock(lunch + 30) : undefined,
      out: wrap !== null ? toClock(wrap) : undefined,
    });
  }
  return out;
}

const dealOf = (p: Project, r: PersonRef) => docsFor(p, r).find((x) => x.kind === 'deal' && x.status !== 'na')?.deal;

export interface PayRow { ref: PersonRef; name: string; role: string; union: string; rate: number; per: string; days: number; hours: number; ot: number; dt: number; penalties: number; kit: number; gross: number; contractor: boolean }

/** Totals per person over all time cards (or one day), priced from their deal memo. */
export function payrollRows(p: Project, dayId?: string): PayRow[] {
  const rules = rulesOf(p);
  const by = new Map<string, TimeCard[]>();
  for (const c of p.budget.timecards ?? []) if (!dayId || c.dayId === dayId) by.set(refKey(c.person), [...(by.get(refKey(c.person)) ?? []), c]);
  const out: PayRow[] = [];
  for (const cards of by.values()) {
    const ref = cards[0].person;
    const who = personOf(p, ref);
    const deal = dealOf(p, ref);
    const otAfter = deal?.otAfter ?? rules.otAfter;
    const mult = deal?.otMult ?? 1.5;
    const hs = cards.map((c) => cardHours(c, rules, otAfter)).filter((h) => h.complete);
    const days = hs.length;
    const sum = (k: keyof Hours) => Math.round(hs.reduce((n, h) => n + (h[k] as number), 0) * 100) / 100;
    const rate = deal?.rate ?? 0, per = deal?.per ?? 'day';
    // Hourly basis for overtime: day rate over the hours before overtime (weekly rate over 5 days).
    const hourly = per === 'day' ? rate / otAfter : per === 'week' ? rate / 5 / otAfter : 0;
    const base = per === 'day' ? rate * days : per === 'week' ? rate * (days / 5) : rate;
    const kitPer = deal?.kitPer ?? 'day';
    const kit = !deal?.kitFee ? 0 : kitPer === 'day' ? deal.kitFee * days : kitPer === 'week' ? deal.kitFee * Math.ceil(days / 5) : deal.kitFee;
    const gross = base + hourly * (sum('ot') * mult + sum('dt') * 2) + sum('penalties') * rules.mealPenalty + kit;
    out.push({
      ref, name: who?.name ?? '?', role: who?.role.replace(/^#\d+\s*/, '') ?? '', union: who ? unionBadge(who) : '',
      rate, per, days, hours: sum('worked'), ot: sum('ot'), dt: sum('dt'), penalties: sum('penalties'), kit, gross: Math.round(gross * 100) / 100,
      contractor: !!deal?.contractor || docsFor(p, ref).some((x) => x.kind === 'w9' && (x.status === 'received')),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A generic payroll CSV most payroll services can map on import (not any one service's format). */
export function payrollCsv(p: Project): string {
  return csv([
    ['Name', 'Position', 'Union / local', 'Employee or contractor', 'Rate', 'Rate per', 'Days worked', 'Hours', 'Overtime hours', 'Double-time hours', 'Meal penalties', 'Kit fee', 'Gross'],
    ...payrollRows(p).map((r) => [r.name, r.role, r.union, r.contractor ? 'Contractor' : 'Employee', r.rate.toFixed(2), r.per, String(r.days), String(r.hours), String(r.ot), String(r.dt), String(r.penalties), r.kit.toFixed(2), r.gross.toFixed(2)]),
  ]);
}

/** Every time card, one row per person per day. */
export function timecardsCsv(p: Project): string {
  const rules = rulesOf(p);
  const dayOf = new Map(p.schedule.days.map((d) => [d.id, d.date]));
  return csv([
    ['Date', 'Name', 'Position', 'In', 'Meal out', 'Meal in', 'Out', 'Hours', 'OT', 'DT', 'Meal penalties', 'Notes'],
    ...(p.budget.timecards ?? []).map((c) => {
      const who = personOf(p, c.person);
      const h = cardHours(c, rules, dealOf(p, c.person)?.otAfter ?? rules.otAfter);
      return [dayOf.get(c.dayId) ?? '', who?.name ?? '?', who?.role.replace(/^#\d+\s*/, '') ?? '', c.in ?? '', c.mealOut ?? '', c.mealIn ?? '', c.out ?? '', String(h.worked), String(h.ot), String(h.dt), String(h.penalties), c.notes ?? ''];
    }).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
  ]);
}

/** Contractor totals for an accountant's year-end (1099) work. No tax IDs: just names and amounts. */
export function contractorCsv(p: Project): string {
  return csv([['Name', 'Position', 'Total paid (gross)', 'Days'], ...payrollRows(p).filter((r) => r.contractor).map((r) => [r.name, r.role, r.gross.toFixed(2), String(r.days)])]);
}
