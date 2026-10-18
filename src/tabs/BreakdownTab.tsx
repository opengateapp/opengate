import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorState } from 'prosemirror-state';
import { TextSelection } from 'prosemirror-state';
import { ScriptEditor } from '../components/ScriptEditor';
import { session } from '../script/session';
import { useDerived, useProject, useStore, getDerived } from '../store/project';
import { sceneAt, selectedText, addTagMark, removeTagMarks } from '../script/tagging';
import { sceneCast, sceneEighths, sceneMinutes } from '../script/derive';
import { looksInScene, openCharacter } from '../script/characters';
import { formatEighths, parseEighths } from '../model/dates';
import { newId } from '../model/ids';
import type { Category, DerivedScene } from '../model/types';
import { ElementManager } from '../components/ElementManager';
import { TagPicker } from '../components/TagPicker';
import { LinkedImages } from '../components/LinkedImages';
import { toast } from '../components/common';
import { download, safeName } from '../io/files';
import { breakdownCsv } from '../io/reports';

export function BreakdownTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [sel, setSel] = useState<{ text: string; sceneId?: string; empty: boolean }>({ text: '', empty: true });
  const [sceneId, setSceneId] = useState<string | undefined>(d.scenes[0]?.id);
  const [managerOpen, setManagerOpen] = useState(false);
  const [focusEl, setFocusEl] = useState<string | null>(null);
  const [dropdown, setDropdown] = useState(false);
  const [popup, setPopup] = useState<{ top: number; left: number } | null>(null);
  const [popupOff, setPopupOff] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const scene = (sceneId && d.sceneById.get(sceneId)) || d.scenes[0];

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setDropdown(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const onState = (s: EditorState) => {
    const text = selectedText(s);
    const sid = sceneAt(s, s.selection.from);
    // Pop-up tag menu beside the highlighted text.
    const v = session.view;
    const box = scrollRef.current;
    if (!s.selection.empty && text && v && box) {
      try {
        const end = v.coordsAtPos(s.selection.to);
        const r = box.getBoundingClientRect();
        setPopup({ top: end.bottom - r.top + box.scrollTop + 6, left: Math.min(end.left - r.left + box.scrollLeft, box.clientWidth - 250) });
      } catch { setPopup(null); }
    } else { setPopup(null); setPopupOff(false); }
    setSel((o) => (o.text === text && o.sceneId === sid && o.empty === s.selection.empty ? o : { text, sceneId: sid, empty: s.selection.empty }));
    if (sid) setSceneId((o) => (o === sid ? o : sid));
  };

  const tag = (cat: Category) => {
    session.syncSelection();
    const s = session.state;
    const text = s ? selectedText(s) : '';
    if (!s || s.selection.empty || !text) { toast('Select words in the script first, then pick a category.'); return; }
    const raw = text.replace(/^[^\w]+|[^\w)]+$/g, '');
    // Script caps ("FILM CANISTER") become "Film Canister" in the breakdown.
    const name = cat.id !== 'cast' && raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : raw;
    const sid = sceneAt(s, s.selection.from);
    if (cat.id === 'cast') {
      const n = name.toUpperCase();
      addTagMark(`cast:${n}`, 'cast');
      if (sid) update((dr) => {
        const m = (dr.sceneMeta[sid] ??= {});
        m.extraCast = [...new Set([...(m.extraCast ?? []), n])];
      }, `Tag cast ${n}`);
      return;
    }
    const el = p.elements.find((e) => e.categoryId === cat.id && e.name.toLowerCase() === name.toLowerCase());
    const id = el?.id ?? newId();
    if (!el) update((dr) => { dr.elements.push({ id, categoryId: cat.id, name, sceneIds: [] }); }, `Add ${cat.name}: ${name}`);
    addTagMark(id, cat.id);
    setFocusEl(id);
  };
  const pick = (c: Category) => { tag(c); setDropdown(false); setPopupOff(true); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!e.altKey || !/^Digit[1-9]$/.test(e.code)) return;
    const cat = p.categories[Number(e.code.slice(5)) - 1];
    if (cat) { e.preventDefault(); tag(cat); }
  };

  const jump = (id: string) => {
    setSceneId(id);
    session.run((s) => {
      let pos = -1;
      s.doc.forEach((n, off) => { if (pos < 0 && n.attrs.sceneId === id) pos = off + 1; });
      return pos < 0 ? null : s.tr.setSelection(TextSelection.create(s.doc, pos)).scrollIntoView();
    });
    requestAnimationFrame(() => document.querySelector(`.breakdown-tab [data-scene-id="${id}"]`)?.scrollIntoView({ block: 'start' }));
  };

  return (
    <div className="breakdown-tab with-side" onKeyDown={onKey}>
      <aside className="side" data-panel="Scenes" data-panel-pick>
        <div className="side-head">
          <b>Scenes</b>
          <button className="small" onClick={() => setManagerOpen(true)}>Elements…</button>
        </div>
        <ol className="scene-nav">
          {d.scenes.map((s) => {
            const count = s.taggedElementIds.length + p.elements.filter((e) => e.sceneIds.includes(s.id)).length;
            return (
              <li key={s.id} className={scene?.id === s.id ? 'active' : ''} onClick={() => jump(s.id)}>
                <span className="num">{s.number}</span>
                <span className="h">{s.heading}</span>
                <span className="badge" title="Tagged elements">{count}</span>
              </li>
            );
          })}
        </ol>
        <button className="small full" onClick={() => download(`${safeName(p.title)} - breakdown.csv`, breakdownCsv(p, getDerived()), 'text/csv')}>Export breakdown CSV</button>
      </aside>
      <section className="main">
        <div className="toolbar tag-bar">
          <div className="menu-wrap" ref={dropRef}>
            <button className="primary" onMouseDown={(e) => { e.preventDefault(); setDropdown(!dropdown); }}>Tag as ▾</button>
            {dropdown && <div className="menu tag-menu"><TagPicker onPick={pick} /></div>}
          </div>
          <span className="muted small">{sel.empty ? 'Highlight words in the script — a tag menu pops up beside them.' : `“${sel.text.slice(0, 40)}${sel.text.length > 40 ? '…' : ''}”`}</span>
          <span className="spacer" />
          <span className="legend-inline">{p.categories.slice(0, 12).map((c) => <i key={c.id} title={c.name} style={{ background: c.color }} />)}</span>
        </div>
        <div className="editor-scroll rel" ref={scrollRef}>
          <ScriptEditor className="show-tags" onState={onState} onClickElement={(id) => setFocusEl(id)} />
          {popup && !popupOff && !dropdown && (
            <div className="tag-popup" style={{ top: popup.top, left: Math.max(8, popup.left) }} onKeyDown={(e) => { if (e.key === 'Escape') setPopupOff(true); }}>
              <div className="tag-popup-head"><b>Tag as</b><button className="icon-btn" onMouseDown={(e) => { e.preventDefault(); setPopupOff(true); }}>×</button></div>
              <TagPicker onPick={pick} compact />
            </div>
          )}
        </div>
      </section>
      <aside className="sheet" data-panel="Breakdown sheet">
        {scene ? <BreakdownSheet scene={scene} focusEl={focusEl} onFocus={setFocusEl} /> : <p className="muted pad">No scenes yet.</p>}
      </aside>
      {managerOpen && <ElementManager onClose={() => setManagerOpen(false)} />}
    </div>
  );
}

function BreakdownSheet({ scene, focusEl, onFocus }: { scene: DerivedScene; focusEl: string | null; onFocus: (id: string | null) => void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const meta = p.sceneMeta[scene.id] ?? {};
  const cast = sceneCast(p, scene);
  const [adding, setAdding] = useState<Record<string, string>>({});
  const elements = useMemo(() => p.elements.filter((e) => scene.taggedElementIds.includes(e.id) || e.sceneIds.includes(scene.id)), [p.elements, scene]);
  const setMeta = (fn: (m: NonNullable<typeof p.sceneMeta[string]>) => void, label: string | null = null) =>
    update((dr) => { fn((dr.sceneMeta[scene.id] ??= {})); }, label);

  const addManual = (catId: string) => {
    const name = (adding[catId] ?? '').trim();
    if (!name) return;
    if (catId === 'cast') {
      setMeta((m) => { m.extraCast = [...new Set([...(m.extraCast ?? []), name.toUpperCase()])]; }, 'Add cast');
    } else {
      const existing = p.elements.find((e) => e.categoryId === catId && e.name.toLowerCase() === name.toLowerCase());
      update((dr) => {
        if (existing) {
          const e = dr.elements.find((x) => x.id === existing.id)!;
          if (!e.sceneIds.includes(scene.id)) e.sceneIds.push(scene.id);
        } else dr.elements.push({ id: newId(), categoryId: catId, name, sceneIds: [scene.id] });
      }, 'Add element');
    }
    setAdding((a) => ({ ...a, [catId]: '' }));
  };

  const removeFromScene = (id: string, name: string) => {
    const restore = scene.taggedElementIds.includes(id) ? removeTagMarks(id, scene.id) : () => {};
    const before = p.elements.find((x) => x.id === id)?.sceneIds ?? [];
    update((dr) => {
      const e = dr.elements.find((x) => x.id === id);
      if (e) e.sceneIds = e.sceneIds.filter((s) => s !== scene.id);
    }, 'Remove element from scene');
    // Undo puts back both the script highlight and the scene link.
    toast(`Removed ${name} from this scene`, { label: 'Undo', run: () => {
      restore();
      update((dr) => { const e = dr.elements.find((x) => x.id === id); if (e) e.sceneIds = [...before]; }, 'Undo remove');
    } });
  };

  return (
    <div className="breakdown-sheet">
      <div className="sheet-head">
        <div className="sheet-num">{scene.number}</div>
        <div>
          <div className="sheet-heading">{scene.heading}</div>
          <div className="muted small">{scene.intExt} · {scene.set} · {scene.time} · p.{scene.startPage}</div>
        </div>
      </div>
      <div className="form-grid tight">
        <label className="field"><span>Pages (eighths)</span>
          <input defaultValue={formatEighths(sceneEighths(p, scene))} key={`e${scene.id}${meta.eighthsOverride}`}
            onBlur={(e) => { const v = parseEighths(e.target.value); setMeta((m) => { m.eighthsOverride = v && v !== scene.eighths ? v : undefined; }, 'Set page count'); }} />
        </label>
        <label className="field"><span>Est. minutes</span>
          <input type="number" min={0} value={sceneMinutes(p, scene)} onChange={(e) => setMeta((m) => { m.estimatedMinutes = Number(e.target.value) || undefined; })} />
        </label>
        <label className="field wide"><span>Synopsis</span>
          <input value={meta.synopsis ?? ''} placeholder={scene.firstAction} onChange={(e) => setMeta((m) => { m.synopsis = e.target.value; })} />
        </label>
      </div>
      {p.categories.map((c) => {
        const items = c.id === 'cast' ? cast.map((n) => ({ id: `cast:${n}`, name: n, manual: !scene.characters.includes(n) })) : elements.filter((e) => e.categoryId === c.id).map((e) => ({ id: e.id, name: e.name, manual: !scene.taggedElementIds.includes(e.id) }));
        if (!items.length && !['cast', 'extras', 'props', 'wardrobe', 'vehicles', 'setDressing'].includes(c.id) && adding[c.id] === undefined) return null;
        return (
          <div key={c.id} className="sheet-cat" style={{ '--c': c.color } as React.CSSProperties}>
            <div className="sheet-cat-head">
              <span className="dot" />{c.name}
              <button className="icon-btn" title={`Add ${c.name}`} onClick={() => setAdding((a) => ({ ...a, [c.id]: a[c.id] ?? '' }))}>+</button>
            </div>
            <ul>
              {items.map((it) => (
                <li key={it.id} className={focusEl === it.id ? 'focus' : ''} onClick={() => onFocus(it.id)}>
                  <span>{it.name}{c.id === 'cast' && (() => { const m = p.cast.find((x) => x.characterName === it.name); return m ? <span className="muted small"> · #{m.castNumber}{m.actorName ? ` ${m.actorName}` : ''}</span> : null; })()}
                    {c.id === 'cast' && (() => { const looks = looksInScene(p, it.name, scene.id); return looks.length ? <span className="cast-wardrobe" title={`Continuity: ${looks.join(', ')} — click for the character's profile`} onClick={(e) => { e.stopPropagation(); openCharacter(it.name); }}>👕</span> : null; })()}</span>
                  {(c.id !== 'cast' || it.manual) && (
                    <button className="icon-btn" title="Remove from this scene" onClick={(e) => {
                      e.stopPropagation();
                      if (c.id === 'cast') {
                        const restore = removeTagMarks(it.id, scene.id);
                        setMeta((m) => { m.extraCast = (m.extraCast ?? []).filter((x) => x !== it.name); }, 'Remove cast');
                        toast(`Removed ${it.name} from this scene`, { label: 'Undo', run: () => { restore(); setMeta((m) => { m.extraCast = [...new Set([...(m.extraCast ?? []), it.name])]; }, 'Undo remove'); } });
                      }
                      else removeFromScene(it.id, it.name);
                    }}>×</button>
                  )}
                </li>
              ))}
            </ul>
            {adding[c.id] !== undefined && (
              <input className="add-input" autoFocus placeholder={`Add ${c.name.toLowerCase()}…`} value={adding[c.id]}
                list={`dl-${c.id}`}
                onChange={(e) => setAdding((a) => ({ ...a, [c.id]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') addManual(c.id); if (e.key === 'Escape') setAdding((a) => { const n = { ...a }; delete n[c.id]; return n; }); }} />
            )}
            <datalist id={`dl-${c.id}`}>
              {(c.id === 'cast' ? [...p.cast.map((x) => x.characterName)] : p.elements.filter((e) => e.categoryId === c.id).map((e) => e.name)).map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
        );
      })}
      <LinkedImages match={(i) => !!i.sceneIds?.includes(scene.id) || !!i.characters?.some((c) => cast.includes(c))} />
      <label className="field wide"><span>Notes</span>
        <textarea rows={3} value={meta.notes ?? ''} onChange={(e) => setMeta((m) => { m.notes = e.target.value; })} />
      </label>
    </div>
  );
}
