import { useMemo, useState } from 'react';
import { useProject, useStore } from '../../store/project';
import type { Festival, FestivalDeadline, FestivalStatus, FestivalTier, PremiereRule } from '../../model/types';
import { money } from '../../budget/calc';
import {
  FESTIVAL_STATUSES, FESTIVAL_TIERS, PREMIERE_RULES, aimedFee, budgeted, daysUntil, festivalTotals, newDeadline, newFestival, nextDeadline,
  parseFestivalCsv, parseFestivalPaste, premiereWarnings, syncFestivalLines, type PasteResult,
} from '../../budget/festivals';
import { formatDate, todayISO } from '../../model/dates';
import { newId } from '../../model/ids';
import { canEdit, useSync } from '../../sync/state';
import { toast } from '../../components/common';
import { deletedToast } from '../../components/deleted';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';
import { RefLink } from '../ReferenceTab';
import { BudgetHidden } from './BudgetTab';

// Budget → Festivals: the festivals you're aiming at, with deadlines, dates and fees. Planned fees
// and travel become lines in Festivals & Marketing. You type or paste festivals in; Open Gate
// doesn't fetch FilmFreeway or festival sites (FilmFreeway's terms forbid scraping).

export function FestivalsTab() {
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  return visible ? <FestivalsScreen /> : <BudgetHidden />;
}

type Sort = 'deadline' | 'event' | 'tier' | 'status';
const fmt = (d?: string) => (d ? formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

function FestivalsScreen() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('budget');
  const $ = (n: number) => money(n, p.budget.currency);
  const list = p.budget.festivals ?? [];
  const today = todayISO();
  const totals = useMemo(() => festivalTotals(list, today), [list, today]);
  const clashes = useMemo(() => premiereWarnings(list), [list]);
  const [sort, setSort] = useState<Sort>('deadline');
  const [status, setStatus] = useState<FestivalStatus | ''>('');
  const [paste, setPaste] = useState(false);

  const edit = (fn: (l: Festival[]) => void, label: string | null = 'Edit festivals') => update((dr) => { dr.budget.festivals ??= []; fn(dr.budget.festivals as Festival[]); syncFestivalLines(dr); }, label);
  const add = (f: Festival, label = 'Add festival') => edit((l) => { l.push(f); }, label);

  const shown = useMemo(() => {
    const key: Record<Sort, (f: Festival) => string> = {
      deadline: (f) => nextDeadline(f, today)?.date ?? '9999',
      event: (f) => f.eventStart ?? '9999',
      tier: (f) => String(FESTIVAL_TIERS.findIndex((t) => t.id === f.tier)),
      status: (f) => String(FESTIVAL_STATUSES.findIndex((t) => t.id === f.status)),
    };
    return list.filter((f) => !status || f.status === status).slice().sort((a, b) => key[sort](a).localeCompare(key[sort](b)) || a.name.localeCompare(b.name));
  }, [list, sort, status, today]);

  const importCsv = async (file?: File) => {
    if (!file) return;
    const got = parseFestivalCsv(await file.text(), today);
    if (!got.length) { toast('No festivals found in that file. Columns: Name, URL, Deadline, Date, Fee, Event start, Event end, Location.'); return; }
    edit((l) => { l.push(...got); }, `Import ${got.length} festivals`);
    toast(`Added ${got.length} festival${got.length === 1 ? '' : 's'} from the spreadsheet.`);
  };

  const next = totals.upcoming[0];
  return (
    <div className="festivals-tab pad scroll" onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('festival-list')) add(newFestival()); }}>
      <div className="toolbar flat wrap">
        <h3>Festivals</h3>
        {!ro && <button className="primary" onClick={() => add(newFestival())}>＋ Festival</button>}
        {!ro && <button onClick={() => setPaste(true)}>Paste from FilmFreeway or a festival site…</button>}
        <RefLink page="festivals" label="Festival strategy" />
        <span className="spacer" />
        <More label="Sort, filter and import">
          <label className="check small keep-open">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="deadline">Next deadline</option><option value="event">Festival date</option><option value="tier">Tier</option><option value="status">Status</option>
            </select>
          </label>
          <label className="check small keep-open">Show
            <select value={status} onChange={(e) => setStatus(e.target.value as FestivalStatus | '')}>
              <option value="">Every status</option>{FESTIVAL_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          {!ro && <label className="button-like" title="Columns: Name, URL, Deadline, Date, Fee, Event start, Event end, Location">Import CSV…<input type="file" accept=".csv,text/csv" hidden onChange={(e) => { void importCsv(e.target.files?.[0]); e.target.value = ''; }} /></label>}
        </More>
      </div>

      <div className="fund-cards fest-summary">
        <div><span className="muted small">Entry fees planned</span><b>{$(totals.planned)}</b><span className="muted small">{totals.byStatus.planned + totals.byStatus.submitted + totals.byStatus.accepted} festivals · paid so far {$(totals.paid)}</span></div>
        <div><span className="muted small">Festival travel</span><b>{$(totals.travel)}</b><span className="muted small">for the festivals you plan to attend</span></div>
        <div className={next && next.days <= 14 ? 'fund-raise' : ''}><span className="muted small">Next deadline</span>
          {next ? <><b>{next.days === 0 ? 'Today' : `${next.days} day${next.days === 1 ? '' : 's'}`}</b><span className="muted small">{next.festival.name || 'Festival'}: {next.deadline.label} {fmt(next.deadline.date)} · {$(next.deadline.fee)}</span></> : <><b>—</b><span className="muted small">No open deadlines on planned festivals</span></>}
        </div>
      </div>
      <p className="muted small"><Hint>{'Fees for planned, submitted and accepted festivals go into the budget as “Festival submissions” (Festivals & Marketing). Open Gate doesn’t pull from FilmFreeway: its terms don’t allow automated reading of the site. Copy the dates and fees from a festival’s page and paste them here instead; you still submit on FilmFreeway.'}</Hint></p>

      {clashes.map(({ festival, before }) => (
        <p key={festival.id} className="fund-warn">⚠ {festival.name || 'A festival'} wants a {PREMIERE_RULES.find((r) => r.id === festival.premiere)?.label.toLowerCase()}, but {before.name || 'another festival'} screens first ({fmt(before.eventStart)}). Screening there may rule you out. <RefLink page="festivals" /></p>
      ))}

      <div className="festival-list">
        {shown.map((f) => <FestivalCard key={f.id} f={f} ro={ro} today={today} edit={edit} />)}
        {!list.length && <p className="muted pad"><Hint>{'No festivals yet. Add one, paste a festival’s dates and fees from FilmFreeway or its website, or import a spreadsheet. Double-click here to add one.'}</Hint></p>}
      </div>
      {paste && <PasteDialog onClose={() => setPaste(false)} onAdd={(f) => { add(f, 'Paste festival'); setPaste(false); toast(`Added ${f.name || 'the festival'} with ${f.deadlines.length} deadline${f.deadlines.length === 1 ? '' : 's'}.`); }} />}
    </div>
  );
}

function FestivalCard({ f, ro, today, edit }: { f: Festival; ro: boolean; today: string; edit: (fn: (l: Festival[]) => void, label?: string | null) => void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const $ = (n: number) => money(n, p.budget.currency);
  const set = (patch: Partial<Festival>, label: string | null = null) => edit((l) => { const x = l.find((y) => y.id === f.id); if (x) Object.assign(x, patch); }, label);
  const setDl = (id: string, patch: Partial<FestivalDeadline>) => set({ deadlines: f.deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const next = nextDeadline(f, today);
  const fee = aimedFee(f, today);
  const submit = () => set({ status: 'submitted', submittedOn: today, feePaid: f.feePaid ?? fee }, 'Mark submitted');
  const toExpense = () => update((dr) => {
    const line = dr.budget.lines.find((l) => l.link?.kind === 'festival');
    const acc = line?.accountId ?? dr.budget.accounts.find((a) => a.code === '5100')?.id ?? dr.budget.accounts[0].id;
    dr.budget.expenses.push({ id: newId(), date: f.submittedOn ?? today, vendor: f.platform === 'filmfreeway' ? 'FilmFreeway' : f.name, description: `Submission fee: ${f.name}`, amount: f.feePaid ?? fee, accountId: acc, ...(line ? { lineId: line.id } : {}), paid: true });
  }, 'Festival fee to expenses');
  const hasExpense = (p.budget.expenses ?? []).some((e) => e.description === `Submission fee: ${f.name}`);
  return (
    <article className={`festival-card st-${f.status} ${budgeted(f) ? '' : 'muted-card'}`}>
      <div className="festival-head">
        <input disabled={ro} className="festival-name" value={f.name} placeholder="Festival name" aria-label="Festival name" onChange={(e) => set({ name: e.target.value })} />
        {f.url && <a className="icon-link" href={f.url} target="_blank" rel="noreferrer noopener" title="Open the festival’s page">↗</a>}
        <select disabled={ro} value={f.status} aria-label="Status" className={`doc-status s-${f.status}`} onChange={(e) => set({ status: e.target.value as FestivalStatus }, 'Festival status')}>{FESTIVAL_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <span className="festival-fee" title="What entering costs (the budget uses this)">{$(fee)}</span>
        {!ro && (
          <More label="Festival actions" always>
            {(f.status === 'considering' || f.status === 'planned') && <button onClick={submit}>Mark submitted today</button>}
            {(f.status === 'submitted' || f.status === 'accepted') && !hasExpense && <button onClick={toExpense}>Add the fee to Expenses</button>}
            <button onClick={() => edit((l) => { l.push({ ...f, id: newId(), name: `${f.name} (copy)`, deadlines: f.deadlines.map((d) => ({ ...d, id: newId() })), status: 'considering', submittedOn: undefined, feePaid: undefined }); }, 'Duplicate festival')}>Duplicate</button>
            <button className="danger-text" onClick={() => { edit((l) => { const i = l.findIndex((x) => x.id === f.id); if (i >= 0) l.splice(i, 1); }, 'Delete festival'); deletedToast(f.name || 'festival'); }}>Delete</button>
          </More>
        )}
      </div>
      <div className="festival-meta">
        <label className="check small">Tier <select disabled={ro} value={f.tier} onChange={(e) => set({ tier: e.target.value as FestivalTier })}>{FESTIVAL_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label className="check small">Premiere <select disabled={ro} value={f.premiere ?? 'none'} onChange={(e) => set({ premiere: e.target.value as PremiereRule })}>{PREMIERE_RULES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label className="check small">Festival <input disabled={ro} type="date" value={f.eventStart ?? ''} aria-label="Festival starts" onChange={(e) => set({ eventStart: e.target.value || undefined, eventEnd: f.eventEnd && f.eventEnd >= e.target.value ? f.eventEnd : e.target.value || undefined })} /> – <input disabled={ro} type="date" value={f.eventEnd ?? ''} aria-label="Festival ends" onChange={(e) => set({ eventEnd: e.target.value || undefined })} /></label>
        <input disabled={ro} className="festival-loc" value={f.location ?? ''} placeholder="Where" aria-label="Location" onChange={(e) => set({ location: e.target.value || undefined })} />
        <input disabled={ro} className="festival-cat" value={f.category ?? ''} placeholder="Category (e.g. Narrative short)" aria-label="Category" onChange={(e) => set({ category: e.target.value || undefined })} />
        <input disabled={ro} className="festival-url" value={f.url ?? ''} placeholder="Link to its FilmFreeway page or website" aria-label="Link" onChange={(e) => set({ url: e.target.value || undefined, platform: /filmfreeway\.com/i.test(e.target.value) ? 'filmfreeway' : e.target.value ? 'site' : f.platform })} />
      </div>

      <table className="table compact festival-deadlines">
        <thead><tr><th>Aim</th><th>Deadline</th><th>Date</th><th className="num">Fee</th><th /></tr></thead>
        <tbody>
          {[...f.deadlines].sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).map((d) => {
            const past = !!d.date && d.date < today;
            const days = d.date ? daysUntil(d.date, today) : null;
            return (
              <tr key={d.id} className={`${past ? 'past' : ''} ${next?.id === d.id ? 'next' : ''}`}>
                <td><input disabled={ro} type="radio" name={`aim-${f.id}`} checked={f.aim === d.id} aria-label={`Aim for the ${d.label} deadline`} onChange={() => set({ aim: d.id }, 'Aim for deadline')} /></td>
                <td><input disabled={ro} value={d.label} aria-label="Deadline name" onChange={(e) => setDl(d.id, { label: e.target.value })} /></td>
                <td><input disabled={ro} type="date" value={d.date} aria-label="Deadline date" onChange={(e) => setDl(d.id, { date: e.target.value })} />{days !== null && !past && days <= 30 && <span className="small fest-days"> {days === 0 ? 'today' : `${days}d`}</span>}</td>
                <td className="num"><input disabled={ro} className="num" type="number" min={0} step={1} value={d.fee || ''} placeholder="0" aria-label="Fee" onChange={(e) => setDl(d.id, { fee: Number(e.target.value) || 0 })} /></td>
                <td>{!ro && <button className="icon-btn" aria-label="Delete deadline" onClick={() => set({ deadlines: f.deadlines.filter((x) => x.id !== d.id), aim: f.aim === d.id ? undefined : f.aim }, 'Delete deadline')}>×</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!ro && <button className="small" onClick={() => set({ deadlines: [...f.deadlines, newDeadline(f.deadlines.length ? 'Late' : 'Regular')] }, 'Add deadline')}>＋ Deadline</button>}

      <div className="festival-meta">
        <input disabled={ro} className="festival-waiver" value={f.waiver ?? ''} placeholder="Fee waiver code / note" aria-label="Fee waiver" onChange={(e) => set({ waiver: e.target.value || undefined })} />
        <label className="check small"><input disabled={ro} type="checkbox" checked={!!f.attend} onChange={(e) => set({ attend: e.target.checked }, 'Attend festival')} /> Attend</label>
        {f.attend && <label className="check small">Travel <input disabled={ro} className="num" type="number" min={0} step={50} value={f.travel ?? ''} placeholder="0" aria-label="Travel budget" onChange={(e) => set({ travel: Number(e.target.value) || 0 })} /></label>}
        {(f.status !== 'considering' && f.status !== 'planned') && <>
          <label className="check small">Submitted <input disabled={ro} type="date" value={f.submittedOn ?? ''} onChange={(e) => set({ submittedOn: e.target.value || undefined })} /></label>
          <label className="check small">Fee paid <input disabled={ro} className="num" type="number" min={0} value={f.feePaid ?? ''} placeholder="0" aria-label="Fee paid" onChange={(e) => set({ feePaid: e.target.value === '' ? undefined : Number(e.target.value) || 0 })} /></label>
        </>}
        <label className="check small">Notified by <input disabled={ro} type="date" value={f.notifyDate ?? ''} onChange={(e) => set({ notifyDate: e.target.value || undefined })} /></label>
      </div>
      <input disabled={ro} className="festival-notes" value={f.notes ?? ''} placeholder="Notes (screening format, DCP, contact…)" aria-label="Notes" onChange={(e) => set({ notes: e.target.value || undefined })} />
    </article>
  );
}

function PasteDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (f: Festival) => void }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState<PasteResult | null>(null);
  const today = todayISO();
  const f = res?.festival;
  const setF = (patch: Partial<Festival>) => setRes((r) => (r ? { ...r, festival: { ...r.festival, ...patch } } : r));
  const setDl = (id: string, patch: Partial<FestivalDeadline>) => f && setF({ deadlines: f.deadlines.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal festival-paste" role="dialog" aria-label="Paste a festival">
        <h3>Paste a festival</h3>
        {!f ? (
          <>
            <ol className="small paste-steps">
              <li>Open the festival’s page on FilmFreeway (or its own website) in your browser.</li>
              <li>Select from the festival’s name down through <b>Dates &amp; Deadlines</b> and the <b>fees</b>, and copy.</li>
              <li>Paste below. Add the page’s link too if you like.</li>
            </ol>
            <textarea rows={10} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={'Prairie Light Film Festival\nEarlybird Deadline\nMarch 1, 2027\nRegular Deadline\nApril 15, 2027\n…\nEarlybird Deadline: USD $25'} />
            <p className="muted small">Read on this device only; nothing is sent anywhere.</p>
            <div className="row modal-actions"><span className="spacer" /><button onClick={onClose}>Cancel</button><button className="primary" disabled={!text.trim()} onClick={() => setRes(parseFestivalPaste(text, today))}>Read it</button></div>
          </>
        ) : (
          <>
            {res!.note && <p className="fund-warn">{res!.note}</p>}
            {res!.guessed.length > 0 && <p className="muted small">Check: {res!.guessed.join(', ')}.</p>}
            <label className="field"><span>Festival</span><input value={f.name} onChange={(e) => setF({ name: e.target.value })} /></label>
            <div className="row wrap">
              <label className="check small">Festival dates <input type="date" value={f.eventStart ?? ''} onChange={(e) => setF({ eventStart: e.target.value || undefined })} /> – <input type="date" value={f.eventEnd ?? ''} onChange={(e) => setF({ eventEnd: e.target.value || undefined })} /></label>
              <label className="check small">Notified by <input type="date" value={f.notifyDate ?? ''} onChange={(e) => setF({ notifyDate: e.target.value || undefined })} /></label>
            </div>
            {f.category && <label className="field"><span>Category (fees are for this one)</span><input value={f.category} onChange={(e) => setF({ category: e.target.value })} /></label>}
            <table className="table compact festival-deadlines">
              <thead><tr><th>Deadline</th><th>Date</th><th className="num">Fee</th></tr></thead>
              <tbody>{f.deadlines.map((d) => (
                <tr key={d.id} className={d.date && d.date < today ? 'past' : ''}>
                  <td><input value={d.label} onChange={(e) => setDl(d.id, { label: e.target.value })} /></td>
                  <td><input type="date" value={d.date} onChange={(e) => setDl(d.id, { date: e.target.value })} /></td>
                  <td className="num"><input className="num" type="number" min={0} value={d.fee || ''} onChange={(e) => setDl(d.id, { fee: Number(e.target.value) || 0 })} /></td>
                </tr>
              ))}</tbody>
            </table>
            <label className="field"><span>Link</span><input value={f.url ?? ''} placeholder="https://filmfreeway.com/…" onChange={(e) => setF({ url: e.target.value || undefined, platform: /filmfreeway\.com/i.test(e.target.value) ? 'filmfreeway' : 'site' })} /></label>
            <div className="row modal-actions"><button onClick={() => setRes(null)}>Back</button><span className="spacer" /><button onClick={onClose}>Cancel</button><button className="primary" disabled={!f.name.trim()} onClick={() => onAdd({ ...f, status: 'planned' })}>Add festival</button></div>
          </>
        )}
      </div>
    </div>
  );
}
