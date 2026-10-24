import { describe, expect, it } from 'vitest';
import { derive } from './script/derive';
import { buildSampleProduction } from './model/sampleProduction';
import { DEFAULT_HAVE, budgetToLimits, storyPrompts, writingCheck } from './budget/writingLimits';
import type { WritingPlan } from './model/types';

describe('what money buys', () => {
  it('never buys less with more money', () => {
    for (const have of [DEFAULT_HAVE, { ...DEFAULT_HAVE, gear: false, helpers: 0, unionTier: 'Ultra Low Project (UPA)' }, { ...DEFAULT_HAVE, kind: 'feature' as const, locations: ['my flat', 'a diner'] }]) {
      let prev = budgetToLimits(500, have).limits;
      for (let m = 1000; m <= 200000; m += 1500) {
        const l = budgetToLimits(m, have).limits;
        for (const k of ['shootDays', 'crew', 'speakingRoles', 'locations', 'pagesMax'] as const) expect(l[k]).toBeGreaterThanOrEqual(prev[k]);
        prev = l;
      }
    }
  });
  it('gives a $10k short a few days and a handful of people', () => {
    const l = budgetToLimits(10000, { ...DEFAULT_HAVE, locations: ['my apartment', 'a friend’s diner'] }).limits;
    expect(l.shootDays).toBeGreaterThanOrEqual(3);
    expect(l.locations).toBeGreaterThanOrEqual(2);
    expect(l.pagesMax).toBe(l.shootDays * 4);
  });
  it('costs more per day with union actors, so buys fewer days', () => {
    const a = budgetToLimits(30000, DEFAULT_HAVE).limits;
    const b = budgetToLimits(30000, { ...DEFAULT_HAVE, unionTier: 'Ultra Low Project (UPA)' }).limits;
    expect(a.shootDays + a.speakingRoles + a.crew).toBeGreaterThan(b.shootDays + b.speakingRoles + b.crew);
  });
});

describe('the script against the plan', () => {
  const p = buildSampleProduction();
  const d = derive(p.scriptDoc);
  const plan = (locations: number, roles = 20): WritingPlan => ({ money: 10000, have: DEFAULT_HAVE, on: true, perLocation: 600, limits: { shootDays: 3, crew: 4, speakingRoles: roles, locations, pagesMin: 9, pagesMax: 12, nightScenes: 1 } });
  it('counts locations, roles and nights, and flags stunts', () => {
    const c = writingCheck(p, d, plan(99));
    expect(c.locations.length).toBe(d.sets.length);
    expect(c.speakingRoles.length).toBe(d.characters.length);
    expect(c.nightSceneIds.length).toBe(d.scenes.filter((s) => s.time === 'NIGHT').length);
    expect(c.flags.map((f) => f.id)).toContain('stunts');
  });
  it('notes the scene that adds one location too many', () => {
    const c = writingCheck(p, d, plan(1));
    const note = c.notes.find((n) => n.text.startsWith('Adds location 2'));
    expect(note).toBeTruthy();
    expect(note!.text).toContain('+$600');
  });
  it('notes a speaking role past the limit', () => {
    expect(writingCheck(p, d, plan(99, 1)).notes.some((n) => n.text.includes('speaking role 2'))).toBe(true);
  });
});

describe('story prompts', () => {
  it('use what you have', () => {
    const out = storyPrompts({ ...DEFAULT_HAVE, locations: ['a diner', 'my car'], extras: ['a dog'] });
    expect(out).toHaveLength(4);
    expect(out.join(' ')).toContain('a diner');
    expect(out.join(' ')).toContain('my car');
    expect(out.join(' ')).toContain('a dog');
  });
});
