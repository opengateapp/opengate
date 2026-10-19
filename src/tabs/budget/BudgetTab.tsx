import { Fragment, useMemo, useState } from 'react';
import type { Draft } from 'immer';
import { useDerived, useProject, useStore } from '../../store/project';
import type { Budget, BudgetAccount, BudgetGroup, BudgetLine, BudgetUnits, Project } from '../../model/types';
import { newId } from '../../model/ids';
import { GROUPS, TYPICAL_SPLIT, accountLabel } from '../../budget/accounts';
import { money, totals, lineTotal, round2, billedQty } from '../../budget/calc';
import { breakdownFacts, importFromBreakdown, LINK_LABEL } from '../../budget/fromBreakdown';
import { canWrite, useSync } from '../../sync/state';
import { askConfirm, askText } from '../../components/dialogs';
import { toast } from '../../components/common';
import { getDerived } from '../../store/project';
import { More } from '../../components/More';
import { LongPress } from '../../components/ActionSheet';
import { Hint } from '../../components/Hint';
import { budgetView } from '../../budget/pipeline';
import { evaluate, isFormula, type Vars } from '../../budget/expr';
import { BUILT_IN_VARS } from '../../budget/pipeline';
import { costReport, lockBudget } from '../../budget/costReport';
import { SheetImport, TemplatePicker } from './BudgetImport';
import { download, safeName } from '../../io/files';

/** Downloads the budget (one version) as a PDF or an Excel workbook. */
export async function exportBudget(p: Project, kind: 'pdf' | 'xlsx', scenarioId?: string) {
  const sc = p.budget.scenarios.find((s) => s.id === scenarioId);
  const name = `${safeName(p.title)} - budget${sc ? ` (${safeName(sc.name)})` : ''}`;
  if (kind === 'pdf') {
    const { budgetPdf } = await import('../../pdf/budgetPdf');
    download(`${name}.pdf`, budgetPdf(p, getDerived(), scenarioId).output('blob'));
  } else {
    const { budgetXlsx } = await import('../../budget/exportXlsx');
    download(`${name}.xlsx`, await budgetXlsx(p, getDerived(), scenarioId));
  }
}

// Budget: an industry-style top sheet (groups → accounts) with editable detail lines.
// The mode dropdown changes what the top sheet compares: build-up, a top-down target,
// actual spending, or scenarios side by side. Linked lines take their quantities live from
// the breakdown and schedule; while a scenario is selected, line edits are saved to it.

export type BudgetMode = 'build' | 'target' | 'actual' | 'scenarios' | 'cost';
const MODES: { id: BudgetMode; label: string; hint: string }[] = [
  { id: 'build', label: 'Build from breakdown', hint: 'Add lines and rates; import cast, crew, locations and tagged elements' },
  { id: 'target', label: 'Top-down target', hint: 'Set a total and split it across accounts' },
  { id: 'actual', label: 'Actual spending', hint: 'Estimate vs. what has been spent' },
  { id: 'scenarios', label: 'Compare versions', hint: 'Every version of the budget side by side' },
  { id: 'cost', label: 'Cost report', hint: 'The locked budget vs. spent, committed and estimate to complete' },
];
const UNITS: { id: BudgetUnits; label: string }[] = [
  { id: 'days', label: 'Days' }, { id: 'weeks', label: 'Weeks' }, { id: 'hours', label: 'Hours' },
  { id: 'each', label: 'Each' }, { id: 'flat', label: 'Flat' }, { id: 'allow', label: 'Allow' },
  { id: 'rentdays', label: 'Rental days' },
];
const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'INR', 'MXN', 'BRL', 'ZAR'];

const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

function NumIn({ value, onChange, disabled, className, title }: { value: number; onChange: (n: number) => void; disabled?: boolean; className?: string; title?: string }) {
  return <input type="number" step="any" className={className} title={title} disabled={disabled} value={Number.isFinite(value) ? round2(value) : ''} onChange={(e) => { const n = num(e.target.value); if (Number.isFinite(n)) onChange(n); }} />;
}

/** Asks for a name and adds a budget version (a copy of `fromId`, or empty = the base budget). */
async function createVersion(fromId: string | undefined, select: (id: string) => void) {
  const b = useStore.getState().project!.budget;
  const from = b.scenarios.find((s) => s.id === fromId);
  const name = await askText('Name this version', {
    initial: from ? `${from.name} copy` : '', placeholder: 'e.g. Lean, Target, Ideal, 12 days', confirmLabel: 'Create',
    message: from ? `Starts as a copy of ${from.name}.` : 'Starts from the base budget; change quantities, rates or shoot days without touching the base.',
  });
  if (!name) return;
  const id = newId();
  useStore.getState().update((dr) => {
    dr.budget.scenarios.push(from
      ? { ...JSON.parse(JSON.stringify(from)), id, name, added: from.added.map((l) => ({ ...l, id: newId() })) }
      : { id, name, overrides: {}, added: [] });
  }, 'Add budget version');
  select(id);
}

/** A quantity box that also takes formulas with named numbers ("SHOOT_WEEKS * 5"). */
function ExprIn({ value, expr, vars, onNumber, onExpr, disabled, className, title }: {
  value: number; expr?: string; vars: Vars; onNumber: (n: number) => void; onExpr: (s: string) => void; disabled?: boolean; className?: string; title?: string;
}) {
  const res = expr ? evaluate(expr, vars) : null;
  return (
    <input className={`${className ?? ''} ${expr ? 'is-formula' : ''} ${res?.error ? 'bad' : ''}`} disabled={disabled} inputMode="decimal"
      value={expr ?? (Number.isFinite(value) ? String(round2(value)) : '')}
      title={res ? (res.error ? res.error : `= ${round2(res.value)}`) : title}
      onChange={(e) => {
        const v = e.target.value;
        if (isFormula(v)) onExpr(v);
        else { const n = num(v); if (Number.isFinite(n)) onNumber(n); }
      }} />
  );
}

/** Everything the screen needs, worked out once per render. */
function useBudgetView(p: Project, scenarioId?: string) {
  const d = useDerived();
  return useMemo(() => {
    const v = budgetView(p, d, scenarioId);
    return { ...v, t: totals(p.budget, v.lines) };
  }, [p, d, scenarioId]);
}

/** Shown instead of the budget to collaborators the owner didn't share it with. */
export function BudgetHidden() {
  return (
    <div className="budget-hidden">
      <h3>The budget isn’t shared with you</h3>
      <p className="muted">The project owner keeps the budget private. If you need it, ask them for a link that includes the budget.</p>
    </div>
  );
}

export function BudgetTab() {
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  return visible ? <BudgetScreen /> : <BudgetHidden />;
}

function BudgetScreen() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canWrite('budget');
  const b = p.budget;
  const [mode, setMode] = useState<BudgetMode>(() => (localStorage.getItem('opengate.budgetMode') as BudgetMode) || 'build');
  const [scenarioId, setScenarioId] = useState<string | undefined>(undefined);
  const scenario = b.scenarios.find((s) => s.id === scenarioId);
  const view = useBudgetView(p, scenario?.id);
  const [accountId, setAccountId] = useState<string>(() => b.accounts.find((a) => a.code === '1400')?.id ?? b.accounts[0]?.id);
  const [showEmpty, setShowEmpty] = useState(false);
  const [settings, setSettings] = useState(false);
  const [dialog, setDialog] = useState<'templates' | 'import' | null>(null);
  const cur = b.currency;
  const $ = (n: number) => money(n, cur);
  const pages = useDerived().pageCount;
  const pickMode = (m: BudgetMode) => { setMode(m); try { localStorage.setItem('opengate.budgetMode', m); } catch { /* ignore */ } };

  const ub = (fn: (bd: Draft<Budget>) => void, label: string | null = 'Edit budget') => update((dr) => fn(dr.budget), label);

  const importLines = () => {
    const added = importFromBreakdown(p, view.facts);
    if (!added.length) { toast('Everything in the breakdown is already in the budget'); return; }
    ub((bd) => { bd.lines.push(...added); }, 'Import from breakdown');
    toast(`Added ${added.length} line${added.length === 1 ? '' : 's'} from the breakdown — fill in the rates`);
  };

  const accountsIn = (g: BudgetGroup) => b.accounts.filter((a) => a.group === g);
  const visible = (a: BudgetAccount) => showEmpty || a.id === accountId || view.t.byAccount.has(a.id) || a.target != null || view.t.actualByAccount.has(a.id);
  const account = b.accounts.find((a) => a.id === accountId) ?? b.accounts[0];

  return (
    <div className="budget">
      <div className="budget-bar">
        <label className="inline-field">
          <span>View</span>
          <select value={mode} onChange={(e) => pickMode(e.target.value as BudgetMode)} title={MODES.find((m) => m.id === mode)?.hint}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="inline-field">
          <span>Version</span>
          <select value={scenarioId ?? ''} onChange={(e) => {
            const v = e.target.value;
            if (v === '__new') { void createVersion(scenarioId, setScenarioId); return; }
            if (v === '__compare') { pickMode('scenarios'); return; }
            setScenarioId(v || undefined);
          }}>
            <option value="">Base budget</option>
            {b.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {!ro && <option disabled>──────────</option>}
            {!ro && <option value="__new">＋ New version{scenario ? ` (copy of ${scenario.name})` : ''}…</option>}
            <option value="__compare">Compare versions…</option>
          </select>
        </label>
        <More label="Budget actions">
        {!ro && <button onClick={() => setDialog('templates')} title="Typical lines for a short, a feature, a music video or a commercial">Templates…</button>}
        {!ro && <button onClick={() => setDialog('import')} title="Bring in an existing budget from CSV or Excel">Import spreadsheet…</button>}
        {mode === 'build' && !ro && <button onClick={importLines} title="Adds cast, crew, locations, tagged elements and per-day catering that aren't in the budget yet">⛓ Update from breakdown</button>}
        <button onClick={() => exportBudget(p, 'pdf', scenario?.id).catch((e) => toast((e as Error).message))} title="Top sheet and detail of the version shown">PDF</button>
        <button onClick={() => exportBudget(p, 'xlsx', scenario?.id).catch((e) => toast((e as Error).message))} title="Top sheet, detail with formulas, and expenses">Excel</button>
        <button className={settings ? 'active' : ''} onClick={() => setSettings((x) => !x)}>Settings</button>
        </More>
        <span className="spacer" />
        <div className="budget-total">
          <span className="muted small">Total{scenario ? ` · ${scenario.name}` : ''}</span>
          <b>{$(view.t.total)}</b>
          {b.targetTotal ? <span className={`small ${view.t.total > b.targetTotal ? 'over' : 'under'}`}>{view.t.total > b.targetTotal ? `${$(view.t.total - b.targetTotal)} over target` : `${$(b.targetTotal - view.t.total)} under target`}</span> : null}
        </div>
      </div>

      {settings && <BudgetSettings ro={ro} vars={view.vars} />}
      {dialog === 'templates' && <TemplatePicker onClose={() => setDialog(null)} />}
      {dialog === 'import' && <SheetImport onClose={() => setDialog(null)} />}
      {!ro && !b.lines.length && mode === 'build' && (
        <div className="budget-start">
          <b>Starting a budget?</b>
          <span className="muted small">Begin from a template, pull in your breakdown, or import a spreadsheet you already have.</span>
          <button className="primary" onClick={() => setDialog('templates')}>Templates…</button>
          <button onClick={importLines}>⛓ From the breakdown</button>
          <button onClick={() => setDialog('import')}>Import spreadsheet…</button>
        </div>
      )}
      {scenario && mode !== 'scenarios' && <p className="budget-note">Showing <b>{scenario.name}</b>. Changes to quantities and rates are saved to this version only; the base budget stays as it is.</p>}

      {mode === 'cost' ? (
        <CostReportView view={view} ro={ro} />
      ) : mode === 'scenarios' ? (
        <ScenariosView scenarioId={scenarioId} setScenarioId={setScenarioId} ro={ro} />
      ) : (
        <div className="budget-split">
          <section className="budget-topsheet">
            {mode === 'target' && <TargetHeader ro={ro} subtotal={view.t.subtotal} estimates={view.t.byAccount} />}
            <table className="table topsheet">
              <thead>
                <tr>
                  <th>Account</th>
                  {mode === 'target' && <><th className="num">Target</th><th className="num">Estimate</th><th className="num">Room</th></>}
                  {mode === 'actual' && <><th className="num">Estimate</th><th className="num">Actual</th><th className="num">Left</th></>}
                  {mode === 'build' && <th className="num">Total</th>}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => {
                  const accs = accountsIn(g.id).filter(visible);
                  const gTarget = accountsIn(g.id).reduce((s, a) => s + (a.target ?? 0), 0);
                  const gActual = accountsIn(g.id).reduce((s, a) => s + (view.t.actualByAccount.get(a.id) ?? 0), 0);
                  const gEst = view.t.byGroup[g.id];
                  return (
                    <GroupRows key={g.id} label={g.label} mode={mode}
                      est={gEst} target={gTarget} actual={gActual} $={$}
                      onAdd={ro ? undefined : async () => {
                        const name = await askText(`New account in ${g.label}`, { placeholder: 'e.g. Drone unit', confirmLabel: 'Add account' });
                        if (!name) return;
                        const codes = accountsIn(g.id).map((a) => Number(a.code)).filter(Number.isFinite);
                        const id = newId();
                        ub((bd) => { bd.accounts.push({ id, code: String((codes.length ? Math.max(...codes) : 900) + 10), name, group: g.id }); }, 'Add account');
                        setAccountId(id);
                      }}>
                      {accs.map((a) => {
                        const est = view.t.byAccount.get(a.id)?.total ?? 0;
                        const act = view.t.actualByAccount.get(a.id) ?? 0;
                        return (
                          <tr key={a.id} className={`acct ${a.id === account?.id ? 'sel' : ''}`}
                            onClick={() => setAccountId(a.id)}
                            onDoubleClick={ro ? undefined : async () => {
                              const name = await askText('Rename account', { initial: a.name, confirmLabel: 'Rename' });
                              if (name) ub((bd) => { bd.accounts.find((x) => x.id === a.id)!.name = name; }, 'Rename account');
                            }}
                            onContextMenu={ro ? undefined : async (e) => {
                              e.preventDefault();
                              if (b.lines.some((l) => l.accountId === a.id) || b.expenses.some((x) => x.accountId === a.id)) { toast('Move or delete this account’s lines and expenses first'); return; }
                              if (await askConfirm(`Delete account ${accountLabel(a)}?`, { confirmLabel: 'Delete', danger: true })) ub((bd) => { bd.accounts = bd.accounts.filter((x) => x.id !== a.id); }, 'Delete account');
                            }}
                            onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-budget-line')) e.preventDefault(); }}
                            onDrop={(e) => {
                              const id = e.dataTransfer.getData('application/x-budget-line');
                              if (!id || ro) return;
                              e.preventDefault();
                              ub((bd) => {
                                const l = bd.lines.find((x) => x.id === id) ?? bd.scenarios.flatMap((s) => s.added).find((x) => x.id === id);
                                if (l) l.accountId = a.id;
                              }, 'Move line');
                            }}
                            title="Double-click to rename · right-click to delete · drop a line here to move it">
                            <td><span className="code">{a.code}</span> {a.name}</td>
                            {mode === 'build' && <td className="num">{est ? <>{$(est)} <span className="pct">{Math.round((est / (view.t.subtotal || 1)) * 100)}%</span></> : '—'}</td>}
                            {mode === 'target' && <>
                              <td className="num" onClick={(e) => e.stopPropagation()}>
                                <NumIn className="cell-num" disabled={ro} value={a.target ?? 0} onChange={(n) => ub((bd) => { const x = bd.accounts.find((y) => y.id === a.id)!; if (n) x.target = n; else delete x.target; }, null)} />
                              </td>
                              <td className="num">{est ? $(est) : '—'}</td>
                              <td className="num"><Room target={a.target} est={est} $={$} /></td>
                            </>}
                            {mode === 'actual' && <>
                              <td className="num">{est ? $(est) : '—'}</td>
                              <td className="num">{act ? $(act) : '—'}</td>
                              <td className="num"><Spent est={est} act={act} $={$} /></td>
                            </>}
                          </tr>
                        );
                      })}
                    </GroupRows>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td>Fringes (included above)</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(view.t.fringes)}</td></tr>
                <tr><td>Subtotal</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(view.t.subtotal)}</td></tr>
                <tr><td>Contingency ({b.contingencyPct}%{b.contingencyAppliesTo && b.contingencyAppliesTo.length < GROUPS.length ? ` of ${b.contingencyAppliesTo.map((g) => GROUPS.find((x) => x.id === g)?.short).join(' + ')}` : ''})</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(view.t.contingency)}</td></tr>
                {view.t.applied.map((a) => (
                  <tr key={a.id} className={a.credit ? 'credit' : ''}><td>{a.name} ({a.credit ? '−' : ''}{a.pct}%)</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(a.amount)}</td></tr>
                ))}
                <tr className="grand"><td>Total</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(view.t.total)}{mode === 'actual' ? ` · spent ${$(view.t.actual)}` : ''}</td></tr>
                {view.t.total > 0 && (
                  <tr className="stats"><td colSpan={mode === 'build' ? 2 : 4}>
                    {view.facts.shootDays > 0 && <span>{$(view.t.total / (scenario?.shootDays ?? view.facts.shootDays))} per shoot day</span>}
                    {pages > 0 && <span>{$(view.t.total / pages)} per script page</span>}
                    <span>Above the line {Math.round((view.t.byGroup.atl / (view.t.subtotal || 1)) * 100)}%</span>
                  </td></tr>
                )}
              </tfoot>
            </table>
            <label className="check small"><input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Show empty accounts</label>
          </section>

          <section className="budget-detail">
            {account && <AccountLines account={account} view={view} scenarioId={scenario?.id} ro={ro} mode={mode} />}
          </section>
        </div>
      )}
    </div>
  );
}

function GroupRows({ label, mode, est, target, actual, $, onAdd, children }: {
  label: string; mode: BudgetMode; est: number; target: number; actual: number; $: (n: number) => string; onAdd?: () => void; children: React.ReactNode;
}) {
  return (
    <>
      <tr className="group">
        <td>{label}{onAdd && <button className="icon-btn" title="Add an account" onClick={(e) => { e.stopPropagation(); onAdd(); }}>＋</button>}</td>
        {mode === 'build' && <td className="num">{$(est)}</td>}
        {mode === 'target' && <><td className="num">{target ? $(target) : '—'}</td><td className="num">{$(est)}</td><td className="num"><Room target={target || undefined} est={est} $={$} /></td></>}
        {mode === 'actual' && <><td className="num">{$(est)}</td><td className="num">{actual ? $(actual) : '—'}</td><td className="num"><Spent est={est} act={actual} $={$} /></td></>}
      </tr>
      {children}
    </>
  );
}

function Room({ target, est, $ }: { target?: number; est: number; $: (n: number) => string }) {
  if (target == null) return est ? <span className="muted small">no target</span> : <span className="muted">—</span>;
  const room = target - est;
  const pct = target > 0 ? Math.min(1, est / target) : 1;
  return (
    <span className={`budget-meter ${room < 0 ? 'over' : ''}`} title={`${$(est)} of ${$(target)}`}>
      <i style={{ width: `${pct * 100}%` }} />
      <span>{room < 0 ? `${$(-room)} over` : `${$(room)} left`}</span>
    </span>
  );
}

function Spent({ est, act, $ }: { est: number; act: number; $: (n: number) => string }) {
  if (!est && !act) return <span className="muted">—</span>;
  const left = est - act;
  const pct = est > 0 ? Math.min(1, act / est) : 1;
  return (
    <span className={`budget-meter ${left < 0 ? 'over' : ''}`} title={est ? `${Math.round((act / est) * 100)}% spent` : 'Spent with nothing budgeted'}>
      <i style={{ width: `${pct * 100}%` }} />
      <span>{left < 0 ? `${$(-left)} over` : $(left)}</span>
    </span>
  );
}

function TargetHeader({ ro, subtotal, estimates }: { ro: boolean; subtotal: number; estimates: Map<string, { total: number }> }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const b = p.budget;
  const $ = (n: number) => money(n, b.currency);
  const reserve = b.targetTotal ? b.targetTotal - b.targetTotal / (1 + b.contingencyPct / 100) : 0;
  const allocatable = (b.targetTotal ?? 0) - reserve;
  const allocated = b.accounts.reduce((s, a) => s + (a.target ?? 0), 0);
  const split = (how: 'typical' | 'estimates') => update((dr) => {
    for (const g of GROUPS) {
      const accs = dr.budget.accounts.filter((a) => a.group === g.id);
      const groupAmount = how === 'typical' ? allocatable * TYPICAL_SPLIT[g.id] : 0;
      const est = accs.map((a) => estimates.get(a.id)?.total ?? 0);
      const estSum = est.reduce((s, v) => s + v, 0);
      accs.forEach((a, i) => {
        let v: number;
        if (how === 'estimates') v = subtotal > 0 ? (allocatable * est[i]) / subtotal : 0;
        // Within a group, follow the estimates where there are any, else split evenly.
        else v = estSum > 0 ? (groupAmount * est[i]) / estSum : groupAmount / accs.length;
        v = Math.round(v);
        if (v > 0) a.target = v; else delete a.target;
      });
    }
  }, 'Split target');
  return (
    <div className="target-head">
      <label className="field"><span>Target total (all-in)</span>
        <NumIn disabled={ro} value={b.targetTotal ?? 0} onChange={(n) => update((dr) => { if (n > 0) dr.budget.targetTotal = n; else delete dr.budget.targetTotal; }, null)} />
      </label>
      {!!b.targetTotal && (
        <div className="target-facts small">
          <span>Contingency reserve ({b.contingencyPct}%): <b>{$(reserve)}</b></span>
          <span>To allocate: <b>{$(allocatable)}</b></span>
          <span className={allocated > allocatable + 0.5 ? 'over' : ''}>Allocated: <b>{$(allocated)}</b> · {allocated > allocatable ? `${$(allocated - allocatable)} too much` : `${$(allocatable - allocated)} unallocated`}</span>
        </div>
      )}
      {!ro && !!b.targetTotal && (
        <div className="row">
          <button onClick={() => split('typical')} title="Above the line 20%, production 55%, post 15%, other 10% — then by your estimates within each group">Use a typical split</button>
          <button disabled={!subtotal} onClick={() => split('estimates')}>Split by current estimates</button>
          <button disabled={!allocated} onClick={() => update((dr) => { dr.budget.accounts.forEach((a) => { delete a.target; }); }, 'Clear targets')}>Clear</button>
        </div>
      )}
    </div>
  );
}

function AccountLines({ account, view, scenarioId, ro, mode }: { account: BudgetAccount; view: ReturnType<typeof useBudgetView>; scenarioId?: string; ro: boolean; mode: BudgetMode }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const b = p.budget;
  const $ = (n: number) => money(n, b.currency);
  const lines = view.lines.filter((l) => l.accountId === account.id);
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const toggleDetails = (id: string) => setOpenDetails((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sc = b.scenarios.find((s) => s.id === scenarioId);
  const isAdded = (id: string) => !!sc?.added.some((l) => l.id === id);
  const expenses = b.expenses.filter((e) => e.accountId === account.id);

  /** Quantity, multiplier and rate go to the scenario when one is selected; everything else to the line. */
  const set = (l: BudgetLine, patch: Partial<BudgetLine>, label: string | null = null) => update((dr) => {
    const bd = dr.budget;
    const inAdded = bd.scenarios.find((s) => s.id === scenarioId)?.added.find((x) => x.id === l.id);
    const target = inAdded ?? bd.lines.find((x) => x.id === l.id);
    if (!target) return;
    const s = bd.scenarios.find((x) => x.id === scenarioId);
    if (s && !inAdded) {
      const numeric = (['qty', 'x', 'rate'] as const).filter((k) => k in patch);
      if (numeric.length) {
        const o = (s.overrides[l.id] ??= {});
        for (const k of numeric) o[k] = patch[k] as number;
      }
      const rest = { ...patch };
      for (const k of numeric) delete rest[k];
      Object.assign(target, rest);
      return;
    }
    // Typing a quantity (or formula) on a linked line unlinks it (the typed value is kept).
    if (('qty' in patch || 'qtyExpr' in patch) && target.link?.auto) target.link.auto = false;
    for (const k of ['qtyExpr', 'xExpr'] as const) if (k in patch && patch[k] === undefined) { delete target[k]; delete patch[k]; }
    Object.assign(target, patch);
  }, label);

  const addLine = () => {
    const l: BudgetLine = { id: newId(), accountId: account.id, description: '', qty: 1, units: 'days', x: 1, rate: 0, fringeIds: [] };
    update((dr) => {
      const s = dr.budget.scenarios.find((x) => x.id === scenarioId);
      (s ? s.added : dr.budget.lines).push(l);
    }, 'Add budget line');
  };
  const removeLine = (l: BudgetLine) => update((dr) => {
    const s = dr.budget.scenarios.find((x) => x.id === scenarioId);
    if (s && !isAdded(l.id)) { (s.overrides[l.id] ??= {}).removed = true; return; }
    if (s) { s.added = s.added.filter((x) => x.id !== l.id); return; }
    dr.budget.lines = dr.budget.lines.filter((x) => x.id !== l.id);
    for (const sc2 of dr.budget.scenarios) delete sc2.overrides[l.id];
    for (const e of dr.budget.expenses) if (e.lineId === l.id) delete e.lineId;
  }, 'Delete budget line');
  const relink = (l: BudgetLine) => update((dr) => {
    const x = dr.budget.lines.find((y) => y.id === l.id);
    if (x?.link) x.link.auto = true;
    const s = dr.budget.scenarios.find((y) => y.id === scenarioId);
    if (s?.overrides[l.id]) delete s.overrides[l.id].qty;
  }, 'Re-link line');

  const total = lines.reduce((s, l) => s + (view.t.lineTotal.get(l.id) ?? lineTotal(b, l)), 0);
  /** The stored line (formulas live there; view lines have them worked out). */
  const base = (l: BudgetLine): BudgetLine => b.lines.find((x) => x.id === l.id) ?? b.scenarios.flatMap((x) => x.added).find((x) => x.id === l.id) ?? l;
  return (
    <div onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).closest('.budget-empty, .lines-pad')) addLine(); }}>
      <div className="detail-head">
        <h3><span className="code">{account.code}</span> {account.name}</h3>
        <span className="muted">{$(total)}</span>
      </div>
      {lines.length ? (
        <table className="table budget-lines cards-on-phone">
          <thead>
            <tr><th /><th>Description</th><th className="num">Qty</th><th>Units</th><th className="num">×</th><th className="num">Rate</th>{b.fringes.length > 0 && <th>Fringes</th>}<th className="num">Total</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const linked = l.link;
              const orphan = view.orphaned.has(l.id);
              const overridden = sc?.overrides[l.id];
              const details = openDetails.has(l.id);
              const extras = [
                l.prepDays ? `+${l.prepDays} prep` : '', l.wrapDays ? `+${l.wrapDays} wrap` : '',
                l.otHours ? `${l.otHours}h OT` : '', l.sixthDays ? `${l.sixthDays}× 6th` : '', l.seventhDays ? `${l.seventhDays}× 7th` : '',
                l.units === 'rentdays' ? `billed ${billedQty(l, b)} d` : '', l.notes ? 'note' : '',
              ].filter(Boolean);
              return (
                <Fragment key={l.id}>
                <LongPress as="tr" title={l.description || 'Budget line'} actions={() => ro ? [] : [
                  { label: 'Move to account…', items: b.accounts.map((acc) => ({ label: accountLabel(acc), current: acc.id === l.accountId, run: () => update((dr) => {
                    const x = dr.budget.lines.find((y) => y.id === l.id) ?? dr.budget.scenarios.flatMap((sc2) => sc2.added).find((y) => y.id === l.id);
                    if (x) x.accountId = acc.id;
                  }, 'Move line') })) },
                  ...(linked && !linked.auto && !orphan ? [{ label: 'Follow the breakdown again', run: () => relink(l) }] : []),
                  { label: sc && !isAdded(l.id) ? `Remove from ${sc.name}` : 'Delete line', danger: true, run: () => removeLine(l) },
                ]} className={overridden ? 'overridden' : isAdded(l.id) ? 'added' : ''}
                  draggable={!ro} onDragStart={(e) => { e.dataTransfer.setData('application/x-budget-line', l.id); e.dataTransfer.effectAllowed = 'move'; }}>
                  <td className="drag" title="Drag onto an account to move">⋮⋮</td>
                  <td>
                    <div className="line-desc">
                      {linked && (
                        <button className={`line-link ${linked.auto ? 'on' : ''} ${orphan ? 'orphan' : ''}`}
                          title={orphan ? 'What this line came from was deleted from the breakdown' : linked.auto ? `${LINK_LABEL[linked.kind]} — the quantity follows the schedule` : `Unlinked (you typed a quantity). Click to follow ${LINK_LABEL[linked.kind].toLowerCase()} again.`}
                          disabled={ro || orphan || linked.auto} onClick={() => relink(l)}>
                          {orphan ? '⚠' : linked.auto ? '⛓' : '⛓̸'}
                        </button>
                      )}
                      <input disabled={ro} value={l.description} placeholder="Description" onChange={(e) => set(l, { description: e.target.value })} />
                    </div>
                    {extras.length > 0 && <div className="line-extras">{extras.map((x) => <span key={x}>{x}</span>)}</div>}
                  </td>
                  <td className="num"><ExprIn className="cell-num" disabled={ro} value={l.qty} expr={linked?.auto ? undefined : base(l).qtyExpr} vars={view.vars}
                    onNumber={(n) => set(l, { qty: n, qtyExpr: undefined })} onExpr={(x) => set(l, { qtyExpr: x })} title={linked?.auto ? LINK_LABEL[linked.kind] : 'A number, or a formula like SHOOT_WEEKS * 5'} /></td>
                  <td>
                    <select disabled={ro} value={l.units} onChange={(e) => set(l, { units: e.target.value as BudgetUnits }, 'Edit budget')}>
                      {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </td>
                  <td className="num"><ExprIn className="cell-num small" disabled={ro} value={l.x} expr={base(l).xExpr} vars={view.vars}
                    onNumber={(n) => set(l, { x: n, xExpr: undefined })} onExpr={(x) => set(l, { xExpr: x })} title="People, items… (or a formula like CREW)" /></td>
                  <td className="num"><NumIn className="cell-num" disabled={ro || !!l.items?.length} value={l.rate} onChange={(n) => set(l, { rate: n })} title={l.items?.length ? 'Adds up the sub-items (open ▸ details)' : undefined} /></td>
                  {b.fringes.length > 0 && (
                    <td className="fringe-cell">
                      {b.fringes.map((f) => (
                        <label key={f.id} className={`fringe-chip ${l.fringeIds.includes(f.id) ? 'on' : ''}`} title={`${f.name} ${f.pct}%`}>
                          <input type="checkbox" disabled={ro} checked={l.fringeIds.includes(f.id)} onChange={(e) => set(l, { fringeIds: e.target.checked ? [...l.fringeIds, f.id] : l.fringeIds.filter((x) => x !== f.id) }, 'Edit budget')} />
                          {f.name.split(/\s+/).filter((w) => /^[a-z]/i.test(w)).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '%'}
                        </label>
                      ))}
                    </td>
                  )}
                  <td className="num"><b>{$(view.t.lineTotal.get(l.id) ?? lineTotal(b, l))}</b></td>
                  <td className="actions">
                    <button className={`icon-btn ${details ? 'on' : ''}`} title="Details: prep / wrap days, overtime, notes" aria-expanded={details} onClick={() => toggleDetails(l.id)}>{details ? '▾' : '▸'}</button>
                    {!ro && <button className="icon-btn" title={sc && !isAdded(l.id) ? `Remove from ${sc.name}` : 'Delete line'} onClick={() => removeLine(l)}>×</button>}
                  </td>
                </LongPress>
                {details && (
                  <tr className="line-details">
                    <td colSpan={b.fringes.length > 0 ? 9 : 8}>
                      <div className="line-details-grid">
                        {linked?.auto && (linked.kind === 'crew' || linked.kind === 'location' || linked.kind === 'cast' || linked.kind === 'shootDays') && <>
                          <label className="field"><span>Prep days</span><NumIn disabled={ro} value={l.prepDays ?? 0} title="Paid days before the shoot (added to the linked days)" onChange={(n) => set(l, { prepDays: n > 0 ? n : undefined })} /></label>
                          <label className="field"><span>Wrap days</span><NumIn disabled={ro} value={l.wrapDays ?? 0} title="Paid days after the shoot (strike, returns)" onChange={(n) => set(l, { wrapDays: n > 0 ? n : undefined })} /></label>
                        </>}
                        {l.units === 'days' && <>
                          <label className="field"><span>Overtime hours (total)</span><NumIn disabled={ro} value={l.otHours ?? 0} title={`Paid at ${b.otMult ?? 1.5}× the hourly rate (day rate ÷ ${b.dayHours ?? 10} h)`} onChange={(n) => set(l, { otHours: n > 0 ? n : undefined })} /></label>
                          <label className="field"><span>6th days</span><NumIn disabled={ro} value={l.sixthDays ?? 0} title={`Days paid at ${b.sixthMult ?? 1.5}×`} onChange={(n) => set(l, { sixthDays: n > 0 ? n : undefined })} /></label>
                          <label className="field"><span>7th days</span><NumIn disabled={ro} value={l.seventhDays ?? 0} title={`Days paid at ${b.seventhMult ?? 2}×`} onChange={(n) => set(l, { seventhDays: n > 0 ? n : undefined })} /></label>
                        </>}
                        {l.units === 'rentdays' && <p className="muted small">Rental week: every 7 days are billed as {b.rentalWeekDays ?? 3} days ({l.qty} days → {billedQty(l, b)} billed). Change it in budget Settings.</p>}
                        <div className="sub-items">
                          <span className="muted small">Sub-items {l.items?.length ? `— they add up to the rate (${$(l.rate)})` : '— break the rate into parts (camera body, lenses, support…)'}</span>
                          {(base(l).items ?? []).map((it) => (
                            <div key={it.id} className="row">
                              <input disabled={ro} value={it.description} placeholder="Item" onChange={(e) => update((dr) => { const t = dr.budget.lines.find((y) => y.id === l.id) ?? dr.budget.scenarios.flatMap((s2) => s2.added).find((y) => y.id === l.id); const x = t?.items?.find((y) => y.id === it.id); if (x) x.description = e.target.value; }, null)} />
                              <NumIn className="cell-num small" disabled={ro} value={it.qty} title="How many" onChange={(n) => update((dr) => { const t = dr.budget.lines.find((y) => y.id === l.id) ?? dr.budget.scenarios.flatMap((s2) => s2.added).find((y) => y.id === l.id); const x = t?.items?.find((y) => y.id === it.id); if (x) x.qty = n; }, null)} /> ×
                              <NumIn className="cell-num" disabled={ro} value={it.rate} title="Rate each" onChange={(n) => update((dr) => { const t = dr.budget.lines.find((y) => y.id === l.id) ?? dr.budget.scenarios.flatMap((s2) => s2.added).find((y) => y.id === l.id); const x = t?.items?.find((y) => y.id === it.id); if (x) x.rate = n; }, null)} />
                              {!ro && <button className="icon-btn" title="Remove" onClick={() => update((dr) => { const t = dr.budget.lines.find((y) => y.id === l.id) ?? dr.budget.scenarios.flatMap((s2) => s2.added).find((y) => y.id === l.id); if (t?.items) { t.items = t.items.filter((y) => y.id !== it.id); if (!t.items.length) delete t.items; } }, 'Remove sub-item')}>×</button>}
                            </div>
                          ))}
                          {!ro && <button className="link small" onClick={() => update((dr) => { const t = dr.budget.lines.find((y) => y.id === l.id) ?? dr.budget.scenarios.flatMap((s2) => s2.added).find((y) => y.id === l.id); if (t) t.items = [...(t.items ?? (t.rate ? [{ id: newId(), description: t.description || 'Item', qty: 1, rate: t.rate }] : [])), { id: newId(), description: '', qty: 1, rate: 0 }]; }, 'Add sub-item')}>＋ Sub-item</button>}
                        </div>
                        <label className="field wide"><span>Notes</span><textarea disabled={ro} rows={2} value={l.notes ?? ''} placeholder="Quote reference, what's included, assumptions…" onChange={(e) => set(l, { notes: e.target.value || undefined })} /></label>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="budget-empty muted">{ro ? 'No lines in this account.' : <Hint>{'No lines yet — double-click here or use “Add line”.'}</Hint>}</p>
      )}
      {!ro && <div className="lines-pad"><button onClick={addLine}>＋ Add line</button>{mode === 'build' && lines.some((l) => l.link) && <span className="muted small"> ⛓ = quantity follows the breakdown and schedule; type a number to override it.</span>}</div>}
      {mode === 'actual' && (
        <div className="account-expenses">
          <h4>Spent in this account</h4>
          {expenses.length ? (
            <table className="table">
              <tbody>
                {[...expenses].sort((a, c) => a.date.localeCompare(c.date)).map((e) => (
                  <tr key={e.id}><td>{e.date}</td><td>{e.vendor}</td><td>{e.description}</td><td className="num">{money(e.amount, b.currency, true)}</td><td>{e.paid ? 'Paid' : <span className="muted">Unpaid</span>}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted small">Nothing logged yet. Add expenses in Budget → Expenses.</p>}
        </div>
      )}
    </div>
  );
}

const FRINGE_PRESETS: { name: string; pct: number; flat?: number; flatPer?: 'day' | 'week' | 'line' }[] = [
  { name: 'Employer payroll taxes', pct: 10 },
  { name: "Workers' comp", pct: 3 },
  { name: 'Payroll service fee', pct: 1 },
  { name: 'Union pension & health', pct: 20 },
];

const APPLIED_PRESETS: { name: string; pct: number; appliesTo: BudgetGroup[]; credit?: boolean }[] = [
  { name: 'Insurance', pct: 3, appliesTo: ['atl', 'btl', 'post', 'other'] },
  { name: 'Completion bond', pct: 2, appliesTo: ['atl', 'btl', 'post', 'other'] },
  { name: 'Production fee', pct: 5, appliesTo: ['btl', 'post'] },
  { name: 'Tax credit', pct: 25, appliesTo: ['btl', 'post'], credit: true },
];

/** Which top-sheet groups a percentage applies to (undefined = all). */
function GroupPicks({ value, onChange, ro }: { value?: BudgetGroup[]; onChange: (v: BudgetGroup[] | undefined) => void; ro: boolean }) {
  const on = value ?? GROUPS.map((g) => g.id);
  return (
    <span className="group-picks">
      {GROUPS.map((g) => (
        <label key={g.id} className={`fringe-chip ${on.includes(g.id) ? 'on' : ''}`} title={g.label}>
          <input type="checkbox" disabled={ro} checked={on.includes(g.id)} onChange={(e) => {
            const next = e.target.checked ? [...on, g.id] : on.filter((x) => x !== g.id);
            onChange(next.length === GROUPS.length ? undefined : next);
          }} />
          {g.short}
        </label>
      ))}
    </span>
  );
}

function BudgetSettings({ ro, vars }: { ro: boolean; vars: Vars }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const b = p.budget;
  const builtIn = new Set(BUILT_IN_VARS.map((v) => v.name));
  return (
    <div className="budget-settings">
      <div className="field"><span>Named numbers</span>
        <div className="fringes">
          <p className="muted small">Use these in any quantity or × box, e.g. <code>SHOOT_WEEKS * 5</code> or <code>CREW + 2</code>. Change one here and every line using it updates.</p>
          <div className="var-list">
            {BUILT_IN_VARS.map((v) => <span key={v.name} className="var-chip" title={v.hint}><code>{v.name}</code> {round2(vars[v.name] ?? 0)}</span>)}
          </div>
          {(b.globals ?? []).map((g) => (
            <div key={g.id} className="row">
              <input disabled={ro} className="var-name" value={g.name} placeholder="PREP_WEEKS" onChange={(e) => update((dr) => { dr.budget.globals!.find((x) => x.id === g.id)!.name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'); }, null)} />
              =
              <NumIn disabled={ro} className="cell-num" value={g.value} onChange={(n) => update((dr) => { dr.budget.globals!.find((x) => x.id === g.id)!.value = n; }, null)} />
              <input disabled={ro} value={g.note ?? ''} placeholder="What it's for" onChange={(e) => update((dr) => { dr.budget.globals!.find((x) => x.id === g.id)!.note = e.target.value || undefined; }, null)} />
              {builtIn.has(g.name) && <span className="over small">replaces the built-in {g.name}</span>}
              {!ro && <button className="icon-btn" title="Remove" onClick={() => update((dr) => { dr.budget.globals = dr.budget.globals!.filter((x) => x.id !== g.id); }, 'Remove named number')}>×</button>}
            </div>
          ))}
          {!ro && <button onClick={() => update((dr) => { dr.budget.globals = [...(dr.budget.globals ?? []), { id: newId(), name: `NUMBER_${(dr.budget.globals?.length ?? 0) + 1}`, value: 0 }]; }, 'Add named number')}>＋ Named number</button>}
        </div>
      </div>
      <label className="field budget-notes"><span>Notes &amp; assumptions</span>
        <textarea disabled={ro} rows={4} value={b.notes ?? ''} placeholder="Union / non-union, rates as of…, what's excluded — printed after the top sheet" onChange={(e) => update((dr) => { dr.budget.notes = e.target.value || undefined; }, null)} />
      </label>
      <label className="field"><span>Currency</span>
        <select disabled={ro} value={b.currency} onChange={(e) => update((dr) => { dr.budget.currency = e.target.value; }, 'Budget currency')}>
          {[...new Set([b.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <div className="field"><span>Contingency</span>
        <div className="row">
          <NumIn className="cell-num" disabled={ro} value={b.contingencyPct} onChange={(n) => update((dr) => { dr.budget.contingencyPct = Math.max(0, n); }, null)} /> % of
          <GroupPicks ro={ro} value={b.contingencyAppliesTo} onChange={(v) => update((dr) => { dr.budget.contingencyAppliesTo = v; }, 'Contingency applies to')} />
        </div>
        <p className="muted small">Usually charged on below-the-line and post only.</p>
      </div>
      <div className="field"><span>Added percentages &amp; credits</span>
        <div className="fringes">
          {(b.applied ?? []).map((a) => (
            <div key={a.id} className="row applied-row">
              <input disabled={ro} value={a.name} onChange={(e) => update((dr) => { const x = dr.budget.applied!.find((y) => y.id === a.id)!; x.name = e.target.value; }, null)} />
              <NumIn disabled={ro} className="cell-num small" value={a.pct} onChange={(n) => update((dr) => { dr.budget.applied!.find((y) => y.id === a.id)!.pct = n; }, null)} /> %
              <label className="check small" title="Comes off the total (a rebate or tax credit)"><input type="checkbox" disabled={ro} checked={!!a.credit} onChange={(e) => update((dr) => { dr.budget.applied!.find((y) => y.id === a.id)!.credit = e.target.checked; }, 'Edit budget')} /> Credit</label>
              <span className="muted small">of</span>
              <GroupPicks ro={ro} value={a.appliesTo} onChange={(v) => update((dr) => { dr.budget.applied!.find((y) => y.id === a.id)!.appliesTo = v ?? GROUPS.map((g) => g.id); }, 'Edit budget')} />
              {!ro && <button className="icon-btn" title="Remove" onClick={() => update((dr) => { dr.budget.applied = dr.budget.applied!.filter((y) => y.id !== a.id); }, 'Remove percentage')}>×</button>}
            </div>
          ))}
          {!ro && (
            <div className="row">
              {APPLIED_PRESETS.map((pr) => (
                <button key={pr.name} className="small" disabled={(b.applied ?? []).some((a) => a.name === pr.name)} onClick={() => update((dr) => { dr.budget.applied = [...(dr.budget.applied ?? []), { id: newId(), ...pr, appliesTo: [...pr.appliesTo] }]; }, `Add ${pr.name}`)}>＋ {pr.name}</button>
              ))}
            </div>
          )}
          <p className="muted small">Insurance, completion bond and fees are added on top; a tax credit or rebate comes off. Check your incentive's real rate and what spend qualifies.</p>
        </div>
      </div>
      <div className="field"><span>Rental week</span>
        <div className="row"><NumIn className="cell-num small" disabled={ro} value={b.rentalWeekDays ?? 3} onChange={(n) => update((dr) => { dr.budget.rentalWeekDays = Math.min(7, Math.max(1, n)); }, null)} /> billed days per 7 (for lines in Rental days)</div>
      </div>
      <div className="field"><span>Overtime</span>
        <div className="row">
          <NumIn className="cell-num small" disabled={ro} value={b.dayHours ?? 10} onChange={(n) => update((dr) => { dr.budget.dayHours = Math.max(1, n); }, null)} /> h day ·
          OT <NumIn className="cell-num small" disabled={ro} value={b.otMult ?? 1.5} onChange={(n) => update((dr) => { dr.budget.otMult = n; }, null)} />× ·
          6th <NumIn className="cell-num small" disabled={ro} value={b.sixthMult ?? 1.5} onChange={(n) => update((dr) => { dr.budget.sixthMult = n; }, null)} />× ·
          7th <NumIn className="cell-num small" disabled={ro} value={b.seventhMult ?? 2} onChange={(n) => update((dr) => { dr.budget.seventhMult = n; }, null)} />×
        </div>
      </div>
      <div className="field"><span>Fringes</span>
        <div className="fringes">
          {b.fringes.map((f) => (
            <div key={f.id} className="row">
              <input disabled={ro} value={f.name} onChange={(e) => update((dr) => { dr.budget.fringes.find((x) => x.id === f.id)!.name = e.target.value; }, null)} />
              <NumIn disabled={ro} className="cell-num" value={f.pct} onChange={(n) => update((dr) => { dr.budget.fringes.find((x) => x.id === f.id)!.pct = n; }, null)} /> %
              <span className="muted small">up to</span>
              <NumIn disabled={ro} className="cell-num" value={f.cap ?? 0} title="Most of the wages it applies to (0 = no cap)" onChange={(n) => update((dr) => { const x = dr.budget.fringes.find((y) => y.id === f.id)!; if (n > 0) x.cap = n; else delete x.cap; }, null)} />
              {!!f.cap && <label className="check small" title="The cap counts all lines for the same cast or crew member, across the whole show"><input type="checkbox" disabled={ro} checked={!!f.capPerPerson} onChange={(e) => update((dr) => { dr.budget.fringes.find((y) => y.id === f.id)!.capPerPerson = e.target.checked || undefined; }, 'Edit fringe')} /> per person</label>}
              <span className="muted small">+</span>
              <NumIn disabled={ro} className="cell-num small" value={f.flat ?? 0} title="A flat amount on top (e.g. a union contribution per day)" onChange={(n) => update((dr) => { const x = dr.budget.fringes.find((y) => y.id === f.id)!; if (n > 0) x.flat = n; else delete x.flat; }, null)} />
              <select disabled={ro} value={f.flatPer ?? 'day'} onChange={(e) => update((dr) => { dr.budget.fringes.find((y) => y.id === f.id)!.flatPer = e.target.value as 'day' | 'week' | 'line'; }, 'Edit fringe')}>
                <option value="day">per day</option><option value="week">per week</option><option value="line">per line</option>
              </select>
              {!ro && <button className="icon-btn" title="Delete fringe" onClick={() => update((dr) => { dr.budget.fringes = dr.budget.fringes.filter((x) => x.id !== f.id); dr.budget.lines.forEach((l) => { l.fringeIds = l.fringeIds.filter((x) => x !== f.id); }); }, 'Delete fringe')}>×</button>}
            </div>
          ))}
          {!ro && (
            <div className="row">
              <button onClick={() => update((dr) => { dr.budget.fringes.push({ id: newId(), name: 'New fringe', pct: 0 }); }, 'Add fringe')}>＋ Fringe</button>
              {FRINGE_PRESETS.map((fp) => (
                <button key={fp.name} className="small" disabled={b.fringes.some((x) => x.name === fp.name)} onClick={() => update((dr) => { dr.budget.fringes.push({ id: newId(), ...fp }); }, `Add ${fp.name}`)}>＋ {fp.name}</button>
              ))}
            </div>
          )}
          <p className="muted small">Fringes are added to the lines you tick them on: a percentage of wages (payroll taxes, pension &amp; health, workers’ comp), optionally capped, plus an optional flat amount per day or week. The presets are <b>examples</b> — use the rates from your payroll company or union agreement.</p>
        </div>
      </div>
    </div>
  );
}

function ScenariosView({ scenarioId, setScenarioId, ro }: { scenarioId?: string; setScenarioId: (id?: string) => void; ro: boolean }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const d = useDerived();
  const b = p.budget;
  const $ = (n: number) => money(n, b.currency);
  const { facts, base, cols } = useMemo(() => {
    const f = breakdownFacts(p, d);
    const baseView = budgetView(p, d, undefined, f);
    const c = [{ id: undefined as string | undefined, name: 'Base budget', t: totals(b, baseView.lines), shootDays: f.shootDays },
      ...b.scenarios.map((s) => ({ id: s.id as string | undefined, name: s.name, t: totals(b, budgetView(p, d, s.id, f).lines), shootDays: s.shootDays ?? f.shootDays }))];
    return { facts: f, base: baseView.base, cols: c };
  }, [p, d, b]);
  void base;

  const duplicate = (fromId?: string) => createVersion(fromId, setScenarioId);

  return (
    <div className="scenarios">
      <p className="muted small">Each version starts from the base budget. Pick one in “Version” above, then change quantities, rates or shoot days — the base stays as it is.</p>
      <div className="scenario-scroll">
        <table className="table scenario-table">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.id ?? 'base'} className={`num ${c.id === scenarioId ? 'sel' : ''}`}>
                  <button className="link" onClick={() => setScenarioId(c.id)}>{c.name}</button>
                  {c.id && !ro && (
                    <span className="scenario-actions">
                      <button className="icon-btn" title="Rename" onClick={async () => { const n = await askText('Rename version', { initial: c.name, confirmLabel: 'Rename' }); if (n) update((dr) => { dr.budget.scenarios.find((s) => s.id === c.id)!.name = n; }, 'Rename version'); }}>✎</button>
                      <button className="icon-btn" title="Duplicate" onClick={() => duplicate(c.id)}>⧉</button>
                      <button className="icon-btn" title="Delete" onClick={async () => { if (await askConfirm(`Delete the version "${c.name}"?`, { confirmLabel: 'Delete', danger: true })) { update((dr) => { dr.budget.scenarios = dr.budget.scenarios.filter((s) => s.id !== c.id); }, 'Delete version'); if (scenarioId === c.id) setScenarioId(undefined); } }}>×</button>
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Shoot days</td>
              {cols.map((c) => (
                <td key={c.id ?? 'base'} className="num">
                  {c.id && !ro
                    ? <NumIn className="cell-num" value={c.shootDays} title="Per-day lines (crew, catering…) follow this" onChange={(n) => update((dr) => { const s = dr.budget.scenarios.find((x) => x.id === c.id)!; if (n > 0 && n !== facts.shootDays) s.shootDays = n; else delete s.shootDays; }, null)} />
                    : c.shootDays}
                </td>
              ))}
            </tr>
            {GROUPS.map((g) => (
              <tr key={g.id}><td>{g.label}</td>{cols.map((c) => <td key={c.id ?? 'base'} className="num">{$(c.t.byGroup[g.id])}</td>)}</tr>
            ))}
            <tr><td>Contingency ({b.contingencyPct}%)</td>{cols.map((c) => <td key={c.id ?? 'base'} className="num">{$(c.t.contingency)}</td>)}</tr>
            {(b.applied ?? []).map((a) => (
              <tr key={a.id} className={a.credit ? 'credit' : ''}><td>{a.name} ({a.credit ? '−' : ''}{a.pct}%)</td>{cols.map((c) => <td key={c.id ?? 'base'} className="num">{$(c.t.applied.find((x) => x.id === a.id)?.amount ?? 0)}</td>)}</tr>
            ))}
            <tr className="grand"><td>Total</td>{cols.map((c) => <td key={c.id ?? 'base'} className="num">{$(c.t.total)}</td>)}</tr>
            <tr>
              <td>vs. base</td>
              {cols.map((c) => {
                const diff = c.t.total - cols[0].t.total;
                return <td key={c.id ?? 'base'} className={`num ${diff > 0 ? 'over' : diff < 0 ? 'under' : ''}`}>{c.id ? `${diff > 0 ? '+' : ''}${$(diff)}` : '—'}</td>;
              })}
            </tr>
            {b.targetTotal ? (
              <tr><td>vs. target {$(b.targetTotal)}</td>{cols.map((c) => { const diff = c.t.total - b.targetTotal!; return <td key={c.id ?? 'base'} className={`num ${diff > 0 ? 'over' : 'under'}`}>{diff > 0 ? `${$(diff)} over` : `${$(-diff)} under`}</td>; })}</tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!ro && <div className="row"><button className="primary" onClick={() => duplicate(scenarioId)}>＋ New version{scenarioId ? ' from the selected one' : ''}</button></div>}
    </div>
  );
}

function CostReportView({ view, ro }: { view: ReturnType<typeof useBudgetView>; ro: boolean }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const b = p.budget;
  const $ = (n: number) => money(n, b.currency);
  const r = costReport(b, view.t);
  const lock = async () => {
    const label = await askText(b.locked ? 'Lock the budget again' : 'Lock the approved budget', {
      initial: `Approved ${new Date().toLocaleDateString()}`, confirmLabel: 'Lock',
      message: 'The cost report compares spending with the budget as it is now. You can keep editing the budget; lock again to update the comparison.',
    });
    if (label === null) return;
    update((dr) => { dr.budget.locked = lockBudget(view.t, label || undefined); }, 'Lock budget');
  };
  if (!r) {
    return (
      <div className="scenarios">
        <h3>Cost report</h3>
        <p className="muted">Once the budget is approved, lock it. The cost report then tracks each account against the locked budget: what's been spent, what's committed (expenses logged but not paid yet), the estimate to complete, and whether it will finish over or under.</p>
        {!ro && <button className="primary" onClick={lock}>Lock the current budget ({$(view.t.total)})</button>}
      </div>
    );
  }
  const name = (id: string) => { const a = b.accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : id; };
  const cell = (n: number, cls = '') => <td className={`num ${cls}`}>{n ? $(n) : '—'}</td>;
  const varCell = (n: number) => <td className={`num ${n < -0.5 ? 'over' : n > 0.5 ? 'under' : ''}`}>{Math.abs(n) < 0.5 ? '—' : n < 0 ? `${$(-n)} over` : `${$(n)} under`}</td>;
  const projected = r.lock.subtotal - r.totals.efc;
  return (
    <div className="scenarios cost-report">
      <div className="row">
        <h3 style={{ margin: 0 }}>Cost report</h3>
        <span className="muted small">vs. {r.lock.label || 'locked budget'} · {new Date(r.lock.at).toLocaleDateString()} · {$(r.lock.total)}</span>
        <span className="spacer" />
        {!ro && <button onClick={lock}>Lock again</button>}
        {!ro && <button onClick={async () => { if (await askConfirm('Unlock the budget?', { message: 'The cost report goes away until you lock again. Expenses and the budget are kept.', confirmLabel: 'Unlock' })) update((dr) => { delete dr.budget.locked; }, 'Unlock budget'); }}>Unlock</button>}
      </div>
      <div className="scenario-scroll">
        <table className="table cost-table">
          <thead><tr><th>Account</th><th className="num">Budget</th><th className="num">Spent</th><th className="num">Committed</th><th className="num">To date</th><th className="num" title="Estimate to complete — type one to override">To complete</th><th className="num" title="Estimated final cost">Final (est.)</th><th className="num">Over / under</th></tr></thead>
          <tbody>
            {GROUPS.map((g) => {
              const rows = r.rows.filter((x) => b.accounts.find((a) => a.id === x.accountId)?.group === g.id);
              if (!rows.length) return null;
              const gt = r.groups[g.id];
              return (
                <Fragment key={g.id}>
                  <tr className="group"><td>{g.label}</td>{cell(gt.budget)}{cell(gt.spent)}{cell(gt.committed)}{cell(gt.toDate)}{cell(gt.etc)}{cell(gt.efc)}{varCell(gt.variance)}</tr>
                  {rows.map((x) => (
                    <tr key={x.accountId}>
                      <td>{name(x.accountId)}</td>{cell(x.budget)}{cell(x.spent)}{cell(x.committed)}{cell(x.toDate)}
                      <td className="num">
                        <input className={`cell-num ${x.etcTyped ? 'typed' : ''}`} disabled={ro} inputMode="decimal" value={x.etcTyped ? String(x.etc) : ''} placeholder={String(Math.round(x.etc))}
                          title={x.etcTyped ? 'Typed estimate — clear it to go back to the automatic one' : 'Automatic: the current estimate minus what is spent and committed'}
                          onChange={(e) => update((dr) => { const v = e.target.value.trim(); dr.budget.etc = { ...dr.budget.etc }; if (v === '') delete dr.budget.etc[x.accountId]; else if (Number.isFinite(Number(v))) dr.budget.etc[x.accountId] = Number(v); }, null)} />
                      </td>
                      {cell(x.efc)}{varCell(x.variance)}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            <tr className="grand"><td>Accounts</td>{cell(r.totals.budget)}{cell(r.totals.spent)}{cell(r.totals.committed)}{cell(r.totals.toDate)}{cell(r.totals.etc)}{cell(r.totals.efc)}{varCell(r.totals.variance)}</tr>
          </tbody>
        </table>
      </div>
      <div className="cost-summary">
        <span>Contingency &amp; added % in the locked budget: <b>{$(r.reserve)}</b></span>
        <span className={projected < 0 ? 'over' : 'under'}>Accounts are projected to finish <b>{$(Math.abs(projected))} {projected < 0 ? 'over' : 'under'}</b>{projected < 0 && r.reserve > 0 ? ` — ${-projected <= r.reserve ? 'covered by' : 'more than'} the contingency` : ''}.</span>
      </div>
      <p className="muted small">Committed = expenses logged but not marked paid (purchase orders, deposits due). Untick “Paid” on an expense in the Expenses tab to count it as committed.</p>
    </div>
  );
}
