import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { parseFountain, toFountain } from './io/fountain';
import { parseFDX, toFDX } from './io/fdx';
import { classifyPlainText } from './io/classify';
import { parseHeading } from './script/heading';
import { paginate, wrap, LINES_PER_PAGE } from './script/paginate';
import { derive, normalizeCharacter, sceneNumbers } from './script/derive';
import { linesToDoc, docToBlocks, blocksToLines } from './script/schema';
import { applyImportedScript } from './io/applyImport';
import { newProject } from './model/defaults';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { moveScenes, scanConflicts, boneyard, cascade, dayNumbers, setRange, lockReport, workingDays, unschedule, swapDays } from './schedule/engine';
import { buildICS } from './schedule/ics';
import { parseEighths, formatEighths, parseClock } from './model/dates';
import { importCineSched } from './io/cinesched';
import { breakdownCsv } from './io/reports';
import type { ScriptLine } from './model/types';
import { buildDood, doodCodeFor, shootDays } from './schedule/dood';
import { autofillCallSheet, resolveCallSheet, parseCoords, sunriseSunset } from './schedule/callsheet';
import { migrate } from './store/migrate';
import { exportProjectFile, readProjectFile } from './io/files';
import { blankShot } from './tabs/ShotsTab';
import { boardFrames } from './script/storyboard';

const sampleProject = () => produce(newProject('T'), (d) => { applyImportedScript(d, parseFountain(SAMPLE_FOUNTAIN)); });

describe('scene headings', () => {
  it('parses INT/EXT, set, time and numbers', () => {
    expect(parseHeading('INT. KITCHEN - NIGHT')).toMatchObject({ intExt: 'INT', set: 'KITCHEN', time: 'NIGHT' });
    expect(parseHeading('EXT. DRIVE-IN THEATER - DUSK')).toMatchObject({ intExt: 'EXT', set: 'DRIVE-IN THEATER', time: 'DUSK' });
    expect(parseHeading('INT./EXT. CAR - MAGIC HOUR')).toMatchObject({ intExt: 'INT/EXT', time: 'DUSK' });
    expect(parseHeading('12A INT. HOUSE - DAY 12A')).toMatchObject({ number: '12A', set: 'HOUSE', time: 'DAY' });
    expect(parseHeading('EXT. PARK - DAY #4#')).toMatchObject({ number: '4', set: 'PARK' });
    expect(parseHeading('INT. HALL - CONTINUOUS').time).toBe('CUSTOM');
  });
});

describe('fountain', () => {
  it('parses the sample script', () => {
    const r = parseFountain(SAMPLE_FOUNTAIN);
    expect(r.titlePage?.title).toBe('The Last Reel');
    expect(r.lines.filter((l) => l.type === 'sceneHeading')).toHaveLength(5);
    const dual = r.lines.find((l) => l.type === 'character' && l.dual);
    expect(dual?.text).toBe('THEO');
    expect(r.lines.find((l) => l.type === 'parenthetical')?.text).toBe('(wheezing)');
    expect(r.lines.some((l) => l.type === 'transition' && l.text === 'FADE OUT.')).toBe(false); // "FADE OUT." doesn't end in TO:
  });
  it('handles forced elements, notes, boneyard and scene numbers', () => {
    const r = parseFountain('.FLASHBACK #7#\n\n!SHOUTING ACTION\n\n@McCLANE\nYippee. [[note]]\n\n> THE END <\n\n/* cut\nthis */\n\n> SMASH CUT TO:\n');
    expect(r.lines[0]).toMatchObject({ type: 'sceneHeading', text: 'FLASHBACK', sceneNumber: '7' });
    expect(r.lines[1]).toMatchObject({ type: 'action', text: 'SHOUTING ACTION' });
    expect(r.lines[2]).toMatchObject({ type: 'character', text: 'McCLANE' });
    expect(r.lines[3]).toMatchObject({ type: 'dialogue', text: 'Yippee.' });
    expect(r.lines[4]).toMatchObject({ type: 'centered', text: 'THE END' });
    expect(r.lines[5]).toMatchObject({ type: 'transition', text: 'SMASH CUT TO:' });
  });
  it('round-trips through export', () => {
    const a = parseFountain(SAMPLE_FOUNTAIN);
    const b = parseFountain(toFountain(a.lines, a.titlePage));
    expect(b.lines.map((l) => [l.type, l.text, !!l.dual])).toEqual(a.lines.map((l) => [l.type, l.text, !!l.dual]));
  });
});

describe('final draft', () => {
  const fdx = `<?xml version="1.0"?><FinalDraft><Content>
    <Paragraph Type="Scene Heading" Number="1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text>A room.</Text></Paragraph>
    <Paragraph><DualDialogue>
      <Paragraph Type="Character"><Text>ANN</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Hi.</Text></Paragraph>
      <Paragraph Type="Character"><Text>BOB</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Hey.</Text></Paragraph>
    </DualDialogue></Paragraph>
    <Paragraph Type="Scene Heading" Number="2"><Text>EXT. STREET - NIGHT</Text></Paragraph>
    <Paragraph Type="Action"><Text>Rain.</Text></Paragraph>
  </Content></FinalDraft>`;
  it('keeps scenes after dual dialogue and flags the second cue', () => {
    const r = parseFDX(fdx);
    expect(r.lines.filter((l) => l.type === 'sceneHeading').map((l) => l.sceneNumber)).toEqual(['1', '2']);
    expect(r.lines.find((l) => l.text === 'BOB')?.dual).toBe(true);
    expect(r.lines.find((l) => l.text === 'ANN')?.dual).toBeFalsy();
  });
  it('round-trips', () => {
    const r = parseFDX(fdx);
    const again = parseFDX(toFDX(r.lines, undefined, ['1', '2']));
    expect(again.lines.map((l) => [l.type, l.text, !!l.dual])).toEqual(r.lines.map((l) => [l.type, l.text, !!l.dual]));
  });
});

describe('plain text classifier', () => {
  it('detects elements from unformatted text', () => {
    const r = classifyPlainText('INT. OFFICE - DAY\n\nJane types.\nShe stops.\n\nJANE (V.O.)\n(quietly)\nNot again.\n\nCUT TO:\n\n2.\n\nEXT. ROOF - NIGHT\n\nWind.');
    expect(r.lines.map((l) => l.type)).toEqual(['sceneHeading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'sceneHeading', 'action']);
    expect(r.lines[1].text).toBe('Jane types. She stops.');
  });
});

describe('paginator', () => {
  it('wraps at the column width', () => {
    expect(wrap('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc']);
    expect(wrap('x'.repeat(12), 5)).toEqual(['xxxxx', 'xxxxx', 'xx']);
  });
  it('fills pages and splits dialogue with MORE / CONTD', () => {
    const lines: ScriptLine[] = [{ type: 'sceneHeading', text: 'INT. A - DAY' }];
    for (let i = 0; i < 24; i++) lines.push({ type: 'action', text: 'Line.' });
    lines.push({ type: 'character', text: 'BOB' });
    lines.push({ type: 'dialogue', text: 'word '.repeat(70) });
    const blocks = docToBlocks(linesToDoc(lines).toJSON());
    const pg = paginate(blocks);
    expect(pg.pages.length).toBe(2);
    expect(pg.pages[0].lines.some((l) => l.type === 'more')).toBe(true);
    expect(pg.pages[1].lines[0]).toMatchObject({ type: 'contd', text: "BOB (CONT'D)" });
    expect(pg.pages[0].lines.every((l) => l.row < LINES_PER_PAGE)).toBe(true);
  });
  it('keeps headings with the following text', () => {
    const lines: ScriptLine[] = [{ type: 'sceneHeading', text: 'INT. A - DAY' }];
    for (let i = 0; i < 26; i++) lines.push({ type: 'action', text: 'Line.' });
    lines.push({ type: 'sceneHeading', text: 'INT. B - DAY' }, { type: 'action', text: 'More.' });
    const pg = paginate(docToBlocks(linesToDoc(lines).toJSON()));
    const headB = pg.blockStart[27];
    expect(headB.page).toBe(1);
    expect(headB.row).toBe(0);
  });
  it('computes eighths per scene', () => {
    const d = derive(sampleProject().scriptDoc);
    expect(d.scenes).toHaveLength(5);
    expect(d.scenes.every((s) => s.eighths >= 1)).toBe(true);
    expect(d.pageCount).toBe(2);
    expect(d.scenes.reduce((a, s) => a + s.eighths, 0)).toBeGreaterThanOrEqual(8);
  });
});

describe('derive', () => {
  it('collects characters, sets and inherited times', () => {
    const d = derive(sampleProject().scriptDoc);
    expect(d.scenes[0].characters).toEqual(['MAYA', 'THEO']);
    expect(d.scenes[2].time).toBe('NIGHT'); // CONTINUOUS inherits from the previous scene
    expect(d.sets.map((s) => s.name)).toContain('DRIVE-IN THEATER');
    expect(normalizeCharacter("MAYA (V.O.) (CONT'D)")).toBe('MAYA');
  });
  it('numbers scenes, with A/B inserts once locked', () => {
    const blocks = docToBlocks(linesToDoc([
      { type: 'sceneHeading', text: 'INT. A', sceneNumber: '1' },
      { type: 'sceneHeading', text: 'INT. NEW' },
      { type: 'sceneHeading', text: 'INT. B', sceneNumber: '2' },
    ]).toJSON());
    expect(sceneNumbers(blocks, true)).toEqual(['1', '1A', '2']);
  });
  it('keeps scene ids when re-importing a revised draft', () => {
    const p = sampleProject();
    const before = derive(p.scriptDoc).scenes.map((s) => s.id);
    const revised = SAMPLE_FOUNTAIN.replace('INT. PICKUP TRUCK - NIGHT', 'INT. MAYA\'S PICKUP TRUCK - NIGHT');
    const p2 = produce(p, (d) => { applyImportedScript(d, parseFountain(revised)); });
    const after = derive(p2.scriptDoc).scenes.map((s) => s.id);
    expect(after[0]).toBe(before[0]);
    expect(after[3]).not.toBe(before[3]);
    expect(after[4]).toBe(before[4]);
  });
  it('exports script lines back out of the doc', () => {
    const d = derive(sampleProject().scriptDoc);
    expect(blocksToLines(d.blocks).filter((l) => l.dual)).toHaveLength(1);
  });
});

describe('schedule engine', () => {
  it('moves scenes onto days, cascades times, numbers days', () => {
    let p = sampleProject();
    const d = derive(p.scriptDoc);
    const [s1, s2] = d.scenes;
    p = produce(p, (dr) => {
      dr.schedule.days[1].times.readyToShoot = '08:00';
      moveScenes(dr.schedule, [s1.id, s2.id], dr.schedule.days[1].id);
      dr.schedule.days[1].items.splice(1, 0, { kind: 'banner', id: 'b', bannerKind: 'meal', title: 'Lunch', color: '#000', minutes: 60 });
    });
    expect(boneyard(p, d)).toHaveLength(3);
    const t = cascade(p, d, p.schedule.days[1]);
    expect(t[0].start).toBe(480);
    expect(t[1].start).toBe(t[0].end);
    expect(t[2].start).toBe(t[1].end);
    expect(t[1].end - t[1].start).toBe(60);
    expect(dayNumbers(p.schedule).get(p.schedule.days[1].id)).toBe(1);
    // Moving within the same day keeps order sane
    p = produce(p, (dr) => moveScenes(dr.schedule, [s2.id], dr.schedule.days[1].id, 0));
    expect(p.schedule.days[1].items[0]).toMatchObject({ sceneId: s2.id });
    p = produce(p, (dr) => swapDays(dr.schedule, dr.schedule.days[1].id, dr.schedule.days[2].id));
    expect(p.schedule.days[2].items).toHaveLength(3);
    p = produce(p, (dr) => unschedule(dr.schedule, [s1.id]));
    expect(boneyard(p, d)).toHaveLength(4);
  });
  it('flags cast conflicts, blackout placements, duplicates and deleted scenes', () => {
    let p = sampleProject();
    const d = derive(p.scriptDoc);
    const day = p.schedule.days[0];
    p = produce(p, (dr) => {
      dr.cast.push({ id: 'c', castNumber: 1, characterName: 'MAYA', actorName: 'A', unavailable: [{ start: day.date, end: day.date }] });
      moveScenes(dr.schedule, [d.scenes[0].id], day.id);
      dr.schedule.days[0].items.push({ kind: 'scene', sceneId: 'gone' });
      dr.schedule.days[1].blackout = true;
      moveScenes(dr.schedule, [d.scenes[4].id], dr.schedule.days[1].id);
    });
    const c = scanConflicts(p, d);
    expect(c.scenes.get(d.scenes[0].id)?.[0]).toContain('unavailable');
    expect(c.scenes.get(d.scenes[4].id)?.[0]).toContain('blackout');
    expect(c.orphans).toHaveLength(1);
  });
  it('shifts the schedule with the start date without dropping strips', () => {
    let p = sampleProject();
    const d = derive(p.scriptDoc);
    p = produce(p, (dr) => moveScenes(dr.schedule, [d.scenes[0].id], dr.schedule.days[2].id));
    const oldDate = p.schedule.days[2].date;
    p = produce(p, (dr) => setRange(dr.schedule, '2030-01-01', '2030-01-20', 'shift'));
    expect(p.schedule.days[0].date).toBe('2030-01-01');
    expect(p.schedule.days.find((x) => x.items.length)?.date).toBe('2030-01-03');
    expect(oldDate).not.toBe('2030-01-03');
  });
  it('reports lock changes per actor', () => {
    let p = sampleProject();
    const d = derive(p.scriptDoc);
    p = produce(p, (dr) => { moveScenes(dr.schedule, [d.scenes[0].id], dr.schedule.days[0].id); });
    p = produce(p, (dr) => { dr.schedule.lock = { lockedAt: '', workingDays: workingDays(p, d) }; });
    p = produce(p, (dr) => { moveScenes(dr.schedule, [d.scenes[0].id], dr.schedule.days[3].id); });
    const r = lockReport(p, d);
    expect(r.find((x) => x.character === 'MAYA')).toMatchObject({ added: [p.schedule.days[3].date], removed: [p.schedule.days[0].date] });
  });
  it('builds an iCalendar file', () => {
    let p = sampleProject();
    const d = derive(p.scriptDoc);
    p = produce(p, (dr) => { moveScenes(dr.schedule, [d.scenes[0].id], dr.schedule.days[0].id); dr.events.push({ id: 'e', date: dr.schedule.days[0].date, title: 'Tech scout', color: '#000', kind: 'scout', start: '09:00' }); });
    const ics = buildICS(p, d);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('Shoot Day 1');
    expect(ics).toContain('SUMMARY:Tech scout');
  });
});

describe('formats and reports', () => {
  it('parses page lengths and clock times', () => {
    expect(parseEighths('1 3/8')).toBe(11);
    expect(parseEighths('2.5')).toBe(20);
    expect(parseEighths('7/8')).toBe(7);
    expect(formatEighths(11)).toBe('1 3/8');
    expect(parseClock('7:30 PM')).toBe(19 * 60 + 30);
    expect(parseClock('07:05')).toBe(425);
  });
  it('exports a breakdown CSV', () => {
    const p = sampleProject();
    const csv = breakdownCsv(p, derive(p.scriptDoc));
    expect(csv.split('\r\n')[0]).toContain('Props');
    expect(csv).toContain('DRIVE-IN THEATER');
  });
  it('imports a CineSched project', () => {
    const p = importCineSched({
      projectTitle: 'CS',
      allScenes: [{ id: 'a', title: 'INT. LAB - NIGHT', sceneNumber: '2', duration: 12, estimatedTime: 90, dayNightType: 'NIGHT', cast: ['ZOE'], props: ['Beaker'] }],
      shootDays: [{ id: 'd', date: '2026-03-02T00:00:00-0800', isBlackout: false, scenes: [
        { id: 'b', title: 'EXT. PARK - DAY', sceneNumber: '1', duration: 4, estimatedTime: 30, dayNightType: 'DAY', cast: 'MAX, ZOE' },
      ], callSheet: { generalCallTime: '07:30 AM' } }],
      productionInfo: { castList: [{ id: 'x', actorName: 'Jo', characterName: 'Zoe', unavailableRanges: [] }] },
    });
    const d = derive(p.scriptDoc, p.sceneNumbersLocked);
    expect(d.scenes.map((s) => s.number)).toEqual(['1', '2']);
    expect(p.schedule.days[0].items).toHaveLength(1);
    expect(p.schedule.days[0].times.generalCall).toBe('07:30');
    expect(p.elements[0]).toMatchObject({ name: 'Beaker', categoryId: 'props' });
    expect(p.cast[0].characterName).toBe('ZOE');
  });
});

describe('pdf exports', () => {
  it('renders the screenplay, stripboard and shooting schedule', async () => {
    const { screenplayPdf } = await import('./pdf/screenplayPdf');
    const { stripboardPdf, shootingSchedulePdf } = await import('./pdf/schedulePdf');
    let p = sampleProject();
    const d = derive(p.scriptDoc);
    p = produce(p, (dr) => {
      moveScenes(dr.schedule, d.scenes.slice(0, 3).map((s) => s.id), dr.schedule.days[0].id);
      dr.schedule.days[0].items.splice(1, 0, { kind: 'banner', id: 'b', bannerKind: 'meal', title: 'Lunch', color: '#18181B', minutes: 60 });
    });
    const script = screenplayPdf(p, d);
    expect(script.getNumberOfPages()).toBe(d.pageCount + 1); // + title page
    expect(stripboardPdf(p, d).getNumberOfPages()).toBe(1);
    expect(shootingSchedulePdf(p, d).output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
});

// ---- Phase 2: Day Out of Days, call sheets, paperwork PDFs, storyboard media ----

/** Sample script on a 5-day board: D1 sc 1+3, D2 sc 5, D3 sc 2, D4 empty (not a shoot day), D5 sc 4. */
const scheduledSample = () => {
  let p = sampleProject();
  const d = derive(p.scriptDoc);
  const [s1, s2, s3, s4, s5] = d.scenes;
  p = produce(p, (dr) => {
    const days = dr.schedule.days;
    dr.cast.push({ id: 'm', castNumber: 1, characterName: 'MAYA', actorName: 'Ana Ruiz', unavailable: [] });
    dr.cast.push({ id: 't', castNumber: 2, characterName: 'THEO', actorName: '', unavailable: [] });
    moveScenes(dr.schedule, [s1.id, s3.id], days[0].id);
    moveScenes(dr.schedule, [s5.id], days[1].id);
    moveScenes(dr.schedule, [s2.id], days[2].id);
    moveScenes(dr.schedule, [s4.id], days[4].id);
  });
  return { p, d };
};

describe('day out of days', () => {
  it('codes start / work / hold / finish over shoot days only', () => {
    const { p, d } = scheduledSample();
    const dood = buildDood(p, d);
    expect(dood.days.map((x) => x.number)).toEqual([1, 2, 3, 4]); // the empty calendar day is not a column
    expect(dood.rows.map((r) => r.character)).toEqual(['MAYA', 'THEO', 'SHERIFF DALE']); // roster first, then A–Z
    const theo = dood.rows.find((r) => r.character === 'THEO')!;
    expect(theo.codes).toEqual(['SW', 'H', 'W', 'WF']);
    expect(theo).toMatchObject({ work: 3, hold: 1, total: 4 });
    expect(dood.rows.find((r) => r.character === 'MAYA')!.codes).toEqual(['SW', 'W', 'W', 'WF']);
    const dale = dood.rows.find((r) => r.character === 'SHERIFF DALE')!;
    expect(dale.codes).toEqual(['', 'SWF', '', '']);
    expect(dale).toMatchObject({ work: 1, hold: 0, total: 1 });
    expect(doodCodeFor(dood, 'maya', p.schedule.days[1].id)).toBe('W');
  });
  it('turns holds off and marks unavailable dates without hiding work days', () => {
    const { p: p0, d } = scheduledSample();
    expect(buildDood(p0, d, false).rows.find((r) => r.character === 'THEO')!.codes).toEqual(['SW', '', 'W', 'WF']);
    const p = produce(p0, (dr) => {
      const t = dr.cast.find((c) => c.id === 't')!;
      t.unavailable.push({ start: dr.schedule.days[1].date, end: dr.schedule.days[2].date }); // a hold and a work day
    });
    const theo = buildDood(p, d).rows.find((r) => r.character === 'THEO')!;
    expect(theo.codes).toEqual(['SW', 'X', 'W', 'WF']);
    expect(theo.hold).toBe(0);
  });
});

describe('call sheets', () => {
  const withSetup = () => {
    const { p, d } = scheduledSample();
    return {
      d,
      p: produce(p, (dr) => {
        dr.locations.push({ id: 'l', setName: 'DRIVE-IN THEATER', realName: 'Starlite Drive-In', address: '1 Route 66' });
        dr.crew.push({ id: 'c1', name: 'Kim', role: 'Gaffer', phone: '555-0101', dailyDefault: true });
        dr.crew.push({ id: 'c2', name: 'Lee', role: 'Drone op', dailyDefault: false });
        dr.schedule.days[0].times.readyToShoot = '08:00';
        dr.schedule.days[0].times.generalCall = '07:00';
      }),
    };
  };
  it('autofills cast, daily crew and locations from the day', () => {
    const { p, d } = withSetup();
    const day = p.schedule.days[0];
    const cs = autofillCallSheet(p, d, day);
    expect(cs.locations).toMatchObject([{ name: 'Starlite Drive-In', address: '1 Route 66' }]); // sc 1 and 3 share it
    expect(cs.cast.map((c) => [c.characterName, c.actorName])).toEqual([['MAYA', 'Ana Ruiz'], ['THEO', '']]);
    expect(cs.crew).toMatchObject([{ role: 'Gaffer', name: 'Kim', phone: '555-0101', crewId: 'c1' }]);
    const r = resolveCallSheet(p, d, day);
    expect(r.stored).toBe(false);
    expect(r.dayNumber).toBe(1);
    expect(r.scenes.map((s) => s.number)).toEqual(['1', '3']);
    expect(r.scenes[0]).toMatchObject({ loc: '1', address: '1 Route 66', cast: '1, 2' });
    expect(r.cast[0]).toMatchObject({ sceneNumbers: '1', status: 'SW', onSet: '08:00', loc: '1', castNumber: 1 });
    expect(r.crew[0].call).toBe('07:00');
    expect(r.clock.lunch).toBe(parseClock(p.production.defaultLunch));
  });
  it('keeps hand edits when refreshed and reports cast added to the day later', () => {
    const { p: p0, d } = withSetup();
    const day0 = p0.schedule.days[0];
    let p = produce(p0, (dr) => {
      const cs = autofillCallSheet(p0, d, day0);
      cs.cast[0].pickup = '06:15';
      cs.cast[0].status = 'H';
      cs.cast.splice(1, 1); // THEO removed by hand
      cs.notes = 'Walkies on ch. 2';
      dr.callSheets[day0.id] = cs;
      dr.cast.find((c) => c.id === 't')!.actorName = 'Sam Oduya';
    });
    let r = resolveCallSheet(p, d, p.schedule.days[0]);
    expect(r.cast.map((c) => c.characterName)).toEqual(['MAYA']); // deletion respected
    expect(r.missingCast).toEqual(['THEO']);
    expect(r.cast[0]).toMatchObject({ pickup: '06:15', status: 'H' });
    p = produce(p, (dr) => { dr.callSheets[day0.id] = autofillCallSheet(p, d, p.schedule.days[0], p.callSheets[day0.id]); });
    r = resolveCallSheet(p, d, p.schedule.days[0]);
    expect(r.cast.map((c) => [c.characterName, c.actorName])).toEqual([['MAYA', 'Ana Ruiz'], ['THEO', 'Sam Oduya']]);
    expect(r.cast[0].pickup).toBe('06:15');
    expect(r.sheet.notes).toBe('Walkies on ch. 2');
    expect(r.crew).toHaveLength(1); // no duplicate crew rows
    expect(r.missingCast).toEqual([]);
  });
  it('parses coordinates and handles polar days for sun times', () => {
    expect(parseCoords('34.05, -118.24')).toEqual({ lat: 34.05, lon: -118.24 });
    expect(parseCoords('nope')).toBeNull();
    expect(sunriseSunset('2026-06-21', 80, 15)).toEqual({ sunrise: null, sunset: null });
    const la = sunriseSunset('2026-03-20', 34.05, -118.24);
    expect(la.sunrise).not.toBeNull();
    expect(la.sunset).not.toBeNull();
  });
  it('migrates older projects to call sheets and storyboard', () => {
    const old = { ...newProject('Old') } as Partial<ReturnType<typeof newProject>>;
    delete old.callSheets;
    delete old.storyboard;
    const p = migrate(JSON.parse(JSON.stringify(old)));
    expect(p.callSheets).toEqual({});
    expect(p.storyboard).toEqual([]);
  });
});

describe('phase 2 pdfs', () => {
  it('renders call sheets, DOOD, breakdown sheets, sides and storyboards', async () => {
    const { callSheetPdf } = await import('./pdf/callSheetPdf');
    const { doodPdf } = await import('./pdf/doodPdf');
    const { breakdownSheetsPdf } = await import('./pdf/breakdownPdf');
    const { sidesPdf, sidesPages } = await import('./pdf/sidesPdf');
    const { storyboardPdf } = await import('./pdf/storyboardPdf');
    const { p: p0, d } = scheduledSample();
    const p = produce(p0, (dr) => {
      dr.shots.push({ ...blankShot(d.scenes[0].id, 0, '1A'), id: 'sh' });
      dr.storyboard.push({ id: 'f1', shotId: 'sh', order: 0, rev: 0, caption: 'Truck rolls in' });
    });
    const days = shootDays(p).map((x) => x.day);
    expect(callSheetPdf(p, d, days).getNumberOfPages()).toBeGreaterThanOrEqual(days.length);
    expect(doodPdf(p, d).getNumberOfPages()).toBe(1);
    expect(breakdownSheetsPdf(p, d).getNumberOfPages()).toBe(d.scenes.length);
    expect(sidesPages(d, days[0])).toEqual([1]);
    expect(sidesPdf(p, d, [days[0]]).getNumberOfPages()).toBe(1);
    const allSides = sidesPages(d, days[0]).length + sidesPages(d, days[1]).length + sidesPages(d, days[2]).length + sidesPages(d, days[3]).length;
    expect(sidesPdf(p, d, days).getNumberOfPages()).toBe(allSides);
    expect(storyboardPdf(p, d, new Map()).output('arraybuffer').byteLength).toBeGreaterThan(1000);
    expect(boardFrames(p, d).map((f) => f.frame.id)).toEqual(['f1']);
  });
  it('bundles storyboard media in the project file', async () => {
    const p = produce(newProject('Media'), (dr) => {
      dr.shots.push({ ...blankShot(null, 0, '1'), id: 'sh' });
      dr.storyboard.push({ id: 'f', shotId: 'sh', order: 0, imageId: 'img1', drawingId: 'drw1', rev: 1, caption: '' });
    });
    const blobs: Record<string, Blob> = { img1: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), drw1: new Blob([new Uint8Array([4, 5])], { type: 'image/png' }) };
    const zip = await exportProjectFile(p, async (id) => blobs[id] ?? null);
    const file = new File([zip], 'm.slateline');
    const saved: { projectId: string; id: string; type: string; size: number }[] = [];
    const save = async (projectId: string, b: Blob, id: string) => { saved.push({ projectId, id, type: b.type, size: b.size }); };
    const same = await readProjectFile(file, false, save);
    expect(saved.map((s) => [s.id, s.type, s.size]).sort()).toEqual([['drw1', 'image/png', 2], ['img1', 'image/jpeg', 3]]);
    expect(saved.every((s) => s.projectId === same.id)).toBe(true);
    saved.length = 0;
    const copy = await readProjectFile(file, true, save);
    expect(copy.id).not.toBe(p.id);
    expect(copy.storyboard[0].imageId).not.toBe('img1');
    expect(saved.map((s) => s.id).sort()).toEqual([copy.storyboard[0].drawingId, copy.storyboard[0].imageId].sort());
  });
});
