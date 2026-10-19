import { useEffect } from 'react';
import { create } from 'zustand';
import { useLongPress, usePhone } from '../ui/responsive';
import { uiZoom } from '../prefs';

// Action menus for items — the touch alternative to drag-and-drop. Long-press (or right-click)
// an item and pick "Move to day…", "Move up", etc. On phones it's a bottom sheet; on desktop a
// small menu at the pointer. Items can open a second list (e.g. the days to move to).

export interface Action {
  label: string;
  run?: () => void;
  /** Opens this list instead of running. */
  items?: Action[];
  danger?: boolean;
  disabled?: boolean;
  /** Shown checked (e.g. the current day). */
  current?: boolean;
}

interface State { title: string; items: Action[]; pos?: { x: number; y: number }; stack: { title: string; items: Action[] }[] }
const useActions = create<State | { title: null }>(() => ({ title: null }));

export function openActions(title: string, items: Action[], pos?: { x: number; y: number }) {
  useActions.setState({ title, items, pos, stack: [] } as State, true);
}
const close = () => useActions.setState({ title: null }, true);

export function ActionSheetHost() {
  const st = useActions();
  const phone = usePhone();
  useEffect(() => {
    if (st.title === null) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [st.title]);
  if (st.title === null) return null;
  const s = st as State;
  const sheet = phone || !s.pos;
  const pick = (a: Action) => {
    if (a.disabled) return;
    if (a.items) { useActions.setState({ ...s, stack: [...s.stack, { title: s.title, items: s.items }], title: a.label.replace(/…$/, ''), items: a.items }); return; }
    close();
    a.run?.();
  };
  const back = () => { const prev = s.stack[s.stack.length - 1]; useActions.setState({ ...s, title: prev.title, items: prev.items, stack: s.stack.slice(0, -1) }); };
  const z = uiZoom();
  const style = sheet ? undefined : { left: Math.min(s.pos!.x / z, window.innerWidth / z - 260), top: Math.min(s.pos!.y / z, window.innerHeight / z - 40 - s.items.length * 36) };
  return (
    <>
      <div className={sheet ? 'sheet-scrim' : 'click-catcher'} onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div className={`more-menu action-sheet ${sheet ? 'as-sheet' : ''}`} role="menu" style={style}>
        {sheet && <div className="sheet-handle" aria-hidden />}
        <div className="action-title">
          {s.stack.length > 0 && <button className="icon-btn" aria-label="Back" onClick={back}>‹</button>}
          <b>{s.title}</b>
        </div>
        {s.items.map((a, i) => (
          <button key={i} role="menuitem" className={`${a.danger ? 'danger-text' : ''} ${a.current ? 'current' : ''}`} disabled={a.disabled} onClick={() => pick(a)}>
            <span>{a.label}</span>{a.items ? <span className="muted">›</span> : a.current ? <span>✓</span> : null}
          </button>
        ))}
        {sheet && <button className="cancel" onClick={close}>Cancel</button>}
      </div>
    </>
  );
}

/**
 * Wraps an item so a long-press (touch) or right-click opens its actions. `as` renders it as
 * a table row or list item (other props, like drag handlers, pass through).
 */
export function LongPress({ title, actions, children, as = 'div', ...rest }: {
  title: string; actions: () => Action[]; children: React.ReactNode; as?: 'div' | 'tr' | 'li';
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'> & { draggable?: boolean }) {
  const lp = useLongPress((pos) => openActions(title, actions(), pos));
  const Tag = as as 'div';
  return <Tag {...rest} {...lp}>{children}</Tag>;
}
