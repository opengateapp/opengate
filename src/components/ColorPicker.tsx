import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhone } from '../ui/responsive';

// One colour button instead of a row of swatches: it opens a palette (popover on a computer,
// sheet on a phone) with the swatches, recently used custom colours and a custom picker.

const RECENT_KEY = 'opengate.recentColors';
const loadRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : []; } catch { return []; } };
const saveRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode */ } };
const HEX = /^#[0-9a-f]{6}$/i;

export interface ColorPickerHandle { open: () => void }

export const ColorPicker = forwardRef<ColorPickerHandle, { value: string; onChange: (c: string) => void; swatches: string[]; label?: string }>(
  function ColorPicker({ value, onChange, swatches, label = 'Colour' }, ref) {
    const phone = usePhone();
    const [open, setOpen] = useState(false);
    const [recent, setRecent] = useState<string[]>(loadRecent);
    const [hex, setHex] = useState(value);
    const btn = useRef<HTMLButtonElement>(null);
    const pop = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    const show = () => {
      const r = btn.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 268)) });
      setHex(value);
      setOpen(true);
    };
    useImperativeHandle(ref, () => ({ open: show }));
    useEffect(() => {
      if (!open) return;
      const close = (e: PointerEvent) => { const t = e.target as Node; if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false); };
      const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
      document.addEventListener('pointerdown', close, true);
      document.addEventListener('keydown', esc, true);
      return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); };
    }, [open]);

    const pick = (c: string, close = true) => { onChange(c); if (close) setOpen(false); };
    /** A colour from the custom picker (it fires while dragging, so it's remembered when the palette closes). */
    const custom = (c: string) => { onChange(c); setHex(c); };
    const wasOpen = useRef(false);
    useEffect(() => {
      if (open) { wasOpen.current = true; return; }
      if (!wasOpen.current) return;
      wasOpen.current = false;
      if (!HEX.test(value) || swatches.some((s) => s.toLowerCase() === value.toLowerCase())) return;
      setRecent((r) => { const next = [value, ...r.filter((x) => x.toLowerCase() !== value.toLowerCase())].slice(0, 5); saveRecent(next); return next; });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

    return (
      <>
        <button ref={btn} className={`color-btn ${open ? 'active' : ''}`} aria-label={`${label}: ${value}`} title={`${label} (C)`} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
          <span className="color-btn-fill" style={{ background: value }} />
        </button>
        {open && createPortal(
          <>
            {phone && <div className="sheet-scrim" onClick={() => setOpen(false)} />}
            <div ref={pop} className={`color-pop ${phone ? 'as-sheet' : ''}`} role="dialog" aria-label={label} style={phone ? undefined : { top: pos.top, left: pos.left }}>
              {phone && <div className="sheet-handle" aria-hidden />}
              <div className="color-grid">
                {swatches.map((c) => (
                  <button key={c} className={`color-sw ${same(c, value) ? 'on' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={same(c, value)} onClick={() => pick(c)} />
                ))}
              </div>
              {recent.length > 0 && (
                <>
                  <span className="color-pop-label">Recent</span>
                  <div className="color-grid">
                    {recent.map((c) => <button key={c} className={`color-sw ${same(c, value) ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => pick(c)} />)}
                  </div>
                </>
              )}
              <span className="color-pop-label">Custom</span>
              <div className="color-custom">
                <input type="color" value={HEX.test(value) ? value : '#000000'} aria-label="Custom colour" onChange={(e) => custom(e.target.value)} />
                <input className="color-hex" value={hex} aria-label="Hex colour" spellCheck={false} maxLength={7}
                  onChange={(e) => { const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`; setHex(v); if (HEX.test(v)) custom(v); }} />
              </div>
            </div>
          </>,
          document.body,
        )}
      </>
    );
  },
);
