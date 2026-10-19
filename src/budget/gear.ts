import type { Draft } from 'immer';
import type { BudgetLine, GearCategory, GearItem, Project } from '../model/types';
import { newId } from '../model/ids';
import { gearDaysOf } from './fromBreakdown';

// The gear manifest: what the shoot needs, whether you own, rent, borrow or buy each item,
// and what it costs. Cameras and lights placed in the shot designer appear here on their own
// (one "Camera A package" across every scene that uses Camera A; lights by type, as many as the
// busiest scene needs). Rented and bought gear becomes linked lines in the budget.

export const GEAR_CATEGORIES: { id: GearCategory; label: string; account: string }[] = [
  { id: 'camera', label: 'Camera', account: '2200' },
  { id: 'lens', label: 'Lenses', account: '2200' },
  { id: 'support', label: 'Support (tripods, sliders, gimbals)', account: '2300' },
  { id: 'grip', label: 'Grip', account: '2300' },
  { id: 'lighting', label: 'Lighting', account: '2300' },
  { id: 'sound', label: 'Sound', account: '2800' },
  { id: 'power', label: 'Power & cables', account: '2300' },
  { id: 'other', label: 'Other', account: '5200' },
];

export const SOURCE_LABEL: Record<GearItem['source'], string> = { own: 'Own it', rent: 'Rent', borrow: 'Borrow', buy: 'Buy' };

/** Gear the plans call for, keyed so the manifest can keep your choices (own / rent, rates) between edits. */
export function planGear(p: Pick<Project, 'plans'>): { key: string; name: string; category: GearCategory; qty: number; sceneIds: string[] }[] {
  const out = new Map<string, { key: string; name: string; category: GearCategory; qty: number; sceneIds: string[] }>();
  for (const plan of p.plans ?? []) {
    const perScene = new Map<string, number>();
    for (const e of plan.elements) {
      if (e.kind !== 'camera' && e.kind !== 'light') continue;
      const key = e.kind === 'camera' ? `cam:${e.label.replace(/^Camera\s+/i, '').trim() || e.label}` : `light:${e.lightType ?? 'Light'}`;
      perScene.set(key, (perScene.get(key) ?? 0) + (e.kind === 'camera' ? 1 : 1));
      const cur = out.get(key) ?? {
        key,
        name: e.kind === 'camera' ? `${e.label} package` : `${e.lightType ?? 'Light'}`,
        category: (e.kind === 'camera' ? 'camera' : 'lighting') as GearCategory,
        qty: 0,
        sceneIds: [],
      };
      if (!cur.sceneIds.includes(plan.sceneId)) cur.sceneIds.push(plan.sceneId);
      out.set(key, cur);
    }
    for (const [key, n] of perScene) { const cur = out.get(key)!; cur.qty = Math.max(cur.qty, key.startsWith('cam:') ? 1 : n); }
  }
  return [...out.values()];
}

/** Brings plan gear into the manifest (keeping own / rent / rates you set) and drops what the plans no longer use. */
export function syncPlanGear(d: Draft<Project>) {
  const want = planGear(d);
  const gear = (d.gear ??= []);
  for (const w of want) {
    const g = gear.find((x) => x.fromPlan?.key === w.key);
    if (g) { g.qty = Math.max(g.qty, w.qty); g.sceneIds = w.sceneIds; }
    else gear.push({ id: newId(), name: w.name, category: w.category, qty: w.qty, source: 'rent', rate: 0, rateUnit: 'day', sceneIds: w.sceneIds, fromPlan: { key: w.key } });
  }
  d.gear = gear.filter((g) => !g.fromPlan || want.some((w) => w.key === g.fromPlan!.key));
  syncGearLines(d);
}

/** Keeps a budget line for every rented or bought item (owned and borrowed gear costs nothing). */
export function syncGearLines(d: Draft<Project>) {
  const gear = d.gear ?? [];
  const lines = d.budget.lines;
  const accountFor = (c: GearCategory) => {
    const code = GEAR_CATEGORIES.find((x) => x.id === c)?.account ?? '5200';
    return d.budget.accounts.find((a) => a.code === code)?.id ?? d.budget.accounts.find((a) => a.group === 'btl')?.id ?? d.budget.accounts[0]?.id;
  };
  for (const g of gear) {
    const paid = g.source === 'rent' || g.source === 'buy';
    const i = lines.findIndex((l) => l.link?.kind === 'gear' && l.link.id === g.id);
    if (!paid) { if (i >= 0) lines.splice(i, 1); continue; }
    const want: Partial<BudgetLine> = {
      description: `${g.name}${g.source === 'buy' ? ' (purchase)' : ''}`,
      units: g.source === 'buy' ? 'flat' : g.rateUnit === 'week' ? 'weeks' : 'rentdays',
      x: g.qty, rate: g.rate,
    };
    if (i >= 0) Object.assign(lines[i], want, { link: { kind: 'gear', id: g.id, auto: true } });
    else lines.push({ id: newId(), accountId: accountFor(g.category)!, qty: 1, fringeIds: [], ...want, link: { kind: 'gear', id: g.id, auto: true } } as BudgetLine);
  }
  d.budget.lines = lines.filter((l) => l.link?.kind !== 'gear' || gear.some((g) => g.id === l.link!.id && (g.source === 'rent' || g.source === 'buy')));

  // Owned gear isn't free to keep: an optional insurance & upkeep line, a % of what renting it would cost.
  const pct = d.budget.ownedGearPct ?? 0;
  const days = gearDaysOf(d as Project);
  const ownedValue = gear.filter((g) => g.source === 'own').reduce((n, g) => n + gearCost(g, days.get(g.id) ?? 0, d.budget.rentalWeekDays ?? 3), 0);
  const upkeep = Math.round(ownedValue * pct) / 100;
  const at = d.budget.lines.findIndex((l) => l.id === UPKEEP_LINE);
  if (pct > 0 && upkeep > 0) {
    const want = { description: `Owned gear: insurance & upkeep (${pct}%)`, units: 'flat' as const, x: 1, qty: 1, rate: upkeep };
    if (at >= 0) Object.assign(d.budget.lines[at], want);
    else d.budget.lines.push({ id: UPKEEP_LINE, accountId: accountFor('other')!, fringeIds: [], ...want } as BudgetLine);
  } else if (at >= 0) d.budget.lines.splice(at, 1);
}

export const UPKEEP_LINE = 'gear-owned-upkeep';

/** What the gear list adds up to: paid out, and what owning / borrowing saves compared with renting. */
export function gearTotals(p: Project): { rent: number; buy: number; ownSaves: number; borrowSaves: number; upkeep: number; days: Map<string, number> } {
  const days = gearDaysOf(p);
  const wk = p.budget.rentalWeekDays ?? 3;
  const t = { rent: 0, buy: 0, ownSaves: 0, borrowSaves: 0, upkeep: 0, days };
  for (const g of p.gear ?? []) {
    const c = gearCost(g, days.get(g.id) ?? 0, wk);
    if (g.source === 'rent') t.rent += c;
    else if (g.source === 'buy') t.buy += c;
    else if (g.source === 'own') t.ownSaves += c;
    else t.borrowSaves += c;
  }
  t.upkeep = Math.round(t.ownSaves * (p.budget.ownedGearPct ?? 0)) / 100;
  return t;
}

/** Cost of one item over `days` (what it would cost to rent, for owned / borrowed gear). */
export function gearCost(g: GearItem, days: number, rentalWeekDays = 3): number {
  if (g.source === 'buy') return g.rate * g.qty;
  if (g.rateUnit === 'week') return Math.ceil(days / 7) * g.rate * g.qty;
  const billed = Math.floor(days / 7) * rentalWeekDays + Math.min(days % 7, rentalWeekDays);
  return billed * g.rate * g.qty;
}

/** Quantity a linked gear line should have: billed days for day rates, weeks for week rates, 1 for purchases. */
export function gearLineQty(g: GearItem, days: number): number {
  return g.source === 'buy' ? 1 : g.rateUnit === 'week' ? Math.ceil(days / 7) : days;
}
