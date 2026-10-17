import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Select({ value, options, onChange, placeholder = '—' }: { value: string; options: (string | { code: string; label: string })[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {value && !options.some((o) => (typeof o === 'string' ? o : o.code) === value) && <option value={value}>{value}</option>}
      {options.map((o) => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.code} value={o.code}>{o.code} — {o.label}</option>)}
    </select>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Brief message at the bottom of the screen, optionally with one action button (e.g. Undo). */
export function toast(msg: string, action?: { label: string; run: () => void }) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.run(); el!.className = ''; };
    el.appendChild(b);
  }
  el.className = action ? 'show actionable' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el!.className = ''; }, action ? 6000 : 3200);
}
