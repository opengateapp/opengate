import { uiZoom } from '../../prefs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Board, BoardItem, BoardItemType } from '../../model/types';
import { useMediaUrl } from '../../store/media';
import { toast } from '../../components/common';
import { addItems, bounds, connector, edgePoint, hostOf, itemsFromTransfer, makeItem, readTransfer, removeItems, updateItems } from './boardOps';
import { CardBody, NoteText, REF_MIME, openRef } from './cards';
import { askText } from '../../components/dialogs';
import { BOARD_MIME, getBoardClipboard, setBoardClipboard } from '../../components/clipboard';
import { isPalm, notePointer, pressureOf, samplesOf, widthFor } from '../../ui/pen';
import { newId } from '../../model/ids';

export type Tool = 'select' | 'hand' | 'pen' | 'note' | 'text' | 'rect' | 'ellipse' | 'arrow' | 'frame' | 'connect';

interface View { x: number; y: number; s: number }

interface Props {
  board: Board;
  selected: string[];
  onSelect: (ids: string[]) => void;
  /** Called when items are dropped onto an element marked data-link-target (outside the canvas). */
  onLinkDrop: (itemIds: string[], target: string) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  ink: string;
}

type Drag =
  | { kind: 'move'; ids: string[]; sx: number; sy: number; dx: number; dy: number; moved: boolean }
  | { kind: 'resize'; id: string; sx: number; sy: number; w: number; h: number; dw: number; dh: number; keep: number | null }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number; add: boolean }
  | { kind: 'stroke'; points: number[]; pressures?: number[] }
  | { kind: 'create'; type: BoardItemType; shape?: BoardItem['shape']; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'connect'; from: string; x1: number; y1: number; moved: boolean };

const QUICK: { type: BoardItemType; label: string; icon: string; shape?: BoardItem['shape'] }[] = [
  { type: 'note', label: 'Sticky note', icon: '▤' },
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'image', label: 'Image…', icon: '🖼' },
  { type: 'link', label: 'Link…', icon: '🔗' },
  { type: 'swatch', label: 'Color swatch', icon: '◼' },
  { type: 'shape', label: 'Rectangle', icon: '▭', shape: 'rect' },
  { type: 'shape', label: 'Ellipse', icon: '◯', shape: 'ellipse' },
  { type: 'shape', label: 'Arrow', icon: '➝', shape: 'arrow' },
  { type: 'frame', label: 'Section frame', icon: '⬚' },
];

const viewKey = (id: string) => `slateline.boardview.${id}`;

export function BoardCanvas({ board, selected, onSelect, onLinkDrop, tool, setTool, ink }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(() => {
    try { return JSON.parse(localStorage.getItem(viewKey(board.id)) ?? '') as View; } catch { return { x: 80, y: 60, s: 1 }; }
  });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [quick, setQuick] = useState<{ sx: number; sy: number; wx: number; wy: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [linkHover, setLinkHover] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => { try { localStorage.setItem(viewKey(board.id), JSON.stringify(view)); } catch { /* ignore */ } }, [board.id, view]);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = host.current!.getBoundingClientRect();
    const v = viewRef.current;
    const z = uiZoom();
    return { x: ((cx - r.left) / z - v.x) / v.s, y: ((cy - r.top) / z - v.y) / v.s };
  }, []);
  const center = () => {
    const r = host.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const r = host.current!.getBoundingClientRect();
    setView((v) => {
      const s = Math.min(4, Math.max(0.1, v.s * factor));
      const px = (cx - r.left) / uiZoom();
      const py = (cy - r.top) / uiZoom();
      return { s, x: px - ((px - v.x) / v.s) * s, y: py - ((py - v.y) / v.s) * s };
    });
  };

  const fit = useCallback(() => {
    const b = bounds(board.items);
    const r = host.current?.getBoundingClientRect();
    if (!b || !r) { setView({ x: 80, y: 60, s: 1 }); return; }
    const z = uiZoom(), W = r.width / z, H = r.height / z;
    const s = Math.min(2, Math.max(0.1, Math.min((W - 80) / b.w, (H - 80) / b.h)));
    setView({ s, x: (W - b.w * s) / 2 - b.x * s, y: (H - b.h * s) / 2 - b.y * s });
  }, [board.items]);

  // Wheel: pinch / ⌘-wheel zooms, plain wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const el = host.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0025));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- Keyboard ----
  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]');
    const down = (e: KeyboardEvent) => {
      if (e.key === ' ' && !typing(e)) { setSpace(true); e.preventDefault(); }
      if (typing(e) || editing) return;
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) { e.preventDefault(); removeItems(board.id, selected); onSelect([]); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); onSelect(board.items.map((i) => i.id)); }
      else if (mod && e.key.toLowerCase() === 'd' && selected.length) {
        e.preventDefault();
        const copies = board.items.filter((i) => selected.includes(i.id)).map((i) => ({ ...i, id: newId(), x: i.x + 24, y: i.y + 24 }));
        addItems(board.id, copies, 'Duplicate');
        onSelect(copies.map((c) => c.id));
      } else if (e.key === 'Escape') { onSelect([]); setQuick(null); setTool('select'); }
      else if (!mod && !e.altKey) {
        const map: Record<string, Tool> = { v: 'select', h: 'hand', p: 'pen', n: 'note', t: 'text', r: 'rect', o: 'ellipse', a: 'arrow', f: 'frame', c: 'connect' };
        const t = map[e.key.toLowerCase()];
        if (t) setTool(t);
        if (e.key === ']' || e.key === '[') {
          const top = e.key === ']';
          const zs = board.items.map((i) => i.z);
          const z = top ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
          updateItems(board.id, selected, (it) => { it.z = z; }, top ? 'Bring to front' : 'Send to back');
        }
        if (e.key === '0' && !mod) fit();
      }
    };
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [board, selected, editing, onSelect, setTool, fit]);

  // ---- Copy / cut / paste: board items (between boards too), images, links, text ----
  useEffect(() => {
    const inField = (t: EventTarget | null) => !!(t as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"], .ProseMirror');
    const pasteItems = (items: BoardItem[]) => {
      const copies = items.map((i) => ({ ...i, id: newId(), x: i.x + 32, y: i.y + 32 }));
      addItems(board.id, copies, copies.length > 1 ? `Paste ${copies.length} items` : 'Paste item');
      onSelect(copies.map((c) => c.id));
      setBoardClipboard(copies);
    };
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (inField(e.target) || !selected.length || window.getSelection()?.toString()) return;
      const items = board.items.filter((i) => selected.includes(i.id));
      setBoardClipboard(items);
      e.clipboardData?.setData(BOARD_MIME, JSON.stringify(items));
      e.clipboardData?.setData('text/plain', items.map((i) => i.text || i.caption || i.sourceUrl || '').filter(Boolean).join('\n') || `${items.length} board item(s)`);
      e.preventDefault();
      if (cut) { removeItems(board.id, selected); onSelect([]); }
    };
    const copy = (e: ClipboardEvent) => onCopy(e, false);
    const cut = (e: ClipboardEvent) => onCopy(e, true);
    const onPaste = async (e: ClipboardEvent) => {
      if (inField(e.target) || !e.clipboardData) return;
      const raw = e.clipboardData.getData(BOARD_MIME);
      if (raw) { e.preventDefault(); try { pasteItems(JSON.parse(raw)); } catch { /* ignore */ } return; }
      const c = readTransfer(e.clipboardData);
      if (!c.files.length && !c.images.length && !c.links.length && !c.text && getBoardClipboard().length) { e.preventDefault(); pasteItems(getBoardClipboard()); return; }
      if (!c.files.length && !c.images.length && !c.links.length && !c.text) return;
      e.preventDefault();
      const at = center();
      try {
        const items = await itemsFromTransfer(c, at.x, at.y);
        addItems(board.id, items, 'Paste');
        onSelect(items.map((i) => i.id));
      } catch (err) { toast((err as Error).message); }
    };
    const onMenuPaste = () => { if (getBoardClipboard().length) pasteItems(getBoardClipboard()); };
    window.addEventListener('paste', onPaste);
    window.addEventListener('copy', copy);
    window.addEventListener('cut', cut);
    window.addEventListener('slateline:board-paste', onMenuPaste);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('copy', copy);
      window.removeEventListener('cut', cut);
      window.removeEventListener('slateline:board-paste', onMenuPaste);
    };
  }, [board.id, board.items, selected, onSelect]);

  // ---- Touch: two fingers pinch-zoom and pan ----
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; s0: number; wx: number; wy: number } | null>(null);
  const twoFinger = () => {
    const [a, b] = [...touches.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  // ---- Pointer handling ----
  const itemAt = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.('[data-item-id]') as HTMLElement | null;

  const onPointerDown = (e: React.PointerEvent) => {
    notePointer(e);
    // A palm resting on the screen while a pen writes is ignored.
    if (isPalm(e)) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        // A second finger: stop whatever the first one started and pinch instead.
        setDrag(null);
        const { d, mx, my } = twoFinger();
        const w = toWorld(mx, my);
        pinch.current = { d0: d, s0: viewRef.current.s, wx: w.x, wy: w.y };
        try { host.current!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
        return;
      }
      if (touches.current.size > 2) return;
    }
    if (e.button === 2) return;
    setQuick(null);
    const el = e.target as HTMLElement;
    if (el.closest('.board-item-editor, .quick-add, .board-toolbar')) return;
    try { host.current!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const w = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || space || tool === 'hand') {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y });
      return;
    }
    if (tool === 'pen') { const pr = pressureOf(e); setDrag({ kind: 'stroke', points: [w.x, w.y], ...(pr != null ? { pressures: [pr] } : {}) }); return; }
    // Connect: drag from an item's ◦ handle (or anywhere on an item with the connect tool) to another item.
    const connectFrom = (el.closest('[data-connect]') as HTMLElement | null)?.dataset.connect
      ?? (tool === 'connect' ? board.items.find((i) => i.id === itemAt(e.target)?.dataset.itemId && i.type !== 'connector')?.id : undefined);
    if (connectFrom) { setDrag({ kind: 'connect', from: connectFrom, x1: w.x, y1: w.y, moved: false }); return; }
    if (tool === 'connect') return;
    if (tool !== 'select') {
      const type: BoardItemType = tool === 'rect' || tool === 'ellipse' || tool === 'arrow' ? 'shape' : tool;
      setDrag({ kind: 'create', type, shape: type === 'shape' ? (tool as BoardItem['shape']) : undefined, x0: w.x, y0: w.y, x1: w.x, y1: w.y });
      return;
    }
    const handle = el.closest('[data-resize]') as HTMLElement | null;
    if (handle) {
      const id = handle.dataset.resize!;
      const it = board.items.find((i) => i.id === id)!;
      setDrag({ kind: 'resize', id, sx: w.x, sy: w.y, w: it.w, h: it.h, dw: 0, dh: 0, keep: it.type === 'image' && !e.shiftKey ? it.h / it.w : null });
      return;
    }
    const itemEl = itemAt(e.target);
    if (itemEl) {
      const id = itemEl.dataset.itemId!;
      // Connectors are selected, not dragged (they follow their items).
      if (board.items.find((i) => i.id === id)?.type === 'connector') { onSelect([id]); return; }
      let ids = selected;
      if (e.shiftKey || e.metaKey) ids = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
      else if (!selected.includes(id)) ids = [id];
      onSelect(ids);
      // Moving a frame carries the items sitting inside it.
      const moving = new Set(ids);
      for (const fid of ids) {
        const f = board.items.find((i) => i.id === fid);
        if (f?.type !== 'frame') continue;
        for (const it of board.items) {
          const cx = it.x + it.w / 2;
          const cy = it.y + it.h / 2;
          if (it.id !== f.id && cx > f.x && cx < f.x + f.w && cy > f.y && cy < f.y + f.h) moving.add(it.id);
        }
      }
      setDrag({ kind: 'move', ids: [...moving], sx: w.x, sy: w.y, dx: 0, dy: 0, moved: false });
      return;
    }
    if (!e.shiftKey) onSelect([]);
    // A pen on empty space draws, without switching tools (fingers keep panning).
    if (e.pointerType === 'pen') { setDrag({ kind: 'stroke', points: [w.x, w.y], pressures: [pressureOf(e) ?? 0.5] }); return; }
    // One finger on empty space pans (a finger can't hold Shift for a selection box).
    if (e.pointerType === 'touch') { setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }); return; }
    setDrag({ kind: 'marquee', x0: w.x, y0: w.y, x1: w.x, y1: w.y, add: e.shiftKey });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size >= 2) {
        const { d, mx, my } = twoFinger();
        const r = host.current!.getBoundingClientRect();
        const p = pinch.current;
        const s = Math.min(4, Math.max(0.1, p.s0 * (d / p.d0)));
        setView({ s, x: (mx - r.left) / uiZoom() - p.wx * s, y: (my - r.top) / uiZoom() - p.wy * s });
        return;
      }
    }
    if (!drag) return;
    const w = toWorld(e.clientX, e.clientY);
    switch (drag.kind) {
      case 'pan':
        setView((v) => ({ ...v, x: drag.vx + (e.clientX - drag.sx) / uiZoom(), y: drag.vy + (e.clientY - drag.sy) / uiZoom() }));
        break;
      case 'move': {
        setDrag({ ...drag, dx: w.x - drag.sx, dy: w.y - drag.sy, moved: true });
        const t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-link-target]') as HTMLElement | null;
        setLinkHover(t?.dataset.linkTarget ?? null);
        break;
      }
      case 'resize': {
        const dw = w.x - drag.sx;
        const dh = drag.keep ? (drag.w + dw) * drag.keep - drag.h : w.y - drag.sy;
        setDrag({ ...drag, dw, dh });
        break;
      }
      case 'marquee':
        setDrag({ ...drag, x1: w.x, y1: w.y });
        break;
      case 'stroke': {
        // Every sample the pen produced since the last event, for smooth lines.
        const samples = samplesOf(e).map((ev) => ({ ...toWorld(ev.clientX, ev.clientY), p: pressureOf(ev) }));
        setDrag({
          kind: 'stroke',
          points: [...drag.points, ...samples.flatMap((s) => [s.x, s.y])],
          ...(drag.pressures ? { pressures: [...drag.pressures, ...samples.map((s) => s.p ?? 0.5)] } : {}),
        });
        break;
      }
      case 'create':
        setDrag({ ...drag, x1: w.x, y1: w.y });
        break;
      case 'connect':
        setDrag({ ...drag, x1: w.x, y1: w.y, moved: drag.moved || Math.hypot(w.x - drag.x1, w.y - drag.y1) > 4 });
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    notePointer(e);
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (pinch.current) { if (touches.current.size < 2) pinch.current = null; setDrag(null); return; }
    }
    const d = drag;
    setDrag(null);
    setLinkHover(null);
    if (!d) return;
    if (d.kind === 'move' && d.moved) {
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-link-target]') as HTMLElement | null;
      if (target) { onLinkDrop(d.ids, target.dataset.linkTarget!); return; }
      const dx = Math.round(d.dx);
      const dy = Math.round(d.dy);
      if (dx || dy) updateItems(board.id, d.ids, (it) => { it.x += dx; it.y += dy; }, d.ids.length > 1 ? `Move ${d.ids.length} items` : 'Move item');
    }
    if (d.kind === 'resize' && (d.dw || d.dh)) {
      updateItems(board.id, [d.id], (it) => { it.w = Math.max(24, Math.round(d.w + d.dw)); it.h = Math.max(16, Math.round(d.h + d.dh)); }, 'Resize');
    }
    if (d.kind === 'connect' && d.moved) {
      const hitId = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-item-id]')?.getAttribute('data-item-id');
      const target = board.items.find((i) => i.id === hitId && i.type !== 'connector' && i.id !== d.from);
      if (target) {
        if (!board.items.some((i) => i.type === 'connector' && ((i.from === d.from && i.to === target.id) || (i.from === target.id && i.to === d.from)))) {
          const c = connector(d.from, target.id);
          addItems(board.id, [c], 'Connect');
          onSelect([c.id]);
        }
      } else {
        // Released on empty space: a new note, connected (like dragging out a mind-map branch).
        const n = makeItem('note', d.x1, d.y1, {});
        addItems(board.id, [n, connector(d.from, n.id)], 'Add connected note');
        onSelect([n.id]);
        setEditing(n.id);
      }
      if (tool === 'connect') setTool('select');
    }
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      if (x1 - x0 > 3 || y1 - y0 > 3) {
        const hit = board.items.filter((i) => i.x < x1 && i.x + i.w > x0 && i.y < y1 && i.y + i.h > y0 && i.type !== 'frame').map((i) => i.id);
        onSelect(d.add ? [...new Set([...selected, ...hit])] : hit);
      }
    }
    if (d.kind === 'stroke' && d.points.length >= 4) {
      const xs = d.points.filter((_, i) => i % 2 === 0);
      const ys = d.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs), y = Math.min(...ys);
      const pts = d.points.map((v, i) => Math.round((i % 2 === 0 ? v - x : v - y) * 10) / 10);
      addItems(board.id, [{ id: newId(), type: 'stroke', x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y), z: 0, points: pts, color: ink, strokeWidth: 3, ...(d.pressures ? { pressures: d.pressures.map((p) => Math.round(p * 100) / 100) } : {}) }], 'Draw');
    }
    if (d.kind === 'create') {
      const big = Math.abs(d.x1 - d.x0) > 8 || Math.abs(d.y1 - d.y0) > 8;
      const it = makeItem(d.type, d.x0, d.y0, d.shape ? { shape: d.shape, color: ink } : {});
      if (big) Object.assign(it, { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.max(24, Math.abs(d.x1 - d.x0)), h: Math.max(16, Math.abs(d.y1 - d.y0)) });
      if (d.shape === 'arrow' || d.shape === 'line') {
        // Arrows keep their direction in points: from (x0,y0) to (x1,y1).
        const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
        Object.assign(it, { x, y, w: Math.max(1, Math.abs(d.x1 - d.x0)), h: Math.max(1, Math.abs(d.y1 - d.y0)), points: big ? [d.x0 - x, d.y0 - y, d.x1 - x, d.y1 - y] : [0, 0, 160, 0] });
        if (!big) Object.assign(it, { x: d.x0, y: d.y0, w: 160, h: 1 });
      }
      addItems(board.id, [it], 'Add ' + (d.shape ?? d.type));
      onSelect([it.id]);
      if (d.type === 'note' || d.type === 'text') setEditing(it.id);
      setTool('select');
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const itemEl = itemAt(e.target);
    if (itemEl) {
      const it = board.items.find((i) => i.id === itemEl.dataset.itemId);
      if (it?.type === 'card' && it.ref) { openRef(it.ref); return; }
      if (it?.type === 'connector') { setEditing(it.id); return; }
      if (it && (it.type === 'note' || it.type === 'text' || it.type === 'frame' || it.type === 'swatch' || it.type === 'shape')) setEditing(it.id);
      else if (it) onSelect([it.id]); // details panel opens for images / links
      return;
    }
    const r = host.current!.getBoundingClientRect();
    const w = toWorld(e.clientX, e.clientY);
    setQuick({ sx: (e.clientX - r.left) / uiZoom(), sy: (e.clientY - r.top) / uiZoom(), wx: w.x, wy: w.y });
  };

  const quickAdd = async (q: (typeof QUICK)[number]) => {
    if (!quick) return;
    const { wx, wy } = quick;
    setQuick(null);
    if (q.type === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async () => {
        const files = [...(input.files ?? [])];
        try {
          const items = await itemsFromTransfer({ files, images: [], links: [], text: '' }, wx, wy);
          addItems(board.id, items, 'Add images');
          onSelect(items.map((i) => i.id));
        } catch (err) { toast((err as Error).message); }
      };
      input.click();
      return;
    }
    if (q.type === 'link') {
      const url = (await askText('Add a link', { placeholder: 'https://… (web page or image URL)', confirmLabel: 'Add' }))?.trim();
      if (!url) return;
      const items = await itemsFromTransfer(readTransferFromString(url), wx, wy);
      addItems(board.id, items, 'Add link');
      onSelect(items.map((i) => i.id));
      return;
    }
    const extra: Partial<BoardItem> = q.shape ? { shape: q.shape, color: ink } : {};
    if (q.shape === 'arrow') Object.assign(extra, { points: [0, 0, 160, 0], w: 160, h: 1 });
    const it = makeItem(q.type, wx, wy, extra);
    addItems(board.id, [it], 'Add ' + q.label.toLowerCase());
    onSelect([it.id]);
    if (q.type === 'note' || q.type === 'text' || q.type === 'frame') setEditing(it.id);
  };

  // ---- Drop from desktop / other tabs ----
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    // A project thing dragged from the side panel: a live card.
    const ref = e.dataTransfer.getData(REF_MIME);
    if (ref) {
      try {
        const r = JSON.parse(ref) as NonNullable<BoardItem['ref']>;
        const at = toWorld(e.clientX, e.clientY);
        const card = makeItem('card', at.x, at.y, { ref: r });
        addItems(board.id, [card], 'Add card');
        onSelect([card.id]);
      } catch { /* not ours */ }
      return;
    }
    const c = readTransfer(e.dataTransfer);
    if (!c.files.length && !c.images.length && !c.links.length && !c.text) return;
    const w = toWorld(e.clientX, e.clientY);
    const t = toast;
    if (c.files.length + c.images.length > 3) t(`Adding ${c.files.length + c.images.length} images…`);
    try {
      const items = await itemsFromTransfer(c, w.x, w.y);
      addItems(board.id, items, items.length > 1 ? `Drop ${items.length} items` : 'Drop item');
      onSelect(items.map((i) => i.id));
      const remote = items.filter((i) => i.imageUrl).length;
      if (remote) t(`${remote} image${remote > 1 ? 's' : ''} couldn't be copied (the site blocks it) — showing ${remote > 1 ? 'them' : 'it'} from the web, with the source link kept.`);
    } catch (err) { t((err as Error).message); }
  };

  // ---- Render ----
  const sorted = useMemo(() => [...board.items].sort((a, b) => a.z - b.z), [board.items]);
  const moveSet = drag?.kind === 'move' ? new Set(drag.ids) : null;
  const gridSize = 24 * view.s;

  const cursor = drag?.kind === 'pan' ? 'grabbing' : space || tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div
      ref={host}
      className={`board-canvas ${board.kind} ${dropHover ? 'drop-hover' : ''}`}
      style={{ cursor, backgroundSize: `${gridSize}px ${gridSize}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dropHover) setDropHover(true); }}
      onDragLeave={(e) => { if (!host.current!.contains(e.relatedTarget as Node)) setDropHover(false); }}
      onDrop={onDrop}
      tabIndex={0}
    >
      <div className="board-layer" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
        <Connectors board={board} moveSet={moveSet} off={drag?.kind === 'move' ? { x: drag.dx, y: drag.dy } : null} selected={selected} editing={editing}
          onEdit={(id, caption) => updateItems(board.id, [id], (x) => { x.caption = caption || undefined; }, 'Label connector')} onDoneEditing={() => setEditing(null)}
          live={drag?.kind === 'connect' ? drag : null} />
        {sorted.filter((it) => it.type !== 'connector').map((it) => {
          const off = moveSet?.has(it.id) && drag?.kind === 'move' ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          const rs = drag?.kind === 'resize' && drag.id === it.id ? { w: drag.dw, h: drag.dh } : { w: 0, h: 0 };
          return (
            <ItemView key={it.id} item={it} x={it.x + off.x} y={it.y + off.y} w={Math.max(24, it.w + rs.w)} h={Math.max(16, it.h + rs.h)}
              selected={selected.includes(it.id)} single={selected.length === 1} editing={editing === it.id}
              linking={!!linkHover && !!moveSet?.has(it.id)}
              onEdit={(patch) => updateItems(board.id, [it.id], (x) => Object.assign(x, patch), null)}
              onDoneEditing={() => setEditing(null)} />
          );
        })}
        {drag?.kind === 'stroke' && (
          <svg className="board-ink" style={{ left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
            {drag.pressures
              ? <PressureLine points={drag.points} pressures={drag.pressures} color={ink} width={3} />
              : <polyline points={pairs(drag.points)} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        )}
        {drag?.kind === 'marquee' && (
          <div className="marquee" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />
        )}
        {drag?.kind === 'create' && (
          <div className="marquee create" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />
        )}
      </div>

      {!board.items.length && (
        <div className="board-empty">
          <h3>{board.kind === 'mood' ? 'Drop images here' : board.kind === 'story' ? 'Map your story' : 'Start sketching'}</h3>
          <p>{board.kind === 'story'
            ? 'Drag characters, places, scenes or shots from the left onto the board · double-click for a note — type [[Name]] to link · drag an item’s ◦ handle to connect it, or into space for a new connected note'
            : 'Drag images from your desktop or another browser tab · paste with ⌘V · double-click anywhere to add a note, text, image, link, swatch, shape or section · import a Pinterest board from the toolbar'}</p>
        </div>
      )}

      {quick && (
        <div className="quick-add" style={{ left: quick.sx, top: quick.sy }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {QUICK.map((q) => (
            <button key={q.label} onClick={() => void quickAdd(q)}><span className="qi">{q.icon}</span>{q.label}</button>
          ))}
        </div>
      )}

      <div className="board-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => { const r = host.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); }} title="Zoom out">−</button>
        <button onClick={() => setView((v) => ({ ...v, s: 1 }))} title="Actual size">{Math.round(view.s * 100)}%</button>
        <button onClick={() => { const r = host.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); }} title="Zoom in">+</button>
        <button onClick={fit} title="Fit everything (0)">Fit</button>
      </div>
    </div>
  );
}

function readTransferFromString(s: string) {
  const dt = new DataTransfer();
  dt.setData('text/plain', s);
  return readTransfer(dt);
}

function pairs(p: number[]): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) out.push(`${p[i]},${p[i + 1]}`);
  return out.join(' ');
}

function ItemView({ item, x, y, w, h, selected, single, editing, linking, onEdit, onDoneEditing }: {
  item: BoardItem; x: number; y: number; w: number; h: number; selected: boolean; single: boolean; editing: boolean; linking: boolean;
  onEdit: (patch: Partial<BoardItem>) => void; onDoneEditing: () => void;
}) {
  const media = useMediaUrl(item.imageId);
  const src = media ?? item.imageUrl ?? null;
  const style: React.CSSProperties = { left: x, top: y, width: w, height: item.type === 'stroke' ? h : h, zIndex: undefined };
  const linked = (item.sceneIds?.length ?? 0) + (item.locationIds?.length ?? 0) + (item.characters?.length ?? 0) + (item.shotIds?.length ?? 0);

  let body: React.ReactNode = null;
  switch (item.type) {
    case 'image':
      body = src ? <img src={src} alt={item.caption ?? ''} draggable={false} /> : <div className="img-missing">Image unavailable</div>;
      break;
    case 'note':
      body = editing
        ? <textarea className="board-item-editor" autoFocus defaultValue={item.text} onBlur={(e) => { onEdit({ text: e.target.value }); onDoneEditing(); }} onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }} />
        : <div className="note-text">{item.text ? <NoteText text={item.text} /> : <span className="muted">Double-click to write · [[Name]] links</span>}</div>;
      break;
    case 'text':
      body = editing
        ? <textarea className="board-item-editor plain" autoFocus defaultValue={item.text} onBlur={(e) => { onEdit({ text: e.target.value }); onDoneEditing(); }} onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }} />
        : <div className="free-text" style={{ color: item.color, fontSize: Math.max(12, Math.min(96, h * 0.55)) }}>{item.text}</div>;
      break;
    case 'link':
      body = (
        <div className="link-card">
          <div className="link-host">🔗 {hostOf(item.sourceUrl ?? '')}</div>
          <div className="link-title">{item.caption || item.sourceUrl}</div>
        </div>
      );
      break;
    case 'swatch':
      body = (
        <div className="swatch-card">
          <div className="swatch-color" style={{ background: item.color }} />
          {editing
            ? <input className="board-item-editor" type="color" autoFocus defaultValue={item.color} onChange={(e) => onEdit({ color: e.target.value })} onBlur={onDoneEditing} />
            : <div className="swatch-label">{item.color?.toUpperCase()}{item.caption ? ` · ${item.caption}` : ''}</div>}
        </div>
      );
      break;
    case 'frame':
      body = editing
        ? <input className="board-item-editor frame-title-edit" autoFocus defaultValue={item.caption} onBlur={(e) => { onEdit({ caption: e.target.value }); onDoneEditing(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
        : <div className="frame-title">{item.caption}</div>;
      break;
    case 'shape':
      body = (
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          {item.shape === 'ellipse' && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="none" stroke={item.color} strokeWidth={item.strokeWidth ?? 3} />}
          {(item.shape === 'rect' || !item.shape) && <rect x={0} y={0} width={w} height={h} rx={6} fill="none" stroke={item.color} strokeWidth={item.strokeWidth ?? 3} />}
          {(item.shape === 'arrow' || item.shape === 'line') && item.points && (() => {
            const [x0, y0, x1, y1] = [item.points[0] * (w / Math.max(1, item.w)), item.points[1] * (h / Math.max(1, item.h)), item.points[2] * (w / Math.max(1, item.w)), item.points[3] * (h / Math.max(1, item.h))];
            const a = Math.atan2(y1 - y0, x1 - x0);
            const head = 14;
            return (
              <g stroke={item.color} strokeWidth={item.strokeWidth ?? 3} fill="none" strokeLinecap="round">
                <line x1={x0} y1={y0} x2={x1} y2={y1} />
                {item.shape === 'arrow' && <polyline points={`${x1 - head * Math.cos(a - 0.45)},${y1 - head * Math.sin(a - 0.45)} ${x1},${y1} ${x1 - head * Math.cos(a + 0.45)},${y1 - head * Math.sin(a + 0.45)}`} />}
              </g>
            );
          })()}
        </svg>
      );
      break;
    case 'card':
      body = <CardBody item={item} />;
      break;
    case 'stroke':
      body = (
        <svg width={w} height={h} style={{ overflow: 'visible' }}>
          {item.pressures
            ? <PressureLine points={(item.points ?? []).map((v, i) => (i % 2 === 0 ? v * (w / Math.max(1, item.w)) : v * (h / Math.max(1, item.h))))} pressures={item.pressures} color={item.color ?? '#000'} width={item.strokeWidth ?? 3} />
            : <polyline points={pairs((item.points ?? []).map((v, i) => (i % 2 === 0 ? v * (w / Math.max(1, item.w)) : v * (h / Math.max(1, item.h)))))} fill="none" stroke={item.color} strokeWidth={item.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      );
      break;
  }

  return (
    <div
      data-item-id={item.id}
      className={`board-item t-${item.type} ${selected ? 'sel' : ''} ${linking ? 'linking' : ''}`}
      style={{ ...style, background: item.type === 'note' ? item.color : item.type === 'frame' ? `${item.color}66` : undefined }}
    >
      {body}
      {item.type === 'image' && item.caption && <div className="img-caption">{item.caption}</div>}
      {(item.sourceUrl || item.pinUrl) && item.type === 'image' && <span className="src-badge" title={item.sourceUrl ?? item.pinUrl}>↗</span>}
      {linked > 0 && <span className="link-badge" title="Linked to scenes / locations / characters / shots">⛓ {linked}</span>}
      {selected && single && item.type !== 'stroke' && <span className="resize-handle" data-resize={item.id} />}
      {selected && single && item.type !== 'stroke' && item.type !== 'frame' && <span className="connect-handle" data-connect={item.id} title="Drag to another item to connect — or to empty space for a new connected note" />}
    </div>
  );
}


/** A pen stroke whose width follows the pressure at each point. */
function PressureLine({ points, pressures, color, width }: { points: number[]; pressures: number[]; color: string; width: number }) {
  const segs: JSX.Element[] = [];
  for (let i = 2; i < points.length; i += 2) {
    const p = ((pressures[i / 2 - 1] ?? 0.5) + (pressures[i / 2] ?? 0.5)) / 2;
    segs.push(<line key={i} x1={points[i - 2]} y1={points[i - 1]} x2={points[i]} y2={points[i + 1]} strokeWidth={widthFor(width * 1.4, p)} />);
  }
  if (points.length === 2) segs.push(<circle key="dot" cx={points[0]} cy={points[1]} r={widthFor(width * 1.4, pressures[0]) / 2} fill={color} stroke="none" />);
  return <g stroke={color} strokeLinecap="round">{segs}</g>;
}

/** Lines between connected items, following them as they move; labels in the middle. */
function Connectors({ board, moveSet, off, selected, editing, onEdit, onDoneEditing, live }: {
  board: Board; moveSet: Set<string> | null; off: { x: number; y: number } | null; selected: string[]; editing: string | null;
  onEdit: (id: string, caption: string) => void; onDoneEditing: () => void; live: { from: string; x1: number; y1: number } | null;
}) {
  const byId = new Map(board.items.map((i) => [i.id, i]));
  const box = (i: BoardItem) => (moveSet?.has(i.id) && off ? { x: i.x + off.x, y: i.y + off.y, w: i.w, h: i.h } : i);
  const lines = board.items.filter((i) => i.type === 'connector' && i.from && i.to && byId.has(i.from) && byId.has(i.to));
  const liveFrom = live ? byId.get(live.from) : undefined;
  return (
    <>
      <svg className="board-connectors" width={1} height={1}>
        <defs>
          {[...new Set(lines.map((l) => l.color ?? '#71717A'))].map((c) => (
            <marker key={c} id={`ah-${c.replace('#', '')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {lines.map((l) => {
          const a = box(byId.get(l.from!)!), b = box(byId.get(l.to!)!);
          const p0 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2), p1 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
          const c = l.color ?? '#71717A';
          const m = `url(#ah-${c.replace('#', '')})`;
          const sel = selected.includes(l.id);
          return (
            <g key={l.id} data-item-id={l.id} className={`conn ${sel ? 'sel' : ''}`}>
              <line className="conn-hit" x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} />
              <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={c} strokeWidth={(l.strokeWidth ?? 2) + (sel ? 1.5 : 0)} strokeDasharray={l.dashed ? '8 6' : undefined}
                markerEnd={(l.arrow ?? 'end') !== 'none' ? m : undefined} markerStart={l.arrow === 'both' ? m : undefined} />
            </g>
          );
        })}
        {live && liveFrom && (() => { const p0 = edgePoint(liveFrom, live.x1, live.y1); return <line className="conn-live" x1={p0.x} y1={p0.y} x2={live.x1} y2={live.y1} />; })()}
      </svg>
      {lines.filter((l) => l.caption || editing === l.id).map((l) => {
        const a = box(byId.get(l.from!)!), b = box(byId.get(l.to!)!);
        const mx = (a.x + a.w / 2 + b.x + b.w / 2) / 2, my = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
        return editing === l.id
          ? <input key={l.id} className="board-item-editor conn-label-edit" style={{ left: mx, top: my }} autoFocus defaultValue={l.caption} placeholder="Label"
              onBlur={(e) => { onEdit(l.id, e.target.value.trim()); onDoneEditing(); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
          : <span key={l.id} data-item-id={l.id} className={`conn-label ${selected.includes(l.id) ? 'sel' : ''}`} style={{ left: mx, top: my, borderColor: l.color }}>{l.caption}</span>;
      })}
    </>
  );
}
