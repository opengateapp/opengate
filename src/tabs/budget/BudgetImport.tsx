import { useState } from 'react';
import { useProject, useStore } from '../../store/project';
import { Modal, toast } from '../../components/common';
import { askConfirm } from '../../components/dialogs';
import { BUDGET_TEMPLATES, templateLines, type BudgetTemplate } from '../../budget/templates';
import { DEFAULT_ACCOUNTS, GROUPS, accountLabel } from '../../budget/accounts';
import { guessSheetMapping, headerRow, readSheet, sheetToLines, type SheetMapping } from '../../budget/importSheet';
import { money } from '../../budget/calc';

// Budget templates (start from a typical budget) and spreadsheet import.

export function TemplatePicker({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const hasLines = p.budget.lines.length > 0;
  const apply = async (t: BudgetTemplate) => {
    const switchesChart = !!t.accounts && !hasLines;
    if (hasLines && !(await askConfirm(`Add the ${t.name} lines to this budget?`, { message: 'Your lines stay; the template adds its own (rates at 0 for you to fill in).', confirmLabel: 'Add lines' }))) return;
    update((dr) => {
      if (switchesChart) dr.budget.accounts = t.accounts!.map((a) => ({ ...a }));
      // A template with its own chart, added to an existing budget: bring in its accounts too.
      if (t.accounts && !switchesChart) for (const a of t.accounts) if (!dr.budget.accounts.some((x) => x.code === a.code)) dr.budget.accounts.push({ ...a });
      if (!t.accounts && !dr.budget.accounts.some((a) => a.code === '1100')) for (const a of DEFAULT_ACCOUNTS) if (!dr.budget.accounts.some((x) => x.id === a.id)) dr.budget.accounts.push({ ...a });
      dr.budget.lines.push(...templateLines(t, dr.budget.accounts));
    }, `Budget template: ${t.name}`);
    toast(`${t.name}: ${t.lines.length} lines added — fill in the rates`);
    onClose();
  };
  return (
    <Modal title="Start from a template" onClose={onClose} wide>
      <p className="muted small">Typical lines for each kind of production, with units and links to your schedule already set. Rates start at 0 — real rates depend on where you shoot, union status and the year, so fill in your own quotes.</p>
      <div className="template-grid">
        {BUDGET_TEMPLATES.map((t) => (
          <button key={t.id} className="template-card" onClick={() => void apply(t)}>
            <b>{t.name}</b>
            <span className="muted small">{t.description}</span>
            <span className="small">{t.lines.length} lines{t.accounts ? ` · its own ${t.accounts.length} sections` : ''}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function SheetImport({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const b = p.budget;
  const [rows, setRows] = useState<string[][] | null>(null);
  const [hdr, setHdr] = useState(0);
  const [map, setMap] = useState<SheetMapping | null>(null);
  const [fallback, setFallback] = useState(b.accounts.find((a) => a.code === '5200')?.id ?? b.accounts[0].id);
  const [name, setName] = useState('');

  const load = async (f?: File) => {
    if (!f) return;
    try {
      const r = await readSheet(f);
      if (r.length < 2) { toast('That file has no rows to import'); return; }
      const h = headerRow(r);
      setRows(r); setHdr(h); setMap(guessSheetMapping(r[h])); setName(f.name);
    } catch (e) { toast(`Couldn't read that file: ${(e as Error).message}`); }
  };
  const lines = rows && map ? sheetToLines(rows, map, b.accounts, fallback, hdr + 1) : [];
  const header = rows ? rows[hdr] : [];
  const col = (k: keyof SheetMapping, label: string) => (
    <label className="field"><span>{label}</span>
      <select value={map![k]} onChange={(e) => setMap({ ...map!, [k]: Number(e.target.value) })}>
        <option value={-1}>—</option>
        {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );
  const accName = (id: string) => { const a = b.accounts.find((x) => x.id === id); return a ? accountLabel(a) : '?'; };

  return (
    <Modal title="Import a budget from a spreadsheet" onClose={onClose} wide footer={<>
      <button onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!lines.length} onClick={() => { update((dr) => { dr.budget.lines.push(...lines); }, 'Import budget lines'); toast(`Imported ${lines.length} lines`); onClose(); }}>Import {lines.length || ''} line{lines.length === 1 ? '' : 's'}</button>
    </>}>
      {!rows ? (
        <>
          <p className="muted small">A CSV or Excel file with one budget line per row: an account (code like 2200, or a name like “Camera”), a description, and quantity / units / × / rate — or just a total. The first row with column names is used as the header.</p>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(e) => void load(e.target.files?.[0])} />
        </>
      ) : (
        <>
          <p className="small"><b>{name}</b> · {rows.length - hdr - 1} rows · header on row {hdr + 1}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            {col('account', 'Account')}{col('description', 'Description')}{col('qty', 'Qty')}{col('units', 'Units')}{col('x', '×')}{col('rate', 'Rate')}{col('total', 'Total (if no rate)')}
            <label className="field"><span>Rows with no matching account go to</span>
              <select value={fallback} onChange={(e) => setFallback(e.target.value)}>
                {GROUPS.map((g) => <optgroup key={g.id} label={g.label}>{b.accounts.filter((a) => a.group === g.id).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}</optgroup>)}
              </select>
            </label>
          </div>
          <table className="table small">
            <thead><tr><th>Account</th><th>Description</th><th className="num">Qty</th><th>Units</th><th className="num">×</th><th className="num">Rate</th></tr></thead>
            <tbody>
              {lines.slice(0, 8).map((l) => <tr key={l.id}><td>{accName(l.accountId)}</td><td>{l.description}</td><td className="num">{l.qty}</td><td>{l.units}</td><td className="num">{l.x}</td><td className="num">{money(l.rate, b.currency, true)}</td></tr>)}
            </tbody>
          </table>
          {lines.length > 8 && <p className="muted small">…and {lines.length - 8} more.</p>}
        </>
      )}
    </Modal>
  );
}
