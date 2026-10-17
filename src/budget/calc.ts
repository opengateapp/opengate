import type { Budget, BudgetGroup, BudgetLine } from '../model/types';
import { GROUPS } from './accounts';

// Budget arithmetic, shared by the screen, the PDF and the spreadsheet so they always agree.
// Lines passed in are already resolved (linked quantities and scenario changes applied).

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function lineBase(l: Pick<BudgetLine, 'qty' | 'x' | 'rate'>): number {
  return (Number(l.qty) || 0) * (Number(l.x) || 0) * (Number(l.rate) || 0);
}

export function lineFringes(b: Budget, l: BudgetLine): number {
  const base = lineBase(l);
  let total = 0;
  for (const id of l.fringeIds) {
    const f = b.fringes.find((x) => x.id === id);
    if (!f) continue;
    const subject = f.cap != null && f.cap > 0 ? Math.min(base, f.cap) : base;
    total += (subject * (Number(f.pct) || 0)) / 100;
  }
  return total;
}

export const lineTotal = (b: Budget, l: BudgetLine) => lineBase(l) + lineFringes(b, l);

export interface BudgetTotals {
  byAccount: Map<string, { base: number; fringes: number; total: number }>;
  byGroup: Record<BudgetGroup, number>;
  fringes: number;
  subtotal: number;
  contingency: number;
  total: number;
  /** Money logged as spent, per account and overall. */
  actualByAccount: Map<string, number>;
  actual: number;
}

export function totals(b: Budget, lines: BudgetLine[]): BudgetTotals {
  const byAccount = new Map<string, { base: number; fringes: number; total: number }>();
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g.id, 0])) as Record<BudgetGroup, number>;
  const groupOf = new Map(b.accounts.map((a) => [a.id, a.group]));
  let fringes = 0;
  for (const l of lines) {
    const base = lineBase(l);
    const fr = lineFringes(b, l);
    const cur = byAccount.get(l.accountId) ?? { base: 0, fringes: 0, total: 0 };
    byAccount.set(l.accountId, { base: cur.base + base, fringes: cur.fringes + fr, total: cur.total + base + fr });
    const g = groupOf.get(l.accountId);
    if (g) byGroup[g] += base + fr;
    fringes += fr;
  }
  const subtotal = [...byAccount.values()].reduce((a, v) => a + v.total, 0);
  const contingency = (subtotal * (Number(b.contingencyPct) || 0)) / 100;
  const actualByAccount = new Map<string, number>();
  for (const e of b.expenses) actualByAccount.set(e.accountId, (actualByAccount.get(e.accountId) ?? 0) + (Number(e.amount) || 0));
  const actual = [...actualByAccount.values()].reduce((a, v) => a + v, 0);
  return { byAccount, byGroup, fringes, subtotal, contingency, total: subtotal + contingency, actualByAccount, actual };
}

/** The lines of a scenario: base lines with its changes (no scenario = the base budget). */
export function scenarioLines(b: Budget, lines: BudgetLine[], scenarioId?: string): BudgetLine[] {
  const sc = scenarioId ? b.scenarios.find((s) => s.id === scenarioId) : undefined;
  if (!sc) return lines;
  const out: BudgetLine[] = [];
  for (const l of lines) {
    const o = sc.overrides[l.id];
    if (o?.removed) continue;
    let next = o ? { ...l, ...(o.qty != null ? { qty: o.qty } : {}), ...(o.x != null ? { x: o.x } : {}), ...(o.rate != null ? { rate: o.rate } : {}) } : l;
    // A different shoot length moves every per-day line that follows the schedule.
    if (sc.shootDays != null && o?.qty == null && next.link?.auto && (next.link.kind === 'shootDays' || next.link.kind === 'crew')) next = { ...next, qty: sc.shootDays };
    out.push(next);
  }
  return [...out, ...sc.added];
}

/** Planned (target) vs estimate vs actual for one bucket. */
export function variance(target: number | undefined, estimate: number, actual: number) {
  return {
    target: target ?? 0,
    unbudgeted: target == null,
    /** Target minus estimate: positive = room left in the plan. */
    planRoom: (target ?? 0) - estimate,
    /** Estimate minus actual: positive = not spent yet, negative = over. */
    remaining: estimate - actual,
    pctSpent: estimate > 0 ? actual / estimate : actual > 0 ? Infinity : 0,
  };
}

export function money(n: number, currency = 'USD', cents = false): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).format(n);
  } catch {
    return (cents ? n.toFixed(2) : Math.round(n).toString());
  }
}
