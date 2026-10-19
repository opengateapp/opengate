import { useMemo, useState } from 'react';
import { useDerived, useProject, useStore, getDerived } from '../store/project';
import { boneyard, dayNumbers, dayTotals, moveScenes, scanConflicts, swapDays, unschedule } from '../schedule/engine';
import { buildICS } from '../schedule/ics';
import { SceneStripView, DayDialog, setDrag, getDrag } from '../components/scheduleBits';
import { RangeControl } from '../components/RangeControl';
import { addDays, dateRange, formatDate, formatEighths, fromISO, toISO, weekday } from '../model/dates';
import { download, safeName } from '../io/files';
import { More } from '../components/More';
import { LongPress } from '../components/ActionSheet';
import { useTouch } from '../ui/responsive';
import { toast } from '../components/common';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarTab() {
  const touch = useTouch();
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [mode, setMode] = useState<'month' | 'list'>('month');
  const [showCast, setShowCast] = useState(false);
  const [dayDialog, setDayDialog] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const nums = useMemo(() => dayNumbers(p.schedule), [p.schedule]);
  const conflicts = useMemo(() => scanConflicts(p, d), [p, d]);
  const bone = boneyard(p, d);
  const byDate = new Map(p.schedule.days.map((x) => [x.date, x]));

  // Sunday-first weeks covering the whole range.
  const gridStart = addDays(p.schedule.startDate, -weekday(p.schedule.startDate));
  const gridEnd = addDays(p.schedule.endDate, 6 - weekday(p.schedule.endDate));
  const cells = dateRange(gridStart, gridEnd);
  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const toggleWeekday = (wd: number) => {
    const days = p.schedule.days.filter((x) => weekday(x.date) === wd);
    const allOff = days.every((x) => x.blackout);
    update((dr) => { dr.schedule.days.forEach((x) => { if (weekday(x.date) === wd) x.blackout = !allOff; }); }, `${allOff ? 'Clear' : 'Mark'} every ${WEEKDAYS[wd]} off`);
  };

  const renderDay = (date: string) => {
    const day = byDate.get(date);
    const inRange = date >= p.schedule.startDate && date <= p.schedule.endDate;
    const events = p.events.filter((e) => e.date === date);
    const tasks = p.tasks.filter((t) => t.due === date && !t.done);
    const n = day ? nums.get(day.id) : undefined;
    const isFirstOfMonth = fromISO(date).getDate() === 1 || date === gridStart;
    if (!day || !inRange) {
      return <div key={date} className="cal-cell out"><span className="cal-date">{fromISO(date).getDate()}</span></div>;
    }
    const t = dayTotals(p, d, day);
    return (
      <div key={date} className={`cal-cell ${day.blackout ? 'blackout' : ''} ${over === day.id ? 'over' : ''} ${date === toISO(new Date()) ? 'today' : ''}`}
        onDoubleClick={() => setDayDialog(day.id)}
        onDragOver={(e) => { e.preventDefault(); setOver(day.id); }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(null);
          const pl = getDrag(e);
          if (pl?.kind === 'scenes') update((dr) => moveScenes(dr.schedule, pl.ids, day.id), 'Schedule scenes');
          if (pl?.kind === 'day') update((dr) => swapDays(dr.schedule, pl.id, day.id), 'Swap days');
          if (pl?.kind === 'task') update((dr) => { const t = dr.tasks.find((x) => x.id === pl.id); if (t) t.due = date; }, 'Set task due date');
        }}>
        <div className="cal-head" draggable={!!day.items.length} onDragStart={(e) => setDrag(e, { kind: 'day', id: day.id })}>
          <span className="cal-date">{isFirstOfMonth ? formatDate(date, { month: 'short', day: 'numeric' }) : fromISO(date).getDate()}</span>
          {n && <span className="pill">D{n}</span>}
          {conflicts.days.has(day.id) && <span className="warn small" title={conflicts.days.get(day.id)!.join('\n')}>⚠</span>}
          <button className="icon-btn small" title="Day details" onClick={() => setDayDialog(day.id)}>⋯</button>
        </div>
        {events.map((e) => <div key={e.id} className="cal-event" style={{ background: e.color }}>{e.start ? e.start + ' ' : ''}{e.title}</div>)}
        {tasks.map((t) => (
          <div key={t.id} className="cal-task" draggable onDragStart={(e) => { e.stopPropagation(); setDrag(e, { kind: 'task', id: t.id }); }} title={`Task${t.assignee ? ` · ${t.assignee}` : ''} — drag to another day`}>
            <input type="checkbox" checked={false} onChange={() => update((dr) => { const x = dr.tasks.find((y) => y.id === t.id); if (x) x.done = true; }, 'Complete task')} onClick={(e) => e.stopPropagation()} /> {t.title}
          </div>
        ))}
        {day.items.map((it) => {
          if (it.kind === 'banner') return null;
          const sc = d.sceneById.get(it.sceneId);
          if (!sc) return null;
          return (
            <div key={it.sceneId}>
              <SceneStripView scene={sc} compact completed={it.completed} conflict={conflicts.scenes.get(sc.id)} onDragStart={(e) => { e.stopPropagation(); setDrag(e, { kind: 'scenes', ids: [sc.id] }); }} />
              {showCast && <div className="cal-cast">{(p.sceneMeta[sc.id]?.extraCast ?? []).concat(sc.characters).join(', ')}</div>}
            </div>
          );
        })}
        {t.scenes > 0 && <div className="cal-total muted small">{formatEighths(t.eighths)} pgs</div>}
        {day.blackout && <div className="muted small">Day off</div>}
      </div>
    );
  };

  return (
    <div className="calendar-tab">
      <div className="toolbar">
        <More label="Calendar options">
          <RangeControl />
          <label className="check"><input type="checkbox" checked={showCast} onChange={(e) => setShowCast(e.target.checked)} /> Show cast</label>
          <button title="Download an .ics file to import into Google, Apple or Outlook calendar" onClick={() => {
            download(`${safeName(p.title)} schedule.ics`, buildICS(p, getDerived()), 'text/calendar');
            toast('Calendar file downloaded — import it into Google Calendar, Apple Calendar or Outlook.');
          }}>Export to calendar (.ics)</button>
        </More>
        <span className="sep" />
        <div className="seg">
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>Month</button>
          <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>Full schedule</button>
        </div>
        <span className="spacer" />
      </div>
      <div className="calendar-body">
        <aside className="boneyard" data-panel="Unscheduled" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const pl = getDrag(e); if (pl?.kind === 'scenes') update((dr) => unschedule(dr.schedule, pl.ids), 'Unschedule'); }}>
          <div className="side-head"><b>Unscheduled</b><span className="muted small">{bone.length}</span></div>
          <div className="strip-list">
            {bone.map((s) => (
              <LongPress key={s.id} title={`Scene ${s.number} — ${s.set || s.heading}`} actions={() => [{ label: 'Schedule on day…', items: p.schedule.days.filter((x) => !x.blackout).map((x) => ({
                label: formatDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' }),
                run: () => update((dr) => moveScenes(dr.schedule, [s.id], x.id), 'Schedule scenes'),
              })) }]}>
                <SceneStripView scene={s} compact onDragStart={(e) => setDrag(e, { kind: 'scenes', ids: [s.id] })} />
              </LongPress>
            ))}
          </div>
        </aside>
        {mode === 'month' ? (
          <section className="cal-grid-wrap">
            <div className="cal-grid">
              {WEEKDAYS.map((w, i) => <button key={w} className="cal-wd" title={`Toggle every ${w} as a day off`} onClick={() => toggleWeekday(i)}>{w}</button>)}
              {weeks.flat().map(renderDay)}
            </div>
            <p className="muted small pad">{touch
              ? 'Long-press an unscheduled scene to put it on a day · double-tap a day for call times, events and days off · tap a weekday name to mark every one off.'
              : "Drag scenes onto days · drag a day's header onto another day to swap · drag tasks onto days to set due dates · double-click a day for call times, events and days off · click a weekday name to mark every one off."}</p>
          </section>
        ) : (
          <section className="cal-list">
            {p.schedule.days.map((day) => {
              const n = nums.get(day.id);
              const t = dayTotals(p, d, day);
              const events = p.events.filter((e) => e.date === day.date);
              return (
                <div key={day.id} className={`cal-row ${day.blackout ? 'blackout' : ''} ${[0, 6].includes(weekday(day.date)) ? 'weekend' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const pl = getDrag(e);
                    if (pl?.kind === 'scenes') update((dr) => moveScenes(dr.schedule, pl.ids, day.id), 'Schedule scenes');
                    if (pl?.kind === 'task') update((dr) => { const t = dr.tasks.find((x) => x.id === pl.id); if (t) t.due = day.date; }, 'Set task due date');
                  }}>
                  <div className="cal-row-date" onClick={() => setDayDialog(day.id)}>
                    <b>{formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</b>
                    {n ? <span className="pill">Day {n}</span> : day.blackout ? <span className="pill off">Off</span> : null}
                    <span className="muted small">{t.scenes ? `${t.scenes} scn · ${formatEighths(t.eighths)} pgs` : ''}</span>
                  </div>
                  <div className="cal-row-items">
                    {events.map((e) => <span key={e.id} className="cal-event" style={{ background: e.color }}>{e.title}</span>)}
                    {p.tasks.filter((t) => t.due === day.date && !t.done).map((t) => <span key={t.id} className="cal-task" draggable onDragStart={(e) => setDrag(e, { kind: 'task', id: t.id })}>☐ {t.title}</span>)}
                    {day.items.map((it) => {
                      if (it.kind !== 'scene') return null;
                      const sc = d.sceneById.get(it.sceneId);
                      return sc ? <SceneStripView key={sc.id} scene={sc} compact completed={it.completed} conflict={conflicts.scenes.get(sc.id)} onDragStart={(e) => setDrag(e, { kind: 'scenes', ids: [sc.id] })} /> : null;
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
      {dayDialog && <DayDialog dayId={dayDialog} onClose={() => setDayDialog(null)} />}
    </div>
  );
}
