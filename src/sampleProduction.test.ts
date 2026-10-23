import { describe, expect, it } from 'vitest';
import { buildSampleProduction, sampleShootDays } from './model/sampleProduction';
import { derive } from './script/derive';
import { migrate } from './store/migrate';
import { breakdownFacts } from './budget/fromBreakdown';
import { budgetView } from './budget/pipeline';
import { totals } from './budget/calc';
import { taftHartleyNeeded } from './paperwork/unions';
import { unsignedOnDay } from './paperwork/paperwork';
import { cardHours, rulesOf } from './paperwork/timecards';
import { breakdownSheetsPdf } from './pdf/breakdownPdf';
import { budgetPdf } from './pdf/budgetPdf';
import { callSheetPdf } from './pdf/callSheetPdf';
import { characterPdf } from './pdf/characterPdf';
import { doodPdf } from './pdf/doodPdf';
import { gearPdf } from './pdf/gearPdf';
import { clearanceReportPdf, paperDocPdf } from './pdf/paperworkPdf';
import { shootingSchedulePdf, stripboardPdf } from './pdf/schedulePdf';
import { screenplayPdf } from './pdf/screenplayPdf';
import { sidesPdf } from './pdf/sidesPdf';
import { storyboardPdf } from './pdf/storyboardPdf';

// The sample production is the standard test project: every section has real data in it, and the
// deliberate problems (Taft-Hartley, an unsigned release, a meal penalty, an uncleared song, a 4th
// location, two stunts) must keep showing up.
describe('sample production', () => {
  const p = buildSampleProduction();
  const d = derive(p.scriptDoc, p.sceneNumbersLocked);
  const days = sampleShootDays(p);

  it('builds a 10–12 page script with four locations and survives a save and reload', () => {
    expect(d.pageCount).toBeGreaterThanOrEqual(10);
    expect(d.pageCount).toBeLessThanOrEqual(12);
    expect(p.locations).toHaveLength(4);
    expect(migrate(JSON.parse(JSON.stringify(p)))).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it('schedules every scene: three shoot days plus a pickup day for the diner', () => {
    expect(days).toHaveLength(4);
    const scheduled = new Set(days.flatMap((x) => x.items.filter((i) => i.kind === 'scene').map((i) => (i as { sceneId: string }).sceneId)));
    expect(d.scenes.every((s) => scheduled.has(s.id))).toBe(true);
    const diner = d.scenes.find((s) => s.set === 'ROSIE\'S DINER')!;
    expect(days[3].items.some((i) => i.kind === 'scene' && i.sceneId === diner.id)).toBe(true);
    expect(Object.keys(p.callSheets)).toHaveLength(4);
  });

  it('fills every section', () => {
    expect(p.characters.length).toBeGreaterThanOrEqual(6);
    expect(p.relationships.length).toBeGreaterThan(0);
    expect(p.bible?.logline).toBeTruthy();
    expect(p.docs.length).toBeGreaterThan(0);
    expect(p.shots.length).toBeGreaterThanOrEqual(15);
    expect(p.storyboard.length).toBeGreaterThanOrEqual(6);
    expect(p.plans?.[0].elements.some((e) => e.kind === 'camera' && e.shotId)).toBe(true);
    expect(p.boards[0].items.length).toBeGreaterThan(0);
    expect(p.events.length).toBeGreaterThan(0);
    expect(p.tasks.length).toBeGreaterThan(0);
    expect(p.gear?.some((g) => g.source === 'own') && p.gear.some((g) => g.source === 'rent') && p.gear.some((g) => g.source === 'buy')).toBe(true);
    expect(p.budget.expenses.length).toBeGreaterThan(0);
    // Breakdown tags are in the script itself, not only linked by hand.
    expect(d.scenes.some((s) => s.taggedElementIds.length > 0)).toBe(true);
  });

  it('puts the stunts in the script, breakdown, schedule, budget and paperwork', () => {
    const stunts = p.elements.filter((e) => e.categoryId === 'stunts');
    expect(stunts.map((e) => e.name)).toEqual(expect.arrayContaining(['Ladder fall (Maya)', 'Truck swerve and slide (Maya driving)']));
    // Stunt performers are cast, added to their stunt scenes, and work on Day 1 (the stunt day).
    const f = breakdownFacts(p, d);
    for (const name of ['MAYA (STUNT DOUBLE)', 'STUNT DRIVER']) {
      const c = p.cast.find((x) => x.characterName === name)!;
      expect(c.union).toBe('SAG-AFTRA');
      expect(f.castWork.get(c.id)).toBe(1);
      const docs = (p.budget.paperwork ?? []).filter((x) => x.person.kind === 'cast' && x.person.id === c.id);
      expect(docs.map((x) => x.kind).sort()).toEqual(['deal', 'other', 'talent']);
      expect(docs.every((x) => x.status === 'signed')).toBe(true);
    }
    const coord = p.crew.find((c) => c.role === 'Stunt coordinator')!;
    expect(p.callSheets[days[0].id].crew.some((x) => x.crewId === coord.id)).toBe(true);
    // Their lines are in the Stunts account (3300).
    const stuntLines = p.budget.lines.filter((l) => l.accountId === 'acc-3300');
    expect(stuntLines.length).toBeGreaterThanOrEqual(3);
    expect(days[0].items.some((i) => i.kind === 'banner' && /stunt safety/i.test(i.title))).toBe(true);
  });

  it('has a realistic budget under its target, and the Micro-Budget version drops the stunts', () => {
    const t = totals(p.budget, budgetView(p, d).lines).total;
    expect(t).toBeGreaterThan(12000);
    expect(t).toBeLessThan(p.budget.targetTotal!);
    const [upa, micro] = p.budget.scenarios;
    const tu = totals(p.budget, budgetView(p, d, upa.id).lines).total;
    const tm = totals(p.budget, budgetView(p, d, micro.id).lines).total;
    expect(tu).toBeCloseTo(t);
    expect(tm).toBeLessThan(tu - 3000);
  });

  it('keeps the deliberate problems', () => {
    expect(taftHartleyNeeded(p).map((x) => x.name)).toEqual(['Lena Ortiz']);
    expect(unsignedOnDay(p, d, days[1]).map((x) => x.name)).toEqual(['Curtis Webb']);
    const pens = (p.budget.timecards ?? []).map((c) => cardHours(c, rulesOf(p)).penalties);
    expect(pens.filter((n) => n > 0)).toHaveLength(1);
    expect(p.budget.licenses[0].status).not.toBe('licensed');
    const cl = p.budget.clearances ?? [];
    expect(cl.some((c) => c.kind === 'logo' && c.status === 'replace')).toBe(true);
    expect(cl.some((c) => c.kind === 'phone')).toBe(true);
    expect(cl.filter((c) => c.kind === 'location')).toHaveLength(4);
    expect(cl.some((c) => c.kind === 'music' && c.status !== 'cleared')).toBe(true);
  });

  it('builds every PDF export', () => {
    const docs = [
      screenplayPdf(p, d), breakdownSheetsPdf(p, d), stripboardPdf(p, d), shootingSchedulePdf(p, d), doodPdf(p, d),
      callSheetPdf(p, d, days), sidesPdf(p, d, days), storyboardPdf(p, d, new Map(), p.storyboardSettings),
      budgetPdf(p, d), gearPdf(p, d), clearanceReportPdf(p, d), characterPdf(p, d, p.characters),
      paperDocPdf(p, p.budget.paperwork!.find((x) => x.kind === 'other')!),
    ];
    for (const doc of docs) expect(doc.getNumberOfPages()).toBeGreaterThan(0);
  });
});
