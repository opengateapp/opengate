import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { newProject } from './model/defaults';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { moveScenes } from './schedule/engine';
import { autofillCallSheet, ensureLayout, resolveCallSheet, infoValue, advanceSchedule, callDayLabel, SECTION_TEMPLATES } from './schedule/callsheet';
import { callSheetPdf } from './pdf/callSheetPdf';

function setup() {
  let p = produce(newProject('Reel'), (d) => { applyImportedScript(d, parseFountain(SAMPLE_FOUNTAIN)); });
  const d = derive(p.scriptDoc);
  p = produce(p, (dr) => {
    dr.production.producer = 'Alex Pitt';
    dr.production.director = 'Kyle Cameron';
    dr.production.company = 'Trillion Watts Media';
    dr.crew.push({ id: 'c1', name: 'Kyle Cameron', role: 'Director', phone: '300-555-5552', dailyDefault: true });
    moveScenes(dr.schedule, [d.scenes[0].id, d.scenes[1].id], dr.schedule.days[0].id);
    moveScenes(dr.schedule, [d.scenes[4].id], dr.schedule.days[2].id);
    dr.schedule.days[0].times.generalCall = '09:00';
    dr.schedule.days[0].times.lunch = '13:30';
  });
  return { p, d, day: p.schedule.days[0] };
}

describe('call sheet page layout', () => {
  it('fills the header from production info with default sections', () => {
    const { p, d, day } = setup();
    const cs = autofillCallSheet(p, d, day);
    expect(cs.fileName).toBe('Call sheet – Day 1');
    expect(cs.productionTitle).toBe('The Last Reel');
    expect(cs.companyInfo).toBe('Trillion Watts Media');
    expect(cs.keyContacts!.map((c) => [c.role, c.name, c.phone])).toEqual([['Producer', 'Alex Pitt', ''], ['Director', 'Kyle Cameron', '300-555-5552'], ['1st AD', '', '']]);
    expect(cs.sections!.map((s) => s.kind)).toEqual(['scenes', 'cast', 'notes', 'crew']);
  });
  it('upgrades sheets saved before the layout existed without losing edits', () => {
    const { p, d, day } = setup();
    const old = { ...autofillCallSheet(p, d, day), notes: 'Walkies ch 2' };
    delete old.sections; delete old.infoRows; delete old.keyContacts; delete old.fileName;
    const up = ensureLayout(p, day, old);
    expect(up.notes).toBe('Walkies ch 2');
    expect(up.sections).toHaveLength(4);
    expect(up.infoRows!.length).toBeGreaterThan(3);
  });
  it('shows live values in blank info rows', () => {
    const { p, d, day } = setup();
    const p2 = produce(p, (dr) => { dr.callSheets[day.id] = { ...autofillCallSheet(p, d, day), weatherTemp: '30°', weatherCondition: 'Rain', coords: '43.65, -79.38' }; });
    const r = resolveCallSheet(p2, d, p2.schedule.days[0]);
    const row = (bind: string) => r.sheet.infoRows!.find((x) => x.bind === bind)!;
    expect(infoValue(row('lunch'), r, day)).toBe('1:30 PM');
    expect(infoValue(row('weather'), r, day)).toBe('30°, Rain');
    expect(infoValue(row('sunrise'), r, day)).toMatch(/AM$/);
    expect(infoValue({ ...row('lunch'), value: '12PM' }, r, day)).toBe('12PM');
  });
  it('finds the next shoot day for the advance schedule and labels the call day', () => {
    const { p, d, day } = setup();
    const adv = advanceSchedule(p, d, day)!;
    expect(adv.number).toBe(2);
    expect(adv.scenes.map((s) => s.number)).toEqual(['5']);
    expect(callDayLabel('2026-10-18', new Date(2026, 9, 17))).toBe('TOMORROW');
    expect(callDayLabel('2026-10-17', new Date(2026, 9, 17))).toBe('TODAY');
  });
  it('prints custom sections and skips hidden ones', () => {
    const { p, d, day } = setup();
    const walkies = SECTION_TEMPLATES.find((t) => t.label === 'Walkie channels')!.make();
    const p2 = produce(p, (dr) => {
      const cs = autofillCallSheet(p, d, day);
      cs.sections!.push(walkies, { id: 'adv', kind: 'advance', title: 'Advance schedule' });
      cs.sections!.find((s) => s.kind === 'crew')!.hidden = true;
      dr.callSheets[day.id] = cs;
    });
    const doc = callSheetPdf(p2, d, [p2.schedule.days[0]]);
    const text = (doc.output() as string);
    expect(text).toContain('WALKIE CHANNELS');
    expect(text).toContain('ADVANCE SCHEDULE');
    expect(text).not.toContain('(CREW)');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
