import { create } from 'zustand';

// Stylus (Apple Pencil, Surface Pen, Wacom…) support shared by the drawing surfaces.
//
// - Pressure: pen strokes get thicker the harder you press.
// - Palm rejection: on drawing canvases, once a pen has been used, fingers stop drawing
//   ("auto"); "pen" always ignores fingers, "any" lets both draw. On boards, touches are
//   ignored while a pen is writing (a resting palm), so fingers still pan and zoom.
// - The eraser end of a pen (where the hardware has one) erases.

export type PenMode = 'auto' | 'pen' | 'any';
const KEY = 'opengate.penMode';

function load(): PenMode {
  try { const v = localStorage.getItem(KEY); return v === 'pen' || v === 'any' ? v : 'auto'; } catch { return 'auto'; }
}

export const usePen = create<{ mode: PenMode; seen: boolean; setMode: (m: PenMode) => void }>((set) => ({
  mode: load(),
  seen: false,
  setMode: (mode) => { try { localStorage.setItem(KEY, mode); } catch { /* ignore */ } set({ mode }); },
}));

let penDown = false;
let penUpAt = 0;

/** Call on every pointer down / up from a drawing surface, so the app knows a pen is around. */
export function notePointer(e: { pointerType: string; type: string }) {
  if (e.pointerType !== 'pen') return;
  if (!usePen.getState().seen) usePen.setState({ seen: true });
  if (e.type === 'pointerdown') penDown = true;
  if (e.type === 'pointerup' || e.type === 'pointercancel') { penDown = false; penUpAt = Date.now(); }
}

/** Whether a drawing canvas should draw with this pointer (fingers are ignored once a pen is in use). */
export function drawsWith(e: { pointerType: string }): boolean {
  if (e.pointerType !== 'touch') return true;
  const { mode, seen } = usePen.getState();
  return mode === 'any' || (mode === 'auto' && !seen);
}

/** Whether a touch should be ignored as a palm (a pen is writing, or just lifted). */
export function isPalm(e: { pointerType: string }): boolean {
  return e.pointerType === 'touch' && (penDown || Date.now() - penUpAt < 400);
}

/** The pen's eraser end (or a pen's eraser button). */
export function isPenEraser(e: { pointerType: string; button: number; buttons: number }): boolean {
  return e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) === 32);
}

/** Pressure from 0 to 1 for a pen, or undefined for a mouse or finger (constant width). */
export function pressureOf(e: { pointerType: string; pressure: number }): number | undefined {
  return e.pointerType === 'pen' ? Math.max(0.05, Math.min(1, e.pressure || 0.5)) : undefined;
}

/** Line width for a pressure: light touch = thin, full press = about 1.8× the base size. */
export const widthFor = (base: number, p?: number) => (p == null ? base : base * (0.25 + 1.55 * p));

/** All the samples a pen produced since the last event (pens report far more often than the screen draws). */
export function samplesOf<E extends PointerEvent>(e: { nativeEvent: E } | E): PointerEvent[] {
  const ne = 'nativeEvent' in e ? e.nativeEvent : e;
  const list = typeof ne.getCoalescedEvents === 'function' ? ne.getCoalescedEvents() : [];
  return list.length ? list : [ne];
}
