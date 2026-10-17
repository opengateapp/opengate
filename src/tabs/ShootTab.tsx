import { useState } from 'react';
import { useProject, getDerived, useStore } from '../store/project';
import { download, safeName } from '../io/files';
import { breakdownCsv, shotListCsv } from '../io/reports';
import { buildICS } from '../schedule/ics';
import { shootDays } from '../schedule/dood';
import { formatDate } from '../model/dates';
import { toast } from '../components/common';
import { CallSheetsView } from './reports/CallSheetsView';
import { DoodView } from './reports/DoodView';
import { exportStoryboardPdf } from './storyboard/render';
import { exportBudget } from './budget/BudgetTab';
import { budgetVisible } from '../sync/state';

/** Reports hub: schedules, call sheets, Day Out of Days, sides, breakdown sheets, storyboards. */
export function ShootTab() {
  const p = useProject();
  const [view, setView] = useState<'hub' | 'callsheets' | 'dood'>('hub');
  const [sidesDay, setSidesDay] = useState('all');
  const [crossOut, setCrossOut] = useState(true);
  const name = safeName(p.title);
  const days = shootDays(p);
  const latest = () => useStore.getState().project!;

  if (view === 'callsheets') return <CallSheetsView onBack={() => setView('hub')} />;
  if (view === 'dood') return <DoodView onBack={() => setView('hub')} />;

  const run = (fn: () => Promise<void> | void) => async () => {
    try { await fn(); } catch (e) { console.error(e); toast((e as Error).message); }
  };
  const pdf = async (kind: 'script' | 'strip' | 'shooting') => {
    const d = getDerived();
    if (kind === 'script') (await (await import('../pdf/screenplayPdf')).screenplayPdfAsync(p, d)).save(`${name}.pdf`);
    else {
      const m = await import('../pdf/schedulePdf');
      (kind === 'strip' ? m.stripboardPdf(p, d) : m.shootingSchedulePdf(p, d)).save(`${name} - ${kind === 'strip' ? 'stripboard' : 'shooting schedule'}.pdf`);
    }
  };
  const sides = async () => {
    const { sidesPdf } = await import('../pdf/sidesPdf');
    const list = sidesDay === 'all' ? days : days.filter((x) => x.day.id === sidesDay);
    const label = sidesDay === 'all' ? 'all days' : `day ${list[0]?.number}`;
    download(`${name} - sides ${label}.pdf`, sidesPdf(latest(), getDerived(), list.map((x) => x.day), { crossOut }).output('blob'));
  };
  const breakdownSheets = async () => {
    const { breakdownSheetsPdf } = await import('../pdf/breakdownPdf');
    download(`${name} - breakdown sheets.pdf`, breakdownSheetsPdf(latest(), getDerived()).output('blob'));
  };

  const reports: { title: string; desc: string; action: () => void; label?: string; extra?: JSX.Element; disabled?: boolean }[] = [
    { title: 'Call sheets', desc: 'One per shoot day, auto-filled from the day’s strips, cast, daily crew and locations. Edit, then export.', action: () => setView('callsheets'), label: 'Open', disabled: !days.length },
    { title: 'Day Out of Days', desc: 'SW / W / WF / SWF / H / X per cast member across shoot days, with TOT / WRK / HLD.', action: () => setView('dood'), label: 'Open' },
    {
      title: 'Script sides', desc: 'The pages holding each day’s scenes, with other scenes crossed out.', action: run(sides), disabled: !days.length,
      extra: (
        <div className="col">
          <select value={sidesDay} onChange={(e) => setSidesDay(e.target.value)}>
            <option value="all">All shoot days</option>
            {days.map(({ day, number }) => <option key={day.id} value={day.id}>Day {number} — {formatDate(day.date)}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={crossOut} onChange={(e) => setCrossOut(e.target.checked)} /> Cross out other scenes</label>
        </div>
      ),
    },
    { title: 'Breakdown sheets', desc: 'One sheet per scene in the classic layout, with a box for each breakdown category.', action: run(breakdownSheets) },
    { title: 'Storyboard', desc: 'Every frame in shot order, six to a page, with shot details and captions.', action: run(() => exportStoryboardPdf(latest())), disabled: !p.storyboard.length },
    { title: 'Screenplay PDF', desc: 'Industry-format script with scene numbers and title page.', action: run(() => pdf('script')) },
    { title: 'Shooting schedule', desc: 'Day-by-day schedule with times, synopses and cast numbers.', action: run(() => pdf('shooting')) },
    { title: 'Stripboard', desc: 'Color-coded strips by day with end-of-day totals.', action: run(() => pdf('strip')) },
    { title: 'Breakdown report', desc: 'Every scene with its elements by category (CSV).', action: () => download(`${name} - breakdown.csv`, breakdownCsv(p, getDerived()), 'text/csv') },
    { title: 'Shot list', desc: 'All shots in script order (CSV).', action: () => download(`${name} - shot list.csv`, shotListCsv(p, getDerived()), 'text/csv') },
    ...(budgetVisible() ? [
      { title: 'Budget (PDF)', desc: 'Top sheet and every line by account, with targets and actuals when you use them.', action: run(() => exportBudget(latest(), 'pdf')), disabled: !p.budget.lines.length },
      { title: 'Budget (Excel)', desc: 'Top sheet, detail with live formulas, and expenses.', action: run(() => exportBudget(latest(), 'xlsx')), disabled: !p.budget.lines.length },
    ] : []),
    { title: 'Calendar (.ics)', desc: 'Shoot days and events for Google / Apple / Outlook.', action: () => download(`${name} schedule.ics`, buildICS(p, getDerived()), 'text/calendar') },
  ];
  return (
    <div className="shoot-tab pad scroll">
      <h2>Reports &amp; paperwork</h2>
      <div className="report-grid">
        {reports.map((r) => (
          <div key={r.title} className="report-card">
            <h3>{r.title}</h3>
            <p className="muted small">{r.desc}</p>
            {r.extra}
            <button className="primary" onClick={r.action} disabled={r.disabled} title={r.disabled ? 'Nothing to export yet' : ''}>{r.label ?? 'Export'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
