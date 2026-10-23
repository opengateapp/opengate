import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { migrate } from './store/migrate';
import { PAGES } from './reference/topics';
import { GUILDS, LEGAL_NOTE, guildForUnion } from './reference/guilds';
import { UNIONS, SAG_TIERS, castBadge } from './paperwork/unions';
import { SOCIETIES, societyLetters, withLetters } from './paperwork/societies';
import { buildCredits, defaultCredits } from './credits/credits';
import { derive } from './script/derive';
import { budgetMediaIds, mediaIds } from './io/files';
import { SECTIONS } from './App';
import { RESTRICTED, TAB_ACCESS, TAB_FOLLOWS, channelOf } from './sync/channels';

describe('Guilds & Unions reference', () => {
  const guildPages = PAGES.filter((p) => p.category === 'guilds');
  it('has a page for every guild, each with sources, a checked date and the legal note', () => {
    expect(guildPages.length).toBe(GUILDS.length);
    for (const p of guildPages) {
      expect(p.sources?.length, p.id).toBeGreaterThan(0);
      for (const s of p.sources!) expect(s.url, p.id).toMatch(/^https:\/\//);
      expect(p.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.notice).toBe(LEGAL_NOTE);
    }
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
  });
  it('is found by abbreviation, and every union in the picker has a page', () => {
    const find = (q: string) => PAGES.filter((p) => `${p.title} ${p.keywords ?? ''}`.toLowerCase().includes(q)).map((p) => p.id);
    expect(find('sag')).toContain('guild-sag-aftra');
    expect(find('asc')).toContain('guild-asc');
    expect(find('taft')).toContain('guild-taft-hartley');
    expect(find('ia ')).toContain('guild-iatse');
    for (const u of UNIONS) expect(guildForUnion(u.name), u.name).toBeTruthy();
    for (const s of SOCIETIES) expect(GUILDS.some((g) => g.id === s.id), s.id).toBe(true);
  });
  it('uses SAG-AFTRA’s current tier names (October 2026 one-sheet)', () => {
    expect(SAG_TIERS).toContain('Ultra Low Project (UPA)');
    expect(SAG_TIERS).toContain('Moderate Low (MPA)');
    expect(SAG_TIERS).toContain('Vertical Agreement');
    expect(SAG_TIERS).not.toContain('Ultra Low Budget');
  });
});

describe('societies', () => {
  const setup = () => produce(newProject('Reel'), (d) => {
    d.production.director = 'Ana Ruiz';
    d.production.producer = 'Sam Lee';
    d.cast = [{ id: 'c1', castNumber: 1, characterName: 'MAYA', actorName: 'Jo Park', unavailable: [], union: 'SAG-AFTRA', unionStatus: 'member' }];
    d.crew = [
      { id: 'k1', name: 'Kim Dee', role: 'Director of Photography', societies: ['asc', 'bsc'] },
      { id: 'k2', name: 'Ed It', role: 'Editor', societies: ['ace'] },
      { id: 'k3', name: 'Ana Ruiz', role: 'Director', societies: ['asc'] },
      { id: 'k4', name: 'Sam Lee', role: 'Producer', societies: ['pga'] },
    ];
  });
  it('writes letters in each society’s style, and p.g.a. only when certified', () => {
    const p = setup();
    expect(societyLetters(p, p.crew[0])).toEqual(['ASC', 'BSC']);
    expect(withLetters(p, 'Ed It', p.crew[1])).toBe('Ed It, ACE');
    expect(societyLetters(p, p.crew[3])).toEqual([]);
    expect(societyLetters(p, { ...p.crew[3], pgaCertified: true })).toEqual(['p.g.a.']);
  });
  it('adds letters in End credits (crew, and names typed in production info) unless switched off', () => {
    let p = setup();
    const d = derive(p.scriptDoc);
    const names = (q: typeof p) => buildCredits(q, d).flatMap((b) => b.lines.map((l) => l.name));
    expect(names(p)).toEqual(expect.arrayContaining(['Kim Dee, ASC, BSC', 'Ed It, ACE', 'Ana Ruiz, ASC', 'Sam Lee']));
    p = produce(p, (dr) => { dr.crew[3].pgaCertified = true; });
    expect(names(p)).toContain('Sam Lee, p.g.a.');
    p = produce(p, (dr) => { dr.credits = { ...defaultCredits(), noSocietyLetters: true }; });
    expect(names(p)).toContain('Kim Dee');
  });
  it('shows union and letters on call-sheet badges', () => {
    const p = produce(setup(), (d) => { d.cast[0].societies = ['csa']; });
    expect(castBadge(p, 'MAYA')).toBe('SAG-AFTRA · CSA');
  });
});

describe('agreements, migration and layout', () => {
  it('older budgets get an agreements list; agreement files stay private with the budget', () => {
    const old = JSON.parse(JSON.stringify(newProject('Old')));
    delete old.budget.agreements;
    expect(migrate(old).budget.agreements).toEqual([]);
    const p = produce(newProject('A'), (d) => { d.budget.agreements = [{ id: 'a', guildId: 'sag-aftra', title: 'ULB', fileId: 'f9', added: 'now' }]; });
    expect(budgetMediaIds(p)).toContain('f9');
    expect(mediaIds(p)).toContain('f9');
    expect(channelOf('societyOptions')).toBe('settings');
  });
  it('sections follow the pipeline, with every tab exactly once', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['write', 'visualize', 'breakdown', 'plan', 'budget', 'shoot', 'reference', 'exports', 'settings']);
    const tabs = SECTIONS.flatMap((s) => s.tabs.map((t) => t.id));
    expect(new Set(tabs).size).toBe(tabs.length);
    const of = (t: string) => SECTIONS.find((s) => s.tabs.some((x) => x.id === t))!.id;
    expect([of('shots'), of('locations'), of('paperwork'), of('sides'), of('reports'), of('gear')]).toEqual(['breakdown', 'plan', 'plan', 'shoot', 'exports', 'budget']);
  });
  it('moving tabs changed no sync channel', () => {
    const chans = Object.fromEntries(TAB_ACCESS.map((t) => [t.id, t.channels.join(',')]));
    expect(chans).toEqual({
      screenplay: 'script,screenplay', characters: 'characters', bible: 'bible', docs: 'docs', av: 'av', boards: 'boards', designer: 'designer', storyboard: 'storyboard',
      breakdown: 'breakdown', shots: 'shots', stripboard: 'schedule', contacts: 'contacts', locations: 'locations', calendar: 'calendar', tasks: 'tasks',
      budget: 'budget', gear: 'gear', callsheets: 'callsheets', settings: 'settings',
    });
    expect(TAB_FOLLOWS).toEqual({ dood: 'stripboard', sides: 'stripboard', expenses: 'budget', licenses: 'budget', paperwork: 'budget', funding: 'budget', festivals: 'budget', reports: 'stripboard' });
    expect(channelOf('locations', 2)).toBe('locations');
    expect(channelOf('shots', 2)).toBe('shots');
    expect(RESTRICTED).toEqual(['budget']);
  });
});
