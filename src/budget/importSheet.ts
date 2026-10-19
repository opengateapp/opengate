import type { BudgetAccount, BudgetLine, BudgetUnits } from '../model/types';
import { newId } from '../model/ids';
import { parseAmount, parseCsv } from './expenses';

// Importing an existing budget from a spreadsheet (CSV or Excel): one row per line, with an
// account (code or name), description, quantity, units, multiplier and rate — or just a total.

export interface SheetMapping { account: number; description: number; qty: number; units: number; x: number; rate: number; total: number }

/** Rows of cells from a .csv, .xlsx or .xls file (first sheet). */
export async function readSheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: '' });
  return rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
}

/** The first row that looks like a header (has a description-ish column). */
export function headerRow(rows: string[][]): number {
  const i = rows.findIndex((r) => r.some((c) => /descr|item|line|name/i.test(c)) && r.some((c) => /rate|amount|total|cost|price/i.test(c)));
  return i >= 0 ? i : 0;
}

export function guessSheetMapping(header: string[]): SheetMapping {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...res: RegExp[]) => { for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; } return -1; };
  return {
    account: find(/^acc(ount)?\b|^acct|account/, /^code$|category|dept|department/),
    description: find(/descr/, /^item|line item|^name$/),
    qty: find(/^qty$|quantity|^amount$|^amt$|^days?$|^#$/),
    units: find(/^units?$|^uom$|per$/),
    x: find(/^(x|×)$/, /multiplier|^mult|people|^count$|^no\.?$/),
    rate: find(/^rate$|unit (cost|price)|price|cost each/),
    total: find(/^total$|subtotal|extended|line total|cost$/),
  };
}

function unitsOf(s: string): BudgetUnits {
  const v = s.trim().toLowerCase();
  if (/^d(ay)?s?$/.test(v) || v === 'days') return 'days';
  if (/^w(ee)?k?s?$/.test(v)) return 'weeks';
  if (/^h(ou)?r?s?$/.test(v)) return 'hours';
  if (/allow/.test(v)) return 'allow';
  if (/each|ea|pcs?|units?/.test(v)) return 'each';
  return 'flat';
}

/**
 * Rows → budget lines. Accounts are matched by code, then by name; unmatched rows go to
 * `fallbackAccountId`. A row with only a total becomes 1 × 1 × total. Empty rows are skipped.
 */
export function sheetToLines(rows: string[][], map: SheetMapping, accounts: BudgetAccount[], fallbackAccountId: string, from = 1): BudgetLine[] {
  const byCode = new Map(accounts.map((a) => [a.code.toLowerCase(), a.id]));
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a.id]));
  const out: BudgetLine[] = [];
  for (const r of rows.slice(from)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const description = get(map.description);
    const num = (i: number) => { const n = parseAmount(get(i)); return Number.isFinite(n) ? n : NaN; };
    let qty = num(map.qty), x = num(map.x), rate = num(map.rate);
    const total = num(map.total);
    if (!description && !(rate > 0) && !(total > 0)) continue;
    if (!(rate > 0) && total > 0) { rate = total; qty = 1; x = 1; }
    if (!Number.isFinite(qty)) qty = 1;
    if (!Number.isFinite(x)) x = 1;
    if (!Number.isFinite(rate)) rate = 0;
    const acc = get(map.account).toLowerCase();
    const code = acc.match(/^[a-z]?\d+[a-z]?|^[a-p]$/)?.[0] ?? acc;
    const accountId = byCode.get(code) ?? byCode.get(acc) ?? byName.get(acc) ?? [...byName.entries()].find(([n]) => acc && (n.includes(acc) || acc.includes(n)))?.[1] ?? fallbackAccountId;
    out.push({ id: newId(), accountId, description: description || 'Imported line', qty, units: unitsOf(get(map.units)), x, rate, fringeIds: [] });
  }
  return out;
}
