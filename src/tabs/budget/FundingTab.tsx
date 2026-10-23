import { useMemo, useState } from 'react';
import { useDerived, useProject, useStore } from '../../store/project';
import type { CrowdPlan, FundingKind, FundingSource, FundingStatus, RewardTier } from '../../model/types';
import { money, totals } from '../../budget/calc';
import { budgetView } from '../../budget/pipeline';
import { budgetFacts, estimatedFacts } from '../../budget/fromBreakdown';
import { shootDays } from '../../schedule/dood';
import {
  DEFAULT_PAGES_PER_DAY, FUNDING_KINDS, FUNDING_STATUSES, LEVELS, PLATFORMS, crowdfundingGoal, defaultCrowd, forgottenItems,
  newFundingSource, quickEstimate, raiseSummary, type FundingLevel,
} from '../../budget/funding';
import { newId } from '../../model/ids';
import { canEdit, useSync } from '../../sync/state';
import { toast } from '../../components/common';
import { deletedToast } from '../../components/deleted';
import { Hint } from '../../components/Hint';
import { RefLink } from '../ReferenceTab';
import { BudgetHidden } from './BudgetTab';

// Budget → Funding: a guided path from the broken-down script to "how much do I need to raise?",
// with the money you have or expect, and a crowdfunding goal that pays for its own rewards.

export function FundingTab() {
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  return visible ? <FundingScreen /> : <BudgetHidden />;
}

const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));

function FundingScreen() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('budget');
  const $ = (n: number) => money(n, p.budget.currency);
  const plan = p.budget.funding ?? {};
  const ppd = plan.pagesPerDay ?? DEFAULT_PAGES_PER_DAY;
  const [level, setLevel] = useState<FundingLevel>(plan.level ?? 'micro');

  const scheduled = shootDays(p).length;
  const facts = useMemo(() => (scheduled ? budgetFacts(p, d) : estimatedFacts(p, d, ppd)), [p, d, scheduled, ppd]);
  const t = useMemo(() => totals(p.budget, budgetView(p, d).lines), [p, d]);
  const checks = useMemo(() => forgottenItems(p, d), [p, d]);
  const sum = useMemo(() => raiseSummary(p, d), [p, d]);
  const castCount = new Set(d.scenes.flatMap((s) => s.characters)).size;
  const steps = [
    p.elements.length > 0 || castCount > 0,
    scheduled > 0 || !!plan.pagesPerDay,
    t.total > 0,
    checks.every((c) => c.ok),
    (p.budget.fundingSources ?? []).length > 0,
  ];
  const status = (ok: boolean) => <span className={`fund-step-dot ${ok ? 'ok' : ''}`} aria-label={ok ? 'Done' : 'To do'}>{ok ? '✓' : ''}</span>;

  const setPlan = (patch: Partial<typeof plan>, label: string | null = null) => update((dr) => { dr.budget.funding = { ...dr.budget.funding, ...patch }; }, label);
  const editSources = (fn: (l: FundingSource[]) => void, label: string | null = 'Edit funding') => update((dr) => { dr.budget.fundingSources ??= []; fn(dr.budget.fundingSources); }, label);
  const setSource = (id: string, patch: Partial<FundingSource>, label: string | null = null) => editSources((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);

  const estimate = () => {
    let r = { added: 0, filled: 0 };
    update((dr) => { r = quickEstimate(dr, d, level, ppd); }, 'Quick estimate from breakdown');
    toast(r.added || r.filled ? `Added ${r.added} line${r.added === 1 ? '' : 's'} from your breakdown and filled ${r.filled} starter rate${r.filled === 1 ? '' : 's'}. Replace them with real quotes as you get them.` : 'Nothing new to add: every line already has a rate.');
  };

  return (
    <div className="funding-tab pad scroll">
      <div className="toolbar flat wrap">
        <h3>How much do I need to raise?</h3>
        <span className="spacer" />
        {ro && <span className="muted small">View only</span>}
      </div>
      <p className="muted small"><Hint>{'Script → breakdown → budget → the money you have → what’s left to raise. Private like the budget. Figures here are estimates to plan with, not quotes.'}</Hint> <RefLink page="funding-ways" label="Ways to fund a film" /></p>

      <ol className="fund-steps">
        <li className={steps[0] ? 'done' : ''}>
          <div className="fund-step-h">{status(steps[0])}<b>1. Break down the script</b></div>
          <p>{d.scenes.length} scenes, {d.pageCount} pages, {castCount} speaking roles, {p.elements.length} tagged elements (props, vehicles, stunts…).</p>
          <button className="small" onClick={() => goto('breakdown')}>Open Script Breakdown →</button>
        </li>

        <li className={steps[1] ? 'done' : ''}>
          <div className="fund-step-h">{status(steps[1])}<b>2. Shoot days</b></div>
          {scheduled > 0
            ? <p>{scheduled} shoot day{scheduled === 1 ? '' : 's'} on the stripboard. The budget counts days from it.</p>
            : <p>Nothing is scheduled yet, so Open Gate estimates: <b>{facts.shootDays} day{facts.shootDays === 1 ? '' : 's'}</b> at
                <label className="inline-num"> <input type="number" min={1} max={12} step={0.5} disabled={ro} value={ppd} aria-label="Pages per day" onChange={(e) => setPlan({ pagesPerDay: Math.max(0.5, Number(e.target.value) || DEFAULT_PAGES_PER_DAY) })} /> pages a day</label>
                , grouping scenes by location. Shorts often shoot 2–5 pages a day; stunts, kids, animals and night work are slower.</p>}
          <button className="small" onClick={() => goto('stripboard')}>{scheduled ? 'Open Stripboard →' : 'Schedule it for real on the Stripboard →'}</button>
        </li>

        <li className={steps[2] ? 'done' : ''}>
          <div className="fund-step-h">{status(steps[2])}<b>3. Build the budget</b> <RefLink page="budget-how" /></div>
          <p>Budget now: <b>{$(t.total)}</b>{sum.estimated ? ' (days estimated from page count)' : ''}.</p>
          {!ro && (
            <div className="row wrap fund-level">
              <span className="muted small">Starter rates for</span>
              <div className="seg small" role="radiogroup" aria-label="Level">
                {LEVELS.map((l) => <button key={l.id} role="radio" aria-checked={level === l.id} className={level === l.id ? 'active' : ''} title={l.hint} onClick={() => setLevel(l.id)}>{l.label}</button>)}
              </div>
              <button className="primary small" onClick={estimate}>Quick estimate from my breakdown</button>
            </div>
          )}
          {!p.crew.length && <p className="small">No crew yet: add your crew in <button className="link small" onClick={() => goto('contacts')}>Plan → Contacts</button> (or Settings → Crew) so the estimate can budget them.</p>}
          <p className="muted small">Adds lines for your cast, crew, locations, tagged elements and meals, and fills example rates only where a rate is still empty (a $0 line with a note is left alone). {LEVELS.find((l) => l.id === level)?.hint}.</p>
          <button className="small" onClick={() => goto('budget')}>Open the Budget →</button>
        </li>

        <li className={steps[3] ? 'done' : ''}>
          <div className="fund-step-h">{status(steps[3])}<b>4. The things people forget</b></div>
          <ul className="fund-checks">
            {checks.map((c) => (
              <li key={c.id} className={c.ok ? 'ok' : ''}>
                <span aria-hidden>{c.ok ? '✓' : '○'}</span>
                <span><b>{c.label}</b> <span className="muted small">{c.detail}</span> <RefLink page={c.ref} /></span>
                {!c.ok && c.fix && !ro && <button className="small" onClick={() => { let n = 0; update((dr) => { n = c.fix!(dr); }, `Add ${c.label.toLowerCase()}`); toast(`${c.label}: added ${n} line${n === 1 ? '' : 's'}${c.id === 'contingency' ? ' (10%)' : ''}. Fill in the rates in the Budget.`); }}>Add</button>}
              </li>
            ))}
          </ul>
        </li>

        <li className={steps[4] ? 'done' : ''}>
          <div className="fund-step-h">{status(steps[4])}<b>5. Money you have or expect</b> <RefLink page="funding-ways" /></div>
          <Sources ro={ro} onEdit={editSources} onSet={setSource} />
        </li>

        <li className="fund-result">
          <div className="fund-step-h"><b>6. What’s left to raise</b></div>
          <div className="fund-cards">
            <div><span className="muted small">Budget</span><b>{$(sum.total)}</b><span className="muted small">{$(sum.before)} before and during the shoot · {$(sum.after)} after (post, marketing)</span></div>
            <div><span className="muted small">Promised or in the bank</span><b>{$(sum.secured)}</b>{sum.hoped > 0 && <span className="muted small">+ {$(sum.hoped)} applied for / hoped</span>}</div>
            <div className="fund-raise"><span className="muted small">Still to raise</span><b>{$(sum.toRaise)}</b>{sum.hoped > 0 && <span className="muted small">{$(sum.toRaiseIfAll)} if everything you applied for comes through</span>}</div>
          </div>
          {sum.shortBeforeShoot > 0 && <p className="fund-warn">You need {$(sum.shortBeforeShoot)} more before the shoot: crew, cast, locations and gear are paid up front.</p>}
          {sum.incentivesAfter > 0 && <p className="muted small">Tax incentives ({$(sum.incentivesAfter)}) aren’t counted: they arrive after the shoot, so you still have to raise or borrow that money first. <RefLink page="incentives" /></p>}
        </li>

        <li>
          <div className="fund-step-h"><b>7. Crowdfunding goal, with perks and rewards</b> <RefLink page="crowdfunding-rewards" /></div>
          <Crowd ro={ro} need={sum.toRaise} />
        </li>
      </ol>
    </div>
  );
}

function Sources({ ro, onEdit, onSet }: { ro: boolean; onEdit: (fn: (l: FundingSource[]) => void, label?: string | null) => void; onSet: (id: string, patch: Partial<FundingSource>, label?: string | null) => void }) {
  const p = useProject();
  const list = p.budget.fundingSources ?? [];
  const $ = (n: number) => money(n, p.budget.currency);
  return (
    <div className="fund-sources" onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('fund-sources')) onEdit((l) => { l.push(newFundingSource()); }, 'Add funding source'); }}>
      {list.map((s) => (
        <div key={s.id} className={`fund-source st-${s.status}`}>
          <select disabled={ro} value={s.kind} aria-label="Kind" title={FUNDING_KINDS.find((k) => k.id === s.kind)?.hint} onChange={(e) => onSet(s.id, { kind: e.target.value as FundingKind }, 'Funding kind')}>{FUNDING_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
          <input disabled={ro} className="grow" value={s.name} placeholder="Who / what" aria-label="Source" onChange={(e) => onSet(s.id, { name: e.target.value })} />
          <input disabled={ro} className="num" type="number" min={0} step={50} value={s.amount || ''} placeholder="0" aria-label="Amount" onChange={(e) => onSet(s.id, { amount: Number(e.target.value) || 0 })} />
          <select disabled={ro} value={s.status} aria-label="Status" onChange={(e) => onSet(s.id, { status: e.target.value as FundingStatus }, 'Funding status')}>{FUNDING_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <input disabled={ro} type="date" value={s.date ?? ''} aria-label="Expected" title="When it arrives" onChange={(e) => onSet(s.id, { date: e.target.value || undefined })} />
          <input disabled={ro} className="fund-notes" value={s.notes ?? ''} placeholder="Notes" aria-label="Notes" onChange={(e) => onSet(s.id, { notes: e.target.value || undefined })} />
          {!ro && <button className="icon-btn" aria-label="Delete source" onClick={() => { onEdit((l) => { const i = l.findIndex((x) => x.id === s.id); if (i >= 0) l.splice(i, 1); }, 'Delete funding source'); deletedToast(s.name || 'source'); }}>×</button>}
        </div>
      ))}
      {!list.length && <p className="muted small"><Hint>{'Add what you have and what you’re chasing: your own cash, in-kind gear or locations, deferrals, grants, investors, a crowdfunding campaign. Double-click here to add one.'}</Hint></p>}
      {!ro && <button className="small" onClick={() => onEdit((l) => { l.push(newFundingSource()); }, 'Add funding source')}>＋ Source</button>}
      {list.length > 0 && <p className="muted small">In-kind and deferrals count as covering part of the budget. Total listed: {$(list.reduce((a, s) => a + (Number(s.amount) || 0), 0))}.</p>}
    </div>
  );
}

function Crowd({ ro, need }: { ro: boolean; need: number }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const $ = (n: number) => money(n, p.budget.currency);
  const c = p.budget.funding?.crowd ?? defaultCrowd();
  const [target, setTarget] = useState<number | ''>('');
  const net = target === '' ? need : target;
  const r = crowdfundingGoal(net, c);
  const preset = PLATFORMS.find((x) => x.id === c.platform);
  const set = (patch: Partial<CrowdPlan>, label: string | null = null) => update((dr) => { dr.budget.funding = { ...dr.budget.funding, crowd: { ...(dr.budget.funding?.crowd ?? c), ...patch } }; }, label);
  const setTier = (id: string, patch: Partial<RewardTier>) => set({ tiers: c.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const num = (v: number, onChange: (n: number) => void, label: string, step = 1) => <input disabled={ro} className="num" type="number" min={0} step={step} value={v} aria-label={label} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
  return (
    <div className="fund-crowd">
      <div className="row wrap fund-crowd-top">
        <label className="check small">To net for the film {<input className="num" type="number" min={0} step={100} value={target === '' ? '' : target} placeholder={String(need)} aria-label="Amount to net" onChange={(e) => setTarget(e.target.value === '' ? '' : Number(e.target.value) || 0)} />}</label>
        <label className="check small">Platform
          <select disabled={ro} value={c.platform} onChange={(e) => { const x = PLATFORMS.find((y) => y.id === e.target.value)!; set({ platform: x.id, feePct: x.feePct, processingPct: x.processingPct, perPledge: x.perPledge }, 'Crowdfunding platform'); }}>
            {PLATFORMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        <RefLink page="crowdfunding" label="Platforms compared" />
      </div>
      {preset && <p className="muted small">{preset.note} Checked October 2026.</p>}
      <div className="row wrap fund-crowd-fees">
        <label className="check small">Platform % {num(c.feePct, (n) => set({ feePct: n }), 'Platform fee', 0.5)}</label>
        <label className="check small">Processing % {num(c.processingPct, (n) => set({ processingPct: n }), 'Processing', 0.1)}</label>
        <label className="check small">+ per pledge {num(c.perPledge, (n) => set({ perPledge: n }), 'Per pledge', 0.05)}</label>
        <label className="check small" title="A pledge manager or fulfilment service, e.g. about 2% + 3.5% on extras with BackerKit">Pledge manager % {num(c.pledgeMgrPct, (n) => set({ pledgeMgrPct: n }), 'Pledge manager', 0.5)}</label>
        <label className="check small" title="Money set aside for tax on rewards and income; ask an accountant">Tax reserve % {num(c.taxReservePct, (n) => set({ taxReservePct: n }), 'Tax reserve', 1)}</label>
        <label className="check small" title="Pledges with no reward attached">No-reward pledges % {num(c.noRewardPct, (n) => set({ noRewardPct: Math.min(100, n) }), 'No-reward pledges', 5)}</label>
      </div>

      <table className="table fund-tiers cards-on-phone">
        <thead><tr><th>Perk / reward</th><th className="num">Pledge</th><th className="num">Backers (planned)</th><th className="num">Cost to make</th><th className="num">Postage</th><th className="num">Keeps</th><th /></tr></thead>
        <tbody>
          {c.tiers.map((t) => {
            const tc = r.tierCosts.find((x) => x.id === t.id);
            return (
              <tr key={t.id}>
                <td data-label="Perk"><input disabled={ro} value={t.name} aria-label="Reward" onChange={(e) => setTier(t.id, { name: e.target.value })} /></td>
                <td data-label="Pledge" className="num">{num(t.price, (n) => setTier(t.id, { price: n }), 'Pledge')}</td>
                <td data-label="Backers" className="num">{num(t.backers, (n) => setTier(t.id, { backers: n }), 'Backers')}</td>
                <td data-label="Cost to make" className="num">{num(t.costEach, (n) => setTier(t.id, { costEach: n }), 'Cost each', 0.5)}</td>
                <td data-label="Postage" className="num">{num(t.shipEach, (n) => setTier(t.id, { shipEach: n }), 'Postage each', 0.5)}</td>
                <td data-label="Keeps" className={`num ${tc && tc.margin < 0.5 ? 'warn-text' : ''}`} title="Share of the pledge left after the reward and fees">{tc ? `${Math.round(tc.margin * 100)}%` : '—'}</td>
                <td>{!ro && <button className="icon-btn" aria-label="Delete reward" onClick={() => set({ tiers: c.tiers.filter((x) => x.id !== t.id) }, 'Delete reward')}>×</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!ro && <button className="small" onClick={() => set({ tiers: [...c.tiers, { id: newId(), name: '', price: 0, backers: 0, costEach: 0, shipEach: 0 }] }, 'Add reward')}>＋ Reward</button>}

      {r.impossible ? (
        <p className="fund-warn">Fees and rewards take nearly everything you raise. Cut physical rewards, raise their prices, or add digital ones.</p>
      ) : net > 0 && (
        <div className="fund-cards">
          <div className="fund-raise"><span className="muted small">Set your goal to about</span><b>{$(r.goal)}</b><span className="muted small">to net {$(r.net)} for the film{preset?.threshold ? `. ${preset.label} pays out once you reach ${preset.threshold}% (${$(Math.round(r.goal * preset.threshold / 100))}), but you’d net less than you need` : ''}</span></div>
          <div><span className="muted small">Fees</span><b>{$(r.fees)}</b><span className="muted small">platform, processing, pledge manager, tax reserve</span></div>
          <div><span className="muted small">Perks & fulfilment</span><b>{$(r.rewards)}</b><span className="muted small">{Math.round(r.rewardPct * 100)}% of pledges · about {r.backers} backers at {$(Math.round(r.avgPledge))} average</span></div>
        </div>
      )}
      <p className="muted small">Rewards that ship cost far more than they look: a poster can cost $20 to print, tube and post. Digital rewards, credits and experiences cost little. Price shipping by weight and destination, and remember fees are charged on shipping too.</p>
    </div>
  );
}
