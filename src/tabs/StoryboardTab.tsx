import { useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { Empty, toast } from '../components/common';
import { askText } from '../components/dialogs';
import { deletedToast } from '../components/deleted';
import { RichText } from '../components/RichText';
import { LENSES, MOVES, SHOT_TYPES } from '../model/defaults';
import { newId } from '../model/ids';
import type { DerivedScene, Shot, StoryboardSettings } from '../model/types';
import { insertFrame, storyboardPanels, PANEL_SHOT_TYPES, shotTypeCodes, type Panel } from '../script/storyboard';
import { addSceneToScript } from '../script/scenes';
import { putMedia, useMediaUrl } from '../store/media';
import { FramingControls, GuideOverlay } from './storyboard/FramingControls';
import { formatOf, ghostAlpha } from './storyboard/formats';

import { FrameEditor } from './storyboard/FrameEditor';
import { exportStoryboardPdf } from './storyboard/render';
import { planPng } from '../visualize/planImage';
import { prepareImage } from './storyboard/images';
import { More, MoreMenu } from '../components/More';
import { usePhone } from '../ui/responsive';
import { Hint } from '../components/Hint';
import { blankShot } from './ShotsTab';

// Storyboard panels laid out like a storyboard sheet: scene / shot #, the frame, a set plan /
// reference box, shot-type checkboxes, lens and a formatted description. Panels and Shot List
// shots are the same records, so you can start in either tab.

const LAYOUTS: StoryboardSettings['perPage'][] = [1, 2, 3, 4, 6];
const DEFAULT: StoryboardSettings = { perPage: 2, showReference: true };

export function StoryboardTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const settings = p.storyboardSettings ?? DEFAULT;
  const phone = usePhone();
  const [editing, setEditing] = useState<{ frameId: string; layer: 'frame' | 'ref' } | null>(null);
  const [sceneFilter, setSceneFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const panels = storyboardPanels(p, d);
  const cols = settings.perPage >= 4 ? (settings.perPage === 4 ? 2 : 3) : 1;
  const showRef = settings.showReference && cols === 1;
  const setSettings = (patch: Partial<StoryboardSettings>) => update((dr) => { dr.storyboardSettings = { ...settings, ...patch }; }, 'Storyboard layout');

  const nextShotNumber = (sceneId: string | null) => {
    const sc = sceneId ? d.sceneById.get(sceneId) : undefined;
    const n = p.shots.filter((s) => (s.sceneId ?? null) === sceneId).length;
    return `${sc?.number ?? ''}${String.fromCharCode(65 + (n % 26))}`;
  };

  /** New panel = a new shot (it appears in the Shot List too) with one frame. */
  const addPanels = async (sceneId: string | null, files: Blob[] = []) => {
    const pr = useStore.getState().project!;
    const made: { shot: Shot; frameId: string; imageId?: string }[] = [];
    let order = pr.shots.filter((s) => (s.sceneId ?? null) === sceneId).length;
    const list = files.length ? files : [null];
    try {
      for (let i = 0; i < list.length; i++) {
        const shot = blankShot(sceneId, order, '');
        const sc = sceneId ? d.sceneById.get(sceneId) : undefined;
        shot.shotNumber = `${sc?.number ?? ''}${String.fromCharCode(65 + (order % 26))}`;
        order++;
        const f = list[i];
        made.push({ shot, frameId: newId(), imageId: f ? await putMedia(pr.id, await prepareImage(f)) : undefined });
      }
    } catch (e) { toast((e as Error).message); }
    if (!made.length) return;
    update((dr) => {
      for (const m of made) {
        dr.shots.push(m.shot);
        dr.storyboard.push({ id: m.frameId, shotId: m.shot.id, order: 0, imageId: m.imageId, rev: 0, caption: '' });
      }
    }, made.length > 1 ? `Add ${made.length} panels` : 'Add panel');
    if (files.length > 1) toast(`Added ${made.length} panels — one per image`);
  };

  /** The panel's frame, created on first use for shots that came from the Shot List. */
  const ensureFrame = (panel: Panel): string => {
    if (panel.frame) return panel.frame.id;
    const id = newId();
    update((dr) => { dr.storyboard.push({ id, shotId: panel.shot.id, order: 0, rev: 0, caption: '' }); }, null);
    return id;
  };

  /** The Shot Designer plan for a panel's scene, and the camera that is this shot. */
  const planFor = (panel: Panel) => {
    const plan = (p.plans ?? []).find((x) => x.sceneId === panel.shot.sceneId && x.elements.length);
    if (!plan) return null;
    const cam = plan.elements.find((e) => e.kind === 'camera' && e.shotId === panel.shot.id);
    // Moving camera: panel 1 = start, then each move point, last = end.
    const pos = cam?.path?.length ? Math.min(panel.frameNo - 1, cam.path.length) : 0;
    return { plan, cameraId: cam?.id, pos };
  };
  const applyPlan = async (panel: Panel, quiet = false) => {
    const f = planFor(panel);
    if (!f) return;
    try {
      await setImage(panel, await planPng(f.plan, f.cameraId, f.pos), 'ref');
      if (!quiet) toast(f.cameraId ? 'Set plan added — this shot’s camera is highlighted' : 'Set plan added (no camera in the plan is this shot yet)');
    } catch (e) { toast((e as Error).message); }
  };
  const fillPlans = async () => {
    const todo = panels.filter((x) => planFor(x) && !x.frame?.refImageId);
    if (!todo.length) { toast('Every panel with a Shot Designer plan already has a set plan.'); return; }
    if (!settings.showReference || cols > 1) setSettings({ showReference: true, ...(cols > 1 ? { perPage: 2 } : {}) });
    for (const x of todo) await applyPlan(x, true);
    toast(`Set plans added to ${todo.length} panel${todo.length > 1 ? 's' : ''}`);
  };

  const setImage = async (panel: Panel, file: Blob | undefined, layer: 'frame' | 'ref') => {
    if (!file) return;
    try {
      const imageId = await putMedia(p.id, await prepareImage(file));
      const frameId = ensureFrame(panel);
      update((dr) => {
        const f = dr.storyboard.find((x) => x.id === frameId);
        if (f) { if (layer === 'ref') f.refImageId = imageId; else f.imageId = imageId; f.rev++; }
      }, layer === 'ref' ? 'Set plan image' : 'Frame image');
    } catch (e) { toast((e as Error).message); }
  };

  const groups: { scene?: DerivedScene; panels: Panel[] }[] = [
    ...d.scenes.map((scene) => ({ scene, panels: panels.filter((x) => x.scene?.id === scene.id) })),
    { scene: undefined, panels: panels.filter((x) => !x.scene) },
  ].filter((g) => !sceneFilter || (g.scene?.id ?? 'none') === sceneFilter);

  return (
    <div className="storyboard-tab">
      <div className="toolbar">
        <h3>Storyboard</h3>
        <select value={sceneFilter} onChange={(e) => setSceneFilter(e.target.value)}>
          <option value="">All scenes</option>
          {d.scenes.map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}</option>)}
          <option value="none">Panels without a scene</option>
        </select>
        <MoreMenu label={`Framing: ${formatOf(settings).label}`} className="framing-menu" sheet={phone} icon={<span className="framing-btn"><span aria-hidden>▭</span> {formatOf(settings).short}{(settings.guides ?? []).length ? ` +${(settings.guides ?? []).filter((g) => g !== formatOf(settings).id).length}` : ''} ▾</span>}>
          <FramingControls />
        </MoreMenu>
        <More label="Storyboard options">
        <span className="muted small">Panels per page</span>
        <div className="seg">
          {LAYOUTS.map((n) => <button key={n} className={settings.perPage === n ? 'active' : ''} onClick={() => setSettings({ perPage: n })} title={n >= 4 ? `${n} per page in a grid` : `${n} per page with set plan box`}>{n}</button>)}
        </div>
        <label className="check" title={cols > 1 ? 'Set plan boxes show with 1–3 panels per page' : ''}>
          <input type="checkbox" checked={settings.showReference} disabled={cols > 1} onChange={(e) => setSettings({ showReference: e.target.checked })} /> Set plan / reference box
        </label>
        <span className="spacer" />
        {(p.plans ?? []).some((x) => x.elements.length) && <button onClick={() => void fillPlans()} title="Put each scene's Shot Designer plan in its panels' set plan boxes, with the right camera highlighted">⌖ Fill set plans from Shot Designer</button>}
        <button onClick={async () => {
          const h = await askText('New scene', { placeholder: 'INT. LOCATION - DAY', confirmLabel: 'Add scene', message: 'Adds a scene heading to the end of the screenplay, so it shows up everywhere.' });
          if (h?.trim()) addSceneToScript(h);
        }}>+ Scene</button>
        <button className="primary" disabled={!panels.length || busy} onClick={async () => {
          setBusy(true);
          try { await exportStoryboardPdf(useStore.getState().project!); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? 'Exporting…' : 'Export PDF'}</button>
        </More>
      </div>
      <div className="board scroll sb-scroll">
        {!d.scenes.length && !panels.length && (
          <Empty title="Start storyboarding">
            <p className="muted">You don't need a script or shot list first. Add panels below, drop in drawings you've already made, or add scenes with “+ Scene”. Every panel is also a shot in the Shot List.</p>
          </Empty>
        )}
        {groups.map(({ scene, panels: list }) => {
          const key = scene?.id ?? 'none';
          if (!scene && !list.length && d.scenes.length) return null;
          return (
            <section key={key} className={`sb-scene ${over === key ? 'drop-hover' : ''}`}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(key); } }}
              onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => {
                setOver(null);
                if ((e.target as HTMLElement).closest('.sb-drop')) return; // a frame / set plan box took it
                e.preventDefault();
                const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
                if (files.length) void addPanels(scene?.id ?? null, files);
              }}
              onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('sb-grid')) void addPanels(scene?.id ?? null); }}>
              <div className="sb-scene-head">
                <h4>{scene ? `${scene.number}. ${scene.heading}` : 'Panels without a scene'}</h4>
                <span className="muted small">{list.length} panel{list.length === 1 ? '' : 's'}</span>
                <span className="spacer" />
                <span className="muted small"><Hint>{'Drop images to add panels · double-click empty space'}</Hint></span>
                <button className="small" onClick={() => void addPanels(scene?.id ?? null)}>+ Panel</button>
              </div>
              <div className={`sb-grid cols-${cols}`}>
                {list.map((panel, i) => (
                  <PanelView key={`${panel.shot.id}:${panel.frameNo}`} panel={panel} showRef={showRef} compact={cols > 1}
                    onOpen={(layer) => setEditing({ frameId: ensureFrame(panel), layer })}
                    onImage={(file, layer) => void setImage(panel, file, layer)}
                    onPlan={planFor(panel) ? () => void applyPlan(panel) : undefined}
                    onMove={(dir) => {
                      const other = list[i + dir];
                      if (!other) return;
                      update((dr) => {
                        if (other.shot.id === panel.shot.id && panel.frame && other.frame) {
                          const a = dr.storyboard.find((f) => f.id === panel.frame!.id)!;
                          const b = dr.storyboard.find((f) => f.id === other.frame!.id)!;
                          [a.order, b.order] = [b.order, a.order];
                        } else {
                          const a = dr.shots.find((s) => s.id === panel.shot.id)!;
                          const b = dr.shots.find((s) => s.id === other.shot.id)!;
                          [a.order, b.order] = [b.order, a.order];
                        }
                      }, 'Reorder panels');
                    }}
                    canLeft={i > 0} canRight={i < list.length - 1}
                    ensureFrame={ensureFrame} shotPlaceholder={nextShotNumber(panel.shot.sceneId)} />
                ))}
                {!list.length && <button className="sb-empty" onClick={() => void addPanels(scene?.id ?? null)}>+ Add the first panel{scene ? ' for this scene' : ''}</button>}
              </div>
            </section>
          );
        })}
      </div>
      {editing && p.storyboard.some((f) => f.id === editing.frameId) && (
        <FrameEditor frameId={editing.frameId} layer={editing.layer} onClose={() => setEditing(null)} onSelect={(id) => setEditing({ frameId: id, layer: editing.layer })} />
      )}
    </div>
  );

}

/** One storyboard panel (its own component so typing in it never remounts it). */
function PanelView({ panel, showRef, compact, onOpen, onImage, onPlan, onMove, canLeft, canRight, ensureFrame, shotPlaceholder }: {
  panel: Panel; showRef: boolean; compact: boolean; onOpen: (layer: 'frame' | 'ref') => void; onImage: (f: File | undefined, layer: 'frame' | 'ref') => void;
  /** Put the Shot Designer plan for this shot's scene into the set plan box. */
  onPlan?: () => void;
  onMove: (dir: -1 | 1) => void; canLeft: boolean; canRight: boolean; ensureFrame: (panel: Panel) => string; shotPlaceholder: string;
}) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const { shot, frame } = panel;
  const setShot = (patch: Partial<Shot>, label: string | null = null) => update((dr) => { const s = dr.shots.find((x) => x.id === shot.id); if (s) Object.assign(s, patch); }, label);
  const codes = shotTypeCodes(shot.shotType);
  const toggleType = (code: string) => {
    const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
    setShot({ shotType: next.join('/') }, 'Shot type');
  };
  const otherTypes = SHOT_TYPES.filter((t) => !PANEL_SHOT_TYPES.some((x) => x.code === t.code));

  const remove = () => {
    const onlyFrame = !frame || p.storyboard.filter((f) => f.shotId === shot.id).length <= 1;
    update((dr) => {
      if (frame) dr.storyboard = dr.storyboard.filter((f) => f.id !== frame.id);
      // A panel that was the shot's only frame takes the shot with it (same record in the Shot List).
      if (onlyFrame) dr.shots = dr.shots.filter((s) => s.id !== shot.id);
    }, 'Delete panel');
    deletedToast(onlyFrame ? `panel and shot ${shot.shotNumber || ''}`.trim() : 'frame');
  };
  const addFrame = () => update((dr) => { insertFrame(dr, shot.id); }, 'Add frame');

  return (
    <article className={`sb-panel ${compact ? 'compact' : ''}`}>
      <div className="sb-main">
        <div className="sb-box">
          <div className="sb-head">
            <span className="sb-label">SCENE:</span>
            <select className="sb-scene-select" value={shot.sceneId ?? ''} onChange={(e) => setShot({ sceneId: e.target.value || null }, 'Move panel')}>
              <option value="">—</option>
              {d.scenes.map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}</option>)}
            </select>
            <span className="sb-shot"><span className="sb-label">SHOT #:</span>
              <input value={shot.shotNumber} placeholder={shotPlaceholder} onChange={(e) => setShot({ shotNumber: e.target.value })} />
              {panel.frameCount > 1 && <span className="muted small">{panel.frameNo}/{panel.frameCount}</span>}
            </span>
          </div>
          <DropBox framed className="sb-frame" imageId={frame?.imageId} drawingId={frame?.drawingId} ghosts={frame?.ghosts} ghostFade={frame?.ghostFade} empty="Click to draw · drop or upload an image"
            onOpen={() => onOpen('frame')} onFile={(f) => onImage(f, 'frame')} />
        </div>
        {showRef && (
          <div className="sb-box sb-ref">
            <div className="sb-head"><span className="sb-label">SET PLAN / REFERENCE</span>
              {onPlan && <button className="small sb-plan-btn" title="Use this scene's top-down plan from the Shot Designer, with this shot's camera highlighted" onClick={onPlan}>⌖ Shot Designer plan</button>}
            </div>
            <DropBox className="sb-frame" imageId={frame?.refImageId} drawingId={frame?.refDrawingId} empty="Overhead plan or reference photo"
              onOpen={() => onOpen('ref')} onFile={(f) => onImage(f, 'ref')} />
          </div>
        )}
      </div>
      <div className="sb-meta">
        <div className="sb-types">
          {PANEL_SHOT_TYPES.map((t) => (
            <label key={t.code} className="sb-check" title={SHOT_TYPES.find((x) => x.code === t.code)?.label}>
              <input type="checkbox" checked={codes.includes(t.code)} onChange={() => toggleType(t.code)} /> {t.label}
            </label>
          ))}
          <select className="sb-more" value="" onChange={(e) => e.target.value && toggleType(e.target.value)} title="Other shot types">
            <option value="">More…</option>
            {otherTypes.map((t) => <option key={t.code} value={t.code}>{codes.includes(t.code) ? '✓ ' : ''}{t.code} — {t.label}</option>)}
          </select>
        </div>
        <div className="sb-lens">
          <span className="sb-label">LENS:</span>
          <input list="sb-lenses" value={shot.lens} onChange={(e) => setShot({ lens: e.target.value })} />
          {!compact && (
            <select value={shot.move} onChange={(e) => setShot({ move: e.target.value }, 'Camera move')} title="Camera move">
              <option value="">Move…</option>
              {MOVES.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
        </div>
      </div>
      <RichText value={frame?.descDoc} text={shot.action} placeholder="Description, action, notes…"
        onChange={(json, plain) => {
          const frameId = ensureFrame(panel);
          update((dr) => {
            const s = dr.shots.find((x) => x.id === shot.id);
            if (s) s.action = plain;
            const f = dr.storyboard.find((x) => x.id === frameId);
            if (f) f.descDoc = json;
          }, null);
        }} />
      <div className="sb-actions">
        <button className="icon-btn" disabled={!canLeft} onClick={() => onMove(-1)} title="Move earlier">◀</button>
        <button className="icon-btn" disabled={!canRight} onClick={() => onMove(1)} title="Move later">▶</button>
        <button className="small" onClick={addFrame} title="Another frame for the same shot">+ Frame</button>
        <span className="spacer" />
        <button className="small" onClick={remove}>Delete</button>
      </div>
      <datalist id="sb-lenses">{LENSES.map((l) => <option key={l} value={l} />)}</datalist>
    </article>
  );
}

/** Frame / set plan box: click to draw, drop or upload an image. */
/** An onion-skin pose in a finished panel: the drawing at its ghost opacity. */
function GhostLayer({ id, alpha }: { id: string; alpha: number }) {
  const url = useMediaUrl(id);
  return url ? <img src={url} alt="" className="layer" style={{ opacity: alpha }} /> : null;
}

function DropBox({ className, imageId, drawingId, ghosts = [], ghostFade, empty, onOpen, onFile, framed }: { className: string; imageId?: string; drawingId?: string; ghosts?: { id: string; drawingId: string }[]; ghostFade?: number; empty: string; onOpen: () => void; onFile: (f: File | undefined) => void; framed?: boolean }) {
  // Frame panels take the storyboard's format and show its frame guides; set plan boxes don't.
  const sb = useProject().storyboardSettings;
  const fmt = formatOf(sb);
  const guideIds = framed && sb?.guidesInPrint !== false ? (sb?.guides ?? []).filter((g) => g !== fmt.id) : [];
  const img = useMediaUrl(imageId);
  const drawing = useMediaUrl(drawingId);
  const [over, setOver] = useState(false);
  return (
    <div className={`${className} sb-drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); onFile([...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))); }}>
      <button className="sb-canvas" onClick={onOpen} title="Open the drawing tools" style={framed ? (fmt.ratio >= 1 ? { aspectRatio: String(fmt.ratio) } : { aspectRatio: String(fmt.ratio), width: 'auto', height: 'min(62vh, 560px)', maxWidth: '100%', margin: '0 auto' }) : undefined}>
        {img && <img src={img} alt="" />}
        {ghosts.map((g, i) => <GhostLayer key={g.id} id={g.drawingId} alpha={ghostAlpha(i, ghosts.length, ghostFade)} />)}
        {drawing && <img src={drawing} alt="" className="layer" />}
        {!img && !drawing && !ghosts.length && <span className="muted small">{empty}</span>}
        {framed && <GuideOverlay ratio={fmt.ratio} ids={guideIds} />}
      </button>
      <label className="sb-upload" title="Upload an image">⇪<input type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
    </div>
  );
}
