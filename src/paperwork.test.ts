import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { newProject } from './model/defaults';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { moveScenes } from './schedule/engine';
import { migrate } from './store/migrate';
import { budgetMediaIds, mediaIds } from './io/files';
import { channelOf, encodeField } from './sync/channels';
import { breakdownFacts, linkedQty } from './budget/fromBreakdown';
import { parseCsv } from './budget/expenses';
import { missingFor, newDoc, people, syncPaperworkLines, unsignedOnDay, unionCounts } from './paperwork/paperwork';
import { newCastMember, taftHartleyNeeded, unionBadge } from './paperwork/unions';
import { applyScan, scanScript } from './paperwork/clearanceScan';
import { DEFAULT_RULES, cardHours, cardsFromCallSheet, contractorCsv, payrollCsv, payrollRows } from './paperwork/timecards';
import type { TimeCard } from './model/types';

function setup() {
  let p = produce(newProject('Reel'), (d) => { applyImportedScript(d, parseFountain(SAMPLE_FOUNTAIN)); });
  const d = derive(p.scriptDoc);
  p = produce(p, (dr) => {
    dr.cast = [
      { id: 'c1', castNumber: 1, characterName: 'MAYA', actorName: 'Jo Park', unavailable: [], union: 'SAG-AFTRA', unionStatus: 'member' },
      { id: 'c2', castNumber: 2, characterName: 'THEO', actorName: 'Lou Grant', unavailable: [] },
    ];
    dr.crew = [{ id: 'k1', name: 'Kim Dee', role: 'Director of Photography', dailyDefault: true, union: 'IATSE', unionStatus: 'member', unionLocal: '600 (camera)' }];
    moveScenes(dr.schedule, [d.scenes[0].id, d.scenes[1].id], dr.schedule.days[0].id);
    dr.schedule.days[0].times.generalCall = '07:00';
    dr.schedule.days[0].times.lunch = '13:00';
    dr.budget.fringes.push({ id: 'fr-ph', name: 'Union pension & health', pct: 20 });
  });
  return { p, d: derive(p.scriptDoc), day: p.schedule.days[0] };
}

describe('unions', () => {
  it('makes short badges and leaves non-union people blank', () => {
    expect(unionBadge({ union: 'IATSE', unionStatus: 'member', unionLocal: '600 (camera)' })).toBe('IATSE 600');
    expect(unionBadge({ union: 'SAG-AFTRA', unionStatus: 'taft-hartley' })).toBe('SAG-AFTRA · T-H');
    expect(unionBadge({ union: 'SAG-AFTRA', unionStatus: 'nonunion' })).toBe('');
    expect(unionBadge({})).toBe('');
  });
  it('starts new cast on the production agreement and flags Taft-Hartley cases', () => {
    const { p } = setup();
    expect(newCastMember(p, 3).union).toBeUndefined();
    const sag = produce(p, (d) => { d.production.agreement = { union: 'SAG-AFTRA', tier: 'Ultra Low Budget' }; });
    expect(newCastMember(sag, 3)).toMatchObject({ union: 'SAG-AFTRA', unionStatus: 'pending' });
    expect(taftHartleyNeeded(sag).map((x) => x.name)).toEqual(['Lou Grant']);
    expect(taftHartleyNeeded(p)).toEqual([]);
  });
});

describe('paperwork', () => {
  it('older projects get empty paperwork, clearances and time cards', () => {
    const old = JSON.parse(JSON.stringify(newProject('Old')));
    delete old.budget.paperwork; delete old.budget.clearances; delete old.budget.timecards;
    const m = migrate(old);
    expect(m.budget.paperwork).toEqual([]);
    expect(m.budget.clearances).toEqual([]);
    expect(m.budget.timecards).toEqual([]);
  });

  it('puts a deal memo rate in the person’s budget line, adds a kit line and the union fringe', () => {
    const { p, d } = setup();
    const doc = { ...newDoc(p, 'deal', { kind: 'crew', id: 'k1' }), id: 'deal1' };
    doc.deal = { rate: 650, per: 'day', kitFee: 100, kitPer: 'day' };
    let q = produce(p, (dr) => { dr.budget.paperwork = [doc]; syncPaperworkLines(dr); });
    const line = q.budget.lines.find((l) => l.link?.kind === 'crew' && l.link.id === 'k1')!;
    expect(line.rate).toBe(650);
    expect(line.units).toBe('days');
    expect(line.fringeIds).toContain('fr-ph');
    const kit = q.budget.lines.find((l) => l.link?.kind === 'kit')!;
    expect(kit.rate).toBe(100);
    const f = breakdownFacts(q, d);
    expect(linkedQty(q, f, kit.link!)).toBe(f.shootDays);
    // A flat deal stops following the schedule; removing the kit fee removes its line.
    q = produce(q, (dr) => { dr.budget.paperwork![0].deal = { rate: 3000, per: 'flat' }; syncPaperworkLines(dr); });
    const flat = q.budget.lines.find((l) => l.link?.kind === 'crew' && l.link.id === 'k1')!;
    expect([flat.rate, flat.units, flat.qty, flat.link!.auto]).toEqual([3000, 'flat', 1, false]);
    expect(q.budget.lines.some((l) => l.link?.kind === 'kit')).toBe(false);
    // Deleting the memo leaves the person's line alone.
    q = produce(q, (dr) => { dr.budget.paperwork = []; syncPaperworkLines(dr); });
    expect(q.budget.lines.some((l) => l.link?.kind === 'crew' && l.link.id === 'k1')).toBe(true);
  });

  it('knows what each person is missing and who on a day hasn’t signed', () => {
    const { p, d, day } = setup();
    const kim = people(p).find((x) => x.ref.id === 'k1')!;
    expect(missingFor(p, kim)).toEqual(['deal', 'crew']);
    const signed = produce(p, (dr) => {
      dr.budget.paperwork = [{ ...newDoc(p, 'crew', { kind: 'crew', id: 'k1' }), status: 'signed' }, { ...newDoc(p, 'deal', { kind: 'crew', id: 'k1' }), status: 'signed', deal: { rate: 500, per: 'day', contractor: true } }];
    });
    expect(missingFor(signed, kim)).toEqual(['w9']);
    expect(unsignedOnDay(p, d, day).map((x) => x.name).sort()).toEqual(['Jo Park', 'Kim Dee', 'Lou Grant']);
    expect(unsignedOnDay(signed, d, day).map((x) => x.name).sort()).toEqual(['Jo Park', 'Lou Grant']);
    // An unsigned deal memo alone doesn't count: the release is what's needed on set.
    const dealOnly = produce(p, (dr) => { dr.budget.paperwork = [{ ...newDoc(p, 'talent', { kind: 'cast', id: 'c1' }), status: 'signed' }]; });
    expect(unsignedOnDay(dealOnly, d, day).map((x) => x.name).sort()).toEqual(['Kim Dee', 'Lou Grant']);
    expect(unionCounts(p, d)[0]).toMatchObject({ union: 2, nonUnion: 1 });
  });

  it('fills release text from the template', () => {
    const { p } = setup();
    const doc = newDoc(p, 'talent', { kind: 'cast', id: 'c1' });
    expect(doc.title).toBe('Talent release — Jo Park');
    expect(doc.body).toContain('I, Jo Park, appear in');
    expect(doc.body).toContain('as MAYA');
    expect(newDoc(p, 'deal', { kind: 'cast', id: 'c1' }).body).toBeUndefined();
  });

  it('keeps paperwork, signatures and files private with the budget', () => {
    const { p } = setup();
    const q = produce(p, (dr) => {
      dr.budget.paperwork = [{ ...newDoc(p, 'talent', { kind: 'cast', id: 'c1' }), fileId: 'f1', signature: { name: 'Jo Park', mediaId: 's1', at: 'now' } }];
      dr.budget.clearances = [{ id: 'cl', kind: 'artwork', item: 'Poster', sceneIds: [], status: 'needed', source: 'manual', fileId: 'f2' }];
    });
    expect(budgetMediaIds(q).sort()).toEqual(['f1', 'f2', 's1']);
    expect(mediaIds(q)).toEqual(expect.arrayContaining(['f1', 'f2', 's1']));
    expect(channelOf('budget')).toBe('budget');
    expect([...encodeField('budget', q.budget).keys()].some((k) => k.startsWith('budget.paperwork'))).toBe(true);
    expect([...encodeField('budget', q.budget).keys()].some((k) => k.startsWith('budget.clearances'))).toBe(true);
    expect(channelOf('unionOptions')).toBe('settings');
  });
});

describe('script clearance scan', () => {
  it('finds phone numbers, addresses, brands, websites and full names, once each', () => {
    let p = produce(newProject('S'), (d) => {
      applyImportedScript(d, parseFountain(`INT. DINER - DAY

Maya sips a Coca-Cola under a poster. A card reads 212-555-0187 and www.maya-films.com.

JOHN SMITH
Meet me at 42 Elm Street.

INT. CAR - NIGHT

She calls 212-555-0187 again.
`));
    });
    const d = derive(p.scriptDoc);
    const hits = scanScript(p, d);
    const find = (k: string) => hits.filter((h) => h.kind === k).map((h) => h.item);
    expect(find('phone')).toEqual(['212-555-0187']);
    expect(hits.find((h) => h.kind === 'phone')!.sceneIds).toHaveLength(2);
    expect(find('logo')).toEqual(['Coca-Cola']);
    expect(find('address')).toEqual(['42 Elm Street']);
    expect(find('web')).toEqual(['www.maya-films.com']);
    expect(find('name')).toEqual(['John Smith']);
    p = produce(p, (dr) => { expect(applyScan(dr, hits)).toBe(hits.length); });
    p = produce(p, (dr) => { expect(applyScan(dr, scanScript(p, d))).toBe(0); });
    expect(p.budget.clearances).toHaveLength(hits.length);
  });
});

describe('time cards', () => {
  const card = (x: Partial<TimeCard>): TimeCard => ({ id: 't', dayId: 'd', person: { kind: 'crew', id: 'k1' }, ...x });
  it('works out hours, overtime, double time and meal penalties', () => {
    expect(cardHours(card({ in: '07:00', mealOut: '13:00', mealIn: '13:30', out: '19:00' }), DEFAULT_RULES)).toMatchObject({ worked: 11.5, straight: 8, ot: 3.5, dt: 0, penalties: 0 });
    expect(cardHours(card({ in: '06:00', mealOut: '13:00', mealIn: '13:30', out: '20:00' }), DEFAULT_RULES)).toMatchObject({ worked: 13.5, ot: 4, dt: 1.5, penalties: 3 });
    // Past midnight, and no meal at all.
    expect(cardHours(card({ in: '18:00', out: '02:00' }), DEFAULT_RULES)).toMatchObject({ worked: 8, ot: 0, penalties: 4 });
    expect(cardHours(card({ in: '07:00' }), DEFAULT_RULES).complete).toBe(false);
  });

  it('fills cards from the call sheet and prices them from deal memos', () => {
    const { p, d, day } = setup();
    const cards = cardsFromCallSheet(p, d, day);
    expect(cards.map((c) => c.person.id).sort()).toEqual(['c1', 'c2', 'k1']);
    const kim = cards.find((c) => c.person.id === 'k1')!;
    expect([kim.in, kim.mealOut, kim.mealIn]).toEqual(['07:00', '13:00', '13:30']);
    const q = produce(p, (dr) => {
      dr.budget.timecards = cards.map((c) => (c.person.id === 'k1' ? { ...c, out: '19:00' } : c));
      dr.budget.paperwork = [{ ...newDoc(p, 'deal', { kind: 'crew', id: 'k1' }), deal: { rate: 800, per: 'day', kitFee: 50, contractor: true } }];
    });
    expect(cardsFromCallSheet(q, d, day)).toEqual([]);
    const kimRow = payrollRows(q).find((r) => r.ref.id === 'k1')!;
    // 800 day + 3.5 h OT at (800 / 8) × 1.5 + 50 kit.
    expect(kimRow).toMatchObject({ days: 1, hours: 11.5, ot: 3.5, gross: 800 + 3.5 * 100 * 1.5 + 50, contractor: true });
    const rows = parseCsv(payrollCsv(q));
    expect(rows[0]).toContain('Overtime hours');
    expect(parseCsv(contractorCsv(q)).map((r) => r[0])).toEqual(['Name', 'Kim Dee']);
  });
});
