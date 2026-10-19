import type { Draft } from 'immer';
import type { PlanElement, PlanElementKind, Project, ScenePlan } from '../model/types';
import { newId } from '../model/ids';

// Shot designer helpers: sensors, lens angles, new elements.

/** Sensor sizes in millimetres (width × height of the image area). */
export const SENSORS: { id: string; label: string; w: number; h: number }[] = [
  { id: 'ff', label: 'Full frame (36 × 24)', w: 36, h: 24 },
  { id: 's35', label: 'Super 35 (24.9 × 18.7)', w: 24.89, h: 18.66 },
  { id: 'apsc', label: 'APS-C (23.5 × 15.6)', w: 23.5, h: 15.6 },
  { id: 'mft', label: 'Micro Four Thirds (17.3 × 13)', w: 17.3, h: 13 },
  { id: 'one', label: '1-inch (13.2 × 8.8)', w: 13.2, h: 8.8 },
  { id: 's16', label: 'Super 16 (12.5 × 7.4)', w: 12.52, h: 7.41 },
  { id: 'phone', label: 'Phone (about 9.8 × 7.3)', w: 9.8, h: 7.3 },
];

export const FOCALS = [14, 18, 21, 24, 25, 28, 32, 35, 40, 50, 65, 75, 85, 100, 135];

export const sensorOf = (id?: string) => SENSORS.find((s) => s.id === id) ?? SENSORS[1];

/** Horizontal angle of view in degrees for a focal length on a sensor. */
export function fovDeg(focal: number, sensorWidth: number): number {
  return (2 * Math.atan(sensorWidth / (2 * Math.max(1, focal))) * 180) / Math.PI;
}

/** A rough shot size from focal length (for the Shot List when a camera is placed). */
export function shotTypeFor(focal: number): string {
  if (focal <= 21) return 'WS';
  if (focal <= 32) return 'MS';
  if (focal <= 65) return 'MCU';
  return 'CU';
}

export const KIND_LABEL: Record<PlanElementKind, string> = {
  actor: 'Actor', camera: 'Camera', light: 'Light', prop: 'Prop', wall: 'Wall', door: 'Door', window: 'Window', text: 'Label',
};

export const LIGHT_TYPES = ['Fresnel', 'LED panel', 'Tube', 'Open face', 'HMI', 'Practical', 'Softbox', 'Bounce'];

export function newPlan(sceneId: string): ScenePlan {
  return { id: newId(), sceneId, elements: [] };
}

/** Next camera letter on a plan: A, B, C… */
export function nextCameraLetter(plan: ScenePlan): string {
  const used = new Set(plan.elements.filter((e) => e.kind === 'camera').map((e) => e.label.replace(/^Camera\s+/i, '').trim()));
  for (let i = 0; i < 26; i++) { const l = String.fromCharCode(65 + i); if (!used.has(l)) return l; }
  return String(plan.elements.length + 1);
}

export function newElement(kind: PlanElementKind, x: number, y: number, plan: ScenePlan): PlanElement {
  const base = { id: newId(), kind, x, y, rot: 0 };
  switch (kind) {
    case 'camera': return { ...base, label: `Camera ${nextCameraLetter(plan)}`, focal: 35, sensor: 's35', rot: -90 };
    case 'actor': return { ...base, label: 'Actor', rot: 90 };
    case 'light': return { ...base, label: 'Light', lightType: 'LED panel', kelvin: 5600 };
    case 'prop': return { ...base, label: 'Prop', w: 3, h: 2 };
    case 'wall': return { ...base, label: '', w: 12, h: 0.5 };
    case 'door': return { ...base, label: 'Door', w: 3, h: 0.5 };
    case 'window': return { ...base, label: 'Window', w: 4, h: 0.5 };
    case 'text': return { ...base, label: 'Note' };
  }
}

/** Kelvin → a display colour (warm tungsten to cool daylight). */
export function kelvinColor(k = 5600): string {
  const t = Math.max(0, Math.min(1, (k - 2700) / (6500 - 2700)));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(255, 200)}, ${lerp(170, 220)}, ${lerp(90, 255)})`;
}

const MOVE_CAPTION = /^(Start|End|Move point \d+)$/;

/**
 * Gives a moving camera's shot one storyboard panel per position: start, each move point, end.
 * Adds missing panels; removes extra ones only if they're still blank auto panels (no image,
 * drawing or your own caption), so nothing you drew is lost when a move gets shorter.
 */
export function syncMoveFrames(d: Draft<Project>, shotId: string, positions: number) {
  const frames = d.storyboard.filter((f) => f.shotId === shotId).sort((a, b) => a.order - b.order);
  const want = positions > 1 ? positions : 1;
  const caption = (i: number) => (want === 1 ? '' : i === 0 ? 'Start' : i === want - 1 ? 'End' : `Move point ${i}`);
  while (frames.length < want) {
    const f = { id: newId(), shotId, order: frames.length, rev: 0, caption: '' };
    d.storyboard.push(f);
    frames.push(d.storyboard[d.storyboard.length - 1]);
  }
  for (let i = frames.length - 1; i >= want; i--) {
    const f = frames[i];
    if (f.imageId || f.drawingId || f.refImageId || f.refDrawingId || (f.caption && !MOVE_CAPTION.test(f.caption))) continue;
    d.storyboard = d.storyboard.filter((x) => x.id !== f.id);
    frames.splice(i, 1);
  }
  frames.forEach((f, i) => { f.order = i; if (!f.caption || MOVE_CAPTION.test(f.caption)) f.caption = caption(i); });
}
