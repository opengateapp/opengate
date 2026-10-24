import { produce } from 'immer';
import type { BoardItem, Project } from './types';
import { newId } from './ids';
import { putMedia } from '../store/media';
import { formatOf, frameSize } from '../tabs/storyboard/formats';

// Pictures for the sample production, drawn here in code (our own simple sketches, nothing copied):
// storyboard drawings, location "photos" and mood-board images. Browser only; if anything fails the
// sample still opens, just without pictures.

type G = CanvasRenderingContext2D;
type Sketch = (g: G, w: number, h: number) => void;

const ink = (g: G, width = 3, color = '#1f2937') => { g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; };
const line = (g: G, ...pts: number[]) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
const person = (g: G, x: number, y: number, s: number, lean = 0) => {
  g.beginPath(); g.arc(x + lean * s * 0.3, y - s * 0.85, s * 0.12, 0, Math.PI * 2); g.stroke();
  line(g, x + lean * s * 0.3, y - s * 0.73, x, y - s * 0.35);
  line(g, x, y - s * 0.35, x - s * 0.15, y); line(g, x, y - s * 0.35, x + s * 0.15, y);
  line(g, x + lean * s * 0.2, y - s * 0.62, x - s * 0.2, y - s * 0.45); line(g, x + lean * s * 0.2, y - s * 0.62, x + s * 0.22, y - s * 0.48);
};
const truck = (g: G, x: number, y: number, s: number, tilt = 0) => {
  g.save(); g.translate(x, y); g.rotate(tilt);
  g.strokeRect(-s, -s * 0.35, s * 1.25, s * 0.35);
  g.beginPath(); g.moveTo(s * 0.25, -s * 0.35); g.lineTo(s * 0.45, -s * 0.7); g.lineTo(s * 0.85, -s * 0.7); g.lineTo(s, -s * 0.35); g.lineTo(s, 0); g.lineTo(s * 0.25, 0); g.stroke();
  for (const wx of [-s * 0.6, s * 0.7]) { g.beginPath(); g.arc(wx, 0, s * 0.16, 0, Math.PI * 2); g.stroke(); }
  g.restore();
};
const screen = (g: G, x: number, y: number, w: number, h: number) => {
  g.strokeRect(x, y, w, h);
  line(g, x + w * 0.2, y + h, x + w * 0.2, y + h * 1.6); line(g, x + w * 0.8, y + h, x + w * 0.8, y + h * 1.6);
  line(g, x + w * 0.55, y, x + w * 0.62, y + h * 0.35, x + w * 0.5, y + h * 0.55); // the tear
};
const rain = (g: G, w: number, h: number) => { ink(g, 1.5, '#64748b'); for (let i = 0; i < 90; i++) { const x = (i * 97) % w, y = (i * 53) % h; line(g, x, y, x - 6, y + 22); } };
const ground = (g: G, w: number, y: number) => line(g, 0, y, w, y);

const SKETCHES: Record<string, Sketch> = {
  arrival: (g, w, h) => { ink(g); ground(g, w, h * 0.78); screen(g, w * 0.55, h * 0.12, w * 0.38, h * 0.36); for (let i = 0; i < 6; i++) line(g, w * (0.05 + i * 0.08), h * 0.78, w * (0.05 + i * 0.08), h * 0.66); truck(g, w * 0.3, h * 0.78, w * 0.1); ink(g, 2, '#f59e0b'); line(g, w * 0.4, h * 0.72, w * 0.62, h * 0.68); line(g, w * 0.4, h * 0.74, w * 0.62, h * 0.8); },
  ladderTop: (g, w, h) => { rain(g, w, h); ink(g); screen(g, w * 0.3, h * 0.05, w * 0.6, h * 0.55); line(g, w * 0.25, h * 0.92, w * 0.38, h * 0.2); line(g, w * 0.3, h * 0.94, w * 0.43, h * 0.22); for (let i = 1; i < 8; i++) { const t = i / 8; line(g, w * (0.25 + 0.13 * t), h * (0.92 - 0.72 * t), w * (0.3 + 0.13 * t), h * (0.94 - 0.72 * t)); } person(g, w * 0.4, h * 0.3, h * 0.28, 0.5); person(g, w * 0.2, h * 0.94, h * 0.32); },
  ladderSkid: (g, w, h) => { rain(g, w, h); ink(g); ground(g, w, h * 0.94); line(g, w * 0.3, h * 0.94, w * 0.48, h * 0.22); line(g, w * 0.35, h * 0.95, w * 0.53, h * 0.24); ink(g, 2, '#dc2626'); line(g, w * 0.22, h * 0.97, w * 0.3, h * 0.94); line(g, w * 0.22, h * 0.9, w * 0.29, h * 0.9); ink(g); person(g, w * 0.5, h * 0.3, h * 0.28, -0.8); },
  ladderFall: (g, w, h) => { rain(g, w, h); ink(g); ground(g, w, h * 0.94); g.strokeRect(w * 0.3, h * 0.82, w * 0.4, h * 0.12); line(g, w * 0.32, h * 0.86, w * 0.68, h * 0.86); g.save(); g.translate(w * 0.5, h * 0.74); g.rotate(-1.4); person(g, 0, 0, h * 0.3); g.restore(); ink(g, 2, '#2563eb'); g.setLineDash([8, 8]); line(g, w * 0.48, h * 0.15, w * 0.52, h * 0.55); g.setLineDash([]); },
  swerve: (g, w, h) => { rain(g, w, h); ink(g); line(g, 0, h * 0.55, w, h * 0.45); line(g, 0, h * 0.95, w, h * 0.85); ink(g, 2, '#94a3b8'); g.setLineDash([20, 18]); line(g, 0, h * 0.75, w, h * 0.65); g.setLineDash([]); ink(g); truck(g, w * 0.45, h * 0.78, w * 0.12, -0.5); ink(g, 2, '#16a34a'); g.beginPath(); g.ellipse(w * 0.75, h * 0.6, w * 0.035, h * 0.06, 0, 0, Math.PI * 2); g.stroke(); line(g, w * 0.75, h * 0.66, w * 0.75, h * 0.74); },
  swerveFinal: (g, w, h) => { rain(g, w, h); ink(g); line(g, 0, h * 0.55, w, h * 0.45); line(g, 0, h * 0.95, w, h * 0.85); ink(g, 2, '#94a3b8'); g.setLineDash([20, 18]); line(g, 0, h * 0.75, w, h * 0.65); g.setLineDash([]); ink(g, 2, '#16a34a'); g.beginPath(); g.ellipse(w * 0.5, h * 0.62, w * 0.03, h * 0.05, 0, 0, Math.PI * 2); g.stroke(); line(g, w * 0.5, h * 0.67, w * 0.5, h * 0.74); ink(g, 2, '#78716c'); g.beginPath(); g.arc(w * 0.45, h * 1.4, w * 0.45, -1.75, -1.0); g.stroke(); ink(g); truck(g, w * 0.72, h * 0.9, w * 0.12, 0.35); },
  slide: (g, w, h) => { rain(g, w, h); ink(g); line(g, 0, h * 0.5, w, h * 0.45); line(g, 0, h * 0.85, w, h * 0.8); ink(g, 2, '#78716c'); g.beginPath(); g.arc(w * 0.25, h * 1.2, w * 0.3, -1.2, -0.4); g.stroke(); ink(g); truck(g, w * 0.62, h * 0.92, w * 0.12, 0.25); },
  beam: (g, w, h) => { g.fillStyle = '#0f172a'; g.fillRect(0, 0, w, h); ink(g, 3, '#e2e8f0'); screen(g, w * 0.45, h * 0.08, w * 0.45, h * 0.5); g.fillStyle = 'rgba(253,230,138,0.25)'; g.beginPath(); g.moveTo(w * 0.05, h * 0.55); g.lineTo(w * 0.45, h * 0.08); g.lineTo(w * 0.45, h * 0.58); g.closePath(); g.fill(); ink(g, 2, '#e2e8f0'); person(g, w * 0.6, h * 0.5, h * 0.3); person(g, w * 0.72, h * 0.5, h * 0.33); },
  dawn: (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fde68a'); gr.addColorStop(1, '#fff7ed'); g.fillStyle = gr; g.fillRect(0, 0, w, h); ink(g); ground(g, w, h * 0.85); g.beginPath(); g.arc(w * 0.8, h * 0.85, h * 0.18, Math.PI, 0); g.stroke(); person(g, w * 0.35, h * 0.85, h * 0.6); person(g, w * 0.55, h * 0.85, h * 0.55); g.strokeRect(w * 0.29, h * 0.2, w * 0.12, h * 0.04); },
  booth: (g, w, h) => { g.fillStyle = '#fef3c7'; g.fillRect(0, 0, w, h); ink(g); g.strokeRect(w * 0.35, h * 0.35, w * 0.3, h * 0.25); g.beginPath(); g.arc(w * 0.42, h * 0.28, h * 0.1, 0, Math.PI * 2); g.arc(w * 0.58, h * 0.28, h * 0.1, 0, Math.PI * 2); g.stroke(); line(g, w * 0.45, h * 0.6, w * 0.42, h * 0.9); line(g, w * 0.55, h * 0.6, w * 0.58, h * 0.9); g.beginPath(); g.arc(w * 0.88, h * 0.3, h * 0.08, 0, Math.PI * 2); g.stroke(); },
  road: (g, w, h) => { g.fillStyle = '#fefce8'; g.fillRect(0, 0, w, h); ink(g); line(g, w * 0.45, h * 0.4, 0, h); line(g, w * 0.55, h * 0.4, w, h); line(g, 0, h * 0.4, w, h * 0.4); ink(g, 2, '#ca8a04'); for (let i = 0; i < 40; i++) line(g, (i * 37) % w, h * 0.4 - 4, (i * 37) % w + 3, h * 0.4 - 18); },
  diner: (g, w, h) => { g.fillStyle = '#fee2e2'; g.fillRect(0, 0, w, h); ink(g); line(g, 0, h * 0.62, w, h * 0.62); g.strokeRect(0, h * 0.62, w, h * 0.08); for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w * (0.15 + i * 0.18), h * 0.8, h * 0.05, 0, Math.PI * 2); g.stroke(); line(g, w * (0.15 + i * 0.18), h * 0.85, w * (0.15 + i * 0.18), h); } for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(w * (0.3 + i * 0.2), h * 0.55, h * 0.06, Math.PI, 0); g.stroke(); } },
};

async function draw(sketch: Sketch, w: number, h: number, background?: string): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (background) { g.fillStyle = background; g.fillRect(0, 0, w, h); }
  sketch(g, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw'))), 'image/png'));
}

/** Storyboard frames in order → which sketch draws them. */
const FRAME_SKETCHES = ['arrival', 'ladderTop', 'ladderSkid', 'ladderFall', 'swerveFinal', 'beam', 'dawn'];
/** The swerve frame's onion-skin ghosts: the truck earlier in the slide (transparent, truck only). */
const SWERVE_GHOSTS: Sketch[] = [
  (g, w, h) => { ink(g); truck(g, w * 0.22, h * 0.72, w * 0.12); },
  (g, w, h) => { ink(g); truck(g, w * 0.45, h * 0.8, w * 0.12, -0.35); },
];

export async function addSampleMedia(p: Project): Promise<Project> {
  try {
    const { w: FW, h: FH } = frameSize(formatOf(p.storyboardSettings).ratio);
    const frames: string[] = [];
    for (const name of FRAME_SKETCHES) frames.push(await putMedia(p.id, await draw(SKETCHES[name], FW, FH)));
    const ghosts: string[] = [];
    for (const sk of SWERVE_GHOSTS) ghosts.push(await putMedia(p.id, await draw(sk, FW, FH)));
    const photos: Record<string, string> = {};
    for (const name of ['arrival', 'booth', 'road', 'diner'] as const) photos[name] = await putMedia(p.id, await draw(SKETCHES[name], 900, 600, '#ffffff'));
    const board: string[] = [];
    for (const name of ['beam', 'dawn', 'booth', 'ladderFall']) board.push(await putMedia(p.id, await draw(SKETCHES[name], 640, 400, '#ffffff')));
    return produce(p, (dr) => {
      dr.storyboard.forEach((f, i) => { if (frames[i]) { f.drawingId = frames[i]; f.rev++; } });
      const swerve = dr.storyboard.find((f) => /swerves/.test(f.caption));
      if (swerve) { swerve.ghosts = ghosts.map((drawingId) => ({ id: newId(), drawingId })); swerve.ghostFade = 0.4; }
      const photoFor: Record<string, string> = { 'DRIVE-IN THEATER': photos.arrival, 'COUNTY ROAD': photos.road, 'ROSIE\'S DINER': photos.diner };
      for (const l of dr.locations) { const id = photoFor[l.setName]; if (id) l.photoIds = [id, ...(l.setName === 'DRIVE-IN THEATER' ? [photos.booth] : [])]; }
      const mood = dr.boards[0];
      if (mood) {
        const captions = ['Projector beam at night: warm against blue', 'Dawn on the lot', 'The booth: practical light', 'Stunts: wide, locked-off, readable'];
        board.forEach((imageId, i) => {
          const item: BoardItem = { id: newId(), type: 'image', x: 40 + (i % 2) * 340, y: 370 + Math.floor(i / 2) * 230, w: 320, h: 200, z: 30 + i, imageId, caption: captions[i] };
          mood.items.push(item);
        });
      }
      // Press kit stills and the poster: the location photos and mood-board drawings (stand-ins for real stills).
      if (dr.pressKit) { dr.pressKit.stills = [photos.arrival, photos.booth, photos.diner, board[0]]; dr.pressKit.posterId = board[0]; }
      const bts = dr.socialPosts?.find((x) => x.milestone === 'First shoot day');
      if (bts) bts.mediaIds = [photos.booth];
    });
  } catch {
    return p;
  }
}
