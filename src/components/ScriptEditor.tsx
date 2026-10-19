import { uiZoom } from '../prefs';
import { useEffect, useRef, useState } from 'react';
import { EditorView } from 'prosemirror-view';
import type { EditorState } from 'prosemirror-state';
import { session } from '../script/session';
import { canWrite } from '../sync/state';
import { useStore, getDerived } from '../store/project';
import type { ElementType } from '../model/types';

interface Props {
  className?: string;
  onState?: (s: EditorState) => void;
  onClickElement?: (elementId: string) => void;
  onClickShot?: (shotId: string) => void;
  readOnly?: boolean;
}

interface Suggest { items: string[]; index: number; from: number; to: number; top: number; left: number }

const HEADING_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EXT./INT. ', 'I/E. '];
const TIMES = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'MOMENTS LATER'];
const TRANSITIONS = ['CUT TO:', 'FADE OUT.', 'FADE TO BLACK.', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE IN:'];

function computeSuggest(state: EditorState, view: EditorView): Suggest | null {
  const sel = state.selection;
  if (!sel.empty) return null;
  const $from = sel.$from;
  const node = $from.parent;
  const type = node.type.name as ElementType;
  if ($from.parentOffset !== node.content.size) return null;
  const text = node.textContent;
  const start = $from.start();
  const d = getDerived();
  let items: string[] = [];
  let from = start;
  const up = text.toUpperCase();

  if (type === 'character') {
    if (!text.trim()) return null;
    items = d.characters.map((c) => c.name).filter((n) => n.startsWith(up.trim()) && n !== up.trim());
  } else if (type === 'transition') {
    items = TRANSITIONS.filter((t) => t.startsWith(up) && t !== up);
  } else if (type === 'sceneHeading') {
    const pre = up.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s+/);
    if (!pre) {
      items = HEADING_PREFIXES.filter((p) => p.startsWith(up) && p !== up);
    } else {
      const rest = up.slice(pre[0].length);
      const dash = rest.match(/^(.*?)\s+[-–—]\s*(.*)$/);
      if (dash) {
        from = start + pre[0].length + rest.length - dash[2].length;
        items = TIMES.filter((t) => t.startsWith(dash[2]) && t !== dash[2]);
      } else {
        from = start + pre[0].length;
        items = d.sets.map((s) => s.name).filter((n) => n.startsWith(rest) && n !== rest);
        if (!rest) items = items.slice(0, 8);
      }
    }
  }
  if (!items.length) return null;
  const coords = view.coordsAtPos($from.pos);
  const host = (view.dom.closest('.script-editor') as HTMLElement) ?? view.dom;
  const box = host.getBoundingClientRect();
  const zoom = Number((view.dom.closest('.script-page') as HTMLElement | null)?.style.zoom || 1) * uiZoom();
  return { items: items.slice(0, 8), index: 0, from, to: $from.pos, top: (coords.bottom - box.top) / zoom + 4, left: (coords.left - box.left) / zoom };
}

export function ScriptEditor({ className, onState, onClickElement, onClickShot, readOnly }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const suggestRef = useRef<Suggest | null>(null);
  suggestRef.current = suggest;
  const scriptDoc = useStore((s) => s.project?.scriptDoc);
  const cbs = useRef({ onState, onClickElement, onClickShot });
  cbs.current = { onState, onClickElement, onClickShot };

  useEffect(() => {
    const state = session.ensure();
    session.beforeMount();
    const view = new EditorView(host.current!, {
      state,
      // View-only links can read and select the script but not type in it.
      editable: () => !readOnly && canWrite('script'),
      dispatchTransaction: (tr) => session.dispatch(tr),
      handleClickOn: (_v, _pos, _node, _np, event) => {
        const t = event.target as HTMLElement;
        const tag = t.closest('[data-element-id]') as HTMLElement | null;
        if (tag && cbs.current.onClickElement) { cbs.current.onClickElement(tag.dataset.elementId!); return false; }
        const shot = t.closest('[data-shot-id]') as HTMLElement | null;
        if (shot && cbs.current.onClickShot) { cbs.current.onClickShot(shot.dataset.shotId!); return false; }
        return false;
      },
    });
    viewRef.current = view;
    session.attach(view);
    const accept = (s: Suggest, value: string) => {
      session.run((st) => {
        let v = value;
        if (st.doc.resolve(s.to).parent.type.name === 'sceneHeading' && /^(INT|EXT|I\/E|EST)/.test(v) === false && !TIMES.includes(v)) v = v + ' - ';
        return st.tr.insertText(v, s.from, s.to);
      });
      setSuggest(null);
    };
    session.acHooks = {
      onKey: (key) => {
        const s = suggestRef.current;
        if (!s) return false;
        if (key === 'Escape') { setSuggest(null); return true; }
        if (key === 'ArrowDown') { setSuggest({ ...s, index: (s.index + 1) % s.items.length }); return true; }
        if (key === 'ArrowUp') { setSuggest({ ...s, index: (s.index - 1 + s.items.length) % s.items.length }); return true; }
        if (key === 'Enter' || key === 'Tab') { accept(s, s.items[s.index]); return true; }
        return false;
      },
    };
    (view as unknown as { _accept: typeof accept })._accept = accept;
    const unsub = session.subscribe((s) => {
      cbs.current.onState?.(s);
      if (view.hasFocus()) setSuggest(computeSuggest(s, view));
    });
    cbs.current.onState?.(state);
    return () => {
      unsub();
      session.flush();
      view.destroy();
      session.detach(view);
      viewRef.current = null;
    };
  }, [readOnly]);

  // Scale the 8.5" page down to fit narrow windows.
  useEffect(() => {
    const page = host.current!;
    const scroller = page.closest('.editor-scroll') as HTMLElement | null;
    if (!scroller) return;
    const fit = () => {
      const avail = scroller.clientWidth - 24;
      const z = Math.min(1, avail / page.offsetWidth);
      page.style.zoom = z < 0.98 ? String(Math.max(0.45, z)) : '';
    };
    const ro = new ResizeObserver(fit);
    ro.observe(scroller);
    fit();
    return () => ro.disconnect();
  }, []);

  // External doc changes (import, rename) rebuild the session state.
  useEffect(() => {
    session.ensure();
  }, [scriptDoc]);

  return (
    <div className={`script-editor ${className ?? ''}`}>
      <div className="script-page" ref={host} />
      {suggest && (
        <ul className="autocomplete" style={{ top: suggest.top, left: suggest.left }}>
          {suggest.items.map((it, i) => (
            <li
              key={it}
              className={i === suggest.index ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                const v = viewRef.current as unknown as { _accept: (s: Suggest, v: string) => void };
                v._accept(suggest, it);
              }}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
