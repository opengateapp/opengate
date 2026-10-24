import { describe, expect, it } from 'vitest';
import * as c from './reference/calc';
import { FRAMEWORKS, beatPage } from './reference/story';
import { PAGES, pageById } from './reference/topics';
import { LIBRARY, learnMore } from './reference/library';
import { TOOLS } from './reference/Tools';

describe('reference calculators', () => {
  it('depth of field matches standard tables', () => {
    // 50mm f/8 full frame (CoC 0.03) focused at 10 ft: hyperfocal ≈ 10.5 m.
    const r = c.depthOfField(50, 8, 10 * c.MM_PER_FT, 0.03);
    expect(r.hyperfocal / 1000).toBeCloseTo(10.47, 1);
    expect(r.near / c.MM_PER_FT).toBeCloseTo(7.75, 1);
    expect(r.far / c.MM_PER_FT).toBeCloseTo(14.1, 0);
    expect(c.depthOfField(24, 11, 5000, 0.03).far).toBe(Infinity);
    expect(c.cocFor(36)).toBe(0.03);
  });
  it('angles, crop, shutter, ND and gels', () => {
    expect(c.angleOfView(50, 36)).toBeCloseTo(39.6, 1);
    expect(c.cropFactor(36, 24)).toBe(1);
    expect(c.cropFactor(17.3, 13)).toBeCloseTo(2, 1);
    expect(1 / c.shutterSpeed(180, 24)).toBe(48);
    expect(c.shutterAngle(1 / 50, 25)).toBe(180);
    expect(c.ndStops(0.9)).toBeCloseTo(3);
    expect(c.ndTransmission(0.6)).toBeCloseTo(0.251, 2);
    // Full CTO turns daylight into roughly tungsten.
    expect(c.kelvinAfterShift(5600, 159)).toBeGreaterThan(2800);
    expect(c.kelvinAfterShift(5600, 159)).toBeLessThan(3300);
  });
  it('light, data, sound and power', () => {
    expect(c.falloff(5, 10)).toEqual({ ratio: 0.25, stops: 2 });
    expect(c.gbPerHour(800)).toBe(360);
    expect(Math.round(c.minutesOnCard(512, 490))).toBe(139);
    expect(c.dbToRatio(-6)).toBeCloseTo(0.5, 1);
    expect(c.audioMbPerMin(48000, 24, 1)).toBeCloseTo(8.64);
    expect(c.runtimeHours(98, 49, 1)).toBe(2);
    expect(c.circuitCapacityW(20, 120)).toBe(1920);
    expect(c.fmtDistance(3048, 'ft')).toBe('10′ 0″');
    expect(c.fmtDistance(Infinity, 'm')).toBe('∞');
  });
});

describe('reference content', () => {
  it('beats are in story order with sensible page targets', () => {
    for (const f of FRAMEWORKS) {
      const at = f.beats.map((b) => b.at);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(at.every((x) => x >= 0 && x <= 1)).toBe(true);
    }
    expect(beatPage({ name: 'Midpoint', at: 0.5, what: '' }, 110)).toBe(55);
    expect(beatPage({ name: 'Open', at: 0, what: '' }, 110)).toBe(1);
  });
  it('every page has a tool that exists, and links to real library topics', () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    for (const p of PAGES) {
      for (const t of p.tool ? [p.tool].flat() : []) expect(t === 'frameworks' || t === 'arcs' || t === 'faq' || !!TOOLS[t]).toBe(true);
      // Help pages (the FAQ) are about Open Gate itself: no library links.
      if (p.category !== 'help') expect(learnMore(p.topics).length).toBeGreaterThan(0);
    }
    expect(pageById('dof')?.title).toBe('Depth of field');
  });
  it('library entries are unique https links without tracking', () => {
    expect(new Set(LIBRARY.map((r) => r.id)).size).toBe(LIBRARY.length);
    for (const r of LIBRARY) { expect(r.url.startsWith('https://')).toBe(true); expect(r.url).not.toMatch(/[?&](tag|ref|aff|utm_)/); }
  });
});

describe('beats on a real script', () => {
  it('spreads beats through a short script and names the scene each lands on', async () => {
    const { produce } = await import('immer');
    const { newProject } = await import('./model/defaults');
    const { parseFountain } = await import('./io/fountain');
    const { applyImportedScript } = await import('./io/applyImport');
    const { SAMPLE_FOUNTAIN } = await import('./model/sample');
    const { derive } = await import('./script/derive');
    const { placeBeats } = await import('./reference/story');
    const p = produce(newProject('x'), (dr) => { applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN)); });
    const d = derive(p.scriptDoc);
    const placed = placeBeats(FRAMEWORKS[0], d);
    expect(new Set(placed.map((x) => x.label)).size).toBeGreaterThan(3);
    expect(placed[0].sceneId).toBe(d.scenes[0].id);
    expect(placed[placed.length - 1].sceneId).toBe(d.scenes[d.scenes.length - 1].id);
    expect(placed.find((x) => x.beat.name === 'Midpoint')!.label).toMatch(/^p\. \d\.\d$/);
  });
});
