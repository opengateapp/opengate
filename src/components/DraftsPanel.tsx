import { useEffect, useMemo, useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import type { ScriptDraft } from '../model/types';
import { derive, type Derived } from '../script/derive';
import { ELEMENT_LABELS, type Block } from '../script/schema';
import { REVISION_COLORS, colorInfo, compareScenes, diffBlocks, makeDraft, nextColor, pruneAuto, unpackDoc, type SceneChange } from '../script/drafts';
import { replaceScene, replaceScript, sceneBlocksIn } from '../script/variants';
import { session } from '../script/session';
import { displayName } from '../sync/engine';
import { canWrite, useSync } from '../sync/state';
import { Modal, toast } from './common';
import { askConfirm, askText } from './dialogs';
import { openActions } from './ActionSheet';
import { useLongPress } from '../ui/responsive';

// Write → Drafts: save named drafts of the script, read or compare any two, restore one or copy a
// single scene back, and run production revisions (colour pages, asterisks, locked pages).

export async function saveDraft(name: string, extra: Partial<ScriptDraft> = {}) {
  session.flush();
  const p = useStore.getState().project!;
  const draft = await makeDraft(p, name, { author: displayName() !== 'Guest' ? displayName() : undefined, ...extra });
  useStore.getState().update((d) => { d.drafts = pruneAuto([...(d.drafts ?? []), draft]); }, extra.auto ? null : `Save draft “${name}”`);
  return draft;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function DraftsPanel() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canWrite('write');
  const drafts = [...(p.drafts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [open, setOpen] = useState<{ draft: ScriptDraft; mode: 'read' | 'compare'; other?: ScriptDraft } | null>(null);
  const rev = p.revision;

  const save = async () => {
    const name = await askText('Save a draft', { initial: rev ? `${colorInfo(rev.color).label} revision` : `Draft ${drafts.filter((x) => !x.auto).length + 1}`, confirmLabel: 'Save draft', message: 'A frozen copy of the script as it is now. You can read it, compare it or go back to it any time.' });
    if (name?.trim()) { await saveDraft(name.trim()); toast(`Saved “${name.trim()}”`); }
  };

  const restore = async (dr: ScriptDraft) => {
    if (!(await askConfirm(`Go back to “${dr.name}”?`, { message: 'The script is replaced with this draft. The current script is saved as a draft first, so nothing is lost.', confirmLabel: 'Restore', danger: false }))) return;
    await saveDraft(`Before restoring “${dr.name}”`, { auto: 'restore' });
    replaceScript(await unpackDoc(dr.data));
    toast(`Restored “${dr.name}”`, { label: 'Undo', run: () => session.undo() });
  };

  const startRevisions = async () => {
    if (!(await askConfirm('Start production revisions?', { message: 'Saves the script as the locked White draft and locks scene numbers. From now on, changes are marked with * in the margin and printed on the next revision colour.', confirmLabel: 'Start', danger: false }))) return;
    const base = await saveDraft('White (locked)', { color: 'white' });
    lockSceneNumbers();
    update((d) => { d.revision = { color: 'blue', baseDraftId: base.id, date: new Date().toISOString(), lockPages: true }; }, 'Start revisions');
    session.relayout();
  };

  const nextRevision = async () => {
    if (!rev) return;
    const next = nextColor(rev.color);
    if (!(await askConfirm(`Issue the ${colorInfo(rev.color).label} pages and start ${colorInfo(next).label}?`, { message: `Saves the script as the ${colorInfo(rev.color).label} revision. New changes are then marked against it.`, confirmLabel: `Start ${colorInfo(next).label}`, danger: false }))) return;
    const base = await saveDraft(`${colorInfo(rev.color).label} revision`, { color: rev.color });
    update((d) => { d.revision = { ...d.revision!, color: next, baseDraftId: base.id, date: new Date().toISOString() }; }, `Start ${colorInfo(next).label} revision`);
    session.relayout();
  };

  return (
    <div className="drafts-panel keep-open">
      {!ro && <div className="pad-x"><button className="primary full" onClick={() => void save()}>＋ Save draft</button></div>}

      <div className="revision-box">
        {rev ? (
          <>
            <div className="row"><i className="rev-swatch" style={{ background: colorInfo(rev.color).hex }} /><b>{colorInfo(rev.color).label} revision</b><span className="muted small">since {new Date(rev.date).toLocaleDateString()}</span></div>
            <p className="muted small">Changes are marked * in the margin and printed on {colorInfo(rev.color).label.toLowerCase()} pages.</p>
            {!ro && <>
              <label className="check small"><input type="checkbox" checked={!!rev.lockPages} onChange={(e) => { update((d) => { d.revision!.lockPages = e.target.checked; }, 'Lock pages'); session.relayout(); }} /> Lock pages (new pages become 12A, 12B…)</label>
              <label className="field small"><span>Colour</span>
                <select value={rev.color} onChange={(e) => { update((d) => { d.revision!.color = e.target.value as typeof rev.color; }, 'Revision colour'); }}>{REVISION_COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
              </label>
              <div className="row wrap">
                <button className="small" onClick={() => void nextRevision()}>Next colour…</button>
                <button className="small" onClick={async () => { if (await askConfirm('Stop marking revisions?', { message: 'The asterisks and colour go away. Drafts and locked scene numbers stay.', confirmLabel: 'Stop', danger: false })) { update((d) => { delete d.revision; }, 'End revisions'); session.relayout(); } }}>End revisions</button>
              </div>
            </>}
          </>
        ) : (
          <>
            <p className="muted small">Shooting soon? Production revisions lock the script and mark every later change in colour.</p>
            {!ro && <button className="small" onClick={() => void startRevisions()}>Start production revisions…</button>}
          </>
        )}
      </div>

      <ul className="draft-list">
        {drafts.map((dr) => <DraftRow key={dr.id} dr={dr} ro={ro} base={rev?.baseDraftId === dr.id}
          onRead={() => setOpen({ draft: dr, mode: 'read' })} onCompare={(other) => setOpen({ draft: dr, mode: 'compare', other })} onRestore={() => void restore(dr)}
          onDelete={async () => { if (await askConfirm(`Delete draft “${dr.name}”?`, { message: rev?.baseDraftId === dr.id ? 'It is the base of the current revision; revisions will stop.' : undefined })) update((d) => { d.drafts = (d.drafts ?? []).filter((x) => x.id !== dr.id); if (d.revision?.baseDraftId === dr.id) delete d.revision; }, 'Delete draft'); }}
          onRename={async () => { const n = await askText('Rename draft', { initial: dr.name, confirmLabel: 'Rename' }); if (n?.trim()) update((d) => { const x = d.drafts?.find((y) => y.id === dr.id); if (x) { x.name = n.trim(); delete x.auto; } }, 'Rename draft'); }}
          others={drafts.filter((x) => x.id !== dr.id)} />)}
        {!drafts.length && <li className="muted small pad">No drafts yet. Save one before a big rewrite, or before sending the script out.</li>}
      </ul>
      {!ro && (
        <label className="check small pad-x"><input type="checkbox" checked={p.autoDrafts !== false} onChange={(e) => update((d) => { d.autoDrafts = e.target.checked; }, 'Daily drafts')} /> Save a draft automatically once a day while writing (and before imports)</label>
      )}
      {open && <DraftView draft={open.draft} mode={open.mode} other={open.other} ro={ro} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DraftRow({ dr, base, ro, others, onRead, onCompare, onRestore, onDelete, onRename }: {
  dr: ScriptDraft; base: boolean; ro: boolean; others: ScriptDraft[];
  onRead: () => void; onCompare: (other?: ScriptDraft) => void; onRestore: () => void; onDelete: () => void; onRename: () => void;
}) {
  const menu = (at?: { x: number; y: number }) => openActions(dr.name, [
    { label: 'Read', run: onRead },
    { label: 'Compare with the current script', run: () => onCompare() },
    ...(others.length ? [{ label: 'Compare with…', items: others.map((o) => ({ label: o.name, run: () => onCompare(o) })) }] : []),
    ...(ro ? [] : [{ label: 'Restore this draft…', run: onRestore }, { label: 'Rename…', run: onRename }, { label: 'Delete…', danger: true, run: onDelete }]),
  ], at);
  const lp = useLongPress((pos) => menu(pos));
  return (
    <li {...lp} onClick={onRead} onContextMenu={(e) => { e.preventDefault(); menu({ x: e.clientX, y: e.clientY }); }}>
      <div className="row">
        {dr.color && <i className="rev-swatch" style={{ background: colorInfo(dr.color).hex }} title={`${colorInfo(dr.color).label} pages`} />}
        <b className="grow">{dr.name}</b>
        {base && <span className="chip small" title="Changes are marked against this draft">base</span>}
        {dr.auto && <span className="muted small">auto</span>}
      </div>
      <span className="muted small">{when(dr.createdAt)}{dr.author ? ` · ${dr.author}` : ''} · {dr.pages} pp · {dr.scenes} sc</span>
      <div className="row draft-actions" onClick={(e) => e.stopPropagation()}>
        <button className="small" onClick={() => onCompare()}>Compare</button>
        {!ro && <button className="small" onClick={onRestore}>Restore</button>}
        <button className="small" aria-label="More" onClick={(e) => menu({ x: e.clientX, y: e.clientY })}>⋯</button>
      </div>
    </li>
  );
}

/** Read a draft, or compare it with the current script (or another draft). */
function DraftView({ draft, mode, other, ro, onClose }: { draft: ScriptDraft; mode: 'read' | 'compare'; other?: ScriptDraft; ro: boolean; onClose: () => void }) {
  const p = useProject();
  const current = useDerived();
  const [doc, setDoc] = useState<unknown>(null);
  const [otherDoc, setOtherDoc] = useState<unknown>(null);
  const [view, setView] = useState<'read' | 'compare'>(mode);
  useEffect(() => { void unpackDoc(draft.data).then(setDoc); if (other) void unpackDoc(other.data).then(setOtherDoc); }, [draft.data, other]);
  const from = useMemo(() => (doc ? derive(doc, true) : null), [doc]);
  const to: Derived | null = other ? (otherDoc ? derive(otherDoc, true) : null) : current;
  const toName = other ? other.name : 'Current script';
  const changes = useMemo(() => (from && to ? compareScenes(from, to) : []), [from, to]);

  const copyBack = async (sceneId: string, heading: string) => {
    const blocks = sceneBlocksIn(doc, sceneId);
    if (!blocks) return;
    const here = current.sceneById.has(sceneId);
    if (!(await askConfirm(here ? `Replace scene “${heading}” with the version from “${draft.name}”?` : `Put scene “${heading}” back into the script?`, { message: here ? 'Undo brings the current version back.' : 'It goes at the end of the script; drag it into place in the Scenes list or Stripboard.', confirmLabel: here ? 'Replace scene' : 'Add scene', danger: false }))) return;
    replaceScene(sceneId, blocks);
    toast('Scene copied from the draft', { label: 'Undo', run: () => session.undo() });
  };

  return (
    <Modal title={view === 'read' ? draft.name : `${draft.name} → ${toName}`} onClose={onClose} wide footer={<button className="primary" onClick={onClose}>Done</button>}>
      <div className="seg">
        <button className={view === 'read' ? 'active' : ''} onClick={() => setView('read')}>Read</button>
        <button className={view === 'compare' ? 'active' : ''} onClick={() => setView('compare')}>Compare with {other ? `“${other.name}”` : 'current'}</button>
      </div>
      {!from || !to ? <p className="muted">Opening…</p> : view === 'read' ? (
        <div className="script-preview">
          {from.blocks.map((b, i) => <PreviewBlock key={i} b={b} />)}
        </div>
      ) : (
        <>
          <p className="small">
            <b>{from.pageCount} → {to.pageCount} pages</b> ({to.pageCount - from.pageCount >= 0 ? '+' : ''}{to.pageCount - from.pageCount}) · {from.scenes.length} → {to.scenes.length} scenes · {from.wordCount.toLocaleString()} → {to.wordCount.toLocaleString()} words
          </p>
          {!changes.length && <p className="muted">No differences.</p>}
          <div className="scene-changes">
            {(['added', 'removed', 'changed', 'moved'] as const).map((k) => {
              const list = changes.filter((c) => c.kind === k);
              return list.length ? <span key={k} className={`chip ch-${k}`}>{list.length} {k}</span> : null;
            })}
          </div>
          {changes.map((c) => <SceneDiff key={c.id + c.kind} c={c} from={from} to={to} canCopy={!ro && !other && c.kind !== 'added'} onCopy={() => void copyBack(c.id, c.heading)} />)}
        </>
      )}
      <p className="muted small">{p.title} · saved {when(draft.createdAt)}{draft.author ? ` by ${draft.author}` : ''}</p>
    </Modal>
  );
}

function PreviewBlock({ b, mark }: { b: Block; mark?: 'add' | 'del' }) {
  if (b.type === 'pageBreak') return <hr className="pv-break" />;
  return <p className={`pv pv-${b.type} ${mark ? `pv-${mark}` : ''}`} title={ELEMENT_LABELS[b.type]}>{b.text || ' '}</p>;
}

function SceneDiff({ c, from, to, canCopy, onCopy }: { c: SceneChange; from: Derived; to: Derived; canCopy: boolean; onCopy: () => void }) {
  const [open, setOpen] = useState(c.kind === 'changed');
  const range = (d: Derived, id: string): Block[] => {
    const s = d.sceneById.get(id);
    if (!s) return [];
    const start = d.pagination.scenes[s.index].blockIndex;
    const next = d.scenes[s.index + 1];
    const end = next ? d.pagination.scenes[next.index].blockIndex : d.blocks.length;
    return d.blocks.slice(start, end);
  };
  const a = range(from, c.id), b = range(to, c.id);
  const ops = open ? diffBlocks(a, b) : [];
  const label = { added: 'Added', removed: 'Cut', changed: 'Changed', moved: 'Moved' }[c.kind];
  return (
    <div className={`scene-diff sd-${c.kind}`}>
      <div className="row">
        <button className="link grow left" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} <b>{c.number}</b> {c.heading} <span className={`chip small ch-${c.kind}`}>{label}</span></button>
        {canCopy && <button className="small" onClick={onCopy}>{c.kind === 'removed' ? 'Put back' : 'Use this version'}</button>}
      </div>
      {open && (
        <div className="script-preview diff">
          {ops.map((o, i) => o.op === 'same' ? <PreviewBlock key={i} b={b[o.b]} /> : o.op === 'add' ? <PreviewBlock key={i} b={b[o.b]} mark="add" /> : <PreviewBlock key={i} b={a[o.a]} mark="del" />)}
        </div>
      )}
    </div>
  );
}

/** Writes the current automatic scene numbers into the headings and locks them (A-scenes from then on). */
export function lockSceneNumbers() {
  const p = useStore.getState().project!;
  if (p.sceneNumbersLocked) return;
  session.flush();
  const d = derive(useStore.getState().project!.scriptDoc, false);
  session.run((s) => {
    const tr = s.tr;
    let i = 0;
    s.doc.forEach((n, off) => { if (n.type.name === 'sceneHeading') tr.setNodeMarkup(off, undefined, { ...n.attrs, number: d.scenes[i++]?.number ?? null }); });
    return tr;
  });
  session.flush();
  useStore.getState().update((dr) => { dr.sceneNumbersLocked = true; }, 'Lock scene numbers');
}

