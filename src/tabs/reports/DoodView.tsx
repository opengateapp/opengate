import { useState } from 'react';
import { useDerived, useProject, getDerived, useStore } from '../../store/project';
import { buildDood, doodRowLabel, DOOD_LEGEND } from '../../schedule/dood';
import { fromISO } from '../../model/dates';
import { download, safeName } from '../../io/files';
import { Empty } from '../../components/common';

/** On-screen Day Out of Days with the same codes and totals as the PDF. */
export function DoodView({ onBack }: { onBack?: () => void }) {
  const p = useProject();
  const d = useDerived();
  const [hold, setHold] = useState(true);
  const { days, rows } = buildDood(p, d, hold);
  const exportPdf = async () => {
    const { doodPdf } = await import('../../pdf/doodPdf');
    download(`${safeName(p.title)} - day out of days.pdf`, doodPdf(useStore.getState().project!, getDerived(), hold).output('blob'));
  };
  return (
    <div className="reports-sub scroll">
      <div className="toolbar">
        {onBack && <button className="link" onClick={onBack}>← Reports</button>}
        <h3>Day Out of Days</h3>
        <span className="spacer" />
        <label className="check" title="Some productions only pay actors for days on set; turn holds off to leave gaps blank">
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> Show holds
        </label>
        <button className="primary" onClick={exportPdf} disabled={!rows.length}>Export PDF</button>
      </div>
      {!rows.length ? (
        <Empty title={days.length ? 'No cast in scheduled scenes' : 'No shoot days yet'}><p className="muted">Schedule scenes on the stripboard to build the Day Out of Days.</p></Empty>
      ) : (
        <div className="pad">
          <div className="dood-wrap">
            <table className="dood">
              <thead>
                <tr>
                  <th className="name">Cast</th><th>TOT</th><th>WRK</th>{hold && <th>HLD</th>}
                  {days.map(({ day, number }) => {
                    const dt = fromISO(day.date);
                    return <th key={day.id} className="day" title={day.date}><span>{dt.toLocaleDateString(undefined, { month: 'short' })}</span><span>{dt.toLocaleDateString(undefined, { weekday: 'narrow' })} {dt.getDate()}</span><b>{number}</b></th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.character}>
                    <td className="name">{doodRowLabel(r)}</td>
                    <td><b>{r.total}</b></td><td>{r.work}</td>{hold && <td>{r.hold}</td>}
                    {r.codes.map((c, i) => <td key={i} className={`code c-${c || 'none'}`}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend">
            {DOOD_LEGEND.filter((l) => hold || l.code !== 'H').map((l) => <span key={l.code} className="legend-item"><i className={`code c-${l.code}`}>{l.code}</i>{l.label}</span>)}
          </div>
          <p className="muted small">Columns are shoot days only. TOT = first to last work day, WRK = work days, HLD = hold days. X marks unavailable dates from the cast roster.</p>
        </div>
      )}
    </div>
  );
}
