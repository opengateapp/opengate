import type { BudgetExpense } from '../model/types';
import { newId } from '../model/ids';

// Expenses: reading bank / card CSV exports into expense rows.

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  const s = text.replace(/^﻿/, '');
  // Some European bank exports separate fields with semicolons.
  const first = s.split(/\r?\n/, 1)[0];
  const sep = !first.includes(',') && first.includes(';') ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export interface CsvMapping { date: number; vendor: number; description: number; amount: number; debit: number; credit: number }

/** Guesses which columns hold what, from the header row (-1 = none). */
export function guessMapping(header: string[]): CsvMapping {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (...res: RegExp[]) => { for (const re of res) { const i = h.findIndex((x) => re.test(x)); if (i >= 0) return i; } return -1; };
  const vendor = find(/payee|merchant|vendor|^name$/, /counterparty/);
  return {
    date: find(/^date$/, /transaction date|posted|post date|^date/),
    vendor,
    description: find(/^description$|memo|details|narrative/, /description/) === vendor ? -1 : find(/^description$|memo|details|narrative/, /description/),
    amount: find(/^amount$/, /amount/),
    debit: find(/debit|withdrawal|money out|paid out/),
    credit: find(/credit|deposit|money in|paid in/),
  };
}

/** Normalizes a date to YYYY-MM-DD (US month-first unless the first number can't be a month). */
export function normDate(raw: string): string {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12) [a, b] = [b, a];
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** "$1,234.50", "(45.00)", "-12" → a number (NaN when it isn't one). */
export function parseAmount(raw: string): number {
  const s = (raw ?? '').trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return neg ? -n : n;
}

/**
 * Rows → expenses. Money going out counts as spending: with a single amount column, banks
 * show it as negative (or all positive on card statements), so the absolute value is used
 * and money coming in is skipped when there are separate debit/credit columns.
 */
export function rowsToExpenses(rows: string[][], map: CsvMapping, accountId: string, skipHeader = true): BudgetExpense[] {
  const out: BudgetExpense[] = [];
  const body = skipHeader ? rows.slice(1) : rows;
  // One amount column with both signs (a bank account): only negatives are money out.
  // All one sign (a card statement): every row is a charge.
  const signs = map.amount >= 0 ? body.map((r) => parseAmount(r[map.amount] ?? '')).filter((n) => n) : [];
  const outIsNegative = signs.some((n) => n < 0) && signs.some((n) => n > 0);
  for (const r of body) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    let amount = NaN;
    if (map.debit >= 0) amount = Math.abs(parseAmount(get(map.debit)));
    if (!(amount > 0) && map.amount >= 0) {
      const a = parseAmount(get(map.amount));
      amount = outIsNegative && a > 0 ? NaN : Math.abs(a);
    }
    if (!(amount > 0)) continue;
    const vendor = get(map.vendor);
    const description = get(map.description);
    out.push({ id: newId(), date: normDate(get(map.date)), vendor: vendor || description, description: vendor ? description : '', amount: Math.round(amount * 100) / 100, accountId, paid: true });
  }
  return out;
}
