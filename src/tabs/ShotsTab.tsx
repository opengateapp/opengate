import { useMemo, useState } from 'react';
import { DurationInput, LensInput } from '../components/NumberInput';
import type { EditorState } from 'prosemirror-state';
import { ScriptEditor } from '../components/ScriptEditor';
import { session } from '../script/session';
import { useDerived, useProject, useStore, getDerived } from '../store/project';
import { sceneAt, selectedText, addShotMark, removeShotMarks } from '../script/tagging';
import { newId } from '../model/ids';
import type { DerivedScene, Shot } from '../model/types';
import { askText } from '../components/dialogs';
import { deletedToast } from '../components/deleted';
import { addSceneToScript } from '../script/scenes';
import { SHOT_TYPES, ANGLES, LENSES, MOVES, EQUIPMENT, FOCUS, LIGHTING, SOUND, PRIORITIES, SHOT_COLORS } from '../model/defaults';
import { Select, Modal, Field } from '../components/common';
import { download, safeName } from '../io/files';
import { More } from '../components/More';
import { LongPress } from '../components/ActionSheet';
import { shotListCsv, shotListXlsx } from '../io/reports';

export function blankShot(sceneId: string | null, order: number, shotNumber: string): Shot {
  return {
    id: newId(), sceneId, order, shotNumber, setup: '', name: '', subject: '', shotType: '', angle: '', lens: '', move: '',
    equipment: '', focus: '', lighting: '', sound: '', vfx: '', action: '', duration: '', priority: '', notes: '', quote: '',
    color: SHOT_COLORS[order % SHOT_COLORS.length],
  };
}

export function ShotsTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [showScript, setShowScript] = useState(true);
  const [sel, setSel] = useState<{ from: number; to: number; text: string; sceneId?: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState({ scene: '', type: '', priority: '', q: '' });
  const [dragId, setDragId] = useState<string | null>(null);

  // A shot belongs to the scene its script anchor is in; otherwise to the scene it was created for.
  const sceneOf = useMemo(() => {
    const m = new Map<string, string>();
    d.scenes.forEach((s) => s.shotIds.forEach((id) => m.set(id, s.id)));
    return (sh: Shot) => m.get(sh.id) ?? sh.sceneId;
  }, [d]);

  const onState = (s: EditorState) => {
    if (s.selection.empty) { setSel(null); return; }
    const text = selectedText(s);
    setSel({ from: s.selection.from, to: s.selection.to, text, sceneId: sceneAt(s, s.selection.from) });
  };

  const nextNumber = (sceneId: string | null) => {
    const sc = sceneId ? d.sceneById.get(sceneId) : undefined;
    const n = p.shots.filter((x) => sceneOf(x) === sceneId).length;
    return `${sc?.number ?? ''}${String.fromCharCode(65 + (n % 26))}`;
  };

  const addShot = (forScene: string | null, fromSel = false) => {
    let sceneId = forScene;
    let range: { from: number; to: number; text: string } | null = null;
    if (fromSel) {
      session.syncSelection();
      const st = session.state;
      if (!st || st.selection.empty) return;
      range = { from: st.selection.from, to: st.selection.to, text: selectedText(st) };
      sceneId = sceneAt(st, st.selection.from) ?? null;
    }
    const order = p.shots.filter((x) => sceneOf(x) === sceneId).length;
    const shot = blankShot(sceneId, order, nextNumber(sceneId));
    if (range) {
      shot.quote = range.text.slice(0, 300);
      shot.name = range.text.split(/\s+/).slice(0, 8).join(' ');
      addShotMark(shot.id, range.from, range.to);
    }
    update((dr) => { dr.shots.push(shot); }, 'Add shot');
    setEditing(shot.id);
  };

  const setField = (id: string, k: keyof Shot, v: string) => update((dr) => { (dr.shots.find((s) => s.id === id) as unknown as Record<string, string>)[k] = v; }, null);

  const remove = (id: string) => {
    removeShotMarks(id);
    // Its storyboard frames go too (same shot in the Storyboard).
    update((dr) => { dr.shots = dr.shots.filter((s) => s.id !== id); dr.storyboard = dr.storyboard.filter((f) => f.shotId !== id); }, 'Delete shot');
    deletedToast('shot');
  };

  const reorder = (dragged: string, target: string) => {
    if (dragged === target) return;
    update((dr) => {
      const t = dr.shots.find((s) => s.id === target)!;
      const sid = sceneOf(t as Shot);
      const list = dr.shots.filter((s) => sceneOf(s as Shot) === sid).sort((a, b) => a.order - b.order);
      const from = list.findIndex((s) => s.id === dragged);
      const to = list.findIndex((s) => s.id === target);
      if (from < 0 || to < 0) return;
      const [m] = list.splice(from, 1);
      list.splice(to, 0, m);
      list.forEach((s, i) => { s.order = i; });
    }, 'Reorder shots');
  };

  const matches = (sh: Shot) => (!filter.type || sh.shotType.split('/').includes(filter.type)) && (!filter.priority || sh.priority === filter.priority)
    && (!filter.q || JSON.stringify(sh).toLowerCase().includes(filter.q.toLowerCase()));
  const unassigned = p.shots.filter((sh) => { const s = sceneOf(sh); return !s || !d.sceneById.has(s); });
  // Shots can exist before there's a script: they sit in "No scene" until you give them one.
  const groups: { scene: DerivedScene | null; shots: Shot[] }[] = [
    ...d.scenes.filter((s) => !filter.scene || s.id === filter.scene).map((s) => ({
      scene: s as DerivedScene | null,
      shots: p.shots.filter((sh) => sceneOf(sh) === s.id).filter(matches).sort((a, b) => a.order - b.order),
    })),
    ...(!filter.scene || filter.scene === 'none' ? [{ scene: null, shots: unassigned.filter(matches).sort((a, b) => a.order - b.order) }] : []),
  ].filter((g) => g.scene || g.shots.length || !d.scenes.length);
  const editShot = p.shots.find((s) => s.id === editing);

  return (
    <div className={`shots-tab ${showScript ? 'split' : ''}`}>
      {showScript && (
        <section className="script-pane">
          <div className="toolbar">
            <span className="muted small">{sel ? `“${sel.text.slice(0, 40)}${sel.text.length > 40 ? '…' : ''}”` : 'Select script text to create a shot from it'}</span>
            <span className="spacer" />
            <button className="primary" disabled={!sel} onMouseDown={(e) => { e.preventDefault(); addShot(null, true); }}>✦ Mark as Shot</button>
          </div>
          <div className="editor-scroll compact">
            <ScriptEditor className="show-shots" onState={onState} onClickShot={(id) => setEditing(id)} />
          </div>
        </section>
      )}
      <section className="list-pane">
        <div className="toolbar">
          <button onClick={() => setShowScript(!showScript)}>{showScript ? 'Hide script' : 'Show script'}</button>
          <select value={filter.scene} onChange={(e) => setFilter({ ...filter, scene: e.target.value })}>
            <option value="">All scenes</option>
            {d.scenes.map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}</option>)}
            <option value="none">No scene</option>
          </select>
          <More label="Filters and export">
          <Select value={filter.type} options={SHOT_TYPES} placeholder="Any type" onChange={(v) => setFilter({ ...filter, type: v })} />
          <Select value={filter.priority} options={PRIORITIES} placeholder="Any priority" onChange={(v) => setFilter({ ...filter, priority: v })} />
          <input placeholder="Search shots…" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          <span className="spacer" />
          <span className="muted small">{p.shots.length} shots</span>
          <button onClick={async () => {
            const h = await askText('New scene', { placeholder: 'INT. LOCATION - DAY', confirmLabel: 'Add scene', message: 'Adds a scene heading to the end of the screenplay, so it shows up everywhere.' });
            if (h?.trim()) addSceneToScript(h);
          }}>+ Scene</button>
          <button onClick={() => download(`${safeName(p.title)} - shot list.csv`, shotListCsv(p, getDerived()), 'text/csv')}>CSV</button>
          <button onClick={async () => download(`${safeName(p.title)} - shot list.xlsx`, await shotListXlsx(p, getDerived()))}>Excel</button>
          </More>
        </div>
        <div className="shot-groups">
          {!d.scenes.length && <p className="muted small">No script yet — add shots below, or add scenes with “+ Scene”. They'll line up with the script when you write or import it.</p>}
          {groups.map(({ scene, shots }) => (
            <div key={scene?.id ?? 'none'} className="shot-group" onDoubleClick={(e) => { const t = e.target as HTMLElement; if (!t.closest('tr, button, input, select')) addShot(scene?.id ?? null); }} title="Double-click to add a shot">
              <div className="shot-group-head">
                {scene ? <><b>{scene.number}</b> <span>{scene.heading}</span></> : <><b>No scene</b> <span className="muted">Shots not tied to a scene yet — pick one under ⋯</span></>}
                <span className="muted small">{shots.length} shots</span>
                <button className="small" onClick={() => addShot(scene?.id ?? null)}>+ Shot</button>
              </div>
              {shots.length > 0 && (
                <table className="table shots cards-on-phone">
                  <thead><tr><th /><th>#</th><th>Description</th><th>Type</th><th>Angle</th><th>Lens</th><th>Move</th><th>Subject</th><th>Dur.</th><th>Priority</th><th /></tr></thead>
                  <tbody>
                    {shots.map((sh, i) => (
                      <LongPress as="tr" key={sh.id} title={`Shot ${sh.shotNumber || ''} ${sh.name || ''}`.trim()} actions={() => [
                        { label: 'Move up', disabled: i === 0, run: () => reorder(sh.id, shots[i - 1].id) },
                        { label: 'Move down', disabled: i === shots.length - 1, run: () => reorder(sh.id, shots[i + 1].id) },
                        { label: 'Delete shot', danger: true, run: () => remove(sh.id) },
                      ]} draggable onDragStart={() => setDragId(sh.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragId) reorder(dragId, sh.id); setDragId(null); }}>
                        <td><span className="grip" style={{ background: sh.color }} title="Drag to reorder" /></td>
                        <td><input className="w-sm" value={sh.shotNumber} onChange={(e) => setField(sh.id, 'shotNumber', e.target.value)} /></td>
                        <td><input value={sh.name} placeholder={sh.quote.slice(0, 40)} onChange={(e) => setField(sh.id, 'name', e.target.value)} /></td>
                        <td><Select value={sh.shotType} options={SHOT_TYPES.map((t) => t.code)} onChange={(v) => setField(sh.id, 'shotType', v)} /></td>
                        <td><Select value={sh.angle} options={ANGLES} onChange={(v) => setField(sh.id, 'angle', v)} /></td>
                        <td><LensInput value={sh.lens} options={LENSES} onChange={(v) => setField(sh.id, 'lens', v)} /></td>
                        <td><Select value={sh.move} options={MOVES} onChange={(v) => setField(sh.id, 'move', v)} /></td>
                        <td><input value={sh.subject} onChange={(e) => setField(sh.id, 'subject', e.target.value)} /></td>
                        <td><DurationInput compact className="w-sm" value={sh.duration} onChange={(v) => setField(sh.id, 'duration', v)} /></td>
                        <td><Select value={sh.priority} options={PRIORITIES} onChange={(v) => setField(sh.id, 'priority', v)} /></td>
                        <td className="actions">
                          <button className="icon-btn" title="All fields" onClick={() => setEditing(sh.id)}>⋯</button>
                          <button className="icon-btn" title="Delete" onClick={() => remove(sh.id)}>×</button>
                        </td>
                      </LongPress>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </section>
      {editShot && (
        <Modal title={`Shot ${editShot.shotNumber}`} onClose={() => setEditing(null)} wide footer={
          <><button onClick={() => { remove(editShot.id); setEditing(null); }}>Delete shot</button><button className="primary" onClick={() => setEditing(null)}>Done</button></>
        }>
          <div className="form-grid">
            <Field label="Scene">
              <select value={sceneOf(editShot) ?? ''} onChange={(e) => update((dr) => { const s = dr.shots.find((x) => x.id === editShot.id)!; s.sceneId = e.target.value || null; }, 'Move shot')}>
                <option value="">—</option>
                {d.scenes.map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}</option>)}
              </select>
            </Field>
            <Field label="Shot #"><input value={editShot.shotNumber} onChange={(e) => setField(editShot.id, 'shotNumber', e.target.value)} /></Field>
            <Field label="Setup"><input value={editShot.setup} onChange={(e) => setField(editShot.id, 'setup', e.target.value)} /></Field>
            <Field label="Description" wide><input value={editShot.name} onChange={(e) => setField(editShot.id, 'name', e.target.value)} /></Field>
            <Field label="Subject / character"><input value={editShot.subject} onChange={(e) => setField(editShot.id, 'subject', e.target.value)} /></Field>
            <Field label="Shot type"><Select value={editShot.shotType} options={SHOT_TYPES} onChange={(v) => setField(editShot.id, 'shotType', v)} /></Field>
            <Field label="Angle"><Select value={editShot.angle} options={ANGLES} onChange={(v) => setField(editShot.id, 'angle', v)} /></Field>
            <Field label="Lens"><LensInput value={editShot.lens} options={LENSES} onChange={(v) => setField(editShot.id, 'lens', v)} /></Field>
            <Field label="Camera move"><Select value={editShot.move} options={MOVES} onChange={(v) => setField(editShot.id, 'move', v)} /></Field>
            <Field label="Equipment"><Select value={editShot.equipment} options={EQUIPMENT} onChange={(v) => setField(editShot.id, 'equipment', v)} /></Field>
            <Field label="Focus"><Select value={editShot.focus} options={FOCUS} onChange={(v) => setField(editShot.id, 'focus', v)} /></Field>
            <Field label="Lighting"><Select value={editShot.lighting} options={LIGHTING} onChange={(v) => setField(editShot.id, 'lighting', v)} /></Field>
            <Field label="Sound"><Select value={editShot.sound} options={SOUND} onChange={(v) => setField(editShot.id, 'sound', v)} /></Field>
            <Field label="VFX / SFX"><input value={editShot.vfx} onChange={(e) => setField(editShot.id, 'vfx', e.target.value)} /></Field>
            <Field label="Est. duration"><DurationInput value={editShot.duration} onChange={(v) => setField(editShot.id, 'duration', v)} /></Field>
            <Field label="Priority"><Select value={editShot.priority} options={PRIORITIES} onChange={(v) => setField(editShot.id, 'priority', v)} /></Field>
            <Field label="Action" wide><textarea rows={2} value={editShot.action} onChange={(e) => setField(editShot.id, 'action', e.target.value)} /></Field>
            <Field label="Director notes" wide><textarea rows={2} value={editShot.notes} onChange={(e) => setField(editShot.id, 'notes', e.target.value)} /></Field>
            {editShot.quote && <Field label="Script text" wide><blockquote className="quote">{editShot.quote}</blockquote></Field>}
          </div>
        </Modal>
      )}
    </div>
  );
}


