import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { migrate } from './store/migrate';
import { mediaIds } from './io/files';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { characterEntries, looksInScene, newProfile, scenesFor } from './script/characters';
import { channelOf } from './sync/channels';

const sample = () => produce(newProject('x'), (dr) => { applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN)); });

describe('character profiles', () => {
  it('older projects get an empty list, and profiles sync with Write', () => {
    const old = { ...newProject('Old') } as Record<string, unknown>;
    delete old.characters;
    expect(migrate(old).characters).toEqual([]);
    expect(channelOf('characters')).toBe('write');
  });

  it('bundles portraits and continuity photos in project files', () => {
    const p = newProject('x');
    const c = newProfile('Maya');
    c.portraitId = 'face';
    c.continuity.push({ id: 'a', kind: 'wardrobe', imageId: 'coat', caption: '', sceneIds: [] }, { id: 'b', kind: 'hair', imageId: 'braid', caption: '', sceneIds: [] });
    p.characters.push(c);
    expect(mediaIds(p).sort()).toEqual(['braid', 'coat', 'face']);
  });

  it('matches profiles to script characters by name and lists the rest', () => {
    const p0 = sample();
    const d = derive(p0.scriptDoc);
    const p = produce(p0, (dr) => { dr.characters.push(newProfile(' maya ')); });
    const entries = characterEntries(p, d);
    expect(entries[0]).toMatchObject({ name: 'MAYA', profile: expect.objectContaining({ name: 'MAYA' }) });
    expect(entries[0].scenes).toBe(scenesFor(p, d, 'Maya').length);
    expect(entries[0].scenes).toBeGreaterThan(0);
    expect(entries.some((e) => e.name === 'THEO' && !e.profile)).toBe(true);
  });

  it('shows continuity looks for the scenes they are tied to', () => {
    const p0 = sample();
    const d = derive(p0.scriptDoc);
    const sc = scenesFor(p0, d, 'MAYA')[0].id;
    const p = produce(p0, (dr) => {
      const c = newProfile('MAYA');
      c.continuity.push({ id: 'a', kind: 'wardrobe', imageId: 'coat', caption: 'Rain coat', look: 'Look 1', sceneIds: [sc] });
      dr.characters.push(c);
    });
    expect(looksInScene(p, 'Maya', sc)).toEqual(['Look 1']);
    expect(looksInScene(p, 'THEO', sc)).toEqual([]);
  });

  it('builds a profile PDF', async () => {
    const { characterPdf } = await import('./pdf/characterPdf');
    const p0 = sample();
    const d = derive(p0.scriptDoc);
    const c = newProfile('MAYA');
    Object.assign(c, { race: 'Human', gender: 'Female', role: 'Protagonist', alignment: 'CG', strengths: ['Resourceful'], faults: ['Stubborn'] });
    c.info.fullName = 'Maya Alvarez';
    c.continuity.push({ id: 'a', kind: 'wardrobe', imageId: 'missing', caption: 'Rain coat', sceneIds: [] });
    const doc = characterPdf(p0, d, [c]);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });
});

describe('custom species packs', () => {
  it('round-trips through an .ogspecies file and cleans junk', async () => {
    const { exportPack, parsePackFile } = await import('./script/speciesPacks');
    const pack = { id: 'p1', name: 'Space opera', author: 'Dirk', entries: [{ name: 'Wookiee', note: 'Tall, furry' }, { name: 'Droid' }] };
    const [back] = parsePackFile(exportPack(pack));
    expect(back).toMatchObject({ name: 'Space opera', author: 'Dirk', entries: pack.entries });
    expect(parsePackFile(JSON.stringify({ name: 'x', entries: ['A', 'a', '', { name: 'B', note: 42 }] }))[0].entries).toEqual([{ name: 'A' }, { name: 'B' }]);
    expect(() => parsePackFile('not json')).toThrow();
    expect(() => parsePackFile('{"hello":1}')).toThrow();
  });
  it('skips exact duplicates and numbers clashing names', async () => {
    const { mergePacks } = await import('./script/speciesPacks');
    const a = { id: 'a', name: 'Fae', entries: [{ name: 'Pixie' }, { name: 'Sprite' }] };
    const same = { id: 'b', name: 'Fae', entries: [{ name: 'sprite' }, { name: 'pixie' }] };
    const other = { id: 'c', name: 'Fae', entries: [{ name: 'Kelpie' }] };
    const r = mergePacks([a], [same, other]);
    expect(r.added.map((x) => x.name)).toEqual(['Fae 2']);
    expect(r.packs).toHaveLength(2);
  });
  it('switched-on packs feed the species list with notes', async () => {
    const { characterOptions, defaultCharacterOptions } = await import('./script/characters');
    const pk = { id: 'mine', name: 'Mine', entries: [{ name: 'Replicant', note: 'Nexus-6' }] };
    const o = characterOptions({ characterOptions: { ...defaultCharacterOptions(), customPacks: [pk], speciesPacks: ['contemporary', 'mine'] } });
    expect(o.species).toEqual(['Human', 'Replicant']);
    expect(o.speciesNotes).toEqual({ Replicant: 'Nexus-6' });
    const off = characterOptions({ characterOptions: { ...defaultCharacterOptions(), customPacks: [pk] } });
    expect(off.species).toEqual(['Human']);
  });
});
