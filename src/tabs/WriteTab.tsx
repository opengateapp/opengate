import { useState } from 'react';
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
import { FindReplace } from '../components/FindReplace';

const BAR: ElementType[] = ['sceneHeading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'shot', 'centered', 'pageBreak'];

export function WriteTab() {
  const d = useDerived();
  const p = useProject();
  const update = useStore((s) => s.update);
  const [current, setCurrent] = useState<{ type: ElementType; sceneId?: string }>({ type: 'action' });
  const [side, setSide] = useState<'title' | 'scenes' | 'characters' | 'notes'>('scenes');
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
      <aside className="side">
        <div className="side-tabs">
          {(['title', 'scenes', 'characters', 'notes'] as const).map((s) => (
            <button key={s} className={side === s ? 'active' : ''} onClick={() => setSide(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
          ))}
        </div>
        {side === 'title' && <TitleLogoControls />}
        {side === 'scenes' && (
          <ol className="scene-nav">
            {d.scenes.map((s) => (
              <li key={s.id} className={current.sceneId === s.id ? 'active' : ''} onClick={() => jumpTo(s.id)}>
                <span className="num">{s.number}</span>
                <span className="h">{s.heading || '(untitled scene)'}</span>
                <span className="muted small">{formatEighths(s.eighths)}</span>
              </li>
            ))}
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
          <button onClick={() => setFindOpen(true)} title="Find & replace (⌘F)">Find</button>
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
          <span className="muted">Tab: change element · Enter: next element · ⌘1–8: element types</span>
        </footer>
      </section>
      )}
      {findOpen && <FindReplace onClose={() => setFindOpen(false)} />}
    </div>
  );
}
