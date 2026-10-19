import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { setRange, moveScenes } from './schedule/engine';
import { buildDood } from './schedule/dood';
import { lineBase, lineFringes, totals, scenarioLines, variance } from './budget/calc';
import { breakdownFacts, importFromBreakdown, resolveLines, crewAccount } from './budget/fromBreakdown';
import { newBudget } from './budget/accounts';
import type { BudgetLine } from './model/types';

const L = (over: Partial<BudgetLine>): BudgetLine => ({ id: 'l', accountId: 'acc-2200', description: '', qty: 1, units: 'days', x: 1, rate: 0, fringeIds: [], ...over });

describe('budget arithmetic', () => {
  it('multiplies qty × x × rate and applies capped fringes', () => {
    const b = newBudget();
    b.fringes = [{ id: 'tax', name: 'Payroll', pct: 10 }, { id: 'ph', name: 'P&H', pct: 20, cap: 1000 }];
    const l = L({ qty: 5, x: 2, rate: 300, fringeIds: ['tax', 'ph'] });
    expect(lineBase(l)).toBe(3000);
    expect(lineFringes(b, l)).toBe(300 + 200); // 10% of 3000 + 20% of the first 1000
  });
  it('totals accounts, groups, contingency and actuals', () => {
    const b = newBudget();
    b.contingencyPct = 10;
    b.expenses = [{ id: 'e', date: '2026-10-01', vendor: 'Rental house', description: 'Camera', amount: 1200, accountId: 'acc-2200', paid: true }];
    const t = totals(b, [L({ id: 'a', qty: 4, rate: 500 }), L({ id: 'b', accountId: 'acc-1400', qty: 2, rate: 250 })]);
    expect(t.byAccount.get('acc-2200')?.total).toBe(2000);
    expect(t.byGroup).toMatchObject({ atl: 500, btl: 2000, post: 0, other: 0 });
    expect(t.subtotal).toBe(2500);
    expect(t.contingency).toBe(250);
    expect(t.total).toBe(2750);
    expect(t.actual).toBe(1200);
    expect(variance(3000, 2000, 1200)).toMatchObject({ planRoom: 1000, remaining: 800 });
  });
  it('applies scenario overrides, removals, added lines and shoot length', () => {
    const b = newBudget();
    const base = [L({ id: 'cam', qty: 10, rate: 500 }), L({ id: 'meals', accountId: 'acc-3500', qty: 10, rate: 200, link: { kind: 'shootDays', auto: true } }), L({ id: 'drone', rate: 900 })];
    b.scenarios = [{ id: 's', name: 'Lean', shootDays: 8, overrides: { cam: { rate: 400 }, drone: { removed: true } }, added: [L({ id: 'extra', rate: 50 })] }];
    const lines = scenarioLines(b, base, 's');
    expect(lines.map((l) => l.id)).toEqual(['cam', 'meals', 'extra']);
    expect(lines.find((l) => l.id === 'cam')).toMatchObject({ qty: 10, rate: 400 });
    expect(lines.find((l) => l.id === 'meals')?.qty).toBe(8);
    expect(scenarioLines(b, base)).toBe(base);
  });
});

describe('budget from the breakdown', () => {
  const scheduled = () => produce(newProject('T'), (dr) => {
    applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN));
    const d = derive(dr.scriptDoc);
    dr.cast.push({ id: 'maya', castNumber: 1, characterName: 'MAYA', actorName: 'Ana', unavailable: [] });
    dr.crew.push({ id: 'dp', name: 'Sam', role: 'Director of Photography' }, { id: 'pa', name: 'Jo', role: 'PA' });
    dr.locations.push({ id: 'drivein', setName: 'DRIVE-IN THEATER', realName: 'Starlite Drive-In', address: '', fee: '$1,500/day' });
    dr.elements.push({ id: 'truck', categoryId: 'vehicles', name: 'Pickup truck', sceneIds: [d.scenes[0].id] }, { id: 'can', categoryId: 'props', name: 'Film canister', sceneIds: [d.scenes[0].id] });
    setRange(dr.schedule, '2026-11-02', '2026-11-04', 'merge');
    const ids = dr.schedule.days.map((x) => x.id);
    moveScenes(dr.schedule, [d.scenes[0].id], ids[0]);
    moveScenes(dr.schedule, [d.scenes[1].id, d.scenes[2].id], ids[1]);
    moveScenes(dr.schedule, [d.scenes[3].id, d.scenes[4].id], ids[2]);
  });

  it('imports cast, crew, locations, elements and per-day lines with live quantities', () => {
    const p = scheduled();
    const d = derive(p.scriptDoc);
    const f = breakdownFacts(p, d);
    const added = importFromBreakdown(p, f);
    const withLines = produce(p, (dr) => { dr.budget.lines.push(...added); });
    const { lines, orphaned } = resolveLines(withLines, f);
    const by = (kind: string, id?: string) => lines.find((l) => l.link?.kind === kind && (id === undefined || l.link.id === id))!;
    const mayaWork = buildDood(p, d).rows.find((r) => r.character === 'MAYA')!.work;
    expect(by('cast', 'maya')).toMatchObject({ accountId: 'acc-1400', qty: mayaWork });
    expect(by('crew', 'dp')).toMatchObject({ accountId: 'acc-2200', qty: 3 });
    expect(by('crew', 'pa').accountId).toBe('acc-2000');
    expect(by('location', 'drivein')).toMatchObject({ accountId: 'acc-2900', rate: 1500 });
    expect(by('element', 'truck')).toMatchObject({ accountId: 'acc-3000', qty: 1, units: 'days' });
    expect(by('element', 'can')).toMatchObject({ accountId: 'acc-2500', units: 'allow' });
    // Catering: people on set × days = (cast in each day's scenes + 2 daily crew) summed over 3 days.
    const castPerDay = p.schedule.days.slice(0, 3).map((day) => new Set(day.items.flatMap((it) => it.kind === 'scene' ? (derive(p.scriptDoc).sceneById.get(it.sceneId)?.characters ?? []) : [])).size);
    expect(by('headcount').qty).toBe(castPerDay.reduce((a, n) => a + n + 2, 0));
    expect(orphaned.size).toBe(0);
    // Importing again adds nothing new.
    expect(importFromBreakdown(withLines, f)).toEqual([]);

    // Unscheduling a day drops the per-day quantities; deleting the DP orphans that line.
    const later = produce(withLines, (dr) => { dr.schedule.days[2].items = []; dr.crew = dr.crew.filter((c) => c.id !== 'dp'); });
    const r2 = resolveLines(later, breakdownFacts(later, derive(later.scriptDoc)));
    expect(r2.lines.find((l) => l.link?.kind === 'headcount')!.qty).toBe(castPerDay[0] + castPerDay[1] + 2);
    expect(r2.orphaned.has(by('crew', 'dp').id)).toBe(true);
  });

  it('exports a PDF and a workbook that agree with the screen', async () => {
    const p = produce(scheduled(), (dr) => {
      const f = breakdownFacts(dr as never, derive(dr.scriptDoc));
      dr.budget.lines.push(...importFromBreakdown(dr as never, f));
      dr.budget.lines.forEach((l) => { l.rate = 100; });
      dr.budget.expenses.push({ id: 'e1', date: '2026-11-01', vendor: 'Rental', description: '', amount: 250, accountId: 'acc-2200', paid: true });
    });
    const d = derive(p.scriptDoc);
    const { budgetReport } = await import('./budget/report');
    const r = budgetReport(p, d);
    const { budgetPdf } = await import('./pdf/budgetPdf');
    const doc = budgetPdf(p, d);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const { budgetXlsx } = await import('./budget/exportXlsx');
    const XLSX = await import('xlsx');
    const blob = await budgetXlsx(p, d);
    const buf = await new Promise<ArrayBuffer>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as ArrayBuffer); fr.readAsArrayBuffer(blob); });
    const wb = XLSX.read(buf);
    expect(wb.SheetNames).toEqual(['Top Sheet', 'Detail', 'Expenses']);
    const top = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Top Sheet'], { header: 1 });
    expect(top.find((row) => row[1] === 'TOTAL')?.[2]).toBe(Math.round(r.t.total * 100) / 100);
    expect(wb.Sheets.Detail.G2.f).toBe('C2*E2*F2');
  });

  it('keeps a typed quantity once a line is unlinked', () => {
    const p = scheduled();
    const f = breakdownFacts(p, derive(p.scriptDoc));
    const meals = { ...importFromBreakdown(p, f).find((l) => l.link?.kind === 'headcount')!, qty: 7 };
    expect(resolveLines(p, f, [meals]).lines[0].qty).toBe(f.personDays);
    expect(resolveLines(p, f, [{ ...meals, link: { ...meals.link!, auto: false } }]).lines[0].qty).toBe(7);
  });

  it('files crew roles under the right accounts', () => {
    expect(crewAccount('Gaffer')).toBe('2300');
    expect(crewAccount('1st AD')).toBe('2000');
    expect(crewAccount('Assistant Director')).toBe('2000');
    expect(crewAccount('Director')).toBe('1300');
    expect(crewAccount('Art Director')).toBe('2400');
    expect(crewAccount('Boom Operator')).toBe('2800');
    expect(crewAccount('Key Makeup')).toBe('2700');
  });
});

describe('expenses from bank exports', () => {
  it('reads quoted CSV and guesses the columns', async () => {
    const { parseCsv, guessMapping, rowsToExpenses } = await import('./budget/expenses');
    const rows = parseCsv('﻿Date,Description,Amount\r\n10/14/2026,"B&H Photo, NYC",-1249.99\r\n10/15/2026,Refund,45.00\r\n2026-10-16,"Catering ""Joe\'s""","(310.50)"\r\n');
    expect(rows[1]).toEqual(['10/14/2026', 'B&H Photo, NYC', '-1249.99']);
    const map = guessMapping(rows[0]);
    expect(map).toMatchObject({ date: 0, amount: 2 });
    const list = rowsToExpenses(rows, map, 'acc-2200');
    expect(list.map((e) => [e.date, e.vendor, e.amount])).toEqual([
      ['2026-10-14', 'B&H Photo, NYC', 1249.99],
      ['2026-10-16', 'Catering "Joe\'s"', 310.5],
    ]);
  });
  it('uses the debit column when there is one and skips deposits', async () => {
    const { parseCsv, guessMapping, rowsToExpenses, normDate } = await import('./budget/expenses');
    const rows = parseCsv('Posted Date;Payee;Debit;Credit\n14/10/2026;Grip truck;800,00;\n15/10/2026;Investor;;5000\n'.replace(/800,00/, '800.00'));
    const map = guessMapping(rows[0]);
    expect(map).toMatchObject({ date: 0, vendor: 1, debit: 2, credit: 3 });
    const list = rowsToExpenses(rows, map, 'acc-2300');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ date: '2026-10-14', vendor: 'Grip truck', amount: 800 });
    expect(normDate('3/4/26')).toBe('2026-03-04');
    // A card statement (all charges positive) imports every row.
    const card = parseCsv('Date,Merchant,Amount\n2026-10-01,Gas,40\n2026-10-02,Tape,12.5\n');
    expect(rowsToExpenses(card, guessMapping(card[0]), 'x').map((e) => e.amount)).toEqual([40, 12.5]);
  });
});

describe('budget: prep/wrap, rentals, overtime and added percentages', () => {
  it('bills rental weeks, overtime and 6th/7th days', async () => {
    const { rentalBilled, lineBase, linePremium } = await import('./budget/calc');
    expect(rentalBilled(3)).toBe(3);
    expect(rentalBilled(7)).toBe(3);
    expect(rentalBilled(10)).toBe(6);
    expect(rentalBilled(16, 4)).toBe(10);
    const b = { ...newBudget(), dayHours: 10, otMult: 1.5, sixthMult: 1.5, seventhMult: 2 };
    expect(lineBase(L({ qty: 10, units: 'rentdays', rate: 100 }), b)).toBe(600);
    // $500 day, 2 people: 4 OT hours = 4 × 50 × 1.5; one 6th day = +250; one 7th day = +500.
    const crew = L({ qty: 6, x: 2, rate: 500, otHours: 4, sixthDays: 1, seventhDays: 1 });
    expect(linePremium(crew, b)).toBe((300 + 250 + 500) * 2);
    expect(lineBase(crew, b)).toBe(6000 + 2100);
  });

  it('charges contingency and added percentages on chosen groups, credits come off', () => {
    const b = newBudget();
    b.contingencyPct = 10;
    b.contingencyAppliesTo = ['btl', 'post'];
    b.applied = [{ id: 'ins', name: 'Insurance', pct: 2, appliesTo: ['atl', 'btl', 'post', 'other'] }, { id: 'tc', name: 'Tax credit', pct: 25, appliesTo: ['btl'], credit: true }];
    const t = totals(b, [L({ id: 'a', accountId: 'acc-1400', qty: 1, rate: 1000 }), L({ id: 'b', accountId: 'acc-2200', qty: 1, rate: 4000 })]);
    expect(t.subtotal).toBe(5000);
    expect(t.contingency).toBe(400); // 10% of BTL only
    expect(t.applied.map((a) => a.amount)).toEqual([100, -1000]);
    expect(t.total).toBe(5000 + 400 + 100 - 1000);
  });

  it('adds prep and wrap days to linked lines, also in a shorter version', () => {
    const b = newBudget();
    const base = [L({ id: 'dp', qty: 10, rate: 500, prepDays: 3, wrapDays: 1, link: { kind: 'crew', id: 'dp', auto: true } })];
    b.scenarios = [{ id: 's', name: '8 days', shootDays: 8, overrides: {}, added: [] }];
    expect(scenarioLines(b, base, 's')[0].qty).toBe(12);
  });
});

describe('budget: formulas, sub-items and fringes', () => {
  it('evaluates formulas safely', async () => {
    const { evaluate, isFormula } = await import('./budget/expr');
    expect(evaluate('SHOOT_WEEKS * 5 + 2', { SHOOT_WEEKS: 3 }).value).toBe(17);
    expect(evaluate('(crew + 2) / 2', { CREW: 6 }).value).toBe(4);
    expect(evaluate('-3 + 10', {}).value).toBe(7);
    expect(evaluate('PREP + 1', {}).error).toMatch(/Unknown name PREP/);
    expect(evaluate('alert(1)', {}).error).toBeTruthy();
    expect(isFormula('12')).toBe(false);
    expect(isFormula('SHOOT_DAYS + 2')).toBe(true);
  });

  it('works out formulas and sub-items before adding up', async () => {
    const { finalizeLines } = await import('./budget/calc');
    const [l] = finalizeLines([L({ qty: 1, qtyExpr: 'SHOOT_WEEKS', units: 'weeks', xExpr: 'CREW / 2', items: [{ id: 'a', description: 'Body', qty: 1, rate: 500 }, { id: 'b', description: 'Lenses', qty: 4, rate: 75 }] })], { SHOOT_WEEKS: 3, CREW: 4 });
    expect(l).toMatchObject({ qty: 3, x: 2, rate: 800 });
  });

  it('applies flat fringes and per-person caps across lines', async () => {
    const { fringeByLine } = await import('./budget/calc');
    const b = newBudget();
    b.fringes = [{ id: 'ph', name: 'P&H', pct: 10, cap: 1000, capPerPerson: true }, { id: 'day', name: 'Union per day', pct: 0, flat: 20, flatPer: 'day' }];
    const lines = [
      L({ id: 'w', qty: 2, rate: 400, fringeIds: ['ph', 'day'], link: { kind: 'cast', id: 'maya', auto: true } }), // 800 wages, 2 days
      L({ id: 'h', qty: 1, rate: 400, fringeIds: ['ph'], link: { kind: 'castHold', id: 'maya', auto: true } }), // same person: only 200 left under the cap
    ];
    const m = fringeByLine(b, lines);
    expect(m.get('w')).toBe(80 + 40);
    expect(m.get('h')).toBe(20);
  });
});
