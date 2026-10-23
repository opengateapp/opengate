import { useCallback, useEffect, useRef, useState } from 'react';
import { useDerived, useProject, useStore } from '../../store/project';
import { blobToImage, getMedia, putMedia } from '../../store/media';
import { newId } from '../../model/ids';
import { boardFrames } from '../../script/storyboard';
import { SHOT_TYPES } from '../../model/defaults';
import { drawContain } from './render';
import { drawGrid, drawGuides, drawLayer, formatOf, frameSize, loadGrid, saveGrid, type GridPrefs } from './formats';
import { FramingControls } from './FramingControls';
import { More, MoreMenu } from '../../components/More';
import { ColorPicker, type ColorPickerHandle } from '../../components/ColorPicker';
import { askConfirm } from '../../components/dialogs';
import { openActions } from '../../components/ActionSheet';
import { drawsWith, isPenEraser, notePointer, pressureOf, samplesOf, widthFor, usePen, type PenMode } from '../../ui/pen';
import { usePhone, useTouch } from '../../ui/responsive';
import { prepareImage } from './images';

// Frame editor after DontPayForStoryboardingSoftware: pen / brush / eraser / fill / line /
// rect / ellipse / text on a transparent drawing layer over the frame's image. Grid and
// onion skin are separate overlay canvases, so they never get baked into the drawing.

type Tool = 'pen' | 'brush' | 'eraser' | 'fill' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
const TOOLS: { id: Tool; icon: string; name: string; key: string }[] = [
  { id: 'pen', icon: '✎', name: 'Pen', key: 'p' }, { id: 'brush', icon: '🖌', name: 'Brush', key: 'b' }, { id: 'eraser', icon: '⌫', name: 'Eraser', key: 'e' },
  { id: 'fill', icon: '◧', name: 'Fill', key: 'f' }, { id: 'line', icon: '╱', name: 'Line', key: 'l' }, { id: 'arrow', icon: '➝', name: 'Arrow', key: 'a' }, { id: 'rect', icon: '▭', name: 'Rectangle', key: 'r' },
  { id: 'ellipse', icon: '◯', name: 'Ellipse', key: 'o' }, { id: 'text', icon: 'T', name: 'Text', key: 't' },
];
/** Line, arrow, rectangle and ellipse share one Shapes button (it shows the last one used). */
const SHAPES: Tool[] = ['line', 'arrow', 'rect', 'ellipse'];
const toolInfo = (t: Tool) => TOOLS.find((x) => x.id === t)!;
const SWATCHES = ['#111111', '#555555', '#9ca3af', '#ffffff', '#dc2626', '#ea580c', '#facc15', '#16a34a', '#2563eb', '#7c3aed'];

export function FrameEditor({ frameId, onClose, onSelect, layer = 'frame' }: { frameId: string; onClose: () => void; onSelect: (id: string) => void; layer?: 'frame' | 'ref' }) {
  // The same editor draws on the frame or on its set plan / reference box.
  const IMG = layer === 'ref' ? 'refImageId' : 'imageId';
  const DRW = layer === 'ref' ? 'refDrawingId' : 'drawingId';
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const all = boardFrames(p, d);
  const pos = all.findIndex((x) => x.frame.id === frameId);
  const cur = all[pos];
  const prev = pos > 0 ? all[pos - 1] : undefined;
  const next = all[pos + 1];
  // The frame takes the storyboard's format (9:16, 2.39, IMAX…); the set plan box stays 16:9.
  const settings = p.storyboardSettings;
  const fmt = formatOf(settings);
  const { w: FW, h: FH } = frameSize(layer === 'ref' ? 16 / 9 : fmt.ratio);
  const guides = layer === 'ref' ? [] : (settings?.guides ?? []).filter((g) => g !== fmt.id);

  const bgRef = useRef<HTMLCanvasElement>(null);
  const onionRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const [tool, setToolState] = useState<Tool>('pen');
  const [lastShape, setLastShape] = useState<Tool>('line');
  const setTool = (t: Tool) => { setToolState(t); if (SHAPES.includes(t)) setLastShape(t); };
  const colorRef = useRef<ColorPickerHandle>(null);
  const phone = usePhone();
  const [color, setColor] = useState('#111111');
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [gridPrefs, setGridPrefsState] = useState<GridPrefs>(loadGrid);
  const setGridPrefs = (patch: Partial<GridPrefs>) => setGridPrefsState((g) => { const n = { ...g, ...patch }; saveGrid(n); return n; });
  /** G: back to the last grid (rule of thirds by default), or off. */
  const lastMode = useRef<GridPrefs['mode']>(gridPrefs.mode === 'off' ? 'thirds' : gridPrefs.mode);
  const toggleGrid = () => { if (gridPrefs.mode !== 'off') { lastMode.current = gridPrefs.mode; setGridPrefs({ mode: 'off' }); } else setGridPrefs({ mode: lastMode.current }); };
  const [onion, setOnion] = useState(false);
  const [textAt, setTextAt] = useState<{ x: number; y: number; cssX: number; cssY: number } | null>(null);
  const [textVal, setTextVal] = useState('');
  const undo = useRef<ImageData[]>([]);
  const redo = useRef<ImageData[]>([]);
  const [, force] = useState(0);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  type Pt = { x: number; y: number; p?: number };
  const pen = usePen();
  const touch = useTouch();
  const drawing = useRef<{ start: Pt; last: Pt; points: Pt[]; snap: ImageData; erasing?: boolean } | null>(null);
  const penLayer = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => { penLayer.current = null; }, [FW, FH]); // the pen's scratch layer matches the frame size
  // Size indicators: how wide the current tool draws, in canvas pixels and on screen.
  const stackRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [stackW, setStackW] = useState(FW);
  const [sizing, setSizing] = useState(false);
  const sizingTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const el = stackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setStackW(el.getBoundingClientRect().width || FW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  /** Line width the tool draws with, in canvas pixels (brush and eraser are 2.5× the Size number). */
  const toolWidth = tool === 'brush' || tool === 'eraser' ? size * 2.5 : size;
  const screenWidth = Math.max(1, (toolWidth * stackW) / FW);
  const sizedTool = tool === 'pen' || tool === 'brush' || tool === 'eraser';
  // Shown while the slider is held or changing (keyboard too), then hidden shortly after.
  const holding = useRef(false);
  const hideSoon = () => { clearTimeout(sizingTimer.current); if (!holding.current) sizingTimer.current = setTimeout(() => setSizing(false), 900); };
  const changeSize = (v: number) => { setSize(v); setSizing(true); hideSoon(); };
  const holdSize = (on: boolean) => { holding.current = on; if (on) { clearTimeout(sizingTimer.current); setSizing(true); } else hideSoon(); };
  const widthLabel = `${Math.round(toolWidth)} px`;
  /** The outline that follows the pointer (mouse and pen, not fingers). */
  const moveRing = (e: React.PointerEvent) => {
    const ring = ringRef.current;
    if (!ring) return;
    if (!sizedTool || e.pointerType === 'touch') { ring.style.display = 'none'; return; }
    const r = e.currentTarget.getBoundingClientRect();
    ring.style.display = 'block';
    ring.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%)`;
  };

  const ctx = () => drawRef.current!.getContext('2d', { willReadFrequently: true })!;

  // ---- Load image + drawing for this frame ----
  useEffect(() => {
    let alive = true;
    const f = cur?.frame;
    if (!f) return;
    undo.current = []; redo.current = []; dirty.current = false;
    const bg = bgRef.current!.getContext('2d')!;
    bg.fillStyle = '#fff';
    bg.fillRect(0, 0, FW, FH);
    ctx().clearRect(0, 0, FW, FH);
    void (async () => {
      if (f[IMG]) {
        const b = await getMedia(f[IMG]);
        if (b && alive) drawContain(bg, await blobToImage(b), FW, FH);
      }
      if (f[DRW]) {
        const b = await getMedia(f[DRW]);
        if (b && alive) drawLayer(ctx(), await blobToImage(b), FW, FH);
      }
    })();
    return () => { alive = false; };
    // Reload only when switching frames or replacing the image (not on our own drawing saves).
  }, [frameId, cur?.frame[IMG], FW, FH]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Overlays: grid (this device) and frame guides (the storyboard's) ----
  useEffect(() => {
    const g = gridRef.current!.getContext('2d')!;
    g.clearRect(0, 0, FW, FH);
    drawGrid(g, FW, FH, gridPrefs);
    if (guides.length) drawGuides(g, FW, FH, guides);
  }, [gridPrefs, guides.join(','), FW, FH]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    const o = onionRef.current!.getContext('2d')!;
    o.clearRect(0, 0, FW, FH);
    if (!onion || !prev) return;
    void (async () => {
      for (const id of [prev.frame[IMG], prev.frame[DRW]]) {
        if (!id) continue;
        const b = await getMedia(id);
        if (!b || !alive) continue;
        const img = await blobToImage(b);
        if (id === prev.frame[DRW]) drawLayer(o, img, FW, FH);
        else drawContain(o, img, FW, FH);
      }
    })();
    return () => { alive = false; };
  }, [onion, prev?.frame.id, prev?.frame.rev, FW, FH]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Saving the drawing layer ----
  const save = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (!dirty.current || !cur) return;
    dirty.current = false;
    const canvas = drawRef.current!;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    const pr = useStore.getState().project!;
    const f = pr.storyboard.find((x) => x.id === cur.frame.id);
    if (!f) return;
    const id = await putMedia(pr.id, blob, f[DRW] ?? newId());
    update((dr) => {
      const x = dr.storyboard.find((y) => y.id === f.id);
      if (x) { x[DRW] = id; x.rev++; }
    }, null);
  }, [cur, update]);
  const changed = () => {
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 600);
    force((n) => n + 1);
  };
  useEffect(() => () => { void save(); }, [save]);

  const snapshot = () => {
    undo.current.push(ctx().getImageData(0, 0, FW, FH));
    if (undo.current.length > 40) undo.current.shift();
    redo.current = [];
  };
  const doUndo = () => {
    const s = undo.current.pop();
    if (!s) return;
    redo.current.push(ctx().getImageData(0, 0, FW, FH));
    ctx().putImageData(s, 0, 0);
    changed();
  };
  const doRedo = () => {
    const s = redo.current.pop();
    if (!s) return;
    undo.current.push(ctx().getImageData(0, 0, FW, FH));
    ctx().putImageData(s, 0, 0);
    changed();
  };

  // Editor shortcuts; captured so ⌘Z doesn't reach the project-level undo.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select');
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.shiftKey) doRedo(); else doUndo();
        return;
      }
      if (typing || mod) return;
      const t = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (t) setTool(t.id);
      if (e.key === 'g') toggleGrid();
      if (e.key === '[') changeSize(Math.max(1, size - 1));
      if (e.key === ']') changeSize(Math.min(40, size + 1));
      if (e.key === 'c') { e.preventDefault(); colorRef.current?.open(); }
      if (e.key === 'n') setOnion((v) => !v);
      if (e.key === 'ArrowLeft' && prev) { void save(); onSelect(prev.frame.id); }
      if (e.key === 'ArrowRight' && next) { void save(); onSelect(next.frame.id); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  // ---- Drawing ----
  const at = (e: { clientX: number; clientY: number; pointerType: string; pressure: number }) => {
    const r = drawRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * FW) / r.width, y: ((e.clientY - r.top) * FH) / r.height, cssX: e.clientX - r.left, cssY: e.clientY - r.top, scale: FW / r.width, p: pressureOf(e) };
  };
  const strokeStyle = (c: CanvasRenderingContext2D) => {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color;
    c.globalAlpha = tool === 'brush' ? opacity * 0.6 : opacity;
    c.lineWidth = tool === 'brush' ? size * 2.5 : size;
  };
  const down = (e: React.PointerEvent) => {
    notePointer(e);
    // Palm rejection: once a pen is in use, fingers don't draw (Settings → Pencil in the brush menu).
    if (!drawsWith(e)) return;
    const penEraser = isPenEraser(e);
    if (e.button !== 0 && !penEraser) return;
    const q = at(e);
    if (tool === 'text') { setTextAt({ x: q.x, y: q.y, cssX: q.cssX, cssY: q.cssY }); setTextVal(''); return; }
    snapshot();
    const c = ctx();
    if (tool === 'fill') { floodFill(c, Math.round(q.x), Math.round(q.y), color, opacity); changed(); return; }
    try { drawRef.current!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    drawing.current = { start: q, last: q, points: [q], snap: c.getImageData(0, 0, FW, FH), erasing: penEraser };
    if (tool === 'eraser' || penEraser) erase(q, q);
    else if (tool === 'pen' || tool === 'brush') { strokePath([q]); }
  };
  const erase = (a: Pt, b: Pt) => {
    const c = ctx();
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = opacity;
    c.lineCap = 'round'; c.lineWidth = widthFor(size * 2.5, b.p);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x + 0.01, b.y); c.stroke();
    c.restore();
  };
  const strokePath = (pts: Pt[]) => {
    const c = ctx();
    if (pts.some((q) => q.p != null)) {
      // Pen pressure: draw each piece at its own width on a scratch layer at full strength,
      // then lay the whole stroke down once, so opacity stays even where pieces overlap.
      const layer = (penLayer.current ??= Object.assign(document.createElement('canvas'), { width: FW, height: FH }));
      const t = layer.getContext('2d')!;
      t.clearRect(0, 0, FW, FH);
      t.lineCap = 'round'; t.lineJoin = 'round'; t.strokeStyle = color; t.fillStyle = color;
      const base = tool === 'brush' ? size * 2.5 : size;
      if (pts.length === 1) { t.beginPath(); t.arc(pts[0].x, pts[0].y, widthFor(base, pts[0].p) / 2, 0, Math.PI * 2); t.fill(); }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        t.lineWidth = widthFor(base, ((a.p ?? 0.5) + (b.p ?? 0.5)) / 2);
        t.beginPath(); t.moveTo(a.x, a.y); t.lineTo(b.x, b.y); t.stroke();
      }
      c.save();
      c.globalAlpha = tool === 'brush' ? opacity * 0.6 : opacity;
      c.drawImage(layer, 0, 0);
      c.restore();
      return;
    }
    c.save();
    strokeStyle(c);
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (const pt of pts.slice(1)) c.lineTo(pt.x, pt.y);
    if (pts.length === 1) c.lineTo(pts[0].x + 0.01, pts[0].y);
    c.stroke();
    c.restore();
  };
  const move = (e: React.PointerEvent) => {
    const st = drawing.current;
    if (!st) return;
    // Pens report many samples between frames; use them all for smooth lines.
    const qs = samplesOf(e).map((ev) => at(ev));
    const q = qs[qs.length - 1] ?? at(e);
    const c = ctx();
    if (tool === 'eraser' || st.erasing) { for (const x of qs) { erase(st.last, x); st.last = x; } return; }
    if (tool === 'pen' || tool === 'brush') {
      // Re-stroke the whole path over the snapshot so opacity stays even where it overlaps itself.
      st.points.push(...qs);
      c.putImageData(st.snap, 0, 0);
      strokePath(st.points);
      return;
    }
    c.putImageData(st.snap, 0, 0);
    c.save();
    strokeStyle(c);
    c.beginPath();
    if (tool === 'line' || tool === 'arrow') { c.moveTo(st.start.x, st.start.y); c.lineTo(q.x, q.y); }
    if (tool === 'arrow') {
      // Arrowhead for camera / character moves.
      const a = Math.atan2(q.y - st.start.y, q.x - st.start.x);
      const head = Math.max(14, c.lineWidth * 4);
      c.moveTo(q.x, q.y); c.lineTo(q.x - head * Math.cos(a - 0.45), q.y - head * Math.sin(a - 0.45));
      c.moveTo(q.x, q.y); c.lineTo(q.x - head * Math.cos(a + 0.45), q.y - head * Math.sin(a + 0.45));
    }
    if (tool === 'rect') { c.rect(st.start.x, st.start.y, q.x - st.start.x, q.y - st.start.y); }
    if (tool === 'ellipse') c.ellipse((st.start.x + q.x) / 2, (st.start.y + q.y) / 2, Math.abs(q.x - st.start.x) / 2, Math.abs(q.y - st.start.y) / 2, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  };
  const up = (e?: React.PointerEvent) => {
    if (e) notePointer(e);
    if (!drawing.current) return;
    drawing.current = null;
    changed();
  };
  const commitText = () => {
    if (textAt && textVal.trim()) {
      snapshot();
      const c = ctx();
      c.save();
      c.globalAlpha = opacity;
      c.fillStyle = color;
      c.font = `${size * 4 + 16}px Inter, system-ui, sans-serif`;
      c.textBaseline = 'top';
      textVal.split('\n').forEach((ln, i) => c.fillText(ln, textAt.x, textAt.y + i * (size * 4 + 20)));
      c.restore();
      changed();
    }
    setTextAt(null);
  };

  const replaceImage = async (file: File | undefined) => {
    if (!file || !cur) return;
    const blob = await prepareImage(file);
    const id = await putMedia(p.id, blob);
    update((dr) => { const x = dr.storyboard.find((y) => y.id === cur.frame.id); if (x) { x[IMG] = id; x.rev++; } }, 'Frame image');
  };

  if (!cur) return null;
  const shot = cur.shot;
  const type = SHOT_TYPES.find((t) => t.code === shot.shotType)?.label;
  const close = () => { void save(); onClose(); };

  // On a phone, undo / redo sit in the top bar so the drawing row fits without scrolling.
  const undoRedo = (
    <span className="fe-undo">
      <button onClick={doUndo} disabled={!undo.current.length} title="Undo (⌘Z)" aria-label="Undo">↶</button>
      <button onClick={doRedo} disabled={!redo.current.length} title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
    </span>
  );
  const sizeControl = (
    <label className="check small size-control" title={`${tool === 'eraser' ? 'Eraser' : tool === 'brush' ? 'Brush' : 'Line'} width: ${Math.round(toolWidth)} px on a ${FW}-px-wide frame ([ and ] to change)`}>
      <span className="fe-ctl-lbl">Size</span>
      <input type="range" min={1} max={40} value={size} aria-label="Size" onChange={(e) => changeSize(Number(e.target.value))} onPointerDown={() => holdSize(true)} onPointerUp={() => holdSize(false)} onPointerCancel={() => holdSize(false)} onBlur={() => holdSize(false)} />
      <span className="size-dot-box" aria-hidden><span className={`size-dot ${tool === 'eraser' ? 'eraser' : ''}`} style={{ width: Math.min(28, screenWidth), height: Math.min(28, screenWidth), background: tool === 'eraser' ? undefined : color, opacity: tool === 'brush' ? opacity * 0.6 : opacity }} /></span>
      <span className="size-num">{widthLabel}</span>
    </label>
  );
  const opacityControl = (
    <label className="check small opacity-control" title="Opacity">
      <span className="fe-ctl-lbl">Opacity</span>
      <input type="range" min={0.05} max={1} step={0.05} value={opacity} aria-label="Opacity" onChange={(e) => setOpacity(Number(e.target.value))} />
      <span className="size-num">{Math.round(opacity * 100)}%</span>
    </label>
  );
  return (
    <div className="frame-editor" role="dialog" aria-label="Storyboard frame">
      <div className="toolbar">
        <h3 className="keep">{cur.scene ? `Sc ${cur.scene.number} · ` : ''}Shot {shot.shotNumber || '—'}{type ? ` · ${type}` : ''}{layer === 'ref' ? ' — Set plan / reference' : ''}</h3>
        <span className="muted small">frame {pos + 1} of {all.length}</span>
        <span className="spacer" />
        {phone && undoRedo}
        <button disabled={!prev} onClick={() => { void save(); onSelect(prev!.frame.id); }} title="Previous frame (←)">◀</button>
        <button disabled={!next} onClick={() => { void save(); onSelect(next!.frame.id); }} title="Next frame (→)">▶</button>
        <button className="primary" onClick={close}>Done</button>
      </div>
      <div className="toolbar tools fe-tools" role="toolbar" aria-label="Drawing tools">
        <div className="fe-seg">
          {(['pen', 'brush', 'eraser', 'fill'] as Tool[]).map((id) => { const t = toolInfo(id); return (
            <button key={id} className={tool === id ? 'active' : ''} aria-pressed={tool === id} aria-label={t.name} title={`${t.name} (${t.key.toUpperCase()})`} onClick={() => setTool(id)}>
              <span className="fe-ico" aria-hidden>{t.icon}</span><span className="fe-lbl">{t.name}</span>
            </button>
          ); })}
          <span className={`fe-shapes ${SHAPES.includes(tool) ? 'active' : ''}`}>
            <button className={SHAPES.includes(tool) ? 'active' : ''} aria-pressed={SHAPES.includes(tool)} aria-label={`Shapes: ${toolInfo(lastShape).name}`} title={`${toolInfo(lastShape).name} (${toolInfo(lastShape).key.toUpperCase()}) — ▾ for other shapes`} onClick={() => setTool(lastShape)}>
              <span className="fe-ico" aria-hidden>{toolInfo(lastShape).icon}</span><span className="fe-lbl">{toolInfo(lastShape).name}</span>
            </button>
            <button className="fe-caret" aria-label="Other shapes" title="Line, arrow, rectangle, ellipse"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); openActions('Shapes', SHAPES.map((id) => ({ label: `${toolInfo(id).icon}  ${toolInfo(id).name} (${toolInfo(id).key.toUpperCase()})`, current: tool === id, run: () => setTool(id) })), { x: r.left, y: r.bottom }); }}>▾</button>
          </span>
          {(() => { const t = toolInfo('text'); return (
            <button className={tool === 'text' ? 'active' : ''} aria-pressed={tool === 'text'} aria-label={t.name} title={`${t.name} (T)`} onClick={() => setTool('text')}>
              <span className="fe-ico" aria-hidden>{t.icon}</span><span className="fe-lbl">{t.name}</span>
            </button>
          ); })()}
        </div>
        <ColorPicker ref={colorRef} value={color} onChange={setColor} swatches={SWATCHES} />
        {phone ? (
          <MoreMenu sheet label={`Size ${widthLabel} and opacity`} className="fe-size-sheet"
            icon={<span className="size-dot-box" aria-hidden><span className={`size-dot ${tool === 'eraser' ? 'eraser' : ''}`} style={{ width: Math.min(24, screenWidth), height: Math.min(24, screenWidth), background: tool === 'eraser' ? undefined : color }} /></span>}>
            {sizeControl}
            {opacityControl}
          </MoreMenu>
        ) : (
          <>{sizeControl}{opacityControl}</>
        )}
        {!phone && undoRedo}
        <More label="Frame options" always>
          <div className="fe-opt keep-open">
            <span className="fe-opt-h">Grid <kbd>G</kbd></span>
            <div className="seg small" role="radiogroup" aria-label="Grid">
              {(['off', 'thirds', 'grid'] as const).map((m) => <button key={m} role="radio" aria-checked={gridPrefs.mode === m} className={gridPrefs.mode === m ? 'active' : ''} onClick={() => setGridPrefs({ mode: m })}>{{ off: 'Off', thirds: 'Rule of thirds', grid: 'Grid' }[m]}</button>)}
            </div>
            {gridPrefs.mode === 'grid' && (
              <div className="fe-opt-row">
                <label className="check small">Columns <input type="number" min={2} max={24} value={gridPrefs.cols} onChange={(e) => setGridPrefs({ cols: Math.max(2, Math.min(24, Number(e.target.value) || 2)) })} /></label>
                <label className="check small">Rows <input type="number" min={2} max={24} value={gridPrefs.rows} onChange={(e) => setGridPrefs({ rows: Math.max(2, Math.min(24, Number(e.target.value) || 2)) })} /></label>
              </div>
            )}
            <label className="check small"><input type="checkbox" checked={gridPrefs.center} onChange={(e) => setGridPrefs({ center: e.target.checked })} /> Centre mark</label>
            <label className="check small"><input type="checkbox" checked={gridPrefs.safe} onChange={(e) => setGridPrefs({ safe: e.target.checked })} /> Safe areas (action 93%, title 90%)</label>
          </div>
          {layer === 'frame' && <FramingControls beforeChange={save} />}
          <button className={onion ? 'active' : ''} disabled={!prev} onClick={() => setOnion(!onion)} title="Show the previous frame faintly (N)">Onion skin</button>
          {(pen.seen || touch) && (
            <label className="check small keep-open" title="Palm rejection — Auto: once you use a pencil, fingers stop drawing. Pencil only: fingers never draw. Pencil & fingers: both draw.">Pencil
              <select value={pen.mode} onChange={(e) => pen.setMode(e.target.value as PenMode)}>
                <option value="auto">Auto</option>
                <option value="pen">Pencil only</option>
                <option value="any">Pencil &amp; fingers</option>
              </select>
            </label>
          )}
          <label className="button-like">Image…<input type="file" accept="image/*" hidden onChange={(e) => void replaceImage(e.target.files?.[0])} /></label>
          {cur.frame[IMG] && <button onClick={() => update((dr) => { const x = dr.storyboard.find((y) => y.id === cur.frame.id); if (x) { x[IMG] = undefined; x.rev++; } }, 'Remove frame image')}>Remove image</button>}
          <hr />
          <button className="danger-text" onClick={async () => { if (await askConfirm('Clear the drawing on this frame?', { message: 'The image stays. You can undo this.', confirmLabel: 'Clear drawing', danger: true })) { snapshot(); ctx().clearRect(0, 0, FW, FH); changed(); } }}>Clear drawing…</button>
        </More>
      </div>
      <div className="frame-stage">
        <div ref={stackRef} className="frame-stack" style={{ aspectRatio: `${FW} / ${FH}`, width: `min(100%, calc((100vh - 240px) * ${(FW / FH).toFixed(4)}))` }}>
          <canvas ref={bgRef} width={FW} height={FH} />
          <canvas ref={onionRef} width={FW} height={FH} className="onion" />
          <canvas ref={drawRef} width={FW} height={FH} className={`draw tool-${tool}`}
            onPointerDown={down} onPointerMove={(e) => { moveRing(e); move(e); }} onPointerUp={up} onPointerCancel={up}
            onPointerLeave={() => { if (ringRef.current) ringRef.current.style.display = 'none'; }} />
          <canvas ref={gridRef} width={FW} height={FH} className="overlay" />
          {/* Follows the pointer at the tool's real size. */}
          <div ref={ringRef} className={`brush-ring ${tool === 'eraser' ? 'eraser' : ''}`} aria-hidden style={{ width: screenWidth, height: screenWidth, display: 'none' }} />
          {/* While the Size slider moves: the stroke at its real size, in the middle of the frame. */}
          {sizing && sizedTool && (
            <div className="brush-preview" aria-live="polite">
              <span className={`brush-preview-dot ${tool === 'eraser' ? 'eraser' : ''}`} style={{ width: screenWidth, height: screenWidth, background: tool === 'eraser' ? undefined : color, opacity: tool === 'brush' ? opacity * 0.6 : opacity }} />
              <span className="brush-preview-label">{tool === 'eraser' ? 'Eraser' : tool === 'brush' ? 'Brush' : 'Pen'} · {widthLabel}</span>
            </div>
          )}
          {textAt && (
            <textarea autoFocus className="frame-text" style={{ left: textAt.cssX, top: textAt.cssY, color }} value={textVal} rows={1}
              onChange={(e) => setTextVal(e.target.value)} onBlur={commitText}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') { e.stopPropagation(); setTextAt(null); } }} />
          )}
        </div>
      </div>
      <div className="frame-caption">
        <textarea rows={2} placeholder={`Caption / action — ${shot.name || shot.action || 'what happens in this frame'}`} value={cur.frame.caption}
          onChange={(e) => { const v = e.target.value; update((dr) => { const x = dr.storyboard.find((y) => y.id === cur.frame.id); if (x) x.caption = v; }, null); }} />
      </div>
    </div>
  );
}

/** Flood fill on the drawing layer (transparent regions bounded by strokes), with a visited mask. */
export function floodFill(c: CanvasRenderingContext2D, sx: number, sy: number, hex: string, alpha = 1) {
  const w = c.canvas.width;
  const h = c.canvas.height;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
  const img = c.getImageData(0, 0, w, h);
  const px = img.data;
  const n = parseInt(hex.slice(1), 16);
  const fr = (n >> 16) & 255, fg = (n >> 8) & 255, fb = n & 255, fa = Math.round(alpha * 255);
  const i0 = (sy * w + sx) * 4;
  const t = [px[i0], px[i0 + 1], px[i0 + 2], px[i0 + 3]];
  if (t[0] === fr && t[1] === fg && t[2] === fb && t[3] === fa) return;
  const tol = 40;
  const match = (i: number) => Math.abs(px[i + 3] - t[3]) <= tol && (t[3] < 20 || (Math.abs(px[i] - t[0]) <= tol && Math.abs(px[i + 1] - t[1]) <= tol && Math.abs(px[i + 2] - t[2]) <= tol));
  const seen = new Uint8Array(w * h);
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    const k = y * w + x;
    if (seen[k]) continue;
    seen[k] = 1;
    const i = k * 4;
    if (!match(i)) continue;
    px[i] = fr; px[i + 1] = fg; px[i + 2] = fb; px[i + 3] = fa;
    if (x > 0) stack.push(x - 1, y);
    if (x < w - 1) stack.push(x + 1, y);
    if (y > 0) stack.push(x, y - 1);
    if (y < h - 1) stack.push(x, y + 1);
  }
  c.putImageData(img, 0, 0);
}
