import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { fovDeg, newElement, newPlan, nextCameraLetter, syncMoveFrames } from './visualize/plan';
import { planGear, syncPlanGear } from './budget/gear';
import { mediaIds } from './io/files';

describe('shot designer', () => {
  it('works out the angle of view from focal length and sensor', () => {
    expect(Math.round(fovDeg(50, 36))).toBe(40); // full frame 50mm
    expect(Math.round(fovDeg(24, 24.89))).toBe(55); // Super 35, 24mm
    expect(fovDeg(18, 36)).toBeGreaterThan(fovDeg(85, 36));
  });

  it('letters cameras A, B, C… and skips used letters', () => {
    const plan = newPlan('s1');
    plan.elements.push(newElement('camera', 0, 0, plan));
    expect(plan.elements[0].label).toBe('Camera A');
    plan.elements.push(newElement('camera', 0, 0, plan));
    expect(nextCameraLetter(plan)).toBe('C');
  });

  it('gives a moving camera a panel per position, and keeps panels you drew on', () => {
    let p = produce(newProject('x'), (d) => { syncMoveFrames(d, 'shot1', 3); });
    expect(p.storyboard.map((f) => f.caption)).toEqual(['Start', 'Move point 1', 'End']);
    p = produce(p, (d) => { d.storyboard[2].imageId = 'drawn'; syncMoveFrames(d, 'shot1', 1); });
    // The drawn-on panel stays; the blank auto one goes.
    expect(p.storyboard.map((f) => f.imageId ?? f.caption)).toEqual(['', 'drawn']);
  });

  it('puts plan cameras and lights on the gear list and keeps your choices', () => {
    let p = produce(newProject('x'), (d) => {
      const pl = newPlan('s1');
      pl.elements.push(newElement('camera', 0, 0, pl), { ...newElement('light', 1, 1, pl) }, { ...newElement('light', 2, 2, pl) });
      d.plans = [pl];
      syncPlanGear(d);
    });
    expect(planGear(p).map((g) => [g.name, g.qty])).toEqual([['Camera A package', 1], ['LED panel', 2]]);
    expect(p.gear?.length).toBe(2);
    p = produce(p, (d) => { d.gear![0].source = 'own'; d.plans![0].elements.push(newElement('actor', 3, 3, d.plans![0])); syncPlanGear(d); });
    expect(p.gear![0].source).toBe('own');
    // Rented gear has budget lines; owned doesn't.
    expect(p.budget.lines.filter((l) => l.link?.kind === 'gear').map((l) => l.link!.id)).toEqual([p.gear![1].id]);
  });

  it('bundles set drawings in project files', () => {
    const p = newProject('x');
    p.plans = [{ ...newPlan('s1'), backgroundId: 'set1' }];
    expect(mediaIds(p)).toContain('set1');
  });
});

describe('gear manifest', () => {
  it('adds up rentals, purchases and what owned gear saves, with an upkeep line', async () => {
    const { gearTotals, UPKEEP_LINE } = await import('./budget/gear');
    const p = produce(newProject('x'), (d) => {
      d.gear = [
        { id: 'a', name: 'Camera', category: 'camera', qty: 1, source: 'own', rate: 100, rateUnit: 'day', sceneIds: [], days: 5 },
        { id: 'b', name: 'Lights', category: 'lighting', qty: 2, source: 'rent', rate: 50, rateUnit: 'day', sceneIds: [], days: 2 },
        { id: 'c', name: 'Mic', category: 'sound', qty: 1, source: 'buy', rate: 300, rateUnit: 'day', sceneIds: [] },
      ];
      d.budget.ownedGearPct = 10;
      syncPlanGear(d);
    });
    const t = gearTotals(p);
    // 5 days at a 3-day rental week = 3 billed days (5 days < 7, min(5,3)=3)
    expect(t.ownSaves).toBe(300);
    expect(t.rent).toBe(200);
    expect(t.buy).toBe(300);
    expect(t.upkeep).toBe(30);
    expect(p.budget.lines.find((l) => l.id === UPKEEP_LINE)?.rate).toBe(30);
    expect(p.budget.lines.filter((l) => l.link?.kind === 'gear').map((l) => l.link!.id).sort()).toEqual(['b', 'c']);
    const off = produce(p, (d) => { d.budget.ownedGearPct = 0; syncPlanGear(d); });
    expect(off.budget.lines.some((l) => l.id === UPKEEP_LINE)).toBe(false);
  });
  it('prints a manifest, with or without costs', async () => {
    const { gearPdf } = await import('./pdf/gearPdf');
    const p = produce(newProject('x'), (d) => { d.gear = [{ id: 'b', name: 'Lights', category: 'lighting', qty: 2, source: 'rent', rate: 50, rateUnit: 'day', sceneIds: [] }]; });
    const { derive } = await import('./script/derive');
    expect(gearPdf(p, derive(p.scriptDoc)).getNumberOfPages()).toBe(1);
    expect(gearPdf(p, derive(p.scriptDoc), false).getNumberOfPages()).toBe(1);
  });
});

describe('plan as a set plan picture', () => {
  it('draws the plan with this shot’s camera highlighted at its move position', async () => {
    const { planSvg } = await import('./visualize/planImage');
    const pl = newPlan('s1');
    const a = newElement('camera', 0, 0, pl); pl.elements.push(a);
    const b = newElement('camera', 10, 0, pl); pl.elements.push(b);
    pl.elements.push(newElement('actor', 5, 5, pl), newElement('wall', 5, -5, pl));
    a.path = [{ x: 3, y: 3 }, { x: 6, y: 1 }];
    const start = planSvg(pl, a.id, 0).svg;
    expect(start).toContain('#e8730c');
    expect(start).toContain('A · 35mm');
    expect(start.match(/#9ca3af/g)!.length).toBeGreaterThan(0); // the other camera is dimmed
    const end = planSvg(pl, a.id, 2).svg;
    expect(end).toContain('rotate(-90 6 1)'); // camera A drawn at its last move point
    expect(planSvg(pl).svg).not.toContain('#9ca3af"/><polygon'); // no highlight: nothing dimmed
  });
});
