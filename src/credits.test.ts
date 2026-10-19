import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { buildCredits, defaultCredits, departmentOf, visibleBlocks } from './credits/credits';
import { creditsCsv, creditsFcpxml, creditsJsx, creditsText } from './credits/exportCredits';
import { newLicense } from './budget/licenses';
import { parseCsv } from './budget/expenses';

function project() {
  return produce(newProject('The Last Reel'), (d) => {
    applyImportedScript(d, parseFountain(SAMPLE_FOUNTAIN));
    d.production.director = 'Ana Ruiz'; d.production.company = 'Drive-In Films'; d.production.producer = 'Sam Lee';
    d.cast = [
      { id: 'c1', castNumber: 1, characterName: 'MAYA', actorName: 'Jo Park', unavailable: [] },
      { id: 'c2', castNumber: 2, characterName: 'THEO', actorName: 'Lou Grant & Co <Jr>', unavailable: [] },
    ];
    d.crew = [
      { id: 'k1', name: 'Kim Dee', role: 'Director of Photography' }, { id: 'k2', name: 'Al Ray', role: '1st AC' },
      { id: 'k3', name: 'Gus Fern', role: 'Gaffer' }, { id: 'k4', name: 'Pat Moss', role: 'Best Boy Grip' },
      { id: 'k5', name: 'Rae Cole', role: 'Art Director' }, { id: 'k6', name: 'Max Bo', role: '1st AD' },
      { id: 'k7', name: 'Ivy Lu', role: 'Sound Designer' }, { id: 'k8', name: 'Ned', role: '' },
    ];
    d.budget.licenses = [{ ...newLicense('music'), id: 'm1', title: 'Night Drive', writers: 'A. Writer', performer: 'The Band', label: 'Indie', status: 'licensed' }];
  });
}

describe('end credits', () => {
  it('sorts crew roles into departments', () => {
    expect(departmentOf('1st AC')).toBe('camera');
    expect(departmentOf('Gaffer')).toBe('electric');
    expect(departmentOf('Best Boy Grip')).toBe('grip');
    expect(departmentOf('Art Director')).toBe('art');
    expect(departmentOf('Director of Photography')).toBe('camera');
    expect(departmentOf('1st AD')).toBe('direction');
    expect(departmentOf('Sound Designer')).toBe('post');
    expect(departmentOf('Boom Operator')).toBe('sound');
    expect(departmentOf('Stunt Coordinator')).toBe('stunts');
    expect(departmentOf('Casting Director')).toBe('casting');
    expect(departmentOf('')).toBe('other');
  });

  it('builds blocks from the project, and applies order, hiding and renaming', () => {
    const p = project();
    const d = derive(p.scriptDoc);
    const blocks = buildCredits(p, d);
    expect(blocks.map((b) => b.id).slice(0, 3)).toEqual(['cards', 'cast', 'crew-direction']);
    expect(blocks.find((b) => b.id === 'cast')!.lines.map((l) => `${l.role}|${l.name}`)).toEqual(['Maya|Jo Park', 'Theo|Lou Grant & Co <Jr>']);
    expect(blocks.find((b) => b.id === 'music')!.lines[0].name).toContain('“Night Drive”');
    expect(blocks.find((b) => b.id === 'crew-other')!.lines[0].name).toBe('Ned');
    const order = blocks.map((b) => b.id);
    const q = { ...p, credits: { ...defaultCredits(), order: ['music', ...order.filter((x) => x !== 'music')], headings: { cast: 'Starring' }, hiddenBlocks: ['crew-other'], hiddenLines: ['cast|c2'] } };
    const b2 = buildCredits(q, d);
    expect(b2[0].id).toBe('music');
    expect(b2.find((b) => b.id === 'cast')!.heading).toBe('Starring');
    expect(b2.find((b) => b.id === 'cast')!.lines).toHaveLength(1);
    expect(visibleBlocks(b2).some((b) => b.id === 'crew-other')).toBe(false);
    // Without the budget, licenses stay out.
    expect(buildCredits(p, d, { includeLicenses: false }).some((b) => b.id === 'music')).toBe(false);
  });

  it('exports text, CSV, an After Effects script and FCPXML', () => {
    const p = project();
    const blocks = buildCredits(p, derive(p.scriptDoc));
    const txt = creditsText(blocks);
    expect(txt).toContain('CAST\n\nMaya\tJo Park');
    expect(txt).toContain('Directed by\nAna Ruiz');
    expect(creditsText(blocks, 'centered')).not.toContain('\t');
    const rows = parseCsv(creditsCsv(blocks));
    expect(rows[0]).toEqual(['Section', 'Role', 'Name']);
    expect(rows.some((r) => r[1] === 'Gaffer' && r[2] === 'Gus Fern')).toBe(true);
    const jsx = creditsJsx(blocks, { width: 1920, height: 1080, fps: 24, runtime: 60, title: p.title });
    expect(() => new Function(jsx)).not.toThrow(); // compiles (not run: it needs After Effects)
    for (const n of ['Jo Park', 'Kim Dee', 'Gus Fern']) expect(jsx).toContain(n);
    const x = creditsFcpxml(blocks, { width: 1920, height: 1080, fps: 24, runtime: 60, title: p.title });
    const doc = new DOMParser().parseFromString(x, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.querySelector('title')!.getAttribute('duration')).toBe('144000/2400s');
    expect(x).toContain('Lou Grant &amp; Co &lt;Jr&gt;');
    expect(creditsFcpxml(blocks, { width: 1920, height: 1080, fps: 23.976, runtime: 10, title: 'x' })).toContain('duration="240240/24000s"');
  });
});
