import { useMemo, useState, type ReactNode } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { canWrite, useSync } from '../sync/state';
import { money, totals } from '../budget/calc';
import { budgetView } from '../budget/pipeline';
import { BUDGET_TERMS, EXAMPLE_PH_PCT, GUIDE_CHECKED, WORKED_EXAMPLE, addCutVersion, agreementCheck, cutSuggestions, workedExampleLines, workedExampleTotal } from '../budget/guide';
import { session } from '../script/session';
import { Modal, toast } from './common';
import { openReference } from '../tabs/ReferenceTab';

// Help for people new to budgets: "?" bubbles, the cap bar shown on every Budget screen, ranked cuts
// and the worked example.

/** A "?" that explains a column. The "?" is drawn by CSS, so phone card labels (copied from header text) stay clean. */
export function Explain({ tip }: { tip: string }) {
  return <span className="explain" tabIndex={0} role="note" aria-label={tip} data-tip={tip} />;
}

/** A "?" for a budget word (after the word, when given): hover or focus explains it, clicking opens its Reference page. */
export function Term({ k, children }: { k: keyof typeof BUDGET_TERMS; children?: ReactNode }) {
  const t = BUDGET_TERMS[k];
  const tip = `${t.tip} Click for more.`;
  const q = <button type="button" className="explain" aria-label={tip} data-tip={tip} onClick={(e) => { e.stopPropagation(); openReference(t.ref); }} />;
  return children ? <span className="term">{children}{q}</span> : q;
}

const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));

/** Show a budget version on the Budget screen. */
export function showVersion(id: string) {
  goto('budget');
  setTimeout(() => window.dispatchEvent(new CustomEvent('opengate:budget-version', { detail: id })), 0);
}

/** The base budget's total, worked out once per render. */
function useBaseTotal() {
  const p = useProject();
  const d = useDerived();
  return useMemo(() => totals(p.budget, budgetView(p, d).lines).total, [p, d]);
}

/** "$212 over your $11,000 cap": on every Budget screen once there's a cap, with the agreement limit and ways to cut. */
export function BudgetCapBar() {
  const p = useProject();
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  const total = useBaseTotal();
  const [open, setOpen] = useState(false);
  const cap = p.budget.targetTotal;
  const ag = agreementCheck(p, total);
  if (!visible || (!cap && !ag?.over)) return null;
  const $ = (n: number) => money(n, p.budget.currency);
  const over = cap ? total - cap : 0;
  const pct = cap ? Math.min(100, (total / cap) * 100) : 100;
  return (
    <div className={`cap-bar ${over > 0 ? 'over' : ''}`}>
      <div className="cap-row">
        {cap ? (
          <>
            <span className="cap-meter" aria-hidden><span style={{ width: `${pct}%` }} /></span>
            <b>{over > 0 ? `${$(over)} over your ${$(cap)} cap` : `${$(-over)} left of your ${$(cap)} cap`}</b>
            <span className="muted small">{$(total)} in the base budget</span>
          </>
        ) : <b>{$(total)} budgeted</b>}
        <span className="spacer" />
        {over > 0 && <button className="small" onClick={() => setOpen((x) => !x)} aria-expanded={open}>{open ? 'Hide ways to cut' : 'Ways to cut'}</button>}
      </div>
      {ag?.over && (
        <span className="small cap-agreement">
          Your budget passed {$(ag.limit)}: {ag.union} {ag.tier} no longer applies{ag.next ? <>; <b>{ag.next.name}</b> does{ag.next.limit ? ` (up to ${$(ag.next.limit)})` : ''}</> : ''}.{' '}
          <button className="link small" onClick={() => openReference('guild-sag-aftra')}>About the agreements</button>
        </span>
      )}
      {open && over > 0 && <CutList over={over} />}
    </div>
  );
}

/** Ways to come in under the cap, biggest saving first. */
export function CutList({ over }: { over: number }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const ro = !canWrite('budget');
  const cuts = useMemo(() => cutSuggestions(p, d), [p, d]);
  const $ = (n: number) => money(n, p.budget.currency);
  if (!cuts.length) return <p className="small muted">No obvious cuts found. Look at the biggest accounts on the top sheet first.</p>;
  let left = over;
  return (
    <ol className="cut-list">
      {cuts.map((c) => {
        const enough = left > 0 && c.saves >= left;
        left -= c.saves;
        return (
          <li key={c.id}>
            <div className="row wrap"><b>{c.label}</b><span className="under small">saves about {$(c.saves)}</span>{enough && <span className="chip small">enough on its own</span>}</div>
            <span className="muted small">{c.effect}</span>
            {!ro && <button className="small" onClick={() => {
              let id = '';
              update((dr) => { id = addCutVersion(dr, c); }, 'Try a cut as a version');
              showVersion(id);
              toast(`Made the version “Try: ${c.label}”. The base budget is unchanged.`);
            }}>Try it as a version</button>}
          </li>
        );
      })}
    </ol>
  );
}

/** Opens a fresh copy of the sample production (this project is saved as it is). */
export async function openSampleProduction() {
  const { buildSampleProduction } = await import('../model/sampleProduction');
  const { addSampleMedia } = await import('../model/sampleMedia');
  const sp = await addSampleMedia(buildSampleProduction());
  session.reset();
  useStore.getState().open(sp);
  useStore.setState({ saveState: 'dirty' });
}

/** A $10,000, 3-day short, line by line, with buttons to use it. */
export function WorkedExample({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const ro = !canWrite('budget');
  const $ = (n: number) => money(n, 'USD');
  const acc = (code: string) => p.budget.accounts.find((a) => a.code === code);
  const empty = !p.budget.lines.length;
  const add = () => {
    let version = '';
    update((dr) => {
      const b = dr.budget;
      let ph = b.fringes.find((f) => /pension|p&h/i.test(f.name));
      if (!ph) { ph = { id: `fr-ph-${Date.now()}`, name: 'SAG-AFTRA pension & health', pct: EXAMPLE_PH_PCT }; b.fringes.push(ph); }
      const lines = workedExampleLines(b.accounts, ph.id);
      if (empty) { b.lines.push(...lines); b.contingencyPct = 10; }
      else { version = `ex-${Date.now()}`; b.scenarios.push({ id: version, name: 'Worked example', overrides: Object.fromEntries(b.lines.map((l) => [l.id, { removed: true }])), added: lines }); }
    }, 'Add the worked example');
    onClose();
    if (version) { showVersion(version); toast('Added the example as the version “Worked example”. Your budget is unchanged.'); }
    else toast('Added the example’s 15 lines. Each note says why it costs what it does.');
  };
  return (
    <Modal title="A $10,000 short, line by line" onClose={onClose} wide footer={<>
      <button onClick={() => void openSampleProduction().then(onClose).catch((e) => toast((e as Error).message))}>Open the sample production</button>
      <span className="spacer" />
      {!ro && <button className="primary" onClick={add}>{empty ? 'Add these lines to my budget' : 'Add as a new version'}</button>}
    </>}>
      <p className="small">A 3-day short with one SAG-AFTRA actor on the Ultra Low agreement, two non-union actors and a crew of five. Sample numbers: your city and your people will differ. SAG-AFTRA figures checked on {GUIDE_CHECKED}.</p>
      <div className="table-scroll">
        <table className="table cards-on-phone example-sheet">
          <thead><tr><th>Line</th><th className="num">How long</th><th className="num">How many</th><th className="num">Cost of one</th><th className="num">Total</th><th>Why</th></tr></thead>
          <tbody>
            {WORKED_EXAMPLE.map((l) => {
              const billed = l.u === 'rentdays' ? Math.floor(l.qty / 7) * 3 + Math.min(l.qty % 7, 3) : l.qty;
              return (
                <tr key={l.d}>
                  <td data-label="Line"><b>{l.d}</b><div className="muted small">{l.acc} {acc(l.acc)?.name}</div></td>
                  <td data-label="How long" className="num">{l.qty} {l.u === 'days' || l.u === 'rentdays' ? 'days' : l.u === 'each' ? 'days' : ''}</td>
                  <td data-label="How many" className="num">{l.x ?? 1}</td>
                  <td data-label="Cost of one" className="num">{$(l.rate)}</td>
                  <td data-label="Total" className="num">{$(billed * (l.x ?? 1) * l.rate)}</td>
                  <td data-label="Why" className="small">{l.why}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small">Plus pension & health ({EXAMPLE_PH_PCT}%) on the SAG-AFTRA actor’s pay, and a 10% contingency on top: <b>{$(workedExampleTotal())}</b> in all.</p>
    </Modal>
  );
}
