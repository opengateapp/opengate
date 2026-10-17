import { useState } from 'react';
import { useProject, useStore, getDerived } from '../../store/project';
import { shootDays } from '../../schedule/dood';
import { formatDate } from '../../model/dates';
import { download, safeName } from '../../io/files';
import { Empty, toast } from '../../components/common';
import { sceneEighths } from '../../script/derive';
import { formatEighths } from '../../model/dates';

/** Script sides: the paginated script pages holding a shoot day's scenes. */
export function SidesView() {
  const p = useProject();
  const days = shootDays(p);
  const [dayId, setDayId] = useState('all');
  const [crossOut, setCrossOut] = useState(true);
  const d = getDerived();

  const make = async () => {
    try {
      const { sidesPdf } = await import('../../pdf/sidesPdf');
      const list = dayId === 'all' ? days : days.filter((x) => x.day.id === dayId);
      const label = dayId === 'all' ? 'all days' : `day ${list[0]?.number}`;
      download(`${safeName(p.title)} - sides ${label}.pdf`, sidesPdf(useStore.getState().project!, getDerived(), list.map((x) => x.day), { crossOut }).output('blob'));
    } catch (e) { toast((e as Error).message); }
  };

  if (!days.length) return <Empty title="No shoot days yet"><p className="muted">Put scenes on days in the Stripboard, then print each day's sides here.</p></Empty>;
  const shown = dayId === 'all' ? days : days.filter((x) => x.day.id === dayId);
  return (
    <div className="pad scroll">
      <div className="toolbar flat">
        <h3>Script sides</h3>
        <select value={dayId} onChange={(e) => setDayId(e.target.value)}>
          <option value="all">All shoot days</option>
          {days.map(({ day, number }) => <option key={day.id} value={day.id}>Day {number} — {formatDate(day.date)}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={crossOut} onChange={(e) => setCrossOut(e.target.checked)} /> Cross out other scenes</label>
        <span className="spacer" />
        <button className="primary" onClick={make}>Export sides PDF</button>
      </div>
      {shown.map(({ day, number }) => (
        <div key={day.id} className="sides-day">
          <h4>Day {number} — {formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}</h4>
          <ul>
            {day.items.map((it) => {
              if (it.kind !== 'scene') return null;
              const sc = d.sceneById.get(it.sceneId);
              return sc ? <li key={sc.id}><b>{sc.number}</b> {sc.heading} <span className="muted small">· pp. {sc.startPage}{sc.endPage !== sc.startPage ? `–${sc.endPage}` : ''} · {formatEighths(sceneEighths(p, sc))}</span></li> : null;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
