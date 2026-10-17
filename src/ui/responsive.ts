import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Phone layout switches. Most of the phone layout is CSS (styles.css, "Phone layout");
// these hooks cover what CSS can't do: the drawer, ⋯ menus and long-press menus.

export const PHONE_QUERY = '(max-width: 760px)';

function subscribe(query: string) {
  return (cb: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const m = window.matchMedia(query);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  };
}
const matches = (query: string) => () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;

const subPhone = subscribe(PHONE_QUERY);
const getPhone = matches(PHONE_QUERY);
/** True on phone-width screens (and narrow windows). */
export function usePhone(): boolean {
  return useSyncExternalStore(subPhone, getPhone, () => false);
}

const NARROW_QUERY = '(max-width: 900px)';
const subNarrow = subscribe(NARROW_QUERY);
const getNarrow = matches(NARROW_QUERY);
/** True on tablets in portrait and phones: the top bar switches to ☰ and ⋯. */
export function useNarrow(): boolean {
  return useSyncExternalStore(subNarrow, getNarrow, () => false);
}

const subTouch = subscribe('(pointer: coarse)');
const getTouch = matches('(pointer: coarse)');
/** True when the main pointer is a finger (no hover, no precise drag-and-drop). */
export function useTouch(): boolean {
  return useSyncExternalStore(subTouch, getTouch, () => false);
}

/**
 * Long-press (or right-click) to open an item's action menu — the touch alternative to
 * drag-and-drop. Returns props to spread on the item. Moving the finger cancels it.
 */
export function useLongPress(onLongPress: (pos: { x: number; y: number }) => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => { clearTimeout(timer.current); start.current = null; };
  // Text fields keep their own long-press / right-click menu (select, copy, paste).
  const inField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || inField(e.target)) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { fired.current = true; onLongPress(start.current ?? { x: e.clientX, y: e.clientY }); }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => { if (inField(e.target)) return; e.preventDefault(); e.stopPropagation(); cancel(); onLongPress({ x: e.clientX, y: e.clientY }); },
    /** Swallows the click that ends a long press (so the item isn't also opened). */
    onClickCapture: (e: React.MouseEvent) => { if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; } },
  };
}

/** Hides the phone top bar while scrolling down a page, shows it again when scrolling up. */
export function useHideOnScroll(enabled: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) { setHidden(false); return; }
    let last = 0;
    const onScroll = (e: Event) => {
      const el = e.target as HTMLElement;
      if (!(el instanceof HTMLElement) || !el.closest?.('.tab-body')) return;
      const y = el.scrollTop;
      if (Math.abs(y - last) < 8) return;
      setHidden(y > last && y > 60);
      last = y;
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [enabled]);
  return hidden;
}

/**
 * Keeps --kb (the on-screen keyboard's height) current, so bars pinned to the bottom of the
 * screen (the screenplay element bar) sit just above the keyboard on phones.
 */
export function startKeyboardInset() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return;
  const set = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
  };
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  set();
}
