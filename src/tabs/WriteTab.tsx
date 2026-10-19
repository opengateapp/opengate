import { useEffect, useState } from 'react';
import type { EditorState } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import { ScriptEditor } from '../components/ScriptEditor';
import { session } from '../script/session';
import { setElementType, ELEMENT_SHORTCUTS } from '../script/commands';
import { ELEMENT_LABELS } from '../script/schema';
import { useDerived, useProject, useStore } from '../store/project';
import type { ElementType } from '../model/types';
import { formatEighths } from '../model/dates';
import { TitlePageEditor, TitleLogoControls } from '../components/TitlePageEditor';
import { More } from '../components/More';
import { FindReplace } from '../components/FindReplace';
import { DraftsPanel, saveDraft } from '../components/DraftsPanel';
import { dailyDraftDue, colorInfo } from '../script/drafts';
import { saveVariant, switchVariant } from '../script/variants';
import { openActions } from '../components/ActionSheet';
import { askText, askConfirm } from '../components/dialogs';
import { canEdit } from '../sync/state';
import { useLongPress } from '../ui/responsive';
import type { DerivedScene } from '../model/types';
import { FRAMEWORKS, beatPage } from '../reference/story';
import { RefLink } from './ReferenceTab';

const BAR: ElementType[] = ['sceneHeading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'centered', 'pageBreak'];

export function WriteTab() {
  const d = useDerived();
  const p = useProject();
  const update = useStore((s) => s.update);
  const [current, setCurrent] = useState<{ type: ElementType; sceneId?: string }>({ type: 'action' });
  const [side, setSide] = useState<'title' | 'scenes' | 'characters' | 'drafts' | 'notes'>('scenes');

  // A draft a day while writing (when the script changed since the last one).
  useEffect(() => {
    const check = async () => {
      session.flush();
      const cur = useStore.getState().project;
      if (cur && canEdit('drafts') && await dailyDraftDue(cur)) await saveDraft(`Daily — ${new Date().toLocaleDateString()}`, { auto: 'daily' });
    };
    const t = setTimeout(() => void check(), 5000);
    const iv = setInterval(() => void check(), 30 * 60_000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [p.id]);

  const sceneMenu = (s: DerivedScene, at?: { x: number; y: number }) => {
    const variants = (p.sceneVariants ?? []).filter((v) => v.sceneId === s.id);
    const ro = !canEdit('sceneVariants');
    openActions(`${s.number}. ${s.heading}`, [
      { label: 'Go to scene', run: () => jumpTo(s.id) },
      ...(ro ? [] : [{ label: 'Save as a variant…', run: async () => {
        const name = await askText('Save this version of the scene', { initial: `Version ${variants.length + 2}`, confirmLabel: 'Save variant', message: 'Keeps the scene exactly as it is now under this name. Rewrite freely; switch back any time.' });
        if (name?.trim()) { if (!p.sceneVariantActive?.[s.id] && !variants.length) update((d) => { (d.sceneVariantActive ??= {})[s.id] = 'Original'; }, null); saveVariant(s.id, name.trim()); }
      } }]),
      ...(variants.length && !ro ? [{ label: `Switch version (now: ${p.sceneVariantActive?.[s.id] ?? 'Original'})`, items: variants.map((v) => ({ label: v.name, run: () => switchVariant(v.id) })) }] : []),
      ...(variants.length && !ro ? [{ label: 'Delete a variant…', items: variants.map((v) => ({ label: v.name, danger: true, run: async () => { if (await askConfirm(`Delete variant “${v.name}”?`)) update((d) => { d.sceneVariants = (d.sceneVariants ?? []).filter((x) => x.id !== v.id); }, 'Delete variant'); } })) }] : []),
    ], at);
  };
  const [findOpen, setFindOpen] = useState(false);

  const onState = (s: EditorState) => {
    const $f = s.selection.$from;
    const type = ($f.depth ? $f.node(1).type.name : 'action') as ElementType;
    // Find the heading above the cursor for the scene highlight.
    let sceneId: string | undefined;
    const idx = $f.index(0);
    for (let i = idx; i >= 0; i--) {
      const n = s.doc.child(i);
      if (n.type.name === 'sceneHeading') { sceneId = n.attrs.sceneId; break; }
    }
    setCurrent((c) => (c.type === type && c.sceneId === sceneId ? c : { type, sceneId }));
  };

  const jumpTo = (sceneId: string) => {
    session.run((s) => {
      let pos = -1;
      s.doc.forEach((n, off) => { if (pos < 0 && n.attrs.sceneId === sceneId) pos = off + 1; });
      if (pos < 0) return null;
      return s.tr.setSelection(TextSelection.create(s.doc, pos)).scrollIntoView();
    });
    session.focus();
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-scene-id="${sceneId}"]`);
      el?.scrollIntoView({ block: 'center' });
    });
  };

  const shortcut = (t: ElementType) => ELEMENT_SHORTCUTS.find(([, x]) => x === t)?.[0].replace('Mod', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');

  return (
    <div className="write-tab with-side">
      <aside className="side" data-panel="Scenes & characters" data-panel-pick>
        <div className="side-tabs keep-open">
          {(['title', 'scenes', 'characters', 'drafts', 'notes'] as const).map((s) => (
            <button key={s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        {side === 'title' && <TitleLogoControls />}
        {side === 'scenes' && (
          <ol className="scene-nav">
            {d.scenes.map((s, i) => [
              <BeatsBefore key={`b${s.id}`} frameworkId={p.structure?.frameworkId} pages={d.pageCount} from={i === 0 ? 0 : d.scenes[i - 1].startPage} to={s.startPage} first={i === 0} />,
              <SceneItem key={s.id} s={s} active={current.sceneId === s.id} variants={(p.sceneVariants ?? []).filter((v) => v.sceneId === s.id).length}
                onGo={() => jumpTo(s.id)} onMenu={(at) => sceneMenu(s, at)} />,
            ])}
            <BeatsBefore frameworkId={p.structure?.frameworkId} pages={d.pageCount} from={d.scenes[d.scenes.length - 1]?.startPage ?? 0} to={Infinity} first={!d.scenes.length} />
          </ol>
        )}
        {side === 'characters' && (
          <ul className="char-list">
            {d.characters.map((c) => (
              <li key={c.name}><b>{c.name}</b><span className="muted small">{c.lines} lines · {c.sceneIds.length} scenes</span></li>
            ))}
            {!d.characters.length && <li className="muted">Characters appear as you write character cues.</li>}
          </ul>
        )}
        {side === 'drafts' && <DraftsPanel />}
        {side === 'notes' && (
          <textarea className="notes" value={p.notes} placeholder="Project notes…" onChange={(e) => update((dr) => { dr.notes = e.target.value; }, null)} />
        )}
      </aside>
      {side === 'title' ? (
        <section className="main"><TitlePageEditor /></section>
      ) : (
      <section className="main">
        <div className="toolbar element-bar">
          {BAR.map((t) => (
            <button key={t} className={current.type === t ? 'active' : ''} title={shortcut(t) ? `${ELEMENT_LABELS[t]} (${shortcut(t)})` : ELEMENT_LABELS[t]}
              onMouseDown={(e) => { e.preventDefault(); session.run((s) => { let tr = null; setElementType(t)(s, (x) => { tr = x; }); return tr; }); }}>
              {ELEMENT_LABELS[t]}
            </button>
          ))}
          <span className="spacer" />
          <More label="Script tools">
          <button onClick={() => setFindOpen(true)} title="Find & replace (⌘F)">Find</button>
          <RefLink page="format" />
          <button onClick={() => setSide('title')}>Title page</button>
          <label className="check" title="Lock scene numbers so new scenes get A/B numbers">
            <input type="checkbox" checked={p.sceneNumbersLocked} onChange={(e) => {
              const lock = e.target.checked;
              session.flush();
              if (lock) {
                // Write the current auto numbers into the headings.
                session.run((s) => {
                  const tr = s.tr;
                  let i = 0;
                  s.doc.forEach((n, off) => {
                    if (n.type.name === 'sceneHeading') {
                      const num = d.scenes[i++]?.number;
                      tr.setNodeMarkup(off, undefined, { ...n.attrs, number: num ?? null });
                    }
                  });
                  return tr;
                });
              } else {
                session.run((s) => {
                  const tr = s.tr;
                  s.doc.forEach((n, off) => { if (n.type.name === 'sceneHeading') tr.setNodeMarkup(off, undefined, { ...n.attrs, number: null }); });
                  return tr;
                });
              }
              session.flush();
              update((dr) => { dr.sceneNumbersLocked = lock; }, lock ? 'Lock scene numbers' : 'Unlock scene numbers');
            }} /> Lock numbers
          </label>
          </More>
        </div>
        <div className="editor-scroll" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); setFindOpen(true); } }}>
          <ScriptEditor onState={onState} />
        </div>
        <footer className="statusbar">
          <span>{ELEMENT_LABELS[current.type]}</span>
          <span>{d.pageCount} pages</span>
          <span>{d.scenes.length} scenes</span>
          <span>{d.characters.length} characters</span>
          <span>{d.wordCount.toLocaleString()} words</span>
          {p.revision && <span className="rev-status" title="Production revisions: changes are marked * in the margin"><i className="rev-swatch" style={{ background: colorInfo(p.revision.color).hex }} />{colorInfo(p.revision.color).label} revision</span>}
          <span className="muted">Tab: change element · Enter: next element · ⌘1–8: element types</span>
        </footer>
      </section>
      )}
      {findOpen && <FindReplace onClose={() => setFindOpen(false)} />}
    </div>
  );
}

function SceneItem({ s, active, variants, onGo, onMenu }: { s: DerivedScene; active: boolean; variants: number; onGo: () => void; onMenu: (at?: { x: number; y: number }) => void }) {
  const lp = useLongPress((pos) => onMenu(pos));
  return (
    <li {...lp} className={active ? 'active' : ''} onClick={onGo} onContextMenu={(e) => { e.preventDefault(); onMenu({ x: e.clientX, y: e.clientY }); }}>
      <span className="num">{s.number}</span>
      <span className="h">{s.heading || '(untitled scene)'}</span>
      {variants > 0 && <span className="variant-badge" title={`${variants} other version${variants > 1 ? 's' : ''} — right-click or long-press to switch`}>⑂{variants}</span>}
      <span className="muted small">{formatEighths(s.eighths)}</span>
    </li>
  );
}

/** Beat markers (from the story structure in use) whose target page falls before this scene. */
function BeatsBefore({ frameworkId, pages, from, to, first }: { frameworkId?: string; pages: number; from: number; to: number; first: boolean }) {
  const fw = FRAMEWORKS.find((f) => f.id === frameworkId);
  if (!fw || !pages) return null;
  const beats = fw.beats.filter((b) => { const t = beatPage(b, pages); return (first ? t >= 0 : t > from) && t <= to; });
  return <>{beats.map((b) => <li key={b.name} className="beat-marker" title={b.what}><span>◆ {b.name}</span><span className="muted small">p. {beatPage(b, pages)}</span></li>)}</>;
}
