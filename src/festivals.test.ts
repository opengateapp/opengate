import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { derive } from './script/derive';
import { budgetView } from './budget/pipeline';
import { totals } from './budget/calc';
import {
  aimedFee, amountsIn, datesIn, festivalDates, festivalTotals, newDeadline, newFestival, parseFestivalCsv, parseFestivalPaste, premiereWarnings, syncFestivalLines,
} from './budget/festivals';
import { buildSampleProduction } from './model/sampleProduction';
import { decodeField, encodeField } from './sync/channels';

const TODAY = '2026-10-23';

const FILMFREEWAY = `Prairie Light Film Festival
https://filmfreeway.com/PrairieLightFilmFestival
Dates & Deadlines
Opening Date
January 15, 2027
Earlybird Deadline
March 1, 2027
Regular Deadline
April 15, 2027
Late Deadline
May 30, 2027
Notification Date
July 1, 2027
Event Date
September 10 - 14, 2027
Categories & Fees
Narrative Short
Earlybird Deadline: USD $25
Regular Deadline: USD $35
Late Deadline: USD $45
Documentary Feature
Earlybird Deadline: USD $50`;

describe('reading pasted festival text', () => {
  it('reads dates in common formats, and amounts', () => {
    expect(datesIn('March 1, 2027', TODAY)).toEqual(['2027-03-01']);
    expect(datesIn('1 Feb 2027 ($20)', TODAY)).toEqual(['2027-02-01']);
    expect(datesIn('05/30/2027', TODAY)).toEqual(['2027-05-30']);
    expect(datesIn('2027-06-04', TODAY)).toEqual(['2027-06-04']);
    expect(datesIn('September 10 - 14, 2027', TODAY)).toEqual(['2027-09-10', '2027-09-14']);
    // No year: the next one on or after today.
    expect(datesIn('Mar 3', TODAY)).toEqual(['2027-03-03']);
    expect(datesIn('Nov 3', TODAY)).toEqual(['2026-11-03']);
    expect(amountsIn('Earlybird Deadline: USD $25')).toEqual([25]);
    expect(amountsIn('US$13.50 or €20')).toEqual([13.5, 20]);
  });

  it('reads a FilmFreeway page copied by hand', () => {
    const { festival: f, guessed } = parseFestivalPaste(FILMFREEWAY, TODAY);
    expect(f.name).toBe('Prairie Light Film Festival');
    expect(f.platform).toBe('filmfreeway');
    expect(f.url).toContain('filmfreeway.com');
    expect(f.deadlines.map((d) => [d.label, d.date, d.fee])).toEqual([['Earlybird', '2027-03-01', 25], ['Regular', '2027-04-15', 35], ['Late', '2027-05-30', 45]]);
    expect([f.eventStart, f.eventEnd, f.notifyDate]).toEqual(['2027-09-10', '2027-09-14', '2027-07-01']);
    expect(f.category).toBe('Narrative Short');
    expect(f.aim).toBe(f.deadlines[0].id);
    expect(guessed).toContain('Festival name');
  });

  it('reads a festival website with several deadlines in one sentence', () => {
    const { festival: f } = parseFestivalPaste('Ridgeline Shorts 2027\nSubmissions are open! Early deadline: 1 Feb 2027 ($20). Standard deadline — March 15, 2027 – $30. Final deadline 05/01/2027 $40.\nFestival dates: June 4–6, 2027', TODAY);
    expect(f.name).toBe('Ridgeline Shorts 2027');
    expect(f.deadlines.map((d) => [d.label, d.date, d.fee])).toEqual([['Early', '2027-02-01', 20], ['Standard', '2027-03-15', 30], ['Final', '2027-05-01', 40]]);
    expect([f.eventStart, f.eventEnd]).toEqual(['2027-06-04', '2027-06-06']);
    expect(f.category).toBeUndefined();
  });

  it('says so when it finds no deadlines', () => {
    expect(parseFestivalPaste('Just some text about a festival', TODAY).note).toMatch(/No deadlines found/);
  });

  it('imports a spreadsheet, one festival per name', () => {
    const got = parseFestivalCsv('Name,URL,Deadline,Date,Fee,Event start,Event end,Location\nA Fest,https://filmfreeway.com/a,Early,2027-02-01,$20,2027-06-01,2027-06-03,Here\nA Fest,,Late,2027-03-01,30,,,\nB Fest,https://b.example,Regular,2027-04-01,15,,,', TODAY);
    expect(got.map((f) => [f.name, f.deadlines.length, f.platform])).toEqual([['A Fest', 2, 'filmfreeway'], ['B Fest', 1, 'site']]);
    expect(got[0].eventStart).toBe('2027-06-01');
  });
});

describe('festival fees in the budget', () => {
  const fest = (patch: Parameters<typeof newFestival>[0]) => {
    const f = newFestival({ name: 'F', status: 'planned', ...patch });
    if (!patch?.deadlines) f.deadlines = [newDeadline('Early', '2027-01-10', 20), newDeadline('Regular', '2027-02-10', 35)];
    return f;
  };

  it('budgets the aimed deadline’s fee, the next open one, the fee paid, or nothing when waived', () => {
    const f = fest({});
    expect(aimedFee(f, TODAY)).toBe(20);
    expect(aimedFee({ ...f, aim: f.deadlines[1].id }, TODAY)).toBe(35);
    expect(aimedFee(f, '2027-01-20')).toBe(35);
    expect(aimedFee({ ...f, waiver: 'CODE' }, TODAY)).toBe(0);
    expect(aimedFee({ ...f, status: 'submitted', feePaid: 18 }, TODAY)).toBe(18);
  });

  it('keeps linked lines with one item per festival you’re entering, and travel only when attending', () => {
    let p = produce(newProject('F'), (dr) => {
      dr.budget.lines.push({ id: 'old', accountId: 'acc-5100', description: 'Festival submissions', qty: 15, units: 'each', x: 1, rate: 30, fringeIds: [] });
      dr.budget.festivals = [fest({ name: 'A' }), fest({ name: 'B', status: 'considering' }), fest({ name: 'C', attend: true, travel: 300 }), fest({ name: 'D', status: 'declined' })];
      syncFestivalLines(dr, TODAY);
    });
    const sub = p.budget.lines.filter((l) => l.link?.kind === 'festival');
    expect(sub).toHaveLength(1);
    expect(sub[0].id).toBe('old'); // the plain line from the marketing block was taken over, not doubled
    expect(sub[0].items!.map((i) => [i.description, i.rate])).toEqual([['A', 20], ['C', 20]]);
    expect(p.budget.lines.find((l) => l.link?.kind === 'festivalTravel')!.items!.map((i) => i.rate)).toEqual([300]);
    const d = derive(p.scriptDoc);
    const t = totals(p.budget, budgetView(p, d).lines);
    expect(t.byAccount.get('acc-5100')!.total).toBe(340);
    p = produce(p, (dr) => { dr.budget.festivals = []; syncFestivalLines(dr, TODAY); });
    expect(p.budget.lines.some((l) => l.link?.kind === 'festival' || l.link?.kind === 'festivalTravel')).toBe(false);
  });

  it('totals, next deadlines, calendar entries and premiere clashes', () => {
    const a = fest({ name: 'Local', eventStart: '2027-05-01' });
    const b = fest({ name: 'Big', premiere: 'world', eventStart: '2027-09-01' });
    const t = festivalTotals([a, b], TODAY);
    expect(t.planned).toBe(40);
    expect(t.upcoming[0].deadline.date).toBe('2027-01-10');
    expect(premiereWarnings([a, b]).map((w) => [w.festival.name, w.before.name])).toEqual([['Big', 'Local']]);
    expect(premiereWarnings([{ ...a, status: 'considering' }, b])).toEqual([]);
    expect(festivalDates([a]).get('2027-01-10')).toEqual(['Local: Early deadline']);
  });

  it('syncs privately with the budget and round-trips', () => {
    const p = produce(newProject('S'), (dr) => { dr.budget.festivals = [fest({ name: 'A' })]; });
    const entries = encodeField('budget', p.budget);
    expect([...entries.keys()].some((k) => k.startsWith('budget.festivals/'))).toBe(true);
    const back = decodeField('budget', (k) => JSON.parse(JSON.stringify(entries.get(k))), [...entries.keys()]) as typeof p.budget;
    expect(back.festivals).toEqual(JSON.parse(JSON.stringify(p.budget.festivals)));
  });
});

describe('the sample production’s festivals', () => {
  it('plans fictional festivals, budgets their fees and travel, and shows a premiere clash', () => {
    const p = buildSampleProduction();
    const list = p.budget.festivals ?? [];
    expect(list.length).toBe(7);
    expect(list.every((f) => /fictional/.test(f.name))).toBe(true);
    const t = festivalTotals(list);
    expect(t.planned).toBe(50 + 25 + 40); // earlybirds; Drive-In Shorts is free, Coastline is waived
    expect(t.travel).toBe(250);
    expect(premiereWarnings(list).length).toBeGreaterThan(0);
    const line = p.budget.lines.find((l) => l.link?.kind === 'festival')!;
    expect(line.items!.length).toBe(5);
    expect(p.budget.lines.filter((l) => l.description === 'Festival submissions')).toHaveLength(1);
  });
});
