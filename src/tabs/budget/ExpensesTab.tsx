import { useMemo, useRef, useState } from 'react';
import { MoneyInput } from '../../components/NumberInput';
import { useProject, useStore } from '../../store/project';
import type { BudgetExpense } from '../../model/types';
import { newId } from '../../model/ids';
import { todayISO } from '../../model/dates';
import { GROUPS, accountLabel } from '../../budget/accounts';
import { money } from '../../budget/calc';
import { parseCsv, guessMapping, rowsToExpenses, type CsvMapping } from '../../budget/expenses';
import { putMedia, getMedia, deleteMedia } from '../../store/media';
import { canWrite, useSync } from '../../sync/state';
import { csv } from '../../io/reports';
import { download, safeName } from '../../io/files';
import { askConfirm } from '../../components/dialogs';
import { toast } from '../../components/common';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';
import { BudgetHidden } from './BudgetTab';
import { RefLink } from '../ReferenceTab';

// Expenses: what has actually been spent, logged against budget accounts (and optionally a
// line). Drop receipt photos or PDFs to log them, or import a bank / card CSV export.
// Budget → "Actual spending" compares these with the estimate.

const RECEIPT_TYPES = /^(image\/|application\/pdf$)/;

export function ExpensesTab() {
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  return visible ? <ExpensesScreen /> : <BudgetHidden />;
}

function ExpensesScreen() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canWrite('budget');
  const b = p.budget;
  const $ = (n: number) => money(n, b.currency, true);
  const [filter, setFilter] = useState<string>('');
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [lastAccount, setLastAccount] = useState<string>(() => b.accounts.find((a) => a.code === '5200')?.id ?? b.accounts[0]?.id);
  const [importing, setImporting] = useState<{ rows: string[][]; map: CsvMapping; accountId: string; name: string } | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => [...b.expenses]
    .filter((e) => (!filter || e.accountId === filter) && (!unpaidOnly || !e.paid))
    .sort((a, c) => c.date.localeCompare(a.date)), [b.expenses, filter, unpaidOnly]);
  const spent = rows.reduce((s, e) => s + e.amount, 0);
  const unpaid = rows.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0);

  const set = (id: string, patch: Partial<BudgetExpense>, label: string | null = null) =>
    update((dr) => { Object.assign(dr.budget.expenses.find((e) => e.id === id)!, patch); }, label);
  const add = (extra: Partial<BudgetExpense> = {}) => {
    const e: BudgetExpense = { id: newId(), date: todayISO(), vendor: '', description: '', amount: 0, accountId: filter || lastAccount, paid: true, ...extra };
    update((dr) => { dr.budget.expenses.push(e); }, 'Add expense');
    return e.id;
  };
  const addReceipts = async (files: File[]) => {
    const ok = files.filter((f) => RECEIPT_TYPES.test(f.type));
    if (!ok.length) { toast('Drop receipt photos or PDFs'); return; }
    for (const f of ok) {
      const receiptId = await putMedia(p.id, f);
      add({ receiptId, description: f.name.replace(/\.[a-z0-9]+$/i, '') });
    }
    toast(`Added ${ok.length} receipt${ok.length === 1 ? '' : 's'} — fill in the amounts`);
  };
  const attach = async (id: string, f?: File) => {
    if (!f || !RECEIPT_TYPES.test(f.type)) return;
    const receiptId = await putMedia(p.id, f);
    set(id, { receiptId }, 'Attach receipt');
  };
  const openReceipt = async (id: string) => {
    const blob = await getMedia(id);
    if (!blob) { toast('This receipt hasn’t arrived on this device yet'); return; }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const remove = async (e: BudgetExpense) => {
    if (!(await askConfirm(`Delete this expense${e.vendor ? ` (${e.vendor})` : ''}?`, { confirmLabel: 'Delete', danger: true }))) return;
    update((dr) => { dr.budget.expenses = dr.budget.expenses.filter((x) => x.id !== e.id); }, 'Delete expense');
    if (e.receiptId) void deleteMedia([e.receiptId]);
  };
  const startImport = async (f?: File) => {
    if (!f) return;
    const parsed = parseCsv(await f.text());
    if (parsed.length < 2) { toast('That file has no rows to import'); return; }
    setImporting({ rows: parsed, map: guessMapping(parsed[0]), accountId: filter || lastAccount, name: f.name });
  };
  const exportCsv = () => {
    const acc = new Map(b.accounts.map((a) => [a.id, accountLabel(a)]));
    const line = new Map(b.lines.map((l) => [l.id, l.description]));
    download(`${safeName(p.title)} - expenses.csv`, csv([
      ['Date', 'Vendor', 'Description', 'Account', 'Line', 'Amount', 'Paid', 'Method'],
      ...[...b.expenses].sort((a, c) => a.date.localeCompare(c.date)).map((e) => [e.date, e.vendor, e.description, acc.get(e.accountId), e.lineId ? line.get(e.lineId) : '', e.amount.toFixed(2), e.paid ? 'yes' : 'no', e.method]),
    ]), 'text/csv');
  };

  const accountOptions = GROUPS.map((g) => (
    <optgroup key={g.id} label={g.label}>
      {b.accounts.filter((a) => a.group === g.id).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
    </optgroup>
  ));

  return (
    <div className={`expenses ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={(e) => {
        setOver(false);
        if (ro || !e.dataTransfer.files.length) return;
        e.preventDefault();
        const files = [...e.dataTransfer.files];
        const csvFile = files.find((f) => /\.csv$/i.test(f.name) || f.type === 'text/csv');
        if (csvFile) void startImport(csvFile); else void addReceipts(files);
      }}>
      <div className="budget-bar">
        {!ro && <button className="primary" onClick={() => add()}>＋ Expense</button>}
        <RefLink page="budget-tracking" label="Tracking spend" />
        <More label="Filter, receipts, import and export">
          <label className="budget-mode"><span className="muted small">Account</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All accounts</option>
              {accountOptions}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} /> Unpaid only</label>
          {!ro && <>
            <button onClick={() => fileRef.current?.click()}>Add receipts…</button>
            <button onClick={() => csvRef.current?.click()} title="From your bank or card: Date, Description/Payee, Amount (or Debit/Credit) columns">Import CSV…</button>
          </>}
          <button disabled={!b.expenses.length} onClick={exportCsv}>Export CSV</button>
        </More>
        <span className="spacer" />
        <div className="budget-total"><span className="muted small">Spent{filter ? ' in this account' : ''}</span><b>{$(spent)}</b>{unpaid > 0 && <span className="small over">{$(unpaid)} unpaid</span>}</div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void addReceipts([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { void startImport(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {importing && (
        <ImportPanel imp={importing} setImp={setImporting} accountOptions={accountOptions}
          onImport={(list) => {
            update((dr) => { dr.budget.expenses.push(...list); }, 'Import expenses');
            setLastAccount(importing.accountId);
            setImporting(null);
            toast(`Imported ${list.length} expense${list.length === 1 ? '' : 's'} — set the accounts below`);
          }} />
      )}

      <div className="expenses-body" onDoubleClick={(e) => { if (!ro && !(e.target as HTMLElement).closest('tr, button, input, select')) add(); }}>
        {rows.length ? (
          <table className="table expenses-table cards-on-phone">
            <thead><tr><th>Date</th><th>Vendor</th><th>Description</th><th>Account</th><th>Line</th><th className="num">Amount</th><th>Paid</th><th>Receipt</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => {
                const lines = b.lines.filter((l) => l.accountId === e.accountId);
                return (
                  <tr key={e.id}>
                    <td><input type="date" disabled={ro} value={e.date} onChange={(ev) => set(e.id, { date: ev.target.value })} /></td>
                    <td><input disabled={ro} value={e.vendor} placeholder="Vendor" onChange={(ev) => set(e.id, { vendor: ev.target.value })} /></td>
                    <td><input disabled={ro} value={e.description} placeholder="What for" onChange={(ev) => set(e.id, { description: ev.target.value })} /></td>
                    <td>
                      <select disabled={ro} value={e.accountId} onChange={(ev) => { setLastAccount(ev.target.value); set(e.id, { accountId: ev.target.value, lineId: undefined }, 'Edit expense'); }}>{accountOptions}</select>
                    </td>
                    <td>
                      <select disabled={ro || !lines.length} value={e.lineId ?? ''} onChange={(ev) => set(e.id, { lineId: ev.target.value || undefined }, 'Edit expense')}>
                        <option value="">—</option>
                        {lines.map((l) => <option key={l.id} value={l.id}>{l.description || 'Untitled line'}</option>)}
                      </select>
                    </td>
                    <td className="num"><MoneyInput className="cell-num" disabled={ro} value={e.amount || undefined} placeholder="0.00" onChange={(n) => set(e.id, { amount: n ?? 0 })} /></td>
                    <td><input type="checkbox" disabled={ro} checked={e.paid} onChange={(ev) => set(e.id, { paid: ev.target.checked }, 'Edit expense')} /></td>
                    <td
                      onDragOver={(ev) => { if (!ro && ev.dataTransfer.types.includes('Files')) { ev.preventDefault(); ev.stopPropagation(); } }}
                      onDrop={(ev) => { if (ro) return; ev.preventDefault(); ev.stopPropagation(); setOver(false); void attach(e.id, ev.dataTransfer.files[0]); }}>
                      {e.receiptId
                        ? <button className="link small" onClick={() => openReceipt(e.receiptId!)}>View</button>
                        : !ro && <label className="link small receipt-pick" title="Attach a photo or PDF (or drop one here)">Attach<input type="file" accept="image/*,application/pdf" hidden onChange={(ev) => void attach(e.id, ev.target.files?.[0])} /></label>}
                    </td>
                    <td className="actions">{!ro && <button className="icon-btn" title="Delete expense" onClick={() => remove(e)}>×</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="expenses-empty muted">
            <p><b>No expenses{filter || unpaidOnly ? ' here' : ' yet'}.</b></p>
            {!ro && <p><Hint>{'Drop receipt photos or PDFs anywhere on this page, drop a bank or card CSV export, or double-click to add one.'}</Hint></p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportPanel({ imp, setImp, accountOptions, onImport }: {
  imp: { rows: string[][]; map: CsvMapping; accountId: string; name: string };
  setImp: (v: typeof imp | null) => void;
  accountOptions: React.ReactNode;
  onImport: (list: BudgetExpense[]) => void;
}) {
  const header = imp.rows[0];
  const preview = rowsToExpenses(imp.rows, imp.map, imp.accountId);
  const col = (k: keyof CsvMapping, label: string) => (
    <label className="field"><span>{label}</span>
      <select value={imp.map[k]} onChange={(e) => setImp({ ...imp, map: { ...imp.map, [k]: Number(e.target.value) } })}>
        <option value={-1}>—</option>
        {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );
  return (
    <div className="csv-import">
      <h4>Import {imp.name}</h4>
      <p className="muted small">Match the columns. Money going out becomes an expense; deposits and zero rows are skipped.</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        {col('date', 'Date')}{col('vendor', 'Vendor / payee')}{col('description', 'Description')}{col('amount', 'Amount')}{col('debit', 'Debit (money out)')}
        <label className="field"><span>Put them in</span><select value={imp.accountId} onChange={(e) => setImp({ ...imp, accountId: e.target.value })}>{accountOptions}</select></label>
      </div>
      <table className="table small">
        <tbody>
          {preview.slice(0, 5).map((e) => <tr key={e.id}><td>{e.date || <span className="over">no date</span>}</td><td>{e.vendor}</td><td>{e.description}</td><td className="num">{e.amount.toFixed(2)}</td></tr>)}
        </tbody>
      </table>
      <div className="row">
        <button className="primary" disabled={!preview.length} onClick={() => onImport(preview)}>Import {preview.length} expense{preview.length === 1 ? '' : 's'}</button>
        <button onClick={() => setImp(null)}>Cancel</button>
      </div>
    </div>
  );
}
