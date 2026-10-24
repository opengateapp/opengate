import { useMemo, useState } from 'react';
import { useDerived, useProject, useStore } from '../../store/project';
import { money, totals } from '../../budget/calc';
import { budgetView } from '../../budget/pipeline';
import { budgetFacts, importFromBreakdown } from '../../budget/fromBreakdown';
import { BUDGET_TEMPLATES, templateLines } from '../../budget/templates';
import { LEVELS, quickEstimate, type FundingLevel } from '../../budget/funding';
import { GUIDE_CHECKED, agreementCheck } from '../../budget/guide';
import { shootDays } from '../../schedule/dood';
import { GUILDS } from '../../reference/guilds';
import { Modal, toast } from '../../components/common';
import { CutList, Term } from '../../components/BudgetHelp';
import { RefLink } from '../ReferenceTab';

// "Set up my budget": one question per step. Every step writes straight into the budget, so
// closing halfway keeps what's done.

const STEPS = ['Your money', 'What you’re making', 'Shoot days', 'Who’s in it', 'Crew', 'Gear', 'Everything else', 'Safety net', 'Your budget'];
const SAG = GUILDS.find((g) => g.id === 'sag-aftra');
const TIERS = ['Micro-Budget Project', 'Short Project (SPA)', 'Ultra Low Project (UPA)', 'Moderate Low (MPA)', 'Low Budget (LBA)'];
const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));

export function BudgetGuide({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [step, setStep] = useState(0);
  const b = p.budget;
  const $ = (n: number) => money(n, b.currency);
  const view = useMemo(() => { const v = budgetView(p, d); return { ...v, t: totals(b, v.lines) }; }, [p, d, b]);
  const scheduled = shootDays(p).length;
  const lines = (kind: string) => view.lines.filter((l) => l.link?.kind === kind);
  const edit = (fn: (dr: Parameters<Parameters<typeof update>[0]>[0]) => void, label: string | null = 'Guided setup') => update(fn, label);
  const setRate = (id: string, rate: number) => edit((dr) => { const l = dr.budget.lines.find((x) => x.id === id); if (l) l.rate = rate; }, null);
  const fromBreakdown = () => {
    const added = importFromBreakdown(p, budgetFacts(p, d));
    if (added.length) edit((dr) => { dr.budget.lines.push(...added); });
    toast(added.length ? `Added ${added.length} line${added.length === 1 ? '' : 's'} from the breakdown` : 'Everything in the breakdown is already in the budget');
  };
  const num = (v: string) => Math.max(0, Number(v.replace(/[^0-9.]/g, '')) || 0);
  const ag = p.production.agreement;
  const isSag = /sag/i.test(ag?.union ?? '');
  const cap = b.targetTotal ?? 0;

  const body = (() => {
    switch (step) {
      case 0: return (
        <>
          <p>How much money do you have for this film, all in? This becomes your <b>cap</b>: every Budget screen shows how close you are.</p>
          <label className="field"><span>Your money</span>
            <input inputMode="decimal" placeholder="e.g. 10000" defaultValue={b.targetTotal ?? ''} onChange={(e) => { const n = num(e.target.value); edit((dr) => { if (n > 0) dr.budget.targetTotal = n; else delete dr.budget.targetTotal; }, null); }} />
          </label>
          <p className="muted small">Not sure yet? Skip it: you can set it later in Target view.</p>
        </>
      );
      case 1: return (
        <>
          <p>What are you making? A template adds the usual lines with $0 rates for you to fill in.</p>
          {b.lines.length ? <p className="muted small">Your budget already has {b.lines.length} lines, so this step adds nothing. Templates… in Budget actions can still add one.</p> : (
            <div className="guide-choices">
              {BUDGET_TEMPLATES.map((t) => (
                <button key={t.id} className="guide-choice" onClick={() => { edit((dr) => { dr.budget.lines.push(...templateLines(t, dr.budget.accounts)); }); toast(`Added the ${t.name} lines`); setStep(2); }}>
                  <b>{t.name}</b><span className="muted small">{t.description}</span>
                </button>
              ))}
            </div>
          )}
        </>
      );
      case 2: return (
        <>
          <p>How many days will you shoot? Crew, cast, locations and meals are paid per day, so this moves the total most.</p>
          {scheduled ? <p>Your stripboard has <b>{scheduled} shoot day{scheduled === 1 ? '' : 's'}</b>. The budget uses those.</p> : (
            <>
              <label className="field"><span>Shoot days for now</span>
                <input inputMode="numeric" placeholder="e.g. 3" defaultValue={b.funding?.plannedDays ?? ''} onChange={(e) => { const n = Math.round(num(e.target.value)); edit((dr) => { if (n > 0) dr.budget.funding = { ...dr.budget.funding, plannedDays: n }; else if (dr.budget.funding) delete dr.budget.funding.plannedDays; }, null); }} />
              </label>
              <p className="muted small">A rough guide: 3 to 5 script pages a day on a small shoot. Once you schedule the Stripboard, the budget uses the real days.</p>
            </>
          )}
        </>
      );
      case 3: return (
        <>
          <p>Will any of your actors be in SAG-AFTRA? Union actors work under an <b>agreement</b> chosen by your total budget.</p>
          <label className="field"><span>Agreement</span>
            <select value={isSag ? ag?.tier ?? '' : ''} onChange={(e) => edit((dr) => { const t = e.target.value; if (t) dr.production.agreement = { union: 'SAG-AFTRA', tier: t }; else delete dr.production.agreement; })}>
              <option value="">Non-union actors only</option>
              {TIERS.map((t) => { const a = SAG?.agreements?.find((x) => x.name === t); return <option key={t} value={t}>SAG-AFTRA {t}{a?.budget ? ` (budget up to ${a.budget.replace('*', '')})` : ''}</option>; })}
            </select>
          </label>
          <p className="muted small">
            Micro-Budget (up to $20,000): rates are negotiable. Ultra Low: $257 a day from 7/1/2026, plus pension & health of 22% from 9/6/2026 (a <Term k="fringe">fringe</Term>).
            Checked on sagaftra.org {GUIDE_CHECKED}; always check the current rate sheet. <RefLink page="guild-sag-aftra" />
          </p>
          {cap > 0 && (() => { const c = agreementCheck(p, cap); return c?.over ? <p className="warn small">Your cap of {$(cap)} is over this agreement’s {$(c.limit)} limit{c.next ? `: ${c.next.name} fits` : ''}.</p> : null; })()}
          {lines('cast').length > 0 ? (
            <>
              <p className="small">A day rate for each actor (the cost of one day):</p>
              <RateList rows={lines('cast').map((l) => ({ id: l.id, label: l.description, rate: l.rate }))} onRate={setRate} cur={b.currency} />
            </>
          ) : <p className="small">No cast lines yet. <button className="link small" onClick={fromBreakdown}>⛓ Add the cast from the breakdown</button></p>}
        </>
      );
      case 4: return (
        <>
          <p>Who’s on the crew, and what does each get a day? Type 0 for someone helping for free.</p>
          {lines('crew').length > 0
            ? <RateList rows={lines('crew').map((l) => ({ id: l.id, label: l.description, rate: l.rate }))} onRate={setRate} cur={b.currency} />
            : <p className="small">No crew lines yet. Add people to Contacts as crew, then <button className="link small" onClick={fromBreakdown}>⛓ add them from the breakdown</button>.</p>}
          <p className="muted small">Someone who brings their own gear often charges a <Term k="kit">kit fee</Term> on top.</p>
        </>
      );
      case 5: return (
        <>
          <p>For each piece of gear: do you <b>own</b> it, <b>borrow</b> it, or <b>rent</b> it? Only rentals and purchases cost money.</p>
          <p className="small">{(p.gear ?? []).length ? `${(p.gear ?? []).length} item${(p.gear ?? []).length === 1 ? '' : 's'} on your gear list, ${(p.gear ?? []).filter((g) => g.source === 'rent').length} rented.` : 'Your gear list is empty.'} Rentals become budget lines by themselves.</p>
          <button onClick={() => { onClose(); goto('gear'); }}>Open Gear</button>
          <p className="muted small">Rental houses often charge 3 days for a 7-day week (a <Term k="rental">rental week</Term>).</p>
        </>
      );
      case 6: return (
        <>
          <p>Locations, food, transport, insurance and post. Fill in what you know on the Budget screen, or start from example rates and change them later. Pick the rates closest to your film:</p>
          <div className="guide-choices">
            {LEVELS.map((lv) => (
              <button key={lv.id} className="guide-choice" onClick={() => {
                let r = { added: 0, filled: 0 };
                edit((dr) => { r = quickEstimate(dr, d, lv.id as FundingLevel, dr.budget.funding?.pagesPerDay); }, 'Starter rates');
                toast(`Added ${r.added} line${r.added === 1 ? '' : 's'} and filled ${r.filled} rate${r.filled === 1 ? '' : 's'} with example rates (${lv.label})`);
              }}><b>{lv.label}</b><span className="muted small">{lv.hint}</span></button>
            ))}
          </div>
          <p className="muted small">Example rates only go into lines that are still $0 and have no note. Lines you typed stay as they are.</p>
        </>
      );
      case 7: return (
        <>
          <p>Something always goes wrong. A <Term k="contingency">contingency</Term> keeps money aside for it: 10% is usual.</p>
          <label className="field"><span>Contingency %</span>
            <input inputMode="decimal" defaultValue={b.contingencyPct} onChange={(e) => { const n = num(e.target.value); edit((dr) => { dr.budget.contingencyPct = Math.min(50, n); }, null); }} />
          </label>
        </>
      );
      default: {
        const over = cap ? view.t.total - cap : 0;
        return (
          <>
            <p className="guide-total">Your budget: <b>{$(view.t.total)}</b>{cap ? <> of your {$(cap)}: <b className={over > 0 ? 'over' : 'under'}>{over > 0 ? `${$(over)} over` : `${$(-over)} left`}</b></> : null}</p>
            {over > 0 ? <><p className="small">Ways to get under, biggest saving first:</p><CutList over={over} /></> : <p className="small">Next: fill in the $0 lines on the Budget screen. Every line’s note says where its number came from.</p>}
          </>
        );
      }
    }
  })();

  return (
    <Modal title="Set up my budget" onClose={onClose} footer={<>
      <span className="muted small">Step {step + 1} of {STEPS.length}: {STEPS[step]}</span>
      <span className="spacer" />
      {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
      {step < STEPS.length - 1 ? <button className="primary" onClick={() => setStep(step + 1)}>{step === 0 && !b.targetTotal ? 'Skip' : 'Next'}</button> : <button className="primary" onClick={onClose}>Done</button>}
    </>}>
      <div className="guide-steps" aria-hidden>{STEPS.map((s, i) => <button key={s} className={i === step ? 'active' : i < step ? 'done' : ''} title={s} onClick={() => setStep(i)} tabIndex={-1} />)}</div>
      {body}
    </Modal>
  );
}

function RateList({ rows, onRate, cur }: { rows: { id: string; label: string; rate: number }[]; onRate: (id: string, n: number) => void; cur: string }) {
  return (
    <div className="guide-rates">
      {rows.map((r) => (
        <label key={r.id} className="row">
          <span className="guide-rate-name">{r.label}</span>
          <span className="muted small">{money(0, cur).replace(/[0.,\s]/g, '')}</span>
          <input inputMode="decimal" defaultValue={r.rate || ''} placeholder="0" onChange={(e) => onRate(r.id, Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0))} />
          <span className="muted small">a day</span>
        </label>
      ))}
    </div>
  );
}
