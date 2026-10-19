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
