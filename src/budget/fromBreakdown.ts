import type { BudgetLine, BudgetLinkKind, BudgetUnits, Project } from '../model/types';
import { newId } from '../model/ids';
import type { Derived } from '../script/derive';
import { sceneCast, sceneElements, sceneEighths } from '../script/derive';
import { buildDood, shootDays } from '../schedule/dood';
import { gearLineQty } from './gear';
import { sceneLocation } from '../schedule/callsheet';

// Budget lines linked to the breakdown. A linked line's quantity is worked out from the
// script and schedule every time it's shown (cast work days from the Day Out of Days,
// location and element days from the stripboard), so moving a scene updates the budget.
// Rates are always the user's.

export interface BreakdownFacts {
  shootDays: number;
  castWork: Map<string, number>;
  castHold: Map<string, number>;
  locationDays: Map<string, number>;
  elementDays: Map<string, number>;
  /** Characters in the Day Out of Days, keyed like link ids (cast member id or `char:NAME`). */
  cast: { key: string; label: string; work: number; hold: number }[];
  /** People on set summed over shoot days (cast in the day's scenes + daily crew), for catering. */
  personDays: number;
  /** Days each piece of gear is needed (from the shot designer's plans). */
  gearDays: Map<string, number>;
  /** Worked out from page counts because nothing is scheduled yet (Budget → Funding). */
  estimated?: boolean;
}

export function breakdownFacts(p: Project, d: Derived): BreakdownFacts {
  const days = shootDays(p);
  const dood = buildDood(p, d, true);
  const castWork = new Map<string, number>();
  const castHold = new Map<string, number>();
  const cast: BreakdownFacts['cast'] = [];
  for (const r of dood.rows) {
    const m = p.cast.find((c) => c.characterName.trim().toUpperCase() === r.character);
    const key = m ? m.id : `char:${r.character}`;
    castWork.set(key, r.work);
    castHold.set(key, r.hold);
    cast.push({ key, label: m?.actorName ? `${r.character} (${m.actorName})` : r.character, work: r.work, hold: r.hold });
  }
  const locationDays = new Map<string, number>();
  const elementDays = new Map<string, number>();
  const dailyCrew = p.crew.filter((c) => c.dailyDefault !== false).length;
  let personDays = 0;
  for (const { day } of days) {
    const locs = new Set<string>();
    const els = new Set<string>();
    const castToday = new Set<string>();
    for (const it of day.items) {
      if (it.kind !== 'scene') continue;
      const sc = d.sceneById.get(it.sceneId);
      if (!sc) continue;
      const loc = sceneLocation(p, sc);
      if (loc) locs.add(loc.id);
      for (const e of sceneElements(p, sc)) els.add(e.id);
      for (const n of sceneCast(p, sc)) castToday.add(n.toUpperCase());
    }
    personDays += castToday.size + dailyCrew;
    for (const id of locs) locationDays.set(id, (locationDays.get(id) ?? 0) + 1);
    for (const id of els) elementDays.set(id, (elementDays.get(id) ?? 0) + 1);
  }
  return { shootDays: days.length, castWork, castHold, locationDays, elementDays, cast, personDays, gearDays: gearDaysOf(p, d) };
}

/**
 * Facts estimated from the script when nothing is scheduled yet: each location's scenes are packed
 * into days at `pagesPerDay`, then cast, location and element days are counted as if those were the
 * shoot days. An estimate to budget with until there's a real stripboard.
 */
export function estimatedFacts(p: Project, d: Derived, pagesPerDay = 3): BreakdownFacts {
  const cap = Math.max(1, pagesPerDay * 8);
  const groups = new Map<string, typeof d.scenes>();
  for (const sc of d.scenes) {
    const key = sceneLocation(p, sc)?.id ?? `set:${sc.set}`;
    groups.set(key, [...(groups.get(key) ?? []), sc]);
  }
  const days: typeof d.scenes[] = [];
  for (const scenes of groups.values()) {
    let cur: typeof d.scenes = [];
    let load = 0;
    for (const sc of scenes) {
      const e = Math.max(1, sceneEighths(p, sc));
      if (cur.length && load + e > cap) { days.push(cur); cur = []; load = 0; }
      cur.push(sc); load += e;
    }
    if (cur.length) days.push(cur);
  }
  const castWork = new Map<string, number>();
  const locationDays = new Map<string, number>();
  const elementDays = new Map<string, number>();
  const dailyCrew = p.crew.filter((c) => c.dailyDefault !== false).length;
  const workByName = new Map<string, number>();
  let personDays = 0;
  for (const day of days) {
    const locs = new Set<string>(); const els = new Set<string>(); const castToday = new Set<string>();
    for (const sc of day) {
      const loc = sceneLocation(p, sc);
      if (loc) locs.add(loc.id);
      for (const e of sceneElements(p, sc)) els.add(e.id);
      for (const n of sceneCast(p, sc)) castToday.add(n.toUpperCase());
    }
    personDays += castToday.size + dailyCrew;
    for (const id of locs) locationDays.set(id, (locationDays.get(id) ?? 0) + 1);
    for (const id of els) elementDays.set(id, (elementDays.get(id) ?? 0) + 1);
    for (const n of castToday) workByName.set(n, (workByName.get(n) ?? 0) + 1);
  }
  const cast: BreakdownFacts['cast'] = [];
  for (const [name, work] of workByName) {
    const m = p.cast.find((c) => c.characterName.trim().toUpperCase() === name);
    const key = m ? m.id : `char:${name}`;
    castWork.set(key, work);
    cast.push({ key, label: m?.actorName ? `${name} (${m.actorName})` : name, work, hold: 0 });
  }
  return { shootDays: days.length, castWork, castHold: new Map(), locationDays, elementDays, cast, personDays, gearDays: gearDaysOf(p, d), estimated: true };
}

/** Whether the budget is working from an estimate (no shoot days scheduled, and the Funding pace is set). */
export function usesEstimate(p: Project): boolean {
  return !!(p.budget.funding?.pagesPerDay || p.budget.funding?.plannedDays) && shootDays(p).length === 0;
}

/**
 * Real facts from the schedule, or an estimate when nothing is scheduled yet: at the Funding pace
 * (pages per day), or for a number of days you set by hand ("plan for 3 days"), which scales the
 * estimate so it comes to exactly that many days.
 */
export function budgetFacts(p: Project, d: Derived): BreakdownFacts {
  if (!usesEstimate(p)) return breakdownFacts(p, d);
  const planned = p.budget.funding?.plannedDays;
  if (!planned) return estimatedFacts(p, d, p.budget.funding!.pagesPerDay);
  const est = estimatedFacts(p, d, Math.max(0.25, d.pageCount / planned));
  if (!est.shootDays || est.shootDays === planned) return { ...est, shootDays: planned };
  const k = planned / est.shootDays;
  const scale = (m: Map<string, number>) => new Map([...m].map(([id, v]) => [id, Math.max(1, Math.min(planned, Math.round(v * k)))]));
  const castWork = scale(est.castWork);
  return { ...est, shootDays: planned, castWork, locationDays: scale(est.locationDays), elementDays: scale(est.elementDays), personDays: Math.round(est.personDays * k), cast: est.cast.map((c) => ({ ...c, work: castWork.get(c.key) ?? c.work })) };
}

/** Lines tied to the schedule that come to nothing because no shoot days exist yet. */
export function zeroDayLines(p: Project, f: BreakdownFacts): BudgetLine[] {
  if (f.shootDays > 0) return [];
  const kinds = new Set(['cast', 'crew', 'location', 'element', 'shootDays', 'headcount']);
  return p.budget.lines.filter((l) => l.link?.auto && kinds.has(l.link.kind));
}

/** The quantity a linked line should have now; null when its source no longer exists. */
export function linkedQty(p: Project, f: BreakdownFacts, link: NonNullable<BudgetLine['link']>): number | null {
  switch (link.kind) {
    case 'shootDays': return f.shootDays;
    case 'crew': return p.crew.some((c) => c.id === link.id) ? f.shootDays : null;
    case 'cast': return f.castWork.get(link.id ?? '') ?? (p.cast.some((c) => c.id === link.id) ? 0 : null);
    case 'castHold': return f.castHold.get(link.id ?? '') ?? (p.cast.some((c) => c.id === link.id) ? 0 : null);
    case 'location': return p.locations.some((l) => l.id === link.id) ? f.locationDays.get(link.id ?? '') ?? 0 : null;
    case 'element': return p.elements.some((e) => e.id === link.id) ? f.elementDays.get(link.id ?? '') ?? 0 : null;
    case 'headcount': return f.personDays;
    case 'gear': {
      const g = (p.gear ?? []).find((x) => x.id === link.id);
      return g ? gearLineQty(g, f.gearDays.get(g.id) ?? 0) : null;
    }
    case 'license': return (p.budget.licenses ?? []).some((l) => l.id === link.id) ? 1 : null;
    case 'festival': case 'festivalTravel': return (p.budget.festivals ?? []).length ? 1 : null;
    case 'kit': {
      const doc = (p.budget.paperwork ?? []).find((x) => x.id === link.id);
      if (!doc?.deal?.kitFee) return null;
      const per = doc.deal.kitPer ?? 'day';
      if (per === 'flat') return 1;
      const days = personWorkDays(p, f, doc.person);
      return per === 'week' ? Math.ceil(days / 5) : days;
    }
  }
}

/** Days a person works: cast work days from the Day Out of Days, crew shoot days. */
export function personWorkDays(p: Project, f: BreakdownFacts, person: { kind: string; id: string }): number {
  if (person.kind === 'cast') {
    const m = p.cast.find((c) => c.id === person.id);
    return f.castWork.get(person.id) ?? (m ? f.castWork.get(`char:${m.characterName.trim().toUpperCase()}`) ?? 0 : 0);
  }
  return f.shootDays;
}

/** Lines with linked quantities filled in, plus the ids of lines whose source was deleted. */
export function resolveLines(p: Project, f: BreakdownFacts, lines = p.budget.lines): { lines: BudgetLine[]; orphaned: Set<string> } {
  const orphaned = new Set<string>();
  const out = lines.map((l) => {
    if (!l.link) return l;
    const q = linkedQty(p, f, l.link);
    if (q === null) { orphaned.add(l.id); return l; }
    return l.link.auto ? { ...l, qty: q + (Number(l.prepDays) || 0) + (Number(l.wrapDays) || 0) } : l;
  });
  return { lines: out, orphaned };
}

// ---------- import ----------

const CATEGORY_ACCOUNT: Record<string, { account: string; units: BudgetUnits }> = {
  extras: { account: '2100', units: 'days' },
  stunts: { account: '3300', units: 'days' },
  vehicles: { account: '3000', units: 'days' },
  props: { account: '2500', units: 'allow' },
  camera: { account: '2200', units: 'days' },
  sfx: { account: '3200', units: 'allow' },
  mechfx: { account: '3200', units: 'allow' },
  wardrobe: { account: '2600', units: 'allow' },
  makeup: { account: '2700', units: 'allow' },
  animals: { account: '3100', units: 'days' },
  music: { account: '4200', units: 'allow' },
  sound: { account: '2800', units: 'allow' },
  setDressing: { account: '2400', units: 'allow' },
  greenery: { account: '2400', units: 'allow' },
  equipment: { account: '2300', units: 'days' },
  security: { account: '2000', units: 'days' },
  labor: { account: '2000', units: 'days' },
  vfx: { account: '4300', units: 'allow' },
  misc: { account: '5200', units: 'allow' },
};

/** Which account a crew member's role belongs in. */
export function crewAccount(role: string): string {
  const r = role.toLowerCase();
  if (/stunt/.test(r)) return '3300';
  if (/stills|unit photographer/.test(r)) return '5100';
  if (/sound|boom|mixer/.test(r)) return '2800';
  if (/\b(dp|dop)\b|photograph|cinematograph|camera|focus|\b1st ac\b|\b2nd ac\b|\bac\b|\bdit\b|steadicam|camera operator/.test(r)) return '2200';
  if (/grip|gaffer|electric|best boy|dolly|lighting/.test(r)) return '2300';
  if (/props?\b|property/.test(r)) return '2500';
  if (/art|production design|set dec|set dress|scenic|carpent|construction/.test(r)) return '2400';
  if (/wardrobe|costume/.test(r)) return '2600';
  if (/make ?up|hair|\bmua\b|sfx makeup/.test(r)) return '2700';
  if (/location/.test(r)) return '2900';
  if (/transport|driver|teamster/.test(r)) return '3400';
  if (/cater|craft|chef|cook/.test(r)) return '3500';
  if (/editor|assistant editor/.test(r)) return '4100';
  if (/composer|music/.test(r)) return '4200';
  if (/vfx|visual effects/.test(r)) return '4300';
  if (/colou?rist/.test(r)) return '4500';
  if (/producer/.test(r)) return '1200';
  if (/writer|screenwriter/.test(r)) return '1100';
  if (/director/.test(r) && !/assistant|art|photography|casting/.test(r)) return '1300';
  return '2000';
}

function line(accountCode: string, description: string, units: BudgetUnits, link?: { kind: BudgetLinkKind; id?: string }, rate = 0): BudgetLine {
  return { id: newId(), accountId: `acc-${accountCode}`, description, qty: 1, units, x: 1, rate, fringeIds: [], link: link ? { ...link, auto: units !== 'allow' && units !== 'flat' } : undefined };
}

const parseFee = (s?: string) => {
  const m = (s ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
};

/**
 * New lines for everything in the breakdown that isn't in the budget yet: cast (work and hold
 * days), crew, locations, tagged elements, and per-day catering. Existing linked lines are left alone.
 */
/** Every line the breakdown would add (cast, crew, locations, mapped elements, meals), whether or not it's there yet. */
export function breakdownCandidates(p: Project, f: BreakdownFacts): BudgetLine[] {
  const out: BudgetLine[] = [];
  for (const c of f.cast) {
    out.push(line('1400', c.label, 'days', { kind: 'cast', id: c.key }));
    if (c.hold > 0) out.push(line('1400', `${c.label} — hold days`, 'days', { kind: 'castHold', id: c.key }));
  }
  for (const c of p.crew) out.push(line(crewAccount(c.role), [c.role, c.name].filter(Boolean).join(' — ') || 'Crew', 'days', { kind: 'crew', id: c.id }));
  for (const l of p.locations) out.push(line('2900', `Location fee — ${l.realName || l.setName || 'Location'}`, 'days', { kind: 'location', id: l.id }, parseFee(l.fee)));
  for (const e of p.elements) {
    const m = CATEGORY_ACCOUNT[e.categoryId];
    if (!m || e.categoryId === 'cast' || e.categoryId === 'notes') continue;
    const cat = p.categories.find((c) => c.id === e.categoryId)?.name ?? '';
    out.push(line(m.account, `${e.name}${cat ? ` (${cat})` : ''}`, m.units, { kind: 'element', id: e.id }));
  }
  if (f.shootDays > 0) out.push(line('3500', 'Meals & craft services (per person per day)', 'each', { kind: 'headcount' }));
  return out;
}

const linkKey = (l: { link?: BudgetLine['link'] }) => `${l.link?.kind}:${l.link?.id ?? ''}`;

export function importFromBreakdown(p: Project, f: BreakdownFacts): BudgetLine[] {
  const has = new Set(p.budget.lines.filter((l) => l.link).map(linkKey));
  const accounts = new Set(p.budget.accounts.map((a) => a.id));
  const out: BudgetLine[] = [];
  for (const l of breakdownCandidates(p, f)) {
    const k = linkKey(l);
    if (l.link && has.has(k)) continue;
    if (!accounts.has(l.accountId)) l.accountId = p.budget.accounts.find((a) => a.group === 'btl')?.id ?? p.budget.accounts[0]?.id ?? l.accountId;
    has.add(k);
    out.push(l);
  }
  return out;
}

export interface BreakdownExplain { added: { line: BudgetLine; account: string }[]; existing: { label: string; line: BudgetLine; account: string; why: string }[] }

/** What "Update from breakdown" did: lines it added and where, and what was already in the budget and why. */
export function explainBreakdown(p: Project, f: BreakdownFacts, added: BudgetLine[]): BreakdownExplain {
  const acc = (id: string) => { const a = p.budget.accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : 'Budget'; };
  const addedKeys = new Set(added.map(linkKey));
  const existing: BreakdownExplain['existing'] = [];
  for (const c of breakdownCandidates(p, f)) {
    if (addedKeys.has(linkKey(c))) continue;
    const l = p.budget.lines.find((x) => x.link && linkKey(x) === linkKey(c));
    if (!l) continue;
    const deal = (c.link?.kind === 'cast' || c.link?.kind === 'crew') && (p.budget.paperwork ?? []).some((d) => d.kind === 'deal' && d.person.kind === c.link!.kind && d.person.id === c.link!.id);
    existing.push({ label: c.description, line: l, account: acc(l.accountId), why: deal ? 'from the deal memo' : l.link?.auto ? 'added earlier, following the schedule' : 'added earlier (you typed its quantity)' });
  }
  return { added: added.map((line) => ({ line, account: acc(line.accountId) })), existing };
}

export const LINK_LABEL: Record<BudgetLinkKind, string> = {
  cast: 'Work days from Day Out of Days',
  castHold: 'Hold days from Day Out of Days',
  crew: 'Shoot days',
  location: 'Shoot days at this location',
  element: 'Shoot days with this element',
  shootDays: 'Shoot days',
  headcount: 'People on set × shoot days (cast in each day’s scenes + daily crew)',
  gear: 'Days the gear is needed, from the shot designer',
  license: 'A license from Budget → Licenses',
  kit: 'Kit fee from a deal memo (Plan → Paperwork), for the days this person works',
  festival: 'Festival fees from Budget → Festivals (one item per festival you plan to enter)',
  festivalTravel: 'Travel to the festivals you plan to attend (Budget → Festivals)',
};

/** Days each gear item is needed; filled in by the gear manifest (shot designer plans). */
export function gearDaysOf(p: Project, d?: Derived): Map<string, number> {
  void d;
  const days = shootDays(p);
  const out = new Map<string, number>();
  for (const g of p.gear ?? []) {
    if (g.days != null) { out.set(g.id, g.days); continue; }
    if (!g.sceneIds.length) { out.set(g.id, days.length); continue; }
    const want = new Set(g.sceneIds);
    out.set(g.id, days.filter(({ day }) => day.items.some((it) => it.kind === 'scene' && want.has(it.sceneId))).length);
  }
  return out;
}
