import type { PlanElement, ScenePlan } from '../model/types';
import { fovDeg, kelvinColor, sensorOf } from './plan';

// The Shot Designer's top-down plan as a print-friendly picture, for a storyboard panel's set plan
// box: one camera highlighted (at the start, a move point or the end of its move), the others dimmed.

const ACCENT = '#e8730c';
const INK = '#1f2937';
const DIM = '#9ca3af';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Where an element is at a move position (0 = start, k = k-th move point). */
function at(el: PlanElement, pos: number): { x: number; y: number; rot: number } {
  if (!pos || !el.path?.length) return { x: el.x, y: el.y, rot: el.rot };
  const k = el.path[Math.min(pos, el.path.length) - 1];
  // Facing at a move point: its own rotation, or toward where it came from → where it goes.
  const prev = pos === 1 ? { x: el.x, y: el.y } : el.path[pos - 2];
  const rot = k.rot ?? (Math.hypot(k.x - prev.x, k.y - prev.y) > 0.01 ? el.rot : el.rot);
  return { x: k.x, y: k.y, rot };
}

/** SVG markup of a plan. `cameraId` is highlighted; `pos` is its move position. */
export function planSvg(plan: ScenePlan, cameraId?: string, pos = 0, distance: 'ft' | 'm' = 'ft'): { svg: string; w: number; h: number } {
  const els = plan.elements;
  const pts = els.flatMap((e) => [{ x: e.x, y: e.y }, ...(e.path ?? [])]);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const pad = 5;
  let x0 = (xs.length ? Math.min(...xs) : 0) - pad, x1 = (xs.length ? Math.max(...xs) : 10) + pad, y0 = (ys.length ? Math.min(...ys) : 0) - pad, y1 = (ys.length ? Math.max(...ys) : 10) + pad;
  // At least 16 ft across, so a single actor and camera still read as a room.
  if (x1 - x0 < 16) { const c = (x0 + x1) / 2; x0 = c - 8; x1 = c + 8; }
  // A 16:9 frame so it sits well in the panel box.
  const want = 16 / 9;
  if ((x1 - x0) / (y1 - y0) < want) { const w = (y1 - y0) * want; x0 -= (w - (x1 - x0)) / 2; x1 = x0 + w; }
  else { const h = (x1 - x0) / want; y0 -= (h - (y1 - y0)) / 2; y1 = y0 + h; }
  const W = x1 - x0, H = y1 - y0;
  const out: string[] = [];
  out.push(`<rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#ffffff"/>`);
  // 5 ft grid
  for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) out.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="#e5e7eb" stroke-width="0.06"/>`);
  for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) out.push(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#e5e7eb" stroke-width="0.06"/>`);
  const label = (x: number, y: number, t: string, color = INK, size = 0.9) => out.push(`<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="${color}" text-anchor="middle">${esc(t)}</text>`);

  for (const e of els) {
    if (e.kind === 'wall' || e.kind === 'door' || e.kind === 'window' || e.kind === 'prop') {
      const w = e.w ?? 3, h = e.h ?? 0.5;
      const fill = e.kind === 'wall' ? INK : e.kind === 'window' ? '#93c5fd' : '#d1d5db';
      out.push(`<g transform="rotate(${e.rot} ${e.x} ${e.y})"><rect x="${e.x - w / 2}" y="${e.y - h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="${INK}" stroke-width="0.05"/></g>`);
      if (e.kind !== 'wall' && e.label) label(e.x, e.y + h / 2 + 1, e.label, '#4b5563', 0.75);
    }
  }
  for (const e of els.filter((x) => x.kind === 'light')) {
    const c = kelvinColor(e.kelvin);
    const a1 = ((e.rot - 30) * Math.PI) / 180, a2 = ((e.rot + 30) * Math.PI) / 180;
    out.push(`<polygon points="${e.x},${e.y} ${e.x + Math.cos(a1) * 8},${e.y + Math.sin(a1) * 8} ${e.x + Math.cos(a2) * 8},${e.y + Math.sin(a2) * 8}" fill="${c}" fill-opacity="0.25"/>`);
    out.push(`<circle cx="${e.x}" cy="${e.y}" r="0.6" fill="${c}" stroke="${INK}" stroke-width="0.08"/>`);
  }
  for (const e of els.filter((x) => x.path?.length)) {
    const mine = e.id === cameraId;
    const ptsAll = [{ x: e.x, y: e.y }, ...e.path!];
    out.push(`<polyline points="${ptsAll.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${mine ? ACCENT : DIM}" stroke-width="0.12" stroke-dasharray="0.5 0.3"/>`);
  }
  for (const e of els.filter((x) => x.kind === 'actor')) {
    const p = at(e, e.path?.length ? Math.min(pos, e.path.length) : 0);
    out.push(`<circle cx="${p.x}" cy="${p.y}" r="0.9" fill="#3b82f6" stroke="#fff" stroke-width="0.12"/>`);
    out.push(`<line x1="${p.x}" y1="${p.y}" x2="${p.x + Math.cos((p.rot * Math.PI) / 180) * 1.3}" y2="${p.y + Math.sin((p.rot * Math.PI) / 180) * 1.3}" stroke="#fff" stroke-width="0.2" stroke-linecap="round"/>`);
    label(p.x, p.y + 2, e.label);
  }
  // Cameras last; the highlighted one on top.
  const cams = els.filter((x) => x.kind === 'camera').sort((a, b) => Number(a.id === cameraId) - Number(b.id === cameraId));
  for (const e of cams) {
    const mine = !cameraId || e.id === cameraId;
    const p = e.id === cameraId ? at(e, pos) : { x: e.x, y: e.y, rot: e.rot };
    const fov = fovDeg(e.focal ?? 35, sensorOf(e.sensor).w);
    const reach = Math.max(W, H);
    const a1 = ((p.rot - fov / 2) * Math.PI) / 180, a2 = ((p.rot + fov / 2) * Math.PI) / 180;
    const col = mine ? ACCENT : DIM;
    out.push(`<polygon points="${p.x},${p.y} ${p.x + Math.cos(a1) * reach},${p.y + Math.sin(a1) * reach} ${p.x + Math.cos(a2) * reach},${p.y + Math.sin(a2) * reach}" fill="${col}" fill-opacity="${mine ? 0.16 : 0.06}" stroke="${col}" stroke-width="${mine ? 0.12 : 0.05}"/>`);
    out.push(`<g transform="rotate(${p.rot} ${p.x} ${p.y})"><rect x="${p.x - 0.9}" y="${p.y - 0.6}" width="1.3" height="1.2" rx="0.15" fill="${mine ? INK : DIM}"/><polygon points="${p.x + 0.4},${p.y - 0.35} ${p.x + 0.9},${p.y - 0.55} ${p.x + 0.9},${p.y + 0.55} ${p.x + 0.4},${p.y + 0.35}" fill="${col}"/></g>`);
    label(p.x, p.y - 1.2, `${e.label.replace(/^Camera\s+/i, '')} · ${e.focal ?? 35}mm`, mine ? ACCENT : DIM, mine ? 0.95 : 0.7);
  }
  // Scale bar
  // Plans are in feet; in metres the bar is 2 m long.
  const bar = scaleBar(distance);
  out.push(`<line x1="${x0 + 1}" y1="${y1 - 1}" x2="${x0 + 1 + bar.len}" y2="${y1 - 1}" stroke="${INK}" stroke-width="0.1"/>`);
  label(x0 + 1 + bar.len / 2, y1 - 1.4, bar.label, INK, 0.6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${W} ${H}" width="${Math.round(W * 40)}" height="${Math.round(H * 40)}">${out.join('')}</svg>`;
  return { svg, w: W, h: H };
}

/** The plan as a PNG (white background), ready to store as a panel's set plan image. */
/** The scale bar: 5 ft, or 2 m (plans are drawn in feet). */
export const scaleBar = (distance: 'ft' | 'm') => (distance === 'm' ? { len: 2 * 3.28084, label: '2 m' } : { len: 5, label: '5 ft' });

export async function planPng(plan: ScenePlan, cameraId?: string, pos = 0, width = 1600, distance: 'ft' | 'm' = 'ft'): Promise<Blob> {
  const { svg, w, h } = planSvg(plan, cameraId, pos, distance);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not draw the plan.')); i.src = url; });
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.round((width * h) / w);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the plan.'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
