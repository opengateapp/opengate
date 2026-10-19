import type { Budget, BudgetGroup, BudgetLock } from '../model/types';
import { GROUPS } from './accounts';
import type { BudgetTotals } from './calc';

// Cost report: the locked (approved) budget against what's been spent and committed, with an
// estimate to complete per account, giving the estimated final cost and over / under.
//   Spent      = expenses marked paid
//   Committed  = expenses logged but not paid yet (POs, deposits due)
//   To date    = spent + committed
//   ETC        = typed estimate to complete, or (current estimate − to date), never below 0
//   EFC        = to date + ETC
//   Over/under = locked budget − EFC (negative = over)

export interface CostRow { accountId: string; budget: number; spent: number; committed: number; toDate: number; etc: number; etcTyped: boolean; efc: number; variance: number }
export interface CostReport {
  rows: CostRow[];
  groups: Record<BudgetGroup, Omit<CostRow, 'accountId' | 'etcTyped'>>;
  totals: Omit<CostRow, 'accountId' | 'etcTyped'>;
  /** Contingency and added percentages that were in the locked total. */
  reserve: number;
  lock: BudgetLock;
}

export function lockBudget(t: BudgetTotals, label?: string): BudgetLock {
  return {
    at: new Date().toISOString(),
    label,
    accounts: Object.fromEntries([...t.byAccount.entries()].map(([id, v]) => [id, Math.round(v.total * 100) / 100])),
    subtotal: Math.round(t.subtotal * 100) / 100,
    total: Math.round(t.total * 100) / 100,
  };
}

export function costReport(b: Budget, current: BudgetTotals): CostReport | null {
  const lock = b.locked;
  if (!lock) return null;
  const spent = new Map<string, number>();
  const committed = new Map<string, number>();
  for (const e of b.expenses) {
    const m = e.paid ? spent : committed;
    m.set(e.accountId, (m.get(e.accountId) ?? 0) + (Number(e.amount) || 0));
  }
  const ids = new Set([...Object.keys(lock.accounts), ...spent.keys(), ...committed.keys(), ...current.byAccount.keys()]);
  const zero = () => ({ budget: 0, spent: 0, committed: 0, toDate: 0, etc: 0, efc: 0, variance: 0 });
  const groups = Object.fromEntries(GROUPS.map((g) => [g.id, zero()])) as CostReport['groups'];
  const totals = zero();
  const rows: CostRow[] = [];
  for (const a of b.accounts) {
    if (!ids.has(a.id)) continue;
    const budget = lock.accounts[a.id] ?? 0;
    const sp = spent.get(a.id) ?? 0;
    const co = committed.get(a.id) ?? 0;
    const toDate = sp + co;
    const typed = b.etc?.[a.id];
    const etc = typed != null ? typed : Math.max(0, (current.byAccount.get(a.id)?.total ?? 0) - toDate);
    const efc = toDate + etc;
    const row: CostRow = { accountId: a.id, budget, spent: sp, committed: co, toDate, etc, etcTyped: typed != null, efc, variance: budget - efc };
    if (!budget && !toDate && !efc) continue;
    rows.push(row);
    for (const bucket of [groups[a.group], totals]) {
      bucket.budget += budget; bucket.spent += sp; bucket.committed += co; bucket.toDate += toDate; bucket.etc += etc; bucket.efc += efc; bucket.variance += row.variance;
    }
  }
  return { rows, groups, totals, reserve: lock.total - lock.subtotal, lock };
}
