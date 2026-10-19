import type { BudgetAccount, BudgetLine, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { GROUPS, accountLabel } from './accounts';
import { lineBase, lineFringes, lineTotal, linePremium, totals, money, type BudgetTotals } from './calc';
import { budgetView } from './pipeline';

// The budget as it should be printed or exported: one version, with linked quantities filled in.
// Shared by the PDF and the spreadsheet.

export interface BudgetReport {
  title: string;
  version: string;
  currency: string;
  shootDays: number;
  lines: BudgetLine[];
  t: BudgetTotals;
  groups: { id: string; label: string; total: number; target: number; actual: number; accounts: { a: BudgetAccount; total: number; actual: number; lines: BudgetLine[] }[] }[];
  hasTargets: boolean;
  hasActuals: boolean;
  $: (n: number) => string;
}

export const UNIT_LABEL: Record<string, string> = { days: 'Days', weeks: 'Weeks', hours: 'Hours', each: 'Each', flat: 'Flat', allow: 'Allow', rentdays: 'Rental days' };

export function budgetReport(p: Project, d: Derived, scenarioId?: string): BudgetReport {
  const b = p.budget;
  const sc = b.scenarios.find((s) => s.id === scenarioId);
  const v = budgetView(p, d, sc?.id);
  const f = v.facts;
  const lines = v.lines;
  const t = totals(b, lines);
  const groups = GROUPS.map((g) => {
    const accounts = b.accounts.filter((a) => a.group === g.id).map((a) => ({
      a,
      total: t.byAccount.get(a.id)?.total ?? 0,
      actual: t.actualByAccount.get(a.id) ?? 0,
      lines: lines.filter((l) => l.accountId === a.id),
    })).filter((x) => x.lines.length || x.actual || x.a.target);
    return {
      id: g.id, label: g.label, total: t.byGroup[g.id],
      target: accounts.reduce((s, x) => s + (x.a.target ?? 0), 0),
      actual: accounts.reduce((s, x) => s + x.actual, 0),
      accounts,
    };
  });
  return {
    title: p.title,
    version: sc?.name ?? 'Base budget',
    currency: b.currency,
    shootDays: sc?.shootDays ?? f.shootDays,
    lines, t, groups,
    hasTargets: b.accounts.some((a) => a.target != null) || !!b.targetTotal,
    hasActuals: b.expenses.length > 0,
    $: (n: number) => money(n, b.currency, true),
  };
}

export { accountLabel, lineBase, lineFringes, lineTotal, linePremium };
