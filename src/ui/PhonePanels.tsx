import { useEffect, useState } from 'react';

// On phones, a tab's side panels (scene lists, boneyard, breakdown sheet, document lists…)
// are hidden behind floating buttons and open as bottom sheets. Panels opt in with
// data-panel="Label"; data-panel-pick closes the sheet when something in it is picked.

interface Panel { el: HTMLElement; label: string }

export function PhonePanels({ tab }: { tab: string }) {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [open, setOpen] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const body = document.querySelector('.tab-body');
    if (!body) return;
    const scan = () => {
      const found = [...body.querySelectorAll<HTMLElement>('aside[data-panel]')].map((el) => ({ el, label: el.dataset.panel ?? 'Panel' }));
      setPanels((cur) => (cur.length === found.length && cur.every((p, i) => p.el === found[i].el && p.label === found[i].label) ? cur : found));
    };
    scan();
    const obs = new MutationObserver(scan);
    obs.observe(body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [tab]);

  // Open = an attribute on the panel itself (React doesn't manage it, so re-renders keep it).
  useEffect(() => {
    for (const p of panels) p.el.toggleAttribute('data-open', p.el === open);
    if (open && !panels.some((p) => p.el === open)) setOpen(null);
  }, [open, panels]);
  useEffect(() => () => { document.querySelectorAll('aside[data-open]').forEach((el) => el.removeAttribute('data-open')); }, []);
  useEffect(() => { setOpen(null); }, [tab]);

  useEffect(() => {
    if (!open) return;
    const pick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (open.hasAttribute('data-panel-pick') && t.closest('button, a, li, .side-link') && !t.closest('input, select, textarea, .keep-open')) setTimeout(() => setOpen(null), 0);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    open.addEventListener('click', pick);
    document.addEventListener('keydown', esc);
    return () => { open.removeEventListener('click', pick); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!panels.length) return null;
  return (
    <>
      {open && <div className="sheet-scrim panel-scrim" onClick={() => setOpen(null)} />}
      {open && <button className="panel-close" aria-label="Close panel" onClick={() => setOpen(null)}>✕</button>}
      <div className="phone-panels">
        {panels.map((p) => (
          <button key={p.label} className={p.el === open ? 'active' : ''} onClick={() => setOpen(p.el === open ? null : p.el)}>{p.label}</button>
        ))}
      </div>
    </>
  );
}
