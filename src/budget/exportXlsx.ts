import type { Project } from '../model/types';
import type { Derived } from '../script/derive';
import { accountLabel } from './accounts';
import { budgetReport, lineBase, lineFringes, linePremium, lineTotal, UNIT_LABEL } from './report';

// Budget workbook: Top Sheet, Detail (with live formulas for each line), Expenses.

export async function budgetXlsx(p: Project, d: Derived, scenarioId?: string): Promise<Blob> {
  const XLSX = await import('xlsx');
  const r = budgetReport(p, d, scenarioId);
  const b = p.budget;
  const wb = XLSX.utils.book_new();

  const top: (string | number | null)[][] = [[r.title], [`${r.version} · ${r.shootDays} shoot days · ${b.currency}`], [], ['Account', 'Name', 'Estimate', ...(r.hasTargets ? ['Target'] : []), ...(r.hasActuals ? ['Actual'] : [])]];
  const extra = (target?: number, actual?: number) => [...(r.hasTargets ? [target ?? null] : []), ...(r.hasActuals ? [actual ?? null] : [])];
  for (const g of r.groups) {
    top.push([g.label.toUpperCase(), null, round(g.total), ...extra(g.target || undefined, g.actual)]);
    for (const x of g.accounts) top.push([x.a.code, x.a.name, round(x.total), ...extra(x.a.target, x.actual)]);
    top.push([]);
  }
  top.push(['', 'Fringes (included above)', round(r.t.fringes)]);
  top.push(['', 'Subtotal', round(r.t.subtotal)]);
  top.push(['', `Contingency (${b.contingencyPct}%)`, round(r.t.contingency)]);
  for (const a of r.t.applied) top.push(['', `${a.name} (${a.credit ? '−' : ''}${a.pct}%)`, round(a.amount)]);
  top.push(['', 'TOTAL', round(r.t.total), ...extra(b.targetTotal, r.t.actual)]);
  const wsTop = XLSX.utils.aoa_to_sheet(top);
  wsTop['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsTop, 'Top Sheet');

  // Detail with formulas, so the sheet keeps working when someone edits a rate in Excel.
  const header = ['Account', 'Description', 'Qty', 'Units', 'x', 'Rate', 'Subtotal', 'Fringes', 'Total'];
  const detail: (string | number | { f: string; v?: number })[][] = [header];
  for (const g of r.groups) for (const x of g.accounts) for (const l of x.lines) {
    const row = detail.length + 1;
    const fr = lineFringes(b, l);
    detail.push([accountLabel(x.a), l.description, round(l.qty), UNIT_LABEL[l.units] ?? l.units, l.x, l.rate, (l.units === 'rentdays' || linePremium(l, b) ? round(lineBase(l, b)) : { f: `C${row}*E${row}*F${row}`, v: round(l.qty * l.x * l.rate) }), round(fr), { f: `G${row}+H${row}`, v: round(lineTotal(b, l)) }]);
  }
  const wsDetail = XLSX.utils.aoa_to_sheet(detail);
  wsDetail['!cols'] = [{ wch: 28 }, { wch: 40 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail');

  if (b.expenses.length) {
    const acc = new Map(b.accounts.map((a) => [a.id, accountLabel(a)]));
    const ex = [['Date', 'Vendor', 'Description', 'Account', 'Amount', 'Paid'], ...[...b.expenses].sort((a, c) => a.date.localeCompare(c.date)).map((e) => [e.date, e.vendor, e.description, acc.get(e.accountId) ?? '', e.amount, e.paid ? 'yes' : 'no'])];
    const wsEx = XLSX.utils.aoa_to_sheet(ex);
    wsEx['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 30 }, { wch: 28 }, { wch: 12 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, wsEx, 'Expenses');
  }

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const round = (n: number) => Math.round(n * 100) / 100;
