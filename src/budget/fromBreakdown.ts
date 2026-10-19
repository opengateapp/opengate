import type { BudgetLine, BudgetLinkKind, BudgetUnits, Project } from '../model/types';
import { newId } from '../model/ids';
import type { Derived } from '../script/derive';
import { sceneElements } from '../script/derive';
import { buildDood, shootDays } from '../schedule/dood';
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
  for (const { day } of days) {
    const locs = new Set<string>();
    const els = new Set<string>();
    for (const it of day.items) {
      if (it.kind !== 'scene') continue;
      const sc = d.sceneById.get(it.sceneId);
      if (!sc) continue;
      const loc = sceneLocation(p, sc);
      if (loc) locs.add(loc.id);
      for (const e of sceneElements(p, sc)) els.add(e.id);
    }
    for (const id of locs) locationDays.set(id, (locationDays.get(id) ?? 0) + 1);
    for (const id of els) elementDays.set(id, (elementDays.get(id) ?? 0) + 1);
  }
  return { shootDays: days.length, castWork, castHold, locationDays, elementDays, cast };
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
  }
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
export function importFromBreakdown(p: Project, f: BreakdownFacts): BudgetLine[] {
  const has = new Set(p.budget.lines.filter((l) => l.link).map((l) => `${l.link!.kind}:${l.link!.id ?? ''}`));
  const accounts = new Set(p.budget.accounts.map((a) => a.id));
  const out: BudgetLine[] = [];
  const add = (l: BudgetLine) => {
    const k = `${l.link?.kind}:${l.link?.id ?? ''}`;
    if (l.link && has.has(k)) return;
    if (!accounts.has(l.accountId)) l.accountId = p.budget.accounts.find((a) => a.group === 'btl')?.id ?? p.budget.accounts[0]?.id ?? l.accountId;
    has.add(k);
    out.push(l);
  };
  for (const c of f.cast) {
    add(line('1400', c.label, 'days', { kind: 'cast', id: c.key }));
    if (c.hold > 0) add(line('1400', `${c.label} — hold days`, 'days', { kind: 'castHold', id: c.key }));
  }
  for (const c of p.crew) add(line(crewAccount(c.role), [c.role, c.name].filter(Boolean).join(' — ') || 'Crew', 'days', { kind: 'crew', id: c.id }));
  for (const l of p.locations) add(line('2900', `Location fee — ${l.realName || l.setName || 'Location'}`, 'days', { kind: 'location', id: l.id }, parseFee(l.fee)));
  for (const e of p.elements) {
    const m = CATEGORY_ACCOUNT[e.categoryId];
    if (!m || e.categoryId === 'cast' || e.categoryId === 'notes') continue;
    const cat = p.categories.find((c) => c.id === e.categoryId)?.name ?? '';
    add(line(m.account, `${e.name}${cat ? ` (${cat})` : ''}`, m.units, { kind: 'element', id: e.id }));
  }
  if (f.shootDays > 0) add(line('3500', 'Meals & craft services (per shoot day)', 'days', { kind: 'shootDays' }));
  return out;
}

export const LINK_LABEL: Record<BudgetLinkKind, string> = {
  cast: 'Work days from Day Out of Days',
  castHold: 'Hold days from Day Out of Days',
  crew: 'Shoot days',
  location: 'Shoot days at this location',
  element: 'Shoot days with this element',
  shootDays: 'Shoot days',
};
