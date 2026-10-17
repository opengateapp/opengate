import { useState } from 'react';
import type { BannerKind, DerivedScene, ShootDay } from '../model/types';
import { useDerived, useProject, useStore } from '../store/project';
import { sceneCast, sceneEighths, sceneMinutes } from '../script/derive';
import { formatEighths, formatDate, formatDuration, formatClock12, parseClock } from '../model/dates';
import { stripColor, dayTotals, dayNumbers } from '../schedule/engine';
import { BANNER_COLORS, COLOR_SLOT_LABELS, DEFAULT_STRIP_COLORS } from '../model/defaults';
import { newId } from '../model/ids';
import { Modal, Field } from './common';

// ---- Drag payloads (HTML5 DnD; plain text like CineSched so drops work between views) ----
export type DragPayload = { kind: 'scenes'; ids: string[] } | { kind: 'banner'; id: string } | { kind: 'day'; id: string } | { kind: 'task'; id: string };
export const DRAG_MIME = 'application/x-slateline';
export function setDrag(e: React.DragEvent, p: DragPayload) {
  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(p));
  e.dataTransfer.setData('text/plain', JSON.stringify(p));
  e.dataTransfer.effectAllowed = 'move';
}
export function getDrag(e: React.DragEvent): DragPayload | null {
  try { return JSON.parse(e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain')); } catch { return null; }
}

export function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#111827' : '#ffffff';
}

export function SceneStripView({ scene, compact, completed, selected, conflict, duplicate, time, onClick, onDragStart, extra }: {
  scene: DerivedScene; compact?: boolean; completed?: boolean; selected?: boolean; conflict?: string[]; duplicate?: boolean;
  time?: string; onClick?: (e: React.MouseEvent) => void; onDragStart?: (e: React.DragEvent) => void; extra?: React.ReactNode;
}) {
  const p = useProject();
  const bg = completed ? '#9CA3AF' : conflict?.length ? '#FCA5A5' : stripColor(p, scene);
  const cast = sceneCast(p, scene).map((c) => {
    const m = p.cast.find((x) => x.characterName === c);
    return m ? String(m.castNumber) : c;
  });
  return (
    <div
      className={`strip ${compact ? 'compact' : ''} ${selected ? 'selected' : ''} ${duplicate ? 'dup' : ''}`}
      style={{ background: bg, color: textOn(bg) }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      title={[`${scene.number}. ${scene.heading}`, p.sceneMeta[scene.id]?.synopsis || scene.firstAction, `Cast: ${sceneCast(p, scene).join(', ')}`, ...(conflict ?? []).map((c) => '⚠ ' + c)].filter(Boolean).join('\n')}
    >
      {time && <span className="s-time">{time}</span>}
      <span className="s-num">{scene.number}</span>
      <span className="s-ie">{scene.intExt === 'INT/EXT' ? 'I/E' : scene.intExt}</span>
      <span className="s-set">{scene.set || scene.heading}</span>
      <span className="s-dn">{scene.time === 'CUSTOM' ? scene.timeLabel || '—' : scene.time}</span>
      {!compact && <span className="s-cast">{cast.join(', ')}</span>}
      <span className="s-len">{formatEighths(sceneEighths(p, scene))}</span>
      {!compact && <span className="s-min">{formatDuration(sceneMinutes(p, scene))}</span>}
      {conflict?.length ? <span className="s-warn">⚠</span> : null}
      {extra}
    </div>
  );
}

export const BANNER_LABELS: Record<BannerKind, string> = { companyMove: 'Company move', meal: 'Meal', notice: 'Notice', custom: 'Custom' };

export function BannerDialog({ day, bannerId, onClose }: { day: ShootDay; bannerId?: string; onClose: () => void }) {
  const update = useStore((s) => s.update);
  const existing = bannerId ? day.items.find((i) => i.kind === 'banner' && i.id === bannerId) : undefined;
  const [b, setB] = useState(() => (existing && existing.kind === 'banner' ? { ...existing } : {
    kind: 'banner' as const, id: newId(), bannerKind: 'meal' as BannerKind, title: 'Lunch', color: '#18181B', minutes: 60, note: '', customStart: '',
  }));
  const save = () => {
    update((dr) => {
      const dd = dr.schedule.days.find((x) => x.id === day.id)!;
      const k = dd.items.findIndex((i) => i.kind === 'banner' && i.id === b.id);
      const item = { ...b, customStart: b.customStart || undefined };
      if (k >= 0) dd.items[k] = item; else dd.items.push(item);
    }, existing ? 'Edit banner' : 'Add banner');
    onClose();
  };
  return (
    <Modal title={existing ? 'Edit banner' : 'Add banner'} onClose={onClose} footer={<>
      {existing && <button onClick={() => { update((dr) => { const dd = dr.schedule.days.find((x) => x.id === day.id)!; dd.items = dd.items.filter((i) => !(i.kind === 'banner' && i.id === b.id)); }, 'Delete banner'); onClose(); }}>Delete</button>}
      <button className="primary" onClick={save}>Save</button></>}>
      <div className="form-grid">
        <Field label="Type">
          <select value={b.bannerKind} onChange={(e) => {
            const k = e.target.value as BannerKind;
            setB({ ...b, bannerKind: k, title: k === 'meal' ? 'Lunch' : k === 'companyMove' ? 'Company move' : b.title, minutes: k === 'meal' ? 60 : k === 'companyMove' ? 30 : b.minutes, color: k === 'meal' ? '#18181B' : k === 'companyMove' ? '#D97706' : b.color });
          }}>
            {Object.entries(BANNER_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Title"><input value={b.title} onChange={(e) => setB({ ...b, title: e.target.value })} /></Field>
        <Field label="Duration (min)"><input type="number" min={0} value={b.minutes} onChange={(e) => setB({ ...b, minutes: Number(e.target.value) || 0 })} /></Field>
        <Field label="Fixed start (optional)"><input type="time" value={b.customStart ?? ''} onChange={(e) => setB({ ...b, customStart: e.target.value })} /></Field>
        <Field label="Note" wide><input value={b.note ?? ''} onChange={(e) => setB({ ...b, note: e.target.value })} /></Field>
        <Field label="Color" wide>
          <div className="swatches">
            {[...BANNER_COLORS, '#18181B'].map((c) => <button key={c} className={`swatch ${b.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setB({ ...b, color: c })} aria-label={c} />)}
            <input type="color" value={b.color} onChange={(e) => setB({ ...b, color: e.target.value })} />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/** Day settings: call times (drive the cascade), blackout, notes, calendar events. */
export function DayDialog({ dayId, onClose }: { dayId: string; onClose: () => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const day = p.schedule.days.find((x) => x.id === dayId);
  const [evTitle, setEvTitle] = useState('');
  if (!day) return null;
  const n = dayNumbers(p.schedule).get(day.id);
  const t = dayTotals(p, d, day);
  const events = p.events.filter((e) => e.date === day.date);
  const setTime = (k: keyof ShootDay['times'], v: string) => update((dr) => { dr.schedule.days.find((x) => x.id === dayId)!.times[k] = v || undefined; }, null);
  return (
    <Modal title={`${formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${n ? ` — Day ${n}` : ''}`} onClose={onClose} wide footer={<button className="primary" onClick={onClose}>Done</button>}>
      <div className="stats">
        <div><b>{t.scenes}</b> scenes</div>
        <div><b>{formatEighths(t.eighths)}</b> pages</div>
        <div><b>{formatDuration(t.minutes)}</b> est.</div>
        <div><b>{t.wrap !== null ? formatClock12(t.wrap) : '—'}</b> wrap</div>
      </div>
      <div className="form-grid">
        <Field label="General crew call"><input type="time" value={day.times.generalCall ?? ''} placeholder={p.production.defaultCall} onChange={(e) => setTime('generalCall', e.target.value)} /></Field>
        <Field label="Ready to shoot"><input type="time" value={day.times.readyToShoot ?? ''} onChange={(e) => setTime('readyToShoot', e.target.value)} /></Field>
        <Field label="Lunch"><input type="time" value={day.times.lunch ?? ''} onChange={(e) => setTime('lunch', e.target.value)} /></Field>
        <Field label="Wrap (blank = estimate)"><input type="time" value={day.times.wrap ?? ''} onChange={(e) => setTime('wrap', e.target.value)} /></Field>
        <label className="check wide"><input type="checkbox" checked={!!day.blackout} onChange={(e) => update((dr) => { dr.schedule.days.find((x) => x.id === dayId)!.blackout = e.target.checked; }, 'Toggle day off')} /> Day off / unavailable (blackout)</label>
        <Field label="Day notes" wide><textarea rows={2} value={day.notes ?? ''} onChange={(e) => update((dr) => { dr.schedule.days.find((x) => x.id === dayId)!.notes = e.target.value; }, null)} /></Field>
      </div>
      {day.times.lunch && !day.items.some((i) => i.kind === 'banner' && i.bannerKind === 'meal') && (
        <p className="muted small">Tip: add a Meal banner on the stripboard so lunch takes time in the day's timeline.
          <button className="link" onClick={() => update((dr) => { dr.schedule.days.find((x) => x.id === dayId)!.items.push({ kind: 'banner', id: newId(), bannerKind: 'meal', meal: 'lunch', title: 'Lunch', color: '#18181B', minutes: 60, customStart: day.times.lunch }); }, 'Add lunch')}>Add lunch at {formatClock12(parseClock(day.times.lunch)!)}</button>
        </p>
      )}
      <h4>Calendar events</h4>
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.id} style={{ borderColor: e.color }}>
            <input value={e.title} onChange={(ev) => update((dr) => { dr.events.find((x) => x.id === e.id)!.title = ev.target.value; }, null)} />
            <input type="time" value={e.start ?? ''} onChange={(ev) => update((dr) => { dr.events.find((x) => x.id === e.id)!.start = ev.target.value || undefined; }, null)} />
            <select value={e.kind} onChange={(ev) => update((dr) => { dr.events.find((x) => x.id === e.id)!.kind = ev.target.value as typeof e.kind; }, null)}>
              {['prep', 'scout', 'rehearsal', 'travel', 'meeting', 'other'].map((k) => <option key={k}>{k}</option>)}
            </select>
            <button className="icon-btn" onClick={() => update((dr) => { dr.events = dr.events.filter((x) => x.id !== e.id); }, 'Delete event')}>×</button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input placeholder="New event (tech scout, rehearsal, travel…)" value={evTitle} onChange={(e) => setEvTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && evTitle.trim()) { update((dr) => { dr.events.push({ id: newId(), date: day.date, title: evTitle.trim(), color: '#6366F1', kind: 'other' }); }, 'Add event'); setEvTitle(''); } }} />
        <button disabled={!evTitle.trim()} onClick={() => { update((dr) => { dr.events.push({ id: newId(), date: day.date, title: evTitle.trim(), color: '#6366F1', kind: 'other' }); }, 'Add event'); setEvTitle(''); }}>Add event</button>
      </div>
    </Modal>
  );
}

export function ColorLegend() {
  const p = useProject();
  return (
    <div className="legend">
      {(Object.keys(COLOR_SLOT_LABELS) as (keyof typeof COLOR_SLOT_LABELS)[]).map((k) => (
        <span key={k} className="legend-item"><i style={{ background: p.schedule.colors[k] ?? DEFAULT_STRIP_COLORS[k] }} />{COLOR_SLOT_LABELS[k]}</span>
      ))}
    </div>
  );
}


