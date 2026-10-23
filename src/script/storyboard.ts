import type { DerivedScene, Project, Shot, StoryboardFrame } from '../model/types';
import type { Derived } from './derive';
import { newId } from '../model/ids';

// Storyboard order: scenes in script order → shots in shot-list order → frames in frame order.
// A shot belongs to the scene its script anchor is in, else the scene it was created for.

export interface BoardShot { shot: Shot; scene?: DerivedScene; frames: StoryboardFrame[] }

export function boardShots(p: Project, d: Derived): BoardShot[] {
  const anchored = new Map<string, string>();
  d.scenes.forEach((s) => s.shotIds.forEach((id) => anchored.set(id, s.id)));
  const sceneOf = (sh: Shot) => d.sceneById.get(anchored.get(sh.id) ?? sh.sceneId ?? '');
  const frames = new Map<string, StoryboardFrame[]>();
  for (const f of p.storyboard) frames.set(f.shotId, [...(frames.get(f.shotId) ?? []), f]);
  return p.shots
    .map((shot) => ({ shot, scene: sceneOf(shot), frames: (frames.get(shot.id) ?? []).sort((a, b) => a.order - b.order) }))
    .sort((a, b) => (a.scene?.index ?? 1e9) - (b.scene?.index ?? 1e9) || a.shot.order - b.shot.order);
}

/** Every frame in board order, with its shot and scene. */
export function boardFrames(p: Project, d: Derived): { frame: StoryboardFrame; shot: Shot; scene?: DerivedScene }[] {
  return boardShots(p, d).flatMap((b) => b.frames.map((frame) => ({ frame, shot: b.shot, scene: b.scene })));
}

export interface Panel { shot: Shot; frame?: StoryboardFrame; scene?: DerivedScene; /** 1-based frame number within the shot, and how many it has. */ frameNo: number; frameCount: number }

/**
 * Storyboard panels: one per frame, plus one empty panel for every shot that has no frame yet,
 * so the Shot List and the Storyboard always show the same shots (start in either tab).
 */
export function storyboardPanels(p: Project, d: Derived): Panel[] {
  return boardShots(p, d).flatMap(({ shot, scene, frames }) =>
    frames.length
      ? frames.map((frame, i) => ({ shot, frame, scene, frameNo: i + 1, frameCount: frames.length }))
      : [{ shot, scene, frameNo: 1, frameCount: 1 }]);
}

/** Shot types shown as checkboxes on a panel (template order). Codes match the Shot List. */
export const PANEL_SHOT_TYPES: { code: string; label: string }[] = [
  { code: 'ECU', label: 'ECU' }, { code: 'CU', label: 'CU' }, { code: 'MCU', label: 'MCU' },
  { code: 'MS', label: 'MS' }, { code: 'WS', label: 'LS' }, { code: 'EWS', label: 'ELS' },
];

export const shotTypeCodes = (v: string) => v.split('/').map((x) => x.trim()).filter(Boolean);

/** Adds a blank frame for the same shot right after `afterId` (or at the end of the shot); returns its id. */
export function insertFrame(dr: Project, shotId: string, afterId?: string): string {
  const mine = dr.storyboard.filter((f) => f.shotId === shotId);
  const after = mine.find((f) => f.id === afterId);
  const order = after ? after.order + 1 : Math.max(-1, ...mine.map((f) => f.order)) + 1;
  for (const f of mine) if (f.order >= order) f.order++;
  const id = newId();
  dr.storyboard.push({ id, shotId, order, rev: 0, caption: '' });
  return id;
}
