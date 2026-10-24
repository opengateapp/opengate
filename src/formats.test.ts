import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { newProject } from './model/defaults';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { migrate } from './store/migrate';
import { FORMATS, drawLayer, formatOf, frameSize, guideRect } from './tabs/storyboard/formats';
import { storyboardPdf } from './pdf/storyboardPdf';
import { insertFrame } from './script/storyboard';

describe('storyboard formats', () => {
  it('sizes the frame canvas with a 1280 px long side', () => {
    expect(frameSize(16 / 9)).toEqual({ w: 1280, h: 720 });
    expect(frameSize(9 / 16)).toEqual({ w: 720, h: 1280 });
    expect(frameSize(2.39)).toEqual({ w: 1280, h: 536 });
    expect(frameSize(1.43)).toEqual({ w: 1280, h: 895 });
  });

  it('centres frame guides as the largest rectangle that fits', () => {
    // 16:9 inside a scope frame: full height, centred left-right.
    const r = guideRect(1280, 536, 16 / 9);
    expect(r.h).toBeCloseTo(536);
    expect(r.x).toBeCloseTo((1280 - 536 * (16 / 9)) / 2);
    // 2.39 inside 16:9: full width, centred top-bottom.
    const s = guideRect(1280, 720, 2.39);
    expect(s.w).toBeCloseTo(1280);
    expect(s.y).toBeCloseTo((720 - 1280 / 2.39) / 2);
  });

  it('defaults to 16:9 and keeps settings through migration', () => {
    expect(formatOf(undefined).id).toBe('16:9');
    expect(formatOf({ perPage: 2, showReference: true, format: 'nope' }).id).toBe('16:9');
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length);
    const p = produce(newProject('F'), (d) => { d.storyboardSettings = { perPage: 2, showReference: true, format: '2.39', guides: ['16:9', '9:16'], guidesInPrint: false }; });
    expect(migrate(JSON.parse(JSON.stringify(p))).storyboardSettings).toEqual(p.storyboardSettings);
  });

  it('fits a drawing of another shape instead of stretching it', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...a: unknown[]) => calls.push((a.slice(1) as number[]).map((n) => Math.round(n))) } as unknown as CanvasRenderingContext2D;
    drawLayer(ctx, { width: 1280, height: 720 } as HTMLImageElement, 1280, 720);
    drawLayer(ctx, { width: 1280, height: 720 } as HTMLImageElement, 720, 1280);
    expect(calls[0]).toEqual([0, 0, 1280, 720]);
    expect(calls[1]).toEqual([0, 438, 720, 405]); // 16:9 drawing fitted into a vertical frame
  });

  it('builds the PDF for vertical and scope storyboards', () => {
    const p = produce(newProject('F'), (d) => { applyImportedScript(d, parseFountain(SAMPLE_FOUNTAIN)); });
    const d = derive(p.scriptDoc);
    for (const format of ['9:16', '2.39'])
      for (const perPage of [1, 2, 3, 4] as const) {
        const doc = storyboardPdf(p, d, new Map(), { perPage, showReference: true, format });
        expect(doc.getNumberOfPages()).toBeGreaterThan(0);
      }
  });

  it('inserts a new frame right after the current one in the same shot', () => {
    let p = newProject('F');
    let id = '';
    p = produce(p, (dr) => { dr.storyboard.push({ id: 'a', shotId: 's', order: 0, rev: 0, caption: '' }, { id: 'b', shotId: 's', order: 1, rev: 0, caption: '' }, { id: 'x', shotId: 't', order: 0, rev: 0, caption: '' }); });
    p = produce(p, (dr) => { id = insertFrame(dr, 's', 'a'); });
    const order = p.storyboard.filter((f) => f.shotId === 's').sort((a, b) => a.order - b.order).map((f) => f.id);
    expect(order).toEqual(['a', id, 'b']);
    expect(p.storyboard.find((f) => f.id === 'x')!.order).toBe(0);
    p = produce(p, (dr) => { id = insertFrame(dr, 's'); });
    expect(p.storyboard.find((f) => f.id === id)!.order).toBe(3);
  });
});

describe('onion-skin ghost poses inside one frame', () => {
  it('fades older ghosts more, and keeps the newest at the chosen fade', async () => {
    const { ghostAlpha } = await import('./tabs/storyboard/formats');
    expect(ghostAlpha(0, 1, 0.4)).toBeCloseTo(0.4);
    expect(ghostAlpha(0, 3, 0.4)).toBeLessThan(ghostAlpha(1, 3, 0.4));
    expect(ghostAlpha(2, 3, 0.4)).toBeCloseTo(0.4);
  });

  it('keeps ghost drawings with the project media, and survives a reload', async () => {
    const { mediaIds } = await import('./io/files');
    const p = produce(newProject('G'), (d) => { d.storyboard.push({ id: 'f', shotId: 's', order: 0, rev: 0, caption: '', drawingId: 'now', ghosts: [{ id: 'g1', drawingId: 'pose1' }, { id: 'g2', drawingId: 'pose2' }], ghostFade: 0.5 }); });
    expect(mediaIds(p)).toEqual(expect.arrayContaining(['now', 'pose1', 'pose2']));
    expect(migrate(JSON.parse(JSON.stringify(p))).storyboard[0]).toEqual(p.storyboard[0]);
  });

  it('the sample production shows motion in one frame instead of two', async () => {
    const { buildSampleProduction } = await import('./model/sampleProduction');
    const p = buildSampleProduction();
    const shotId = p.shots.find((s) => s.shotNumber === '12A')!.id;
    const frames = p.storyboard.filter((f) => f.shotId === shotId);
    expect(frames).toHaveLength(1);
    expect(frames[0].caption).toMatch(/ghosts/);
  });
});
