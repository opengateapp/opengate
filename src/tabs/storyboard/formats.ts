import type { StoryboardSettings } from '../../model/types';

// Framing formats for the storyboard: the main format sets the shape of every frame panel; extra
// frame guides show other deliverables inside it ("shoot scope, protect for 16:9 and vertical").

export interface FrameFormat { id: string; label: string; short: string; ratio: number; group: string; note: string }

export const FORMATS: FrameFormat[] = [
  { id: '9:16', label: 'Vertical 9:16', short: '9:16', ratio: 9 / 16, group: 'Social & mobile', note: 'Reels, TikTok, Shorts, Stories' },
  { id: '4:5', label: 'Portrait 4:5', short: '4:5', ratio: 4 / 5, group: 'Social & mobile', note: 'Instagram and Facebook feed' },
  { id: '1:1', label: 'Square 1:1', short: '1:1', ratio: 1, group: 'Social & mobile', note: 'Square feed posts' },
  { id: '4:3', label: 'Full screen 4:3 (1.33)', short: '4:3', ratio: 4 / 3, group: 'TV & web', note: 'Classic TV and video' },
  { id: '16:9', label: 'Widescreen 16:9 (1.78)', short: '16:9', ratio: 16 / 9, group: 'TV & web', note: 'HD / UHD TV, streaming, YouTube' },
  { id: '1.37', label: 'Academy 1.37:1', short: '1.37', ratio: 1.375, group: 'Cinema', note: 'Classic Academy ratio' },
  { id: '1.85', label: 'Flat 1.85:1', short: '1.85', ratio: 1.85, group: 'Cinema', note: 'Most non-scope features' },
  { id: '2.00', label: 'Univisium 2:1', short: '2:1', ratio: 2, group: 'Cinema', note: 'Popular for streaming dramas' },
  { id: '2.39', label: 'Scope 2.39:1', short: '2.39', ratio: 2.39, group: 'Cinema', note: 'Anamorphic / CinemaScope' },
  { id: '2.76', label: 'Ultra Panavision 2.76:1', short: '2.76', ratio: 2.76, group: 'Cinema', note: '65 mm anamorphic' },
  { id: '1.43', label: 'IMAX 1.43:1', short: 'IMAX 1.43', ratio: 1.43, group: 'IMAX', note: 'IMAX 70 mm film and IMAX laser (GT) screens' },
  { id: '1.90', label: 'IMAX Digital 1.90:1', short: 'IMAX 1.90', ratio: 1.9, group: 'IMAX', note: 'Most IMAX digital screens' },
];
export const DEFAULT_FORMAT = '16:9';
export const formatById = (id?: string) => FORMATS.find((f) => f.id === id) ?? FORMATS.find((f) => f.id === DEFAULT_FORMAT)!;
export const formatOf = (s?: StoryboardSettings) => formatById(s?.format);

/** Canvas size for a ratio: the long side is 1280 px (16:9 → 1280 × 720, 9:16 → 720 × 1280). */
export function frameSize(ratio: number): { w: number; h: number } {
  return ratio >= 1 ? { w: 1280, h: Math.round(1280 / ratio) } : { w: Math.round(1280 * ratio), h: 1280 };
}

/** The largest rectangle of `ratio` centred inside w × h. */
export function guideRect(w: number, h: number, ratio: number): { x: number; y: number; w: number; h: number } {
  const gw = Math.min(w, h * ratio);
  const gh = gw / ratio;
  return { x: (w - gw) / 2, y: (h - gh) / 2, w: gw, h: gh };
}

/** Colours for up to six frame guides, readable on white paper. */
export const GUIDE_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2'];

/** Draws frame guides (dashed outlines with a label) onto a canvas of the frame's size. */
export function drawGuides(g: CanvasRenderingContext2D, w: number, h: number, ids: string[], shade = false) {
  const list = ids.map((id) => FORMATS.find((f) => f.id === id)).filter((f): f is FrameFormat => !!f);
  const scale = Math.max(w, h) / 1280;
  list.forEach((f, i) => {
    const r = guideRect(w, h, f.ratio);
    if (shade && i === 0) {
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath(); g.rect(0, 0, w, h); g.rect(r.x, r.y, r.w, r.h); g.fill('evenodd');
      g.restore();
    }
    const c = GUIDE_COLORS[i % GUIDE_COLORS.length];
    g.save();
    g.strokeStyle = c; g.lineWidth = 2 * scale; g.setLineDash([12 * scale, 8 * scale]);
    g.strokeRect(r.x + g.lineWidth / 2, r.y + g.lineWidth / 2, r.w - g.lineWidth, r.h - g.lineWidth);
    g.setLineDash([]);
    g.font = `600 ${Math.round(18 * scale)}px Inter, system-ui, sans-serif`;
    const label = f.short;
    const tw = g.measureText(label).width;
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(r.x + 6 * scale, r.y + 6 * scale, tw + 10 * scale, 24 * scale);
    g.fillStyle = c;
    g.fillText(label, r.x + 11 * scale, r.y + 24 * scale);
    g.restore();
  });
}

// ---- Grid overlay (editor only; remembered on this device) ----

export interface GridPrefs { mode: 'off' | 'thirds' | 'grid'; cols: number; rows: number; center: boolean; safe: boolean }
const GRID_KEY = 'opengate.sbGrid';
export const DEFAULT_GRID: GridPrefs = { mode: 'off', cols: 4, rows: 4, center: false, safe: false };
export function loadGrid(): GridPrefs {
  try { return { ...DEFAULT_GRID, ...JSON.parse(localStorage.getItem(GRID_KEY) ?? '{}') }; } catch { return DEFAULT_GRID; }
}
export function saveGrid(g: GridPrefs) { try { localStorage.setItem(GRID_KEY, JSON.stringify(g)); } catch { /* private mode */ } }

/** Draws the grid overlay: rule of thirds or an N × M grid, plus centre mark and safe areas. */
export function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, p: GridPrefs) {
  const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  g.save();
  if (p.mode === 'thirds' || p.mode === 'grid') {
    const cols = p.mode === 'thirds' ? 3 : Math.max(2, Math.min(24, Math.round(p.cols)));
    const rows = p.mode === 'thirds' ? 3 : Math.max(2, Math.min(24, Math.round(p.rows)));
    g.strokeStyle = p.mode === 'thirds' ? 'rgba(234,88,12,0.6)' : 'rgba(37,99,235,0.35)';
    g.lineWidth = p.mode === 'thirds' ? 2 : 1.5;
    for (let i = 1; i < cols; i++) line((w * i) / cols, 0, (w * i) / cols, h);
    for (let i = 1; i < rows; i++) line(0, (h * i) / rows, w, (h * i) / rows);
    if (p.mode === 'thirds') {
      g.fillStyle = 'rgba(234,88,12,0.7)';
      for (const x of [w / 3, (2 * w) / 3]) for (const y of [h / 3, (2 * h) / 3]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
    }
  }
  if (p.center) {
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5;
    const s = Math.min(w, h) * 0.04;
    line(w / 2 - s, h / 2, w / 2 + s, h / 2); line(w / 2, h / 2 - s, w / 2, h / 2 + s);
  }
  if (p.safe) {
    // Action safe 93%, title safe 90% (the common broadcast guides).
    g.setLineDash([6, 6]); g.lineWidth = 1.5;
    for (const [pct, col] of [[0.93, 'rgba(22,163,74,0.6)'], [0.9, 'rgba(220,38,38,0.55)']] as const) {
      g.strokeStyle = col;
      g.strokeRect((w * (1 - pct)) / 2, (h * (1 - pct)) / 2, w * pct, h * pct);
    }
  }
  g.restore();
}

/** Draws a stored drawing layer onto a frame canvas: same shape fills it, a different shape is fitted. */
export function drawLayer(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number) {
  if (Math.abs(img.width / img.height - w / h) < 0.01) { ctx.drawImage(img, 0, 0, w, h); return; }
  const s = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}

/** Ghost poses' opacity, oldest (i = 0) faintest, newest at `fade`. */
export const DEFAULT_GHOST_FADE = 0.35;
export function ghostAlpha(i: number, n: number, fade = DEFAULT_GHOST_FADE): number {
  return n <= 1 ? fade : fade * (0.45 + 0.55 * (i / (n - 1)));
}
