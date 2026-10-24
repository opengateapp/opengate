import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleBar } from '../../visualize/planImage';
import { NumberInput, useUnits } from '../../components/NumberInput';
import { showDistance, storeDistance } from '../../model/units';
import type { Draft } from 'immer';
import { useDerived, useProject, useStore } from '../../store/project';
import type { PlanElement, PlanElementKind, Project, ScenePlan } from '../../model/types';
import { sceneCast } from '../../script/derive';
import { putMedia, useMediaUrl } from '../../store/media';
import { prepareImage } from '../storyboard/images';
import { blankShot } from '../ShotsTab';
import { FOCALS, KIND_LABEL, LIGHT_TYPES, SENSORS, fovDeg, kelvinColor, newElement, newPlan, sensorOf, shotTypeFor, syncMoveFrames } from '../../visualize/plan';
import { newId } from '../../model/ids';
import { syncPlanGear } from '../../budget/gear';
import { openActions } from '../../components/ActionSheet';
import { askConfirm } from '../../components/dialogs';
import { Empty, toast } from '../../components/common';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';
import { canEdit, useSync } from '../../sync/state';
import { isPalm, notePointer } from '../../ui/pen';
import { RefLink } from '../ReferenceTab';

// Shot designer: a top-down plan per scene. Actors, cameras (with lens-accurate angle of view),
// lights, props and walls on a grid in feet. Every camera is a shot in the Shot List (and so a
// panel in the Storyboard); cameras and lights fill the gear manifest.

const ADD_KINDS: PlanElementKind[] = ['actor', 'camera', 'light', 'prop', 'wall', 'door', 'window', 'text'];
const CONE = 28; // feet the angle-of-view cone is drawn out to
const DRAG_KIND = 'application/x-opengate-plan-kind';

type View = { x: number; y: number; w: number };

export function ShotDesignerTab() {
  const distance = useUnits().distance;
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('plans');
  const [sceneId, setSceneId] = useState<string>(() => d.scenes[0]?.id ?? '');
  const scene = d.sceneById.get(sceneId) ?? d.scenes[0];
  const plan = (p.plans ?? []).find((x) => x.sceneId === scene?.id);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: -4, y: -4, w: 44 });
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<null | { kind: 'move' | 'rotate' | 'key' | 'pan'; id?: string; key?: number; start: { x: number; y: number }; orig: { x: number; y: number; rot: number }; moved: boolean }>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<ReturnType<typeof setTimeout>>();
  const pinch = useRef<{ d0: number; w0: number } | null>(null);
  const bgUrl = useMediaUrl(plan?.backgroundId);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Frames everything on the plan (or a default 40-foot area when it's empty). */
  const fit = (pl = plan, asp = aspectRef.current) => {
    const pts = (pl?.elements ?? []).flatMap((e) => [{ x: e.x, y: e.y }, ...(e.path ?? [])]);
    if (!pts.length) { setView({ x: -4, y: -4, w: 44 }); return; }
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6;
    const w = Math.max(16, x1 - x0, (y1 - y0) / asp);
    setView({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (w * asp) / 2, w });
  };
  const aspectRef = useRef(0.7);
  useEffect(() => { setSel(null); fit(); }, [scene?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Edits the plan for this scene (making it on first use), then keeps the gear manifest in step. */
  const edit = (fn: (pl: Draft<ScenePlan>, dr: Draft<Project>) => void, label: string | null = 'Edit plan') => {
    if (!scene || ro) return;
    update((dr) => {
      dr.plans ??= [];
      let pl = dr.plans.find((x) => x.sceneId === scene.id);
      if (!pl) { pl = newPlan(scene.id) as Draft<ScenePlan>; dr.plans.push(pl); }
      fn(pl, dr);
      syncPlanGear(dr);
    }, label);
  };

  const toFeet = (clientX: number, clientY: number) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m);
    return { x: pt.x, y: pt.y };
  };
  const center = () => ({ x: view.x + view.w / 2, y: view.y + (view.w * aspect) / 2 });

  const add = (kind: PlanElementKind, place?: { x: number; y: number }) => {
    if (!scene) return;
    const basePlan = plan ?? newPlan(scene.id);
    // Added with a button: start in the middle and step aside from anything already there.
    let at = place ?? center();
    for (let i = 0; !place && i < 40 && basePlan.elements.some((e) => Math.hypot(e.x - at.x, e.y - at.y) < 1.5); i++) at = { x: at.x + 2.5, y: at.y + (i % 4 === 3 ? 2.5 : 0) };
    const el = newElement(kind, Math.round(at.x * 2) / 2, Math.round(at.y * 2) / 2, basePlan);
    if (kind === 'actor') {
      const cast = sceneCast(p, scene);
      const used = new Set(basePlan.elements.filter((e) => e.kind === 'actor').map((e) => e.character));
      const who = cast.find((c) => !used.has(c));
      if (who) { el.character = who; el.label = who; }
    }
    edit((pl, dr) => {
      if (kind === 'camera') {
        // A camera is a shot: add it to the Shot List for this scene.
        const order = dr.shots.filter((s) => s.sceneId === scene.id).length;
        const shot = blankShot(scene.id, order, `${scene.number}${String.fromCharCode(65 + (order % 26))}`);
        shot.name = el.label; shot.setup = el.label; shot.lens = `${el.focal}mm`; shot.shotType = shotTypeFor(el.focal ?? 35);
        dr.shots.push(shot);
        el.shotId = shot.id;
      }
      pl.elements.push(el);
    }, `Add ${KIND_LABEL[kind].toLowerCase()}`);
    setSel(el.id);
  };

  /** Right-click / long-press menu for an item on the plan. */
  const itemMenu = (el: PlanElement, at: { x: number; y: number }) => {
    if (ro) return;
    setSel(el.id);
    openActions(el.label || KIND_LABEL[el.kind], [
      { label: 'Turn left 15°', run: () => setEl(el.id, { rot: el.rot - 15 }, 'Rotate') },
      { label: 'Turn right 15°', run: () => setEl(el.id, { rot: el.rot + 15 }, 'Rotate') },
      ...(el.kind === 'camera' || el.kind === 'actor' ? [{ label: '＋ Move point', run: () => addMovePoint(el) }] : []),
      ...(el.path?.length ? [{ label: 'Clear move', run: () => setEl(el.id, { path: undefined }, 'Clear move') }] : []),
      ...(el.kind !== 'camera' ? [{ label: 'Duplicate', run: () => { const copy = { ...el, id: newId(), x: el.x + 2, y: el.y + 2, path: undefined }; edit((pl) => { pl.elements.push(copy); }, 'Duplicate'); setSel(copy.id); } }] : []),
      { label: 'Remove', danger: true, run: () => void remove(el) },
    ], at);
  };

  const addMovePoint = (el: PlanElement) => {
    const last = el.path?.[el.path.length - 1] ?? { x: el.x, y: el.y };
    const a = (el.rot * Math.PI) / 180;
    setEl(el.id, { path: [...(el.path ?? []), { x: Math.round((last.x + Math.cos(a) * 4) * 4) / 4, y: Math.round((last.y + Math.sin(a) * 4) * 4) / 4 }] }, 'Add move point');
  };

  const remove = async (el: PlanElement) => {
    const shot = el.shotId ? p.shots.find((s) => s.id === el.shotId) : undefined;
    const dropShot = shot ? await askConfirm(`Also remove shot ${shot.shotNumber} from the Shot List?`, { message: 'Keep it if you still want the shot without this camera position.', confirmLabel: 'Remove the shot too' }) : false;
    edit((pl, dr) => {
      pl.elements = pl.elements.filter((x) => x.id !== el.id);
      if (dropShot && shot) { dr.shots = dr.shots.filter((s) => s.id !== shot.id); dr.storyboard = dr.storyboard.filter((f) => f.shotId !== shot.id); }
    }, `Remove ${KIND_LABEL[el.kind].toLowerCase()}`);
    setSel(null);
  };

  const setEl = (id: string, patch: Partial<PlanElement>, label: string | null = null) => edit((pl, dr) => {
    const e = pl.elements.find((x) => x.id === id);
    if (!e) return;
    Object.assign(e, patch);
    // Keep the camera's shot in step with its lens and name.
    if (e.kind === 'camera' && e.shotId) {
      const s = dr.shots.find((x) => x.id === e.shotId);
      if (s) {
        if ('focal' in patch) { s.lens = `${e.focal}mm`; s.shotType = s.shotType || shotTypeFor(e.focal ?? 35); }
        if ('label' in patch) { s.name = e.label; s.setup = e.label; }
        if ('path' in patch && e.path?.length && !s.move) s.move = 'Track';
        // A moving camera gets a storyboard panel at its start, each move point and its end.
        if ('path' in patch) syncMoveFrames(dr, s.id, (e.path?.length ?? 0) + 1);
      }
    }
  }, label);

  // ---- pointer handling ----
  const onDown = (e: React.PointerEvent, target?: { id: string; kind: 'move' | 'rotate' | 'key'; key?: number }) => {
    notePointer(e);
    if (isPalm(e)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, w0: view.w };
      setDrag(null);
      return;
    }
    e.stopPropagation();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* gone */ }
    const pt = toFeet(e.clientX, e.clientY);
    if (target && !ro) {
      const el = plan?.elements.find((x) => x.id === target.id);
      if (!el) return;
      setSel(el.id);
      // Touch: hold still on an item for its menu (the touch version of right-click).
      clearTimeout(press.current);
      if (e.pointerType !== 'mouse' && target.kind === 'move') {
        const at = { x: e.clientX, y: e.clientY };
        press.current = setTimeout(() => { setDrag(null); itemMenu(el, at); }, 500);
      }
      const k = target.key != null ? el.path?.[target.key] : undefined;
      setDrag({ kind: target.kind, id: el.id, key: target.key, start: pt, orig: { x: k?.x ?? el.x, y: k?.y ?? el.y, rot: el.rot }, moved: false });
      return;
    }
    if (target) { setSel(target.id); return; }
    setSel(null);
    setDrag({ kind: 'pan', start: { x: e.clientX, y: e.clientY }, orig: { x: view.x, y: view.y, rot: 0 }, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const w = Math.max(8, Math.min(200, pinch.current.w0 * (pinch.current.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1))));
      setView((v) => ({ x: v.x + (v.w - w) / 2, y: v.y + ((v.w - w) * aspect) / 2, w }));
      return;
    }
    if (!drag) return;
    if (drag.kind === 'pan') {
      const r = svg.current!.getBoundingClientRect();
      const k = view.w / r.width;
      setView((v) => ({ ...v, x: drag.orig.x - (e.clientX - drag.start.x) * k, y: drag.orig.y - (e.clientY - drag.start.y) * k }));
      return;
    }
    const pt = toFeet(e.clientX, e.clientY);
    const snap = (n: number) => (e.shiftKey ? n : Math.round(n * 4) / 4);
    if (!drag.moved && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) < 0.15) return;
    clearTimeout(press.current);
    const live = { ...drag, moved: true };
    setDrag(live);
    if (drag.kind === 'move') setEl(drag.id!, { x: snap(drag.orig.x + pt.x - drag.start.x), y: snap(drag.orig.y + pt.y - drag.start.y) });
    if (drag.kind === 'rotate') {
      const el = plan!.elements.find((x) => x.id === drag.id)!;
      let deg = (Math.atan2(pt.y - el.y, pt.x - el.x) * 180) / Math.PI;
      if (!e.shiftKey) deg = Math.round(deg / 15) * 15;
      setEl(drag.id!, { rot: deg });
    }
    if (drag.kind === 'key') {
      const el = plan!.elements.find((x) => x.id === drag.id)!;
      const path = [...(el.path ?? [])];
      path[drag.key!] = { ...path[drag.key!], x: snap(drag.orig.x + pt.x - drag.start.x), y: snap(drag.orig.y + pt.y - drag.start.y) };
      setEl(drag.id!, { path });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    notePointer(e);
    clearTimeout(press.current);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    setDrag(null);
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const pt = toFeet(e.clientX, e.clientY);
        setView((v) => {
          const w = Math.max(8, Math.min(200, v.w * Math.exp(e.deltaY * 0.004)));
          const k = w / v.w;
          return { x: pt.x - (pt.x - v.x) * k, y: pt.y - (pt.y - v.y) * k, w };
        });
      } else {
        const r = el.getBoundingClientRect();
        setView((v) => ({ ...v, x: v.x + e.deltaX * (v.w / r.width), y: v.y + e.deltaY * (v.w / r.width) }));
      }
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') || !sel || !plan) return;
      const el = plan.elements.find((x) => x.id === sel);
      if (!el) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); void remove(el); }
      if (e.key.toLowerCase() === 'r') setEl(el.id, { rot: el.rot + (e.shiftKey ? -15 : 15) }, 'Rotate');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  // The plan's shape follows the canvas (tall on a phone held upright, wide on a desktop).
  const [aspect, setAspect] = useState(0.7);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { const { width, height } = e.contentRect; 
      if (width > 0 && height > 0) {
        const a = Math.max(0.4, Math.min(2.2, height / width));
        if (Math.abs(a - aspectRef.current) > 0.05) { aspectRef.current = a; setAspect(a); fit(undefined, a); }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [d.scenes.length]);
  const selected = plan?.elements.find((x) => x.id === sel);
  const grid = useMemo(() => {
    const lines: JSX.Element[] = [];
    const x0 = Math.floor(view.x), x1 = Math.ceil(view.x + view.w), y0 = Math.floor(view.y), y1 = Math.ceil(view.y + view.w * aspect);
    const step = view.w > 90 ? 5 : 1;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) lines.push(<line key={`x${x}`} x1={x} y1={y0} x2={x} y2={y1} className={x % 5 === 0 ? 'g5' : 'g1'} />);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) lines.push(<line key={`y${y}`} x1={x0} y1={y} x2={x1} y2={y} className={y % 5 === 0 ? 'g5' : 'g1'} />);
    return lines;
  }, [view, aspect]);

  if (!d.scenes.length) return <Empty title="No scenes yet"><p className="muted">Write or import a script, then block each scene here.</p></Empty>;

  return (
    <div className="designer with-side">
      <section className="main designer-main">
        <div className="toolbar">
          <select value={scene?.id} onChange={(e) => setSceneId(e.target.value)} aria-label="Scene">
            {d.scenes.map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}{(p.plans ?? []).some((x) => x.sceneId === s.id && x.elements.length) ? ' ●' : ''}</option>)}
          </select>
          {!ro && <span className="designer-add">
            {(['actor', 'camera', 'light'] as const).map((k) => <button key={k} draggable title={`Add a ${KIND_LABEL[k].toLowerCase()} (or drag it onto the plan)`} onDragStart={(e) => { e.dataTransfer.setData(DRAG_KIND, k); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => add(k)}>＋ {KIND_LABEL[k]}</button>)}
            <More label="More to add">
              {(['prop', 'wall', 'door', 'window', 'text'] as const).map((k) => <button key={k} draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_KIND, k); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => add(k)}>＋ {KIND_LABEL[k]}</button>)}
            </More>
          </span>}
          <span className="spacer" />
          <More label="Plan options">
            <button onClick={() => fit()}>Fit to plan</button>
            {!ro && <button onClick={() => fileRef.current?.click()}>{plan?.backgroundId ? 'Replace' : 'Add'} set drawing…</button>}
            {!ro && plan?.backgroundId && <button onClick={() => edit((pl) => { delete pl.backgroundId; }, 'Remove set drawing')}>Remove set drawing</button>}
          </More>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { const id = await putMedia(p.id, await prepareImage(f)); edit((pl) => { pl.backgroundId = id; pl.bgWidth ??= 40; pl.bgOpacity ??= 0.6; }, 'Set drawing'); } catch (err) { toast((err as Error).message); }
          }} />
        </div>
        <div className="designer-canvas">
          <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.w * aspect}`} preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes(DRAG_KIND)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
            onDrop={(e) => { const k = e.dataTransfer.getData(DRAG_KIND) as PlanElementKind; if (!k || ro) return; e.preventDefault(); add(k, toFeet(e.clientX, e.clientY)); }}
            onDoubleClick={(e) => {
              if (ro || e.target !== svg.current && !(e.target as Element).classList.contains('bg')) return;
              const at = toFeet(e.clientX, e.clientY);
              openActions('Add here', ADD_KINDS.map((k) => ({ label: KIND_LABEL[k], run: () => add(k, at) })), { x: e.clientX, y: e.clientY });
            }}>
            {bgUrl && plan && <image className="bg" href={bgUrl} x={0} y={0} width={plan.bgWidth ?? 40} opacity={plan.bgOpacity ?? 0.6} preserveAspectRatio="xMinYMin meet" />}
            <g className="grid">{grid}</g>
            {plan?.elements.filter((x) => x.path?.length).map((el) => (
              <g key={`p${el.id}`} className="path">
                <polyline points={[{ x: el.x, y: el.y }, ...el.path!].map((k) => `${k.x},${k.y}`).join(' ')} />
                {el.path!.map((k, i) => (
                  <g key={i} className="key" onPointerDown={(e) => onDown(e, { id: el.id, kind: 'key', key: i })}>
                    <circle cx={k.x} cy={k.y} r={0.45} />
                    <text x={k.x} y={k.y + 0.16} textAnchor="middle">{i + 1}</text>
                  </g>
                ))}
              </g>
            ))}
            {plan?.elements.map((el) => <ElementView key={el.id} el={el} selected={el.id === sel} onDown={(e, kind) => onDown(e, { id: el.id, kind })} onMenu={(at) => itemMenu(el, at)} />)}
            <g className="scale-bar" transform={`translate(${view.x + 1} ${view.y + view.w * aspect - 1.2})`}>
              <line x1={0} y1={0} x2={scaleBar(distance).len} y2={0} /><text x={scaleBar(distance).len / 2} y={-0.4} textAnchor="middle">{scaleBar(distance).label}</text>
            </g>
          </svg>
          {!plan?.elements.length && (
            <p className="designer-hint muted small"><Hint>{'Add actors, cameras and lights with the buttons above, or double-click the grid. Drag to move, use the round handle to turn. Each camera becomes a shot in the Shot List.'}</Hint></p>
          )}
        </div>
      </section>
      <aside className="side designer-side" data-panel="Inspector">
        {selected ? (
          <Inspector el={selected} ro={ro} scene={scene!} onSet={(patch, label) => setEl(selected.id, patch, label)} onRemove={() => void remove(selected)} onAddPoint={() => addMovePoint(selected)} />
        ) : (
          <PlanSummary plan={plan} onSelect={setSel} onBg={(patch) => edit((pl) => Object.assign(pl, patch), null)} ro={ro} />
        )}
      </aside>
    </div>
  );
}

function ElementView({ el, selected, onDown, onMenu }: { el: PlanElement; selected: boolean; onDown: (e: React.PointerEvent, kind: 'move' | 'rotate') => void; onMenu: (at: { x: number; y: number }) => void }) {
  const rot = el.rot;
  const handle = { x: el.x + Math.cos((rot * Math.PI) / 180) * 2.2, y: el.y + Math.sin((rot * Math.PI) / 180) * 2.2 };
  let body: JSX.Element;
  if (el.kind === 'camera') {
    const fov = fovDeg(el.focal ?? 35, sensorOf(el.sensor).w);
    const a1 = ((rot - fov / 2) * Math.PI) / 180, a2 = ((rot + fov / 2) * Math.PI) / 180;
    body = (
      <>
        <polygon className="cone" points={`${el.x},${el.y} ${el.x + Math.cos(a1) * CONE},${el.y + Math.sin(a1) * CONE} ${el.x + Math.cos(a2) * CONE},${el.y + Math.sin(a2) * CONE}`} />
        <g transform={`rotate(${rot} ${el.x} ${el.y})`}>
          <rect className="cam-body" x={el.x - 0.9} y={el.y - 0.6} width={1.3} height={1.2} rx={0.15} />
          <polygon className="cam-lens" points={`${el.x + 0.4},${el.y - 0.35} ${el.x + 0.9},${el.y - 0.55} ${el.x + 0.9},${el.y + 0.55} ${el.x + 0.4},${el.y + 0.35}`} />
        </g>
        <text className="el-label" x={el.x} y={el.y - 1.1} textAnchor="middle">{el.label.replace(/^Camera\s+/i, '')} · {el.focal}mm</text>
      </>
    );
  } else if (el.kind === 'actor') {
    body = (
      <>
        <circle className="actor" cx={el.x} cy={el.y} r={0.9} style={{ fill: el.color }} />
        <line className="facing" x1={el.x} y1={el.y} x2={el.x + Math.cos((rot * Math.PI) / 180) * 1.3} y2={el.y + Math.sin((rot * Math.PI) / 180) * 1.3} />
        <text className="el-label" x={el.x} y={el.y + 2} textAnchor="middle">{el.label}</text>
      </>
    );
  } else if (el.kind === 'light') {
    const c = kelvinColor(el.kelvin);
    const a1 = ((rot - 30) * Math.PI) / 180, a2 = ((rot + 30) * Math.PI) / 180;
    body = (
      <>
        <polygon className="beam" style={{ fill: c }} points={`${el.x},${el.y} ${el.x + Math.cos(a1) * 9},${el.y + Math.sin(a1) * 9} ${el.x + Math.cos(a2) * 9},${el.y + Math.sin(a2) * 9}`} />
        <circle className="light" cx={el.x} cy={el.y} r={0.6} style={{ fill: c }} />
        <text className="el-label" x={el.x} y={el.y + 1.6} textAnchor="middle">{el.lightType}{el.kelvin ? ` ${el.kelvin}K` : ''}</text>
      </>
    );
  } else if (el.kind === 'text') {
    body = <text className="el-note" x={el.x} y={el.y} textAnchor="middle" transform={`rotate(${rot} ${el.x} ${el.y})`}>{el.label}</text>;
  } else {
    const w = el.w ?? 3, h = el.h ?? 0.5;
    body = (
      <g transform={`rotate(${rot} ${el.x} ${el.y})`}>
        <rect className={`shape ${el.kind}`} x={el.x - w / 2} y={el.y - h / 2} width={w} height={h} style={{ fill: el.color }} />
        {el.kind === 'door' && <path className="door-swing" d={`M ${el.x - w / 2} ${el.y} A ${w} ${w} 0 0 1 ${el.x + w / 2} ${el.y - w}`} />}
        {el.kind !== 'wall' && el.label && <text className="el-label" x={el.x} y={el.y + h / 2 + 0.9} textAnchor="middle">{el.label}</text>}
      </g>
    );
  }
  return (
    <g className={`el el-${el.kind} ${selected ? 'sel' : ''}`} onPointerDown={(e) => onDown(e, 'move')} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMenu({ x: e.clientX, y: e.clientY }); }}>
      {body}
      {selected && el.kind !== 'text' && (
        <g className="rot-handle" onPointerDown={(e) => { e.stopPropagation(); onDown(e, 'rotate'); }}>
          <line x1={el.x} y1={el.y} x2={handle.x} y2={handle.y} />
          <circle cx={handle.x} cy={handle.y} r={0.4} />
        </g>
      )}
    </g>
  );
}

function Inspector({ el, ro, scene, onSet, onRemove, onAddPoint }: { el: PlanElement; ro: boolean; scene: { id: string; number: string }; onSet: (patch: Partial<PlanElement>, label?: string | null) => void; onRemove: () => void; onAddPoint: () => void }) {
  const dist = useUnits().distance;
  const p = useProject();
  const d = useDerived();
  const sc = d.sceneById.get(scene.id);
  const shot = el.shotId ? p.shots.find((s) => s.id === el.shotId) : undefined;
  const fov = el.kind === 'camera' ? fovDeg(el.focal ?? 35, sensorOf(el.sensor).w) : 0;
  return (
    <div className="inspector pad">
      <div className="side-head"><b>{KIND_LABEL[el.kind]}</b>{!ro && <button className="small danger-text" onClick={onRemove}>Remove</button>}</div>
      <label className="field"><span>Label</span><input disabled={ro} value={el.label} onChange={(e) => onSet({ label: e.target.value })} /></label>
      {el.kind === 'actor' && sc && (
        <label className="field"><span>Character</span>
          <select disabled={ro} value={el.character ?? ''} onChange={(e) => onSet({ character: e.target.value || undefined, label: e.target.value || el.label }, 'Set character')}>
            <option value="">—</option>
            {sceneCast(p, sc).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      )}
      {el.kind === 'camera' && <>
        <label className="field"><span>Lens — {el.focal}mm · {Math.round(fov)}° wide <RefLink page="dof" label="focus & depth" /></span>
          <div className="row">
            <select disabled={ro} value={FOCALS.includes(el.focal ?? 0) ? el.focal : ''} onChange={(e) => e.target.value && onSet({ focal: Number(e.target.value) }, 'Change lens')}>
              <option value="">Other</option>
              {FOCALS.map((f) => <option key={f} value={f}>{f}mm</option>)}
            </select>
            <NumberInput suffix="mm" className="cell-num small" min={4} decimals={1} disabled={ro} value={el.focal ?? 35} aria-label="Focal length" onChange={(n) => onSet({ focal: Math.max(4, n ?? 35) })} />
          </div>
        </label>
        <label className="field"><span>Sensor</span>
          <select disabled={ro} value={el.sensor ?? 's35'} onChange={(e) => onSet({ sensor: e.target.value }, 'Change sensor')}>
            {SENSORS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <p className="muted small">{shot ? <>Shot <b>{shot.shotNumber}</b> in the Shot List{shot.shotType ? ` · ${shot.shotType}` : ''}.</> : 'Not linked to a shot.'}</p>
      </>}
      {el.kind === 'light' && <>
        <label className="field"><span>Type</span>
          <select disabled={ro} value={el.lightType} onChange={(e) => onSet({ lightType: e.target.value }, 'Light type')}>{LIGHT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <label className="field"><span>Colour temperature {(el.kelvin ?? 5600) <= 3400 ? '(tungsten)' : (el.kelvin ?? 5600) >= 5000 ? '(daylight)' : ''}</span>
          <span className="row nowrap"><input type="range" min={2000} max={10000} step={100} disabled={ro} value={el.kelvin ?? 5600} aria-label="Colour temperature" onChange={(e) => onSet({ kelvin: Number(e.target.value) })} /><NumberInput suffix="K" className="cell-num small" min={1000} max={20000} decimals={0} grouping={false} disabled={ro} value={el.kelvin ?? 5600} aria-label="Kelvin" onChange={(n) => n && onSet({ kelvin: n })} /></span>
        </label>
      </>}
      {(el.kind === 'prop' || el.kind === 'wall' || el.kind === 'door' || el.kind === 'window') && (
        <div className="row">
          <label className="field"><span>Length</span><NumberInput suffix={dist} className="cell-num small" decimals={2} disabled={ro} value={showDistance(el.w ?? 3, dist)} onChange={(n) => n && onSet({ w: Math.max(0.25, storeDistance(n, dist)) })} /></label>
          <label className="field"><span>Depth</span><NumberInput suffix={dist} className="cell-num small" decimals={2} disabled={ro} value={showDistance(el.h ?? 0.5, dist)} onChange={(n) => n && onSet({ h: Math.max(0.1, storeDistance(n, dist)) })} /></label>
        </div>
      )}
      <label className="field"><span>Facing</span>
        <span className="row nowrap"><input type="range" min={-180} max={180} step={5} disabled={ro} value={((el.rot + 540) % 360) - 180} aria-label="Facing" onChange={(e) => onSet({ rot: Number(e.target.value) })} /><NumberInput suffix="°" className="cell-num small" min={0} max={359} decimals={0} disabled={ro} value={Math.round(((el.rot % 360) + 360) % 360)} aria-label="Facing in degrees" onChange={(n) => n != null && onSet({ rot: n })} /></span>
      </label>
      {(el.kind === 'camera' || el.kind === 'actor') && (
        <div className="field"><span>Movement {el.path?.length ? `· ${el.path.length} point${el.path.length > 1 ? 's' : ''}` : ''}</span>
          <div className="row">
            {!ro && <button className="small" onClick={onAddPoint}>＋ Move point</button>}
            {!ro && !!el.path?.length && <button className="small" onClick={() => onSet({ path: undefined }, 'Clear move')}>Clear</button>}
          </div>
          <p className="muted small">Drag the numbered points on the plan to shape the move.{el.kind === 'camera' && el.path?.length ? ` The storyboard has a panel for the start, each point and the end (${el.path.length + 1}).` : ''}</p>
        </div>
      )}
    </div>
  );
}

function PlanSummary({ plan, onSelect, onBg, ro }: { plan?: ScenePlan; onSelect: (id: string) => void; onBg: (patch: Partial<ScenePlan>) => void; ro: boolean }) {
  const dist = useUnits().distance;
  const p = useProject();
  const cams = plan?.elements.filter((e) => e.kind === 'camera') ?? [];
  return (
    <div className="inspector pad">
      <div className="side-head"><b>This scene</b></div>
      {!plan?.elements.length ? <p className="muted small">Nothing placed yet.</p> : (
        <>
          <h4>Cameras / shots</h4>
          <ul className="plan-list">
            {cams.map((c) => { const s = p.shots.find((x) => x.id === c.shotId); return <li key={c.id}><button className="link" onClick={() => onSelect(c.id)}>{c.label}</button> <span className="muted small">{c.focal}mm{s ? ` · shot ${s.shotNumber}` : ''}</span></li>; })}
            {!cams.length && <li className="muted small">No cameras yet.</li>}
          </ul>
          <h4>Also on the plan</h4>
          <ul className="plan-list">
            {plan.elements.filter((e) => e.kind !== 'camera').map((e) => <li key={e.id}><button className="link" onClick={() => onSelect(e.id)}>{e.label || KIND_LABEL[e.kind]}</button> <span className="muted small">{KIND_LABEL[e.kind]}</span></li>)}
          </ul>
        </>
      )}
      {plan?.backgroundId && (
        <>
          <h4>Set drawing</h4>
          <label className="field"><span>Width — {showDistance(plan.bgWidth ?? 40, dist)} {dist}</span><input type="range" min={10} max={200} disabled={ro} value={plan.bgWidth ?? 40} onChange={(e) => onBg({ bgWidth: Number(e.target.value) })} /></label>
          <label className="field"><span>Opacity — {Math.round((plan.bgOpacity ?? 0.6) * 100)}%</span><input type="range" min={0.1} max={1} step={0.05} disabled={ro} value={plan.bgOpacity ?? 0.6} onChange={(e) => onBg({ bgOpacity: Number(e.target.value) })} /></label>
        </>
      )}
      <p className="muted small"><Hint>{'Tip: double-click the grid to add something right there. R turns the selected item; Delete removes it. Cameras and lights also go on the gear list (Budget → Gear).'}</Hint></p>
    </div>
  );
}
