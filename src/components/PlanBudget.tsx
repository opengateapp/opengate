import { useMemo } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { canWrite, useSync } from '../sync/state';
import { money, totals } from '../budget/calc';
import { budgetView } from '../budget/pipeline';
import { lineFor, rateFor, setRateFor, type Linkable } from '../budget/planLinks';
import { MoneyInput } from './NumberInput';

// Money where the people and places are (Contacts, Paperwork → People, Locations), for people who
// can see the budget only. Editing here writes the deal memo or the location fee the budget reads.

const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));
/** Opens Budget at an account. */
export function openBudgetAccount(accountId: string) {
  goto('budget');
  setTimeout(() => window.dispatchEvent(new CustomEvent('opengate:budget-account', { detail: accountId })), 0);
}

export const useSeesBudget = () => useSync((s) => s.write === null || s.admin || s.budget);

/** "$ [387] /day · Budget → 2200 Camera →" */
export function RateLink({ target, compact }: { target: Linkable; compact?: boolean }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const sees = useSeesBudget();
  useSync((s) => s.write);
  if (!sees) return null;
  const r = rateFor(p, target);
  const at = lineFor(p, target);
  const ro = !canWrite(target.kind === 'location' ? 'locations' : 'budget') || (target.kind !== 'location' && !r);
  return (
    <span className={`rate-link ${compact ? 'compact' : ''}`}>
      {r ? <MoneyInput className="cell-num" disabled={ro} min={0} per={r.per} value={r.rate} aria-label="Rate" title={r.from === 'deal' ? 'From the deal memo' : r.from === 'location' ? 'The location fee' : 'The budget line’s rate'} onChange={(n) => update((dr) => setRateFor(dr, target, n ?? 0), null)} />
        : <span className="muted small">{target.kind === 'location' ? 'No fee yet' : 'No rate yet'}</span>}
      {at?.account ? <button className="link small" onClick={() => openBudgetAccount(at.account!.id)}>Budget → {at.account.code} {at.account.name} →</button>
        : <span className="muted small">not in the budget yet</span>}
    </span>
  );
}

/** "Budget: $9,840 of $11,000 →" at the top of Plan screens, for people who can see the budget. */
export function PlanBudgetSummary() {
  const p = useProject();
  const d = useDerived();
  const sees = useSeesBudget();
  const total = useMemo(() => (p.budget.lines.length ? totals(p.budget, budgetView(p, d).lines).total : 0), [p, d]);
  if (!sees || !p.budget.lines.length) return null;
  const cap = p.budget.targetTotal;
  return (
    <div className="cap-bar plan-budget">
      <button className="link small" onClick={() => goto('budget')}>Budget: <b>{money(total, p.budget.currency)}</b>{cap ? <> of {money(cap, p.budget.currency)}</> : null} →</button>
      {cap && total > cap && <span className="over small"> {money(total - cap, p.budget.currency)} over</span>}
    </div>
  );
}
