import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildSampleProduction } from './model/sampleProduction';
import { newProject } from './model/defaults';
import { derive } from './script/derive';
import { dealFor, lineFor, lineSource, pipelineChecklist, rateFor, setRateFor } from './budget/planLinks';

const p = buildSampleProduction();

describe('Plan ↔ Budget links', () => {
  it('finds a person’s deal memo, budget line and account', () => {
    const doc = (p.budget.paperwork ?? []).find((d) => d.kind === 'deal' && d.deal && d.person.kind !== 'location')!;
    const ref = doc.person as { kind: 'cast' | 'crew'; id: string };
    expect(dealFor(p, ref)?.id).toBe(doc.id);
    const at = lineFor(p, ref)!;
    expect(at.account).toBeTruthy();
    expect(rateFor(p, ref)).toMatchObject({ rate: doc.deal!.rate, from: 'deal' });
    expect(lineSource(p, at.line)).toMatchObject({ tab: 'paperwork', docId: doc.id });
  });
  it('a rate typed in Plan goes into the deal memo, and the budget line follows', () => {
    const doc = (p.budget.paperwork ?? []).find((d) => d.kind === 'deal' && d.deal && d.person.kind !== 'location')!;
    const ref = doc.person as { kind: 'cast' | 'crew'; id: string };
    const q = produce(p, (dr) => setRateFor(dr, ref, 999));
    expect(dealFor(q, ref)!.deal!.rate).toBe(999);
    expect(lineFor(q, ref)!.line.rate).toBe(999);
  });
  it('locations: the fee and its line', () => {
    const loc = p.locations.find((l) => l.feeAmount)!;
    expect(rateFor(p, { kind: 'location', id: loc.id })).toMatchObject({ rate: loc.feeAmount, from: 'location' });
    const line = lineFor(p, { kind: 'location', id: loc.id })?.line;
    if (line) expect(lineSource(p, line)?.tab).toBe('locations');
  });
  it('the pipeline checklist says what’s missing upstream', () => {
    const empty = newProject('E');
    const items = pipelineChecklist(empty, derive(empty.scriptDoc));
    expect(items.filter((x) => !x.ok).map((x) => x.id)).toEqual(['script', 'breakdown', 'stripboard', 'crew']);
    const s = pipelineChecklist(p, derive(p.scriptDoc));
    expect(s.find((x) => x.id === 'stripboard')!.ok).toBe(true);
    expect(s.find((x) => x.id === 'deals')!.label).toMatch(/deal memo/);
  });
});
