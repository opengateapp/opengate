import { useMemo, useState } from 'react';
import { useDerived, useProject, useStore, getDerived } from '../store/project';
import { boneyard, cascade, dayNumbers, dayTotals, moveBanner, moveScenes, scanConflicts, swapDays, unschedule, lockReport, workingDays } from '../schedule/engine';
import { sceneCast, sceneTime } from '../script/derive';
import { formatDate, formatEighths, formatDuration, formatClock12, weekday } from '../model/dates';
import { SceneStripView, BannerDialog, DayDialog, ColorLegend, setDrag, getDrag, textOn, type DragPayload } from '../components/scheduleBits';
import { RangeControl } from '../components/RangeControl';
import { Modal, Empty, toast } from '../components/common';
import type { DerivedScene, ShootDay } from '../model/types';
import { askText } from '../components/dialogs';
import { addSceneToScript } from '../script/scenes';
import { More } from '../components/More';
import { LongPress, type Action } from '../components/ActionSheet';
import { safeName } from '../io/files';

type Sort = 'script' | 'location' | 'intExt' | 'time' | 'cast' | 'length';

export function ScheduleTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('script');
  const [q, setQ] = useState('');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [dayDialog, setDayDialog] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ day: ShootDay; id?: string } | null>(null);
  const [lockOpen, setLockOpen] = useState(false);
  const [dropAt, setDropAt] = useState<{ dayId: string; index: number } | null>(null);

  const conflicts = useMemo(() => scanConflicts(p, d), [p, d]);
  const nums = useMemo(() => dayNumbers(p.schedule), [p.schedule]);
  const lockChanges = useMemo(() => lockReport(p, d), [p, d]);

  const bone = useMemo(() => {
    const list = boneyard(p, d).filter((s) => !q || `${s.number} ${s.heading} ${sceneCast(p, s).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
    const by: Record<Sort, (a: DerivedScene, b: DerivedScene) => number> = {
      script: (a, b) => a.index - b.index,
      location: (a, b) => a.set.localeCompare(b.set) || a.index - b.index,
      intExt: (a, b) => a.intExt.localeCompare(b.intExt) || a.set.localeCompare(b.set),
      time: (a, b) => sceneTime(p, a).localeCompare(sceneTime(p, b)) || a.index - b.index,
      cast: (a, b) => (sceneCast(p, a)[0] ?? '~').localeCompare(sceneCast(p, b)[0] ?? '~') || a.index - b.index,
      length: (a, b) => b.eighths - a.eighths,
    };
    return [...list].sort(by[sort]);
  }, [p, d, q, sort]);

  const select = (id: string, list: string[], e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else if (e.shiftKey && anchor && list.includes(anchor)) {
      const a = list.indexOf(anchor);
      const b = list.indexOf(id);
      setSelected(list.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else setSelected([id]);
    setAnchor(id);
  };

  const dragScenes = (e: React.DragEvent, id: string) => {
    const ids = selected.includes(id) ? selected : [id];
    setDrag(e, { kind: 'scenes', ids });
  };

  const drop = (payload: DragPayload | null, dayId: string, index?: number) => {
    setDropAt(null);
    if (!payload) return;
    if (payload.kind === 'scenes') update((dr) => moveScenes(dr.schedule, payload.ids, dayId, index), `Schedule ${payload.ids.length} scene(s)`);
    if (payload.kind === 'banner') update((dr) => moveBanner(dr.schedule, payload.id, dayId, index), 'Move banner');
    if (payload.kind === 'day') update((dr) => swapDays(dr.schedule, payload.id, dayId), 'Swap days');
    setSelected([]);
  };

  const rowDragOver = (e: React.DragEvent, dayId: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = e.clientY > r.top + r.height / 2 ? index + 1 : index;
    if (dropAt?.dayId !== dayId || dropAt.index !== at) setDropAt({ dayId, index: at });
  };

  const sendTo = (dayId: string) => {
    if (!selected.length) return;
    update((dr) => moveScenes(dr.schedule, selected, dayId), `Send ${selected.length} scene(s) to day`);
    setSelected([]);
  };

  /** Touch / right-click menu for a strip: the alternative to dragging it. */
  const stripActions = (day: ShootDay, idx: number, sceneId: string, completed?: boolean): Action[] => {
    const scenesInDay = day.items.filter((i) => i.kind === 'scene').length;
    return [
      { label: 'Move to day…', items: p.schedule.days.filter((x) => !x.blackout).map((x) => ({
        label: `${formatDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' })}${nums.get(x.id) ? ` · Day ${nums.get(x.id)}` : ''}`,
        current: x.id === day.id,
        run: () => update((dr) => moveScenes(dr.schedule, [sceneId], x.id), 'Move scene to day'),
      })) },
      { label: 'Move earlier', disabled: idx === 0, run: () => update((dr) => moveScenes(dr.schedule, [sceneId], day.id, idx - 1), 'Move strip') },
      { label: 'Move later', disabled: idx >= day.items.length - 1 || scenesInDay < 1, run: () => update((dr) => moveScenes(dr.schedule, [sceneId], day.id, idx + 2), 'Move strip') },
      { label: 'Set a fixed start time…', run: async () => {
        const v = await askText('Fixed start time', { placeholder: '07:30', message: 'Leave blank to follow the day’s timeline.', confirmLabel: 'Set time' });
        if (v === null) return;
        const t = v.trim();
        if (t && !/^\d{1,2}:\d{2}$/.test(t)) { toast('Use a time like 07:30'); return; }
        update((dr) => { const x = dr.schedule.days.find((y) => y.id === day.id)!.items[idx]; if (x.kind === 'scene') x.customStart = t ? t.padStart(5, '0') : undefined; }, 'Set strip time');
      } },
      { label: completed ? 'Mark not shot' : 'Mark shot / completed', run: () => update((dr) => { const x = dr.schedule.days.find((y) => y.id === day.id)!.items[idx]; if (x.kind === 'scene') x.completed = !x.completed; }, 'Toggle completed') },
      { label: 'Back to boneyard', danger: true, run: () => update((dr) => unschedule(dr.schedule, [sceneId]), 'Unschedule') },
    ];
  };
  /** Touch menu for a boneyard strip. */
  const boneActions = (sceneId: string): Action[] => [
    { label: 'Schedule on day…', items: p.schedule.days.filter((x) => !x.blackout).map((x) => ({
      label: `${formatDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' })}${nums.get(x.id) ? ` · Day ${nums.get(x.id)}` : ''}`,
      run: () => update((dr) => moveScenes(dr.schedule, [sceneId], x.id), 'Schedule scene'),
    })) },
  ];

  const exportPdf = async (kind: 'strip' | 'shooting') => {
    const m = await import('../pdf/schedulePdf');
    const doc = kind === 'strip' ? m.stripboardPdf(p, getDerived()) : m.shootingSchedulePdf(p, getDerived());
    doc.save(`${safeName(p.title)} - ${kind === 'strip' ? 'stripboard' : 'shooting schedule'}.pdf`);
  };

  const days = p.schedule.days.filter((day) => !hideEmpty || day.items.length || day.blackout);
  const shootDays = days.filter((x) => nums.has(x.id)).length;

  return (
    <div className="schedule-tab">
      <div className="toolbar">
        <More label="Schedule options">
        <RangeControl />
        <span className="sep" />
        <button disabled={!canUndo} onClick={() => useStore.getState().undo()} title="Undo (⌘Z)">↶</button>
        <button disabled={!canRedo} onClick={() => useStore.getState().redo()} title="Redo (⇧⌘Z)">↷</button>
        <label className="check"><input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide empty days</label>
        <span className="spacer" />
        {p.schedule.lock
          ? <button className={lockChanges.length ? 'warn-btn' : ''} onClick={() => setLockOpen(true)}>🔒 Locked {lockChanges.length ? `· ${lockChanges.length} changed` : ''}</button>
          : <button onClick={() => { update((dr) => { dr.schedule.lock = { lockedAt: new Date().toISOString(), workingDays: workingDays(p, d) }; }, 'Lock schedule'); toast('Schedule locked. Changes to cast work days will be tracked.'); }}>Lock schedule</button>}
        <button onClick={() => exportPdf('strip')}>Stripboard PDF</button>
        <button onClick={() => exportPdf('shooting')}>Shooting schedule PDF</button>
        </More>
      </div>
      <div className="schedule-body">
        <aside className="boneyard" data-panel="Boneyard"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { const pl = getDrag(e); if (pl?.kind === 'scenes') { update((dr) => unschedule(dr.schedule, pl.ids), 'Unschedule'); setSelected([]); } }}>
          <div className="side-head">
            <b>Boneyard</b><span className="muted small">{bone.length} unscheduled</span>
            <button className="small" title="Add a scene to the screenplay (and here)" onClick={async () => {
              const h = await askText('New scene', { placeholder: 'INT. LOCATION - DAY', confirmLabel: 'Add scene', message: 'Adds a scene heading to the end of the screenplay, so it shows up everywhere.' });
              if (h?.trim()) addSceneToScript(h);
            }}>+ Scene</button>
          </div>
          <div className="row">
            <input placeholder="Search scenes, cast…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} title="Sort">
              <option value="script">Script order</option><option value="location">Location</option><option value="intExt">INT/EXT</option>
              <option value="time">Day/Night</option><option value="cast">Cast</option><option value="length">Length</option>
            </select>
          </div>
          {selected.length > 0 && (
            <div className="row send-to">
              <span className="small">{selected.length} selected →</span>
              <select value="" onChange={(e) => sendTo(e.target.value)}>
                <option value="">Send to day…</option>
                {p.schedule.days.filter((x) => !x.blackout).map((x) => <option key={x.id} value={x.id}>{formatDate(x.date)}{nums.get(x.id) ? ` · Day ${nums.get(x.id)}` : ''}</option>)}
              </select>
            </div>
          )}
          <div className="strip-list">
            {bone.map((s) => (
              <LongPress key={s.id} title={`Scene ${s.number} — ${s.set || s.heading}`} actions={() => boneActions(s.id)}>
              <SceneStripView scene={s} compact selected={selected.includes(s.id)} duplicate={conflicts.duplicateNumbers.has(s.id)}
                onClick={(e) => select(s.id, bone.map((x) => x.id), e)} onDragStart={(e) => dragScenes(e, s.id)} />
              </LongPress>
            ))}
            {!bone.length && <p className="muted small pad">{d.scenes.length ? 'Every scene is scheduled.' : 'No scenes yet — write or import a script.'}</p>}
          </div>
          <ColorLegend />
        </aside>
        <section className="days">
          <div className="muted small pad">{shootDays} shoot days · {formatEighths(d.scenes.reduce((a, s) => a + (p.sceneMeta[s.id]?.eighthsOverride ?? s.eighths), 0))} pages in script</div>
          {!days.length && <Empty title="No days in range">Set the production dates above.</Empty>}
          {days.map((day) => {
            const n = nums.get(day.id);
            const timed = cascade(p, d, day);
            const totals = dayTotals(p, d, day);
            const weekend = [0, 6].includes(weekday(day.date));
            const dayConf = conflicts.days.get(day.id);
            const ids = day.items.filter((i) => i.kind === 'scene').map((i) => (i as { sceneId: string }).sceneId);
            return (
              <div key={day.id} className={`day-card ${weekend ? 'weekend' : ''} ${day.blackout ? 'blackout' : ''}`}
                onDragOver={(e) => { e.preventDefault(); if (dropAt?.dayId !== day.id) setDropAt({ dayId: day.id, index: day.items.length }); }}
                onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null); }}
                onDrop={(e) => { e.preventDefault(); drop(getDrag(e), day.id, dropAt?.dayId === day.id ? dropAt.index : undefined); }}>
                <div className="day-head" draggable onDragStart={(e) => setDrag(e, { kind: 'day', id: day.id })} title="Drag onto another day to swap">
                  <span className="grip">⋮⋮</span>
                  <b>{formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                  {n ? <span className="pill">Day {n}</span> : day.blackout ? <span className="pill off">Off</span> : null}
                  {dayConf && <span className="warn small" title={dayConf.join('\n')}>⚠ {dayConf.length}</span>}
                  <span className="muted small">{totals.scenes ? `${totals.scenes} scn · ${formatEighths(totals.eighths)} pgs · ${formatDuration(totals.minutes)}` : ''}</span>
                  <span className="spacer" />
                  {day.times.generalCall && <span className="muted small">Call {formatClock12(Number(day.times.generalCall.split(':')[0]) * 60 + Number(day.times.generalCall.split(':')[1]))}</span>}
                  <button className="small" onClick={() => setBanner({ day })}>+ Banner</button>
                  <button className="small" onClick={() => setDayDialog(day.id)}>Day…</button>
                </div>
                <div className="day-strips" onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('drop-hint')) setBanner({ day }); }} title="Double-click empty space to add a banner">
                  {timed.map((t, idx) => {
                    const it = t.item;
                    const line = dropAt?.dayId === day.id && dropAt.index === idx ? <div className="drop-line" /> : null;
                    if (it.kind === 'banner') {
                      return (
                        <div key={it.id} onDragOver={(e) => rowDragOver(e, day.id, idx)}>
                          {line}
                          <div className="strip banner" style={{ background: it.color, color: textOn(it.color) }} draggable
                            onDragStart={(e) => { e.stopPropagation(); setDrag(e, { kind: 'banner', id: it.id }); }}
                            onDoubleClick={() => setBanner({ day, id: it.id })}>
                            <span className="s-time">{formatClock12(t.start)}</span>
                            <span className="s-set">{it.title.toUpperCase()}{it.note ? ` — ${it.note}` : ''}</span>
                            <span className="s-min">{it.minutes ? formatDuration(it.minutes) : ''}</span>
                            <button className="icon-btn" onClick={() => setBanner({ day, id: it.id })}>✎</button>
                          </div>
                        </div>
                      );
                    }
                    const sc = d.sceneById.get(it.sceneId);
                    if (!sc) {
                      return <div key={it.sceneId} className="strip orphan">{line}Deleted scene <button className="small" onClick={() => update((dr) => unschedule(dr.schedule, [it.sceneId]), 'Remove deleted scene')}>Remove</button></div>;
                    }
                    return (
                      <LongPress key={it.sceneId} title={`Scene ${sc.number} — ${sc.set || sc.heading}`} actions={() => stripActions(day, idx, sc.id, it.completed)}>
                      <div onDragOver={(e) => rowDragOver(e, day.id, idx)}>
                        {line}
                        <SceneStripView scene={sc} completed={it.completed} selected={selected.includes(sc.id)} conflict={conflicts.scenes.get(sc.id)} duplicate={conflicts.duplicateNumbers.has(sc.id)}
                          time={`${formatClock12(t.start)}–${formatClock12(t.end)}`}
                          onClick={(e) => select(sc.id, ids, e)}
                          onDragStart={(e) => { e.stopPropagation(); dragScenes(e, sc.id); }}
                          extra={
                            <span className="s-actions" onClick={(e) => e.stopPropagation()}>
                              <input type="time" title="Fixed start time (blank = cascade)" value={it.customStart ?? ''} onChange={(e) => update((dr) => {
                                const x = dr.schedule.days.find((y) => y.id === day.id)!.items[idx];
                                if (x.kind === 'scene') x.customStart = e.target.value || undefined;
                              }, 'Set strip time')} />
                              <button className="icon-btn" title="Mark shot / completed" onClick={() => update((dr) => {
                                const x = dr.schedule.days.find((y) => y.id === day.id)!.items[idx];
                                if (x.kind === 'scene') x.completed = !x.completed;
                              }, 'Toggle completed')}>✓</button>
                              <button className="icon-btn" title="Back to boneyard" onClick={() => update((dr) => unschedule(dr.schedule, [sc.id]), 'Unschedule')}>×</button>
                            </span>
                          } />
                      </div>
                      </LongPress>
                    );
                  })}
                  {dropAt?.dayId === day.id && dropAt.index >= timed.length && <div className="drop-line" />}
                  {!timed.length && <div className="drop-hint">{day.blackout ? 'Day off' : 'Drop scenes here · double-click to add a banner'}</div>}
                </div>
                {n && (
                  <div className="end-of-day">
                    — END OF DAY {n} — {formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })} — Total pages: {formatEighths(totals.eighths)} — Est. {formatDuration(totals.minutes)}{totals.wrap !== null ? ` — Wrap ${formatClock12(totals.wrap)}` : ''} —
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
      {dayDialog && <DayDialog dayId={dayDialog} onClose={() => setDayDialog(null)} />}
      {banner && <BannerDialog day={banner.day} bannerId={banner.id} onClose={() => setBanner(null)} />}
      {lockOpen && (
        <Modal title="Schedule lock report" onClose={() => setLockOpen(false)} footer={<>
          <button onClick={() => { update((dr) => { dr.schedule.lock = undefined; }, 'Unlock schedule'); setLockOpen(false); }}>Unlock</button>
          <button onClick={() => { update((dr) => { dr.schedule.lock = { lockedAt: new Date().toISOString(), workingDays: workingDays(p, d) }; }, 'Re-lock schedule'); setLockOpen(false); }}>Re-lock with current schedule</button>
          <button className="primary" onClick={() => setLockOpen(false)}>Close</button></>}>
          <p className="muted small">Locked {p.schedule.lock && new Date(p.schedule.lock.lockedAt).toLocaleString()}. Changes to each cast member's work days since then:</p>
          {!lockChanges.length && <p>No changes to cast work days.</p>}
          <table className="table">
            <tbody>
              {lockChanges.map((c) => (
                <tr key={c.character}>
                  <td><b>{c.character}</b></td>
                  <td className="ok">{c.added.map((x) => '+ ' + formatDate(x)).join(', ')}</td>
                  <td className="bad">{c.removed.map((x) => '− ' + formatDate(x)).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  );
}
