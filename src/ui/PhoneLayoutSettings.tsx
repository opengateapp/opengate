import { useState } from 'react';
import { usePhoneTabs, allSections, LITE_DEFAULT } from './phoneTabs';
import { usePhone } from './responsive';

/** Settings → Phone layout: Open Gate Lite on/off, which tabs show on this phone, and their order. */
export function PhoneLayoutSettings() {
  const s = usePhoneTabs();
  const phone = usePhone();
  const sections = allSections();
  const label = new Map(sections.flatMap((x) => x.tabs.map((t) => [t.id, t.label] as const)));
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div className="phone-layout">
      <h3>Phone layout</h3>
      <p className="muted small">Saved on this device. {phone ? 'You’re on a phone-sized screen now.' : 'These settings apply when Open Gate is used on a phone-sized screen.'}</p>

      <label className="switch-row">
        <input type="checkbox" checked={s.lite} onChange={(e) => s.setLite(e.target.checked)} />
        <span><b>Open Gate Lite</b><small className="muted">Show only the tabs you pick below. Turn it off to see every tab on your phone.</small></span>
      </label>

      <div className={s.lite ? '' : 'disabled-block'}>
        <h4>Your tabs <span className="muted small">({s.tabs.length})</span></h4>
        <ol className="lite-order">
          {s.tabs.map((t, i) => (
            <li key={t} draggable onDragStart={() => setDrag(t)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) s.reorder(drag, t); setDrag(null); }} className={drag === t ? 'dragging' : ''}>
              <span className="drag" aria-hidden>⋮⋮</span>
              <span className="name">{label.get(t) ?? t}</span>
              <button className="icon-btn" aria-label={`Move ${label.get(t)} up`} disabled={i === 0} onClick={() => s.move(t, -1)}>↑</button>
              <button className="icon-btn" aria-label={`Move ${label.get(t)} down`} disabled={i === s.tabs.length - 1} onClick={() => s.move(t, 1)}>↓</button>
              <button className="icon-btn" aria-label={`Remove ${label.get(t)}`} disabled={s.tabs.length === 1} onClick={() => s.toggle(t, false)}>✕</button>
            </li>
          ))}
        </ol>

        <h4>All tabs</h4>
        <div className="lite-all">
          {sections.map((sec) => (
            <fieldset key={sec.id}>
              <legend>{sec.label}</legend>
              {sec.tabs.map((t) => (
                <label key={t.id} className="check">
                  <input type="checkbox" checked={s.tabs.includes(t.id)} disabled={s.tabs.length === 1 && s.tabs.includes(t.id)} onChange={(e) => s.toggle(t.id, e.target.checked)} />
                  <span>{t.label}<small className="muted"> — {t.hint}</small></span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <button onClick={s.reset}>Reset to Lite defaults</button>
        <p className="muted small">Defaults: {LITE_DEFAULT.map((t) => label.get(t) ?? t).join(', ')}.</p>
      </div>
    </div>
  );
}
