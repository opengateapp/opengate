import { useMemo, useState } from 'react';
import type { Draft } from 'immer';
import { useDerived, useProject, useStore } from '../../store/project';
import type { Budget, BudgetAccount, BudgetGroup, BudgetLine, BudgetUnits, Project } from '../../model/types';
import { newId } from '../../model/ids';
import { GROUPS, TYPICAL_SPLIT, accountLabel } from '../../budget/accounts';
import { money, scenarioLines, totals, lineTotal, round2 } from '../../budget/calc';
import { breakdownFacts, importFromBreakdown, resolveLines, LINK_LABEL } from '../../budget/fromBreakdown';
import { canWrite, useSync } from '../../sync/state';
import { askConfirm, askText } from '../../components/dialogs';
import { toast } from '../../components/common';
import { getDerived } from '../../store/project';
import { More } from '../../components/More';
import { LongPress } from '../../components/ActionSheet';
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

export type BudgetMode = 'build' | 'target' | 'actual' | 'scenarios';
const MODES: { id: BudgetMode; label: string; hint: string }[] = [
  { id: 'build', label: 'Build from breakdown', hint: 'Add lines and rates; import cast, crew, locations and tagged elements' },
  { id: 'target', label: 'Top-down target', hint: 'Set a total and split it across accounts' },
  { id: 'actual', label: 'Actual spending', hint: 'Estimate vs. what has been spent' },
  { id: 'scenarios', label: 'Scenarios', hint: 'Compare versions side by side' },
];
const UNITS: { id: BudgetUnits; label: string }[] = [
  { id: 'days', label: 'Days' }, { id: 'weeks', label: 'Weeks' }, { id: 'hours', label: 'Hours' },
  { id: 'each', label: 'Each' }, { id: 'flat', label: 'Flat' }, { id: 'allow', label: 'Allow' },
];
const CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'INR', 'MXN', 'BRL', 'ZAR'];

const num = (v: string) => (v.trim() === '' ? 0 : Number(v));

function NumIn({ value, onChange, disabled, className, title }: { value: number; onChange: (n: number) => void; disabled?: boolean; className?: string; title?: string }) {
  return <input type="number" step="any" className={className} title={title} disabled={disabled} value={Number.isFinite(value) ? round2(value) : ''} onChange={(e) => { const n = num(e.target.value); if (Number.isFinite(n)) onChange(n); }} />;
}

/** Everything the screen needs, worked out once per render. */
function useBudgetView(p: Project, scenarioId?: string) {
  const d = useDerived();
  return useMemo(() => {
    const facts = breakdownFacts(p, d);
    const { lines: base, orphaned } = resolveLines(p, facts);
    const lines = scenarioLines(p.budget, base, scenarioId);
    return { facts, base, lines, orphaned, t: totals(p.budget, lines) };
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
  const cur = b.currency;
  const $ = (n: number) => money(n, cur);
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
        <label className="budget-mode">
          <span className="muted small">View</span>
          <select value={mode} onChange={(e) => pickMode(e.target.value as BudgetMode)} title={MODES.find((m) => m.id === mode)?.hint}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <More label="Budget actions">
        <label className="budget-mode">
          <span className="muted small">Version</span>
          <select value={scenarioId ?? ''} onChange={(e) => setScenarioId(e.target.value || undefined)}>
            <option value="">Base budget</option>
            {b.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
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

      {settings && <BudgetSettings ro={ro} />}
      {scenario && mode !== 'scenarios' && <p className="budget-note">Showing <b>{scenario.name}</b>. Changes to quantities and rates are saved to this version only; the base budget stays as it is.</p>}

      {mode === 'scenarios' ? (
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
                            {mode === 'build' && <td className="num">{est ? $(est) : '—'}</td>}
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
                <tr><td>Contingency ({b.contingencyPct}%)</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(view.t.contingency)}</td></tr>
                <tr className="grand"><td>Total</td><td className="num" colSpan={mode === 'build' ? 1 : 3}>{$(view.t.total)}{mode === 'actual' ? ` · spent ${$(view.t.actual)}` : ''}</td></tr>
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
    // Typing a quantity on a linked line unlinks it (the typed number is kept).
    if ('qty' in patch && target.link?.auto) target.link.auto = false;
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

  const total = lines.reduce((s, l) => s + lineTotal(b, l), 0);
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
              return (
                <LongPress as="tr" key={l.id} title={l.description || 'Budget line'} actions={() => ro ? [] : [
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
                  </td>
                  <td className="num"><NumIn className="cell-num" disabled={ro} value={l.qty} onChange={(n) => set(l, { qty: n })} title={linked?.auto ? LINK_LABEL[linked.kind] : undefined} /></td>
                  <td>
                    <select disabled={ro} value={l.units} onChange={(e) => set(l, { units: e.target.value as BudgetUnits }, 'Edit budget')}>
                      {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </td>
                  <td className="num"><NumIn className="cell-num small" disabled={ro} value={l.x} onChange={(n) => set(l, { x: n })} /></td>
                  <td className="num"><NumIn className="cell-num" disabled={ro} value={l.rate} onChange={(n) => set(l, { rate: n })} /></td>
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
                  <td className="num"><b>{$(lineTotal(b, l))}</b></td>
                  <td className="actions">{!ro && <button className="icon-btn" title={sc && !isAdded(l.id) ? `Remove from ${sc.name}` : 'Delete line'} onClick={() => removeLine(l)}>×</button>}</td>
                </LongPress>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="budget-empty muted">{ro ? 'No lines in this account.' : 'No lines yet — double-click here or use “Add line”.'}</p>
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

function BudgetSettings({ ro }: { ro: boolean }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const b = p.budget;
  return (
    <div className="budget-settings">
      <label className="field"><span>Currency</span>
        <select disabled={ro} value={b.currency} onChange={(e) => update((dr) => { dr.budget.currency = e.target.value; }, 'Budget currency')}>
          {[...new Set([b.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <label className="field"><span>Contingency %</span>
        <NumIn disabled={ro} value={b.contingencyPct} onChange={(n) => update((dr) => { dr.budget.contingencyPct = Math.max(0, n); }, null)} />
      </label>
      <div className="field"><span>Fringes</span>
        <div className="fringes">
          {b.fringes.map((f) => (
            <div key={f.id} className="row">
              <input disabled={ro} value={f.name} onChange={(e) => update((dr) => { dr.budget.fringes.find((x) => x.id === f.id)!.name = e.target.value; }, null)} />
              <NumIn disabled={ro} className="cell-num" value={f.pct} onChange={(n) => update((dr) => { dr.budget.fringes.find((x) => x.id === f.id)!.pct = n; }, null)} /> %
              <span className="muted small">up to</span>
              <NumIn disabled={ro} className="cell-num" value={f.cap ?? 0} title="Most of each line it applies to (0 = no cap)" onChange={(n) => update((dr) => { const x = dr.budget.fringes.find((y) => y.id === f.id)!; if (n > 0) x.cap = n; else delete x.cap; }, null)} />
              {!ro && <button className="icon-btn" title="Delete fringe" onClick={() => update((dr) => { dr.budget.fringes = dr.budget.fringes.filter((x) => x.id !== f.id); dr.budget.lines.forEach((l) => { l.fringeIds = l.fringeIds.filter((x) => x !== f.id); }); }, 'Delete fringe')}>×</button>}
            </div>
          ))}
          {!ro && <button onClick={() => update((dr) => { dr.budget.fringes.push({ id: newId(), name: 'New fringe', pct: 0 }); }, 'Add fringe')}>＋ Fringe</button>}
          <p className="muted small">Fringes are percentages added to the lines you tick them on (payroll taxes, union pension &amp; health, workers’ comp). “Up to” caps the amount of each line they apply to.</p>
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
    const baseLines = resolveLines(p, f).lines;
    const c = [{ id: undefined as string | undefined, name: 'Base budget', t: totals(b, baseLines), shootDays: f.shootDays },
      ...b.scenarios.map((s) => ({ id: s.id as string | undefined, name: s.name, t: totals(b, scenarioLines(b, baseLines, s.id)), shootDays: s.shootDays ?? f.shootDays }))];
    return { facts: f, base: baseLines, cols: c };
  }, [p, d, b]);
  void base;

  const duplicate = async (fromId?: string) => {
    const from = b.scenarios.find((s) => s.id === fromId);
    const name = await askText('Name this version', { initial: from ? `${from.name} copy` : '', placeholder: 'e.g. Lean, Target, Ideal, 12 days', confirmLabel: 'Create' });
    if (!name) return;
    const id = newId();
    update((dr) => {
      dr.budget.scenarios.push(from
        ? { ...JSON.parse(JSON.stringify(from)), id, name, added: from.added.map((l) => ({ ...l, id: newId() })) }
        : { id, name, overrides: {}, added: [] });
    }, 'Add budget version');
    setScenarioId(id);
  };

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
