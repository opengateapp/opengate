import { describe, expect, it } from 'vitest';
import { SAMPLE_TOUR } from './tour/sampleTour';
import { SECTIONS } from './App';
import { buildSampleProduction } from './model/sampleProduction';

describe('the sample tour', () => {
  it('opens real tabs, in pipeline order, and stops at the problems', () => {
    const tabs = SECTIONS.flatMap((s) => s.tabs.map((t) => t.id as string));
    for (const s of SAMPLE_TOUR) expect(tabs).toContain(s.tab);
    expect(new Set(SAMPLE_TOUR.map((s) => s.id)).size).toBe(SAMPLE_TOUR.length);
    expect(SAMPLE_TOUR.filter((s) => s.problem).map((s) => s.id)).toEqual(['taft', 'release', 'meal', 'location', 'song', 'social', 'scope']);
  });
  it('the sample says it is the sample (so the tour is offered)', () => {
    expect(buildSampleProduction().isSample).toBe(true);
  });
});
