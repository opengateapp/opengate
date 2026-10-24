import { useMemo, useState } from 'react';
import { useProject, useStore } from '../store/project';
import { canEdit } from '../sync/state';
import { allCurrencies, currencyParts, formatNumber, regionDefaults, unitsOf } from '../model/units';
import type { ProjectUnits } from '../model/types';
import { askConfirm } from './dialogs';
import { toast } from './common';

// Settings → Project → Units & currency: shared with everyone on the project, so money and
// measurements read the same for everyone.

const LOCALES = ['en-US', 'en-CA', 'fr-CA', 'en-GB', 'en-AU', 'en-NZ', 'en-IE', 'en-IN', 'en-ZA', 'de-DE', 'fr-FR', 'es-ES', 'es-MX', 'it-IT', 'nl-NL', 'pt-BR', 'pt-PT', 'sv-SE', 'nb-NO', 'da-DK', 'fi-FI', 'pl-PL', 'de-CH', 'ja-JP', 'ko-KR', 'zh-CN'];

export function UnitsSettings() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const ro = !canEdit('units');
  const u = unitsOf(p);
  const [q, setQ] = useState('');
  const list = useMemo(() => allCurrencies(u.locale), [u.locale]);
  const shown = q.trim() ? list.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q.trim().toLowerCase())) : list;
  const c = currencyParts(u.currency, u.locale, u.symbolStyle);
  const sample = (n: number) => `${c.side === 'prefix' ? `${c.symbol}${c.space ? ' ' : ''}` : ''}${formatNumber(n, u.locale, c.decimals)}${c.side === 'suffix' ? `${c.space ? ' ' : ''}${c.symbol}` : ''}`;
  const locales = [...new Set([u.locale, navigator.language, ...LOCALES])];

  const set = (patch: Partial<ProjectUnits>, label: string) => update((dr) => {
    dr.units = { ...unitsOf(dr as never), ...patch };
    // Older copies read the budget's currency: keep it in step where we may write the budget.
    if (patch.currency && canEdit('budget')) dr.budget.currency = patch.currency;
  }, label);
  const setCurrency = async (code: string) => {
    if (code === u.currency) return;
    if (!(await askConfirm(`Use ${code} for this project?`, { message: 'Amounts stay the same numbers: Open Gate doesn’t convert currencies. A $1,000 line becomes 1,000 in the new currency.', confirmLabel: `Use ${code}` }))) return;
    set({ currency: code }, 'Currency');
  };

  return (
    <div className="prefs units-settings">
      <h3>Units & currency</h3>
      <p className="muted small">Shared with everyone on this project, so money and measurements read the same for all of you.</p>
      <div className="form-grid">
        <label className="field wide"><span>Currency · now <b>{u.currency}</b> ({list.find((x) => x.code === u.currency)?.name ?? u.currency})</span>
          <input disabled={ro} value={q} placeholder="Search: CAD, euro, yen…" onChange={(e) => setQ(e.target.value)} aria-label="Search currencies" />
          <select disabled={ro} value={u.currency} size={6} onChange={(e) => void setCurrency(e.target.value)} aria-label="Currency">
            {shown.map((x) => <option key={x.code} value={x.code}>{x.code} — {x.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Symbol</span>
          <select disabled={ro} value={u.symbolStyle} onChange={(e) => set({ symbolStyle: e.target.value as ProjectUnits['symbolStyle'] }, 'Currency symbol')}>
            <option value="narrow">Short ({currencyParts(u.currency, u.locale, 'narrow').symbol})</option>
            <option value="clear">Clear ({currencyParts(u.currency, u.locale, 'clear').symbol}) for when “$” could mean several currencies</option>
          </select>
        </label>
        <label className="field"><span>Number format</span>
          <select disabled={ro} value={u.locale} onChange={(e) => set({ locale: e.target.value }, 'Number format')}>
            {locales.map((l) => <option key={l} value={l}>{formatNumber(1234.5, l, 2)} · {(() => { try { return new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l; } catch { return l; } })()}</option>)}
          </select>
        </label>
        <label className="field"><span>Distances</span>
          <select disabled={ro} value={u.distance} onChange={(e) => set({ distance: e.target.value as ProjectUnits['distance'] }, 'Distances')}>
            <option value="ft">Feet</option><option value="m">Metres</option>
          </select>
        </label>
      </div>
      <p className="small">Looks like: <b>{sample(1234.5)}</b> · <b>{sample(387)}/day</b> · distances in <b>{u.distance === 'm' ? 'metres' : 'feet'}</b></p>
      {!ro && <button onClick={() => { const r = regionDefaults(); set(r, 'Region defaults'); toast(`Set to ${r.currency}, ${r.distance === 'm' ? 'metres' : 'feet'}, ${formatNumber(1234.5, r.locale, 2)}.`); }}>Use my region’s defaults ({regionDefaults().currency}, {regionDefaults().distance === 'm' ? 'metres' : 'feet'})</button>}
      <p className="muted small">Shot Designer sizes and the Reference calculators use the distance setting. Dates and times are set per device in Dates & units.</p>
    </div>
  );
}
