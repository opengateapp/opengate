import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePhone } from '../ui/responsive';

// ⋯ menus. <More> shows its children inline on desktop and collapses them into a ⋯ menu on
// phones (or always, with `always`). On phones the menu opens as a sheet from the bottom.
// Picking a button inside closes it; form controls (selects, inputs, checkboxes) don't.

export function More({ children, always, label = 'More', className }: { children: React.ReactNode; always?: boolean; label?: string; className?: string }) {
  const phone = usePhone();
  if (!phone && !always) return <>{children}</>;
  return <MoreMenu label={label} className={className} sheet={phone}>{children}</MoreMenu>;
}

export function MoreMenu({ children, label = 'More', className, sheet, icon = '⋯' }: { children: React.ReactNode; label?: string; className?: string; sheet?: boolean; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc); };
  }, [open]);

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
    setOpen((o) => !o);
  };
  // A button (or link) inside does its thing and closes the menu.
  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('button, a');
    if (el && menu.current?.contains(el) && !el.closest('.keep-open')) setTimeout(() => setOpen(false), 0);
  };

  return (
    <>
      <button ref={btn} className={`more-btn ${open ? 'active' : ''}`} aria-haspopup="menu" aria-expanded={open} title={label} aria-label={label} onClick={toggle}>{icon}</button>
      {open && createPortal(
        <>
          {sheet && <div className="sheet-scrim" onClick={() => setOpen(false)} />}
          <div ref={menu} role="menu" className={`more-menu ${sheet ? 'as-sheet' : ''} ${className ?? ''}`} style={sheet ? undefined : { top: pos.top, right: pos.right }} onClick={onClick}>
            {sheet && <div className="sheet-handle" aria-hidden />}
            {children}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
