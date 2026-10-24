import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { derive } from './script/derive';
import { budgetView } from './budget/pipeline';
import { totals } from './budget/calc';
import { buildSampleProduction } from './model/sampleProduction';
import { newProject } from './model/defaults';
import { WORKED_EXAMPLE, addCutVersion, agreementCheck, cutSuggestions, parseLimit, workedExampleLines, workedExampleTotal } from './budget/guide';

const total = (p: ReturnType<typeof buildSampleProduction>, sc?: string) => {
  const d = derive(p.scriptDoc);
  return totals(p.budget, budgetView(p, d, sc).lines).total;
};

describe('agreement limits', () => {
  it('parses the Guilds budget strings', () => {
    expect(parseLimit('$20K')).toBe(20000);
    expect(parseLimit('$300K*')).toBe(300000);
    expect(parseLimit('$2M')).toBe(2000000);
    expect(parseLimit('varies')).toBeUndefined();
  });
  it('says when Micro-Budget no longer applies and which tier does', () => {
    const p = produce(newProject('X'), (d) => { d.production.agreement = { union: 'SAG-AFTRA', tier: 'Micro-Budget Project' }; });
    expect(agreementCheck(p, 19000)?.over).toBe(false);
    const over = agreementCheck(p, 21000)!;
    expect(over.over).toBe(true);
    expect(over.limit).toBe(20000);
    expect(over.next?.name).toBe('Short Project (SPA)');
    expect(agreementCheck(p, 120000)?.next?.name).toBe('Ultra Low Project (UPA)');
  });
  it('stays quiet without an agreement', () => {
    expect(agreementCheck(newProject('X'), 1e6)).toBeNull();
  });
});

describe('cut suggestions', () => {
  it('are ranked by money saved and can be tried as a version without touching the base', () => {
    const p = buildSampleProduction();
    const cuts = cutSuggestions(p, derive(p.scriptDoc));
    expect(cuts.length).toBeGreaterThan(1);
    for (let i = 1; i < cuts.length; i++) expect(cuts[i - 1].saves).toBeGreaterThanOrEqual(cuts[i].saves);
    const before = total(p);
    let id = '';
    const q = produce(p, (d) => { id = addCutVersion(d, cuts[0]); });
    expect(total(q)).toBe(before);
    expect(Math.abs(before - total(q, id) - cuts[0].saves)).toBeLessThanOrEqual(1);
  });
});

describe('the worked example', () => {
  it('comes to about $10,000 and explains every line', () => {
    expect(workedExampleTotal()).toBeGreaterThan(9000);
    expect(workedExampleTotal()).toBeLessThanOrEqual(10500);
    const p = newProject('X');
    const lines = workedExampleLines(p.budget.accounts);
    expect(lines).toHaveLength(WORKED_EXAMPLE.length);
    expect(lines.every((l) => l.notes?.startsWith('Worked example:'))).toBe(true);
  });
});
