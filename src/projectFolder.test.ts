import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildSampleProduction } from './model/sampleProduction';
import { newProject } from './model/defaults';
import { derive } from './script/derive';
import { readProjectFile } from './io/files';
import { setChannelFormat } from './sync/channels';
import { useSync } from './sync/state';
import { Cancelled, WARN_BYTES, buildProjectFolder, defaultSelection, likelySize, mediaSizes, projectFolderName, safeSegment, type FolderOptions } from './io/projectFolder/build';
import { availableItems, ITEMS, limitedAccess } from './io/projectFolder/items';
import { DOCUMENT_FOLDERS, LAYOUTS, layoutById, topFolders } from './io/projectFolder/layouts';
import type { Project } from './model/types';

vi.mock('./store/media', async (orig) => ({ ...(await orig<object>()), getMedia: async () => null }));

const DOT = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const render = async () => DOT;
const sample = (): Project => JSON.parse(JSON.stringify(buildSampleProduction()));
const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

async function build(p: Project, o: Partial<FolderOptions> = {}) {
  const d = derive(p.scriptDoc, p.sceneNumbersLocked);
  const selected = o.selected ?? new Set(availableItems(p, d).filter((s) => !s.empty).map((s) => s.item.id));
  const r = await buildProjectFolder(p, d, { layout: LAYOUTS[0], selected, render, media: async () => null, now: new Date('2026-11-03T12:00:00Z'), ...o });
  const zip = await JSZip.loadAsync(r.blob);
  return { ...r, zip, names: Object.keys(zip.files), read: (n: string) => zip.files[n].async('string') };
}

afterEach(() => { useSync.setState({ write: null, admin: false, budget: true, hidden: undefined }); setChannelFormat(1); });

describe('Export everything', () => {
  it('builds every file from the sample into its folder, for each layout, with the empty folders', async () => {
    for (const layout of LAYOUTS) {
      const { names, name, skipped } = await build(sample(), { layout });
      expect(name).toBe('The Last Reel.zip');
      expect(skipped).toEqual([]);
      const top = 'The Last Reel/';
      expect(names.every((n) => n.startsWith(top))).toBe(true);
      for (const f of layout.folders) expect(names).toContain(`${top}${f}/`);
      for (const f of DOCUMENT_FOLDERS) expect(names).toContain(`${top}${layout.documents}/${f}/`);
      const docs = `${top}${layout.documents}/`;
      for (const f of ['SCRIPTS/Screenplay.pdf', 'SCRIPTS/Screenplay.fountain', 'SCRIPTS/Screenplay.fdx', 'SCRIPTS/Sides - all days.pdf', 'CHARACTERS/Character profiles.pdf', 'STORYBOARDS/Storyboard.pdf', 'SHOT_LISTS/Shot list.csv', 'SHOT_LISTS/Shot list.xlsx', 'BREAKDOWN/Breakdown sheets.pdf', 'BREAKDOWN/Breakdown report.csv', 'SCHEDULE/Stripboard.pdf', 'SCHEDULE/Shooting schedule.pdf', 'SCHEDULE/Day Out of Days.pdf', 'SCHEDULE/Calendar.ics', 'CONTACTS/Contacts.csv', 'CONTACTS/Contacts.vcf', 'LOCATIONS/Locations.csv', 'BUDGET/Budget.pdf', 'BUDGET/Budget.xlsx', 'BUDGET/Expenses.csv', 'BUDGET/Gear.csv', 'BUDGET/Gear manifest.pdf', 'RELEASE/END_CREDITS/End credits.pdf', 'RELEASE/END_CREDITS/End credits.fcpxml', 'RELEASE/PRESS_KIT/Press kit.pdf', 'RELEASE/PRESS_KIT/Press kit.html', 'RELEASE/Festivals.csv', 'RELEASE/SOCIAL/calendar.csv']) {
        expect(names).toContain(docs + f);
      }
      expect(names).toContain(`${top}The Last Reel.opengate`);
      expect(names).toContain(`${top}READ ME.txt`);
      expect(names.some((n) => /CALL_SHEETS\/Day 01 - \d{4}-\d\d-\d\d\.pdf$/.test(n))).toBe(true);
    }
  });

  it('the project file is a separate copy with no share data, and reopens', async () => {
    const p: Project = { ...sample(), share: { relay: 'r', roomId: 'room', key: 'SECRET-KEY' } as never, boards: [{ id: 'b', title: 'B', kind: 'mood', items: [], roomId: 'live-room', updatedAt: '' }] };
    const { zip } = await build(p);
    const blob = await zip.files['The Last Reel/The Last Reel.opengate'].async('blob');
    const inner = await JSZip.loadAsync(blob);
    expect(Object.keys(inner.files).some((n) => n.startsWith('sync/'))).toBe(false);
    const json = await inner.files['project.json'].async('string');
    expect(json).not.toContain('SECRET-KEY');
    expect(json).not.toContain('live-room');
    const back = await readProjectFile(new File([blob], 'x.opengate'), false, async () => {}, async () => {});
    expect(back.share).toBeUndefined();
    expect(back.id).not.toBe(p.id);
    expect(back.title).toBe(p.title);
  });

  it('without the budget: no budget or paperwork, no fees, no project file, and READ ME says why', async () => {
    useSync.setState({ write: ['script'], admin: false, budget: false });
    expect(limitedAccess()).toBe(true);
    const { names, read } = await build(sample());
    const has = (s: string) => names.some((n) => n.includes(s) && !n.endsWith('/'));
    for (const hidden of ['Budget.pdf', 'Expenses.csv', 'Gear.csv', 'Payroll.csv', 'Cue sheet.csv', '.opengate']) expect(has(hidden)).toBe(false);
    expect(names).toContain('The Last Reel/06_DOCUMENTS/BUDGET/');
    expect(has('Gear manifest.pdf')).toBe(true);
    expect(await read('The Last Reel/READ ME.txt')).toMatch(/project file was left out/);
    const loc = await read('The Last Reel/06_DOCUMENTS/LOCATIONS/Locations.csv');
    expect(loc.split('\r\n')[0]).not.toContain('Fee');
    expect((await read('The Last Reel/06_DOCUMENTS/RELEASE/Festivals.csv')).split('\r\n')[0]).not.toContain('Fee paid');
  });

  it('a hidden tab leaves its files out', async () => {
    setChannelFormat(2);
    useSync.setState({ write: ['tasks'], admin: false, budget: true, hidden: ['callsheets', 'contacts'] });
    const { names } = await build(sample());
    expect(names.some((n) => /Day 01/.test(n))).toBe(false);
    expect(names.some((n) => /Contacts\.csv/.test(n))).toBe(false);
    expect(names.some((n) => /\.opengate/.test(n))).toBe(false);
    expect(names.some((n) => /Screenplay\.pdf/.test(n))).toBe(true);
    expect(availableItems(sample(), derive(sample().scriptDoc, false)).map((s) => s.item.id)).not.toContain('callsheets');
  });

  it('awkward titles stay inside the folder', async () => {
    expect(safeSegment('..')).toBe('Untitled');
    expect(safeSegment('name. ')).toBe('name');
    expect(safeSegment('CON')).toBe('CON_');
    expect(safeSegment('aux.txt', 'x', true)).toBe('aux_.txt');
    expect(safeSegment('a'.repeat(200) + '.pdf', 'x', true)).toBe('a'.repeat(76) + '.pdf');
    expect(projectFolderName('')).toBe('Untitled Project');
    expect(projectFolderName('   ')).toBe('Untitled Project');
    expect(projectFolderName('../x')).toBe('x');
    expect(projectFolderName('a/b')).toBe('ab');
    expect(projectFolderName('Café Noir')).toBe('Café Noir');
    for (const [title, top] of [['../x', 'x'], ['CON', 'CON_'], ['a/b', 'ab'], ['', 'Untitled Project'], ['Café', 'Café']] as const) {
      const { names, name } = await build({ ...newProject(title), title });
      expect(name).toBe(`${top}.zip`);
      expect(names.every((n) => n.startsWith(`${top}/`) && !n.split('/').includes('..'))).toBe(true);
    }
  });

  it('same-named files get a number, and titles can\'t add folders', async () => {
    const p = sample();
    p.docs = [{ id: '1', title: 'Notes', doc: p.docs[0]?.doc, updatedAt: '' }, { id: '2', title: 'notes', doc: p.docs[0]?.doc, updatedAt: '' }, { id: '3', title: 'Notes', doc: p.docs[0]?.doc, updatedAt: '' }, { id: '4', title: '../../evil', doc: p.docs[0]?.doc, updatedAt: '' }];
    const { names } = await build(p);
    const docs = names.filter((n) => n.includes('TREATMENTS_AND_NOTES/') && n.endsWith('.html')).map((n) => n.split('TREATMENTS_AND_NOTES/')[1]);
    expect(docs.sort()).toEqual(['evil.html', 'Notes (3).html', 'Notes.html', 'notes (2).html'].sort());
  });

  it('a failing item is listed, on screen and in READ ME, and the rest still build', async () => {
    const { skipped, names, read, included } = await build(sample(), { render: async () => { throw new Error('No canvas here'); } });
    expect(skipped).toEqual([{ label: 'Storyboard PDF', reason: 'No canvas here' }]);
    expect(await read('The Last Reel/READ ME.txt')).toMatch(/Storyboard PDF: No canvas here/);
    expect(names.some((n) => n.endsWith('Storyboard.pdf'))).toBe(false);
    expect(names.some((n) => n.endsWith('Screenplay.pdf'))).toBe(true);
    expect(included.length).toBeGreaterThan(20);
  });

  it('a new empty project still gives the folders, the project file and READ ME', async () => {
    const p = newProject('New film');
    const d = derive(p.scriptDoc, p.sceneNumbersLocked);
    const states = availableItems(p, d);
    expect(states.find((s) => s.item.id === 'callsheets')!.empty).toBe('No shoot days yet');
    expect(states.find((s) => s.item.id === 'script-pdf')!.empty).toBe('The script is empty');
    const { names, skipped } = await build(p);
    expect(skipped).toEqual([]);
    expect(names).toContain('New film/06_DOCUMENTS/CALL_SHEETS/');
    expect(names).toContain('New film/00_MEDIA/CAMERA/');
    expect(names).toContain('New film/New film.opengate');
    expect(names.filter((n) => !n.endsWith('/') && n.includes('06_DOCUMENTS') && !n.includes('PRESS_KIT'))).toEqual([]);
  });

  it('copies media, draws frames and exports drafts', async () => {
    const p = sample();
    p.storyboard = p.storyboard.slice(0, 2).map((f) => ({ ...f, imageId: 'art' }));
    p.locations[0].photoIds = ['ph1', 'gone', 'ph2'];
    p.boards = [{ id: 'b', title: 'Look/feel', kind: 'mood', updatedAt: '', items: [{ id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, z: 0, imageId: 'img' } as never] }, { id: 's', title: 'Map', kind: 'story', updatedAt: '', items: [{ id: 'i', type: 'image', x: 0, y: 0, w: 1, h: 1, z: 0, imageId: 'map' } as never] }];
    p.drafts = [{ id: 'n', name: 'Blue pass', createdAt: '2026-01-02T00:00:00Z', data: `j:${JSON.stringify(p.scriptDoc)}`, pages: 1, scenes: 1, words: 1 }, { id: 'a', name: 'Auto', auto: 'daily', createdAt: '2026-01-03T00:00:00Z', data: `j:${JSON.stringify(p.scriptDoc)}`, pages: 1, scenes: 1, words: 1 }];
    const d = derive(p.scriptDoc, p.sceneNumbersLocked);
    const states = availableItems(p, d);
    const selected = defaultSelection(states, new Map());
    expect(selected.has('drafts-auto')).toBe(false);
    const { names } = await build(p, { selected, media: async (id) => (id === 'gone' ? null : png()) });
    expect(names.filter((n) => n.includes('FRAMES/') && n.endsWith('.jpg'))).toHaveLength(2);
    expect(names.filter((n) => n.includes('FRAMES/')).some((n) => /Scene .+ - Shot .+\.jpg$/.test(n))).toBe(true);
    const loc = (p.locations[0].realName);
    expect(names).toContain(`The Last Reel/06_DOCUMENTS/LOCATIONS/PHOTOS/${loc}/Photo 1.png`);
    expect(names).toContain(`The Last Reel/06_DOCUMENTS/LOCATIONS/PHOTOS/${loc}/Photo 3.png`);
    expect(names).toContain('The Last Reel/06_DOCUMENTS/REFERENCE/Lookfeel/Image 1.png');
    expect(names.some((n) => n.includes('REFERENCE/Map'))).toBe(false);
    expect(names).toContain('The Last Reel/06_DOCUMENTS/SCRIPTS/DRAFTS/Blue pass 2026-01-02.fountain');
    expect(names).toContain('The Last Reel/06_DOCUMENTS/SCRIPTS/DRAFTS/Blue pass 2026-01-02.pdf');
    expect(names.some((n) => n.includes('DRAFTS/Auto'))).toBe(false);
  });

  it('stores binaries and compresses text', async () => {
    const { zip } = await build(sample());
    const big = 'The Last Reel/06_DOCUMENTS/SCRIPTS/Screenplay.fountain';
    const raw = await zip.files[big].async('uint8array');
    const stats = (zip.files[big] as unknown as { _data: { compressedSize: number } })._data;
    expect(stats.compressedSize).toBeLessThan(raw.length);
    const pdf = 'The Last Reel/06_DOCUMENTS/SCRIPTS/Screenplay.pdf';
    const pdfRaw = await zip.files[pdf].async('uint8array');
    expect((zip.files[pdf] as unknown as { _data: { compressedSize: number } })._data.compressedSize).toBe(pdfRaw.length);
  });

  it('cancelling stops the build', async () => {
    const ctl = new AbortController();
    const p = sample();
    await expect(build(p, { signal: ctl.signal, onProgress: (x) => { if (x.done === 2) ctl.abort(); } })).rejects.toBeInstanceOf(Cancelled);
    const late = new AbortController();
    await expect(build(p, { signal: late.signal, onProgress: (x) => { if (x.label === 'Packing the ZIP') late.abort(); } })).rejects.toBeInstanceOf(Cancelled);
  });

  it('sizes known media and leaves big deliverables unticked', async () => {
    const p = sample();
    p.deliverables = [{ id: 'x', name: 'Master', group: 'picture', status: 'done', fileId: 'huge', fileName: 'master.mov' }];
    const sizes = await mediaSizes(p, async (id) => (id === 'huge' ? { size: WARN_BYTES + 1 } as Blob : null));
    expect(sizes.get('deliverables')).toBe(WARN_BYTES + 1);
    const d = derive(p.scriptDoc, p.sceneNumbersLocked);
    const on = defaultSelection(availableItems(p, d), sizes);
    expect(on.has('deliverables')).toBe(false);
    expect(on.has('project-file')).toBe(true);
    expect(likelySize(sizes, new Set(['deliverables']))).toBe(WARN_BYTES + 1);
  });

  it('layouts match the Project Folders presets; every item points at a known folder', () => {
    expect(LAYOUTS.map((l) => l.label)).toEqual(['General Video', 'Resolve Cloud Team', 'Classic']);
    expect(layoutById('nope').id).toBe('general');
    expect(topFolders(layoutById('classic'))).toEqual(['VIDEO', 'AUDIO', 'GRAPHICS', 'PHOTOS', 'TIMELINES', 'DOCUMENTS']);
    const roots = new Set(DOCUMENT_FOLDERS.map((f) => f.split('/')[0]));
    for (const i of ITEMS) if (i.folder) expect(roots).toContain(i.folder.split('/')[0]);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });
});
