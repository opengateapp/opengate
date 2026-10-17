import { useState } from 'react';
import { useProject, useStore } from '../store/project';
import { setRange } from '../schedule/engine';
import { addDays, diffDays } from '../model/dates';

/** Production date range. Changing the start offers shift (move everything) or keep dates. */
export function RangeControl() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const [shift, setShift] = useState(true);
  const { startDate, endDate } = p.schedule;
  return (
    <span className="range">
      <label>Prod. dates <input type="date" value={startDate} onChange={(e) => {
        const v = e.target.value;
        if (!v) return;
        const newEnd = shift ? addDays(endDate, diffDays(startDate, v)) : endDate;
        update((dr) => setRange(dr.schedule, v, newEnd < v ? v : newEnd, shift ? 'shift' : 'merge'), 'Change start date');
      }} /></label>
      <label>to <input type="date" value={endDate} min={startDate} onChange={(e) => { const v = e.target.value; if (v) update((dr) => setRange(dr.schedule, startDate, v, 'merge'), 'Change end date'); }} /></label>
      <label className="check" title="When moving the start date, move every scheduled day along with it"><input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} /> Shift schedule</label>
    </span>
  );
}

