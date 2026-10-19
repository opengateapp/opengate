import { useState } from 'react';
import { useDerived, useProject, useStore } from '../../store/project';
import type { GearItem, GearSource } from '../../model/types';
import { newId } from '../../model/ids';
import { money } from '../../budget/calc';
import { GEAR_CATEGORIES, SOURCE_LABEL, gearCost, gearTotals, syncGearLines } from '../../budget/gear';
import { budgetVisible, canWrite, useSync } from '../../sync/state';
import { csv } from '../../io/reports';
import { download, safeName } from '../../io/files';
import { deletedToast } from '../../components/deleted';
import { openActions } from '../../components/ActionSheet';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';

// Budget → Gear: the gear manifest. Cameras and lights placed in the shot designer appear on
// their own; add anything else by hand. For each item choose Own / Rent / Borrow / Buy: rented
// and bought gear become linked budget lines, owned and borrowed gear costs nothing (and shows
// what it saves), with an optional insurance & upkeep percentage on owned gear.

const SOURCES: GearSource[] = ['own', 'rent', 'borrow', 'buy'];

export function GearTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canWrite('visualize') || !canWrite('budget');
  const showCost = budgetVisible();
  const gear = p.gear ?? [];
  const t = gearTotals(p);
  const $ = (n: number) => money(n, p.budget.currency);
  const [cat, setCat] = useState('');

  const edit = (fn: (g: GearItem[]) => void, label: string | null = 'Edit gear') => update((dr) => { dr.gear ??= []; fn(dr.gear); syncGearLines(dr); }, label);
  const set = (id: string, patch: Partial<GearItem>, label: string | null = null) => edit((g) => { const x = g.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const add = () => edit((g) => { g.push({ id: newId(), name: 'New item', category: (cat || 'other') as GearItem['category'], qty: 1, source: 'rent', rate: 0, rateUnit: 'day', sceneIds: [] }); }, 'Add gear');
  const remove = (x: GearItem) => { edit((g) => { const i = g.findIndex((y) => y.id === x.id); if (i >= 0) g.splice(i, 1); }, 'Remove gear'); deletedToast(x.name); };

  const shown = gear.filter((g) => !cat || g.category === cat);
  const daysLabel = (g: GearItem) => (g.days != null ? 'typed' : g.sceneIds.length ? `${g.sceneIds.length} scene${g.sceneIds.length > 1 ? 's' : ''}` : 'whole shoot');

  const exportCsv = () => download(`${safeName(p.title)} - gear.csv`, csv([
    ['Item', 'Category', 'Qty', 'Own / rent', 'Rate', 'Per', 'Days', 'Cost', 'Notes'],
    ...gear.map((g) => [g.name, GEAR_CATEGORIES.find((c) => c.id === g.category)?.label ?? g.category, String(g.qty), SOURCE_LABEL[g.source], String(g.rate), g.source === 'buy' ? 'purchase' : g.rateUnit, String(t.days.get(g.id) ?? 0),
      g.source === 'rent' || g.source === 'buy' ? String(gearCost(g, t.days.get(g.id) ?? 0, p.budget.rentalWeekDays ?? 3)) : '0', g.notes ?? '']),
  ]), 'text/csv');
  const exportPdf = async () => {
    const { gearPdf } = await import('../../pdf/gearPdf');
    download(`${safeName(p.title)} - gear manifest.pdf`, gearPdf(useStore.getState().project!, d, showCost).output('blob'), 'application/pdf');
  };

  return (
    <div className="gear-tab pad scroll" onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('gear-tab')) add(); }}>
      <div className="toolbar flat">
        <h3>Gear</h3>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {GEAR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {!ro && <button className="primary" onClick={add}>＋ Item</button>}
        <span className="spacer" />
        <More label="Gear actions">
          <button onClick={exportCsv} disabled={!gear.length}>Export CSV</button>
          <button onClick={() => void exportPdf()} disabled={!gear.length}>Manifest PDF</button>
        </More>
      </div>

      {showCost && (
        <div className="gear-totals">
          <div><span className="muted small">Rentals</span><b>{$(t.rent)}</b></div>
          <div><span className="muted small">Purchases</span><b>{$(t.buy)}</b></div>
          <div className="good"><span className="muted small">Gear you own saves</span><b>{$(t.ownSaves)}</b></div>
          <div className="good"><span className="muted small">Borrowed gear saves</span><b>{$(t.borrowSaves)}</b></div>
          <label className="gear-upkeep"><span className="muted small">Insurance & upkeep on owned gear</span>
            <span className="row"><input type="number" min={0} max={100} step={1} className="cell-num" disabled={ro} value={p.budget.ownedGearPct ?? 0}
              onChange={(e) => update((dr) => { dr.budget.ownedGearPct = Math.max(0, Number(e.target.value) || 0); syncGearLines(dr); }, null)} />% {t.upkeep > 0 && <span className="muted small">= {$(t.upkeep)}</span>}</span>
          </label>
        </div>
      )}

      <div className="table-scroll">
      <table className="table gear-table cards-on-phone">
        <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Own / rent</th>{showCost && <><th>Rate</th><th>Days</th><th>Cost</th></>}<th>Notes</th><th /></tr></thead>
        <tbody>
          {shown.map((g) => {
            const days = t.days.get(g.id) ?? 0;
            const cost = gearCost(g, days, p.budget.rentalWeekDays ?? 3);
            return (
              <tr key={g.id} onContextMenu={(e) => { if (ro || (e.target as HTMLElement).closest('input, select, textarea')) return; e.preventDefault(); openActions(g.name, [
                ...SOURCES.map((s) => ({ label: SOURCE_LABEL[s], current: g.source === s, run: () => set(g.id, { source: s }, 'Own / rent') })),
                { label: 'Duplicate', run: () => edit((list) => { list.push({ ...g, id: newId(), name: `${g.name} (copy)`, fromPlan: undefined }); }, 'Duplicate gear') },
                ...(g.fromPlan ? [] : [{ label: 'Remove', danger: true, run: () => remove(g) }]),
              ], { x: e.clientX, y: e.clientY }); }}>
                <td data-label="Item"><input disabled={ro} value={g.name} onChange={(e) => set(g.id, { name: e.target.value })} />{g.fromPlan && <span className="muted small" title="Placed in the shot designer"> 🎥 from plan</span>}</td>
                <td data-label="Category"><select disabled={ro} value={g.category} onChange={(e) => set(g.id, { category: e.target.value as GearItem['category'] }, 'Gear category')}>{GEAR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                <td data-label="Qty"><input type="number" min={1} className="cell-num" disabled={ro} value={g.qty} onChange={(e) => set(g.id, { qty: Math.max(1, Number(e.target.value) || 1) })} /></td>
                <td data-label="Own / rent">
                  <div className="seg small" role="radiogroup" aria-label="Own or rent">
                    {SOURCES.map((s) => <button key={s} role="radio" aria-checked={g.source === s} disabled={ro} className={g.source === s ? 'active' : ''} onClick={() => set(g.id, { source: s }, 'Own / rent')}>{SOURCE_LABEL[s]}</button>)}
                  </div>
                </td>
                {showCost && <>
                  <td data-label={g.source === 'buy' ? 'Price' : g.source === 'rent' ? 'Rate' : 'Rental value'}>
                    <span className="row nowrap">
                      <input type="number" min={0} className="cell-num" disabled={ro} value={g.rate} onChange={(e) => set(g.id, { rate: Math.max(0, Number(e.target.value) || 0) })} />
                      {g.source !== 'buy' && <select disabled={ro} value={g.rateUnit} onChange={(e) => set(g.id, { rateUnit: e.target.value as 'day' | 'week' }, 'Rate per')}><option value="day">/ day</option><option value="week">/ week</option></select>}
                    </span>
                  </td>
                  <td data-label="Days">
                    {g.source === 'buy' ? <span className="muted small">—</span> : (
                      <span className="row nowrap">
                        <input type="number" min={0} className="cell-num" disabled={ro} value={days} title={g.days != null ? 'Typed' : 'Shoot days with the scenes it’s used in'}
                          onChange={(e) => set(g.id, { days: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} />
                        <span className="muted small">{daysLabel(g)}</span>
                        {g.days != null && !ro && <button className="link small" title="Count shoot days again" onClick={() => set(g.id, { days: undefined }, 'Days from schedule')}>auto</button>}
                      </span>
                    )}
                  </td>
                  <td data-label="Cost" className={g.source === 'own' || g.source === 'borrow' ? 'muted' : ''}>
                    {g.source === 'own' || g.source === 'borrow' ? <span title={`Renting it would cost ${$(cost)}`}>$0 <small>(saves {$(cost)})</small></span> : <b>{$(cost)}</b>}
                  </td>
                </>}
                <td data-label="Notes"><input disabled={ro} value={g.notes ?? ''} placeholder="Serials, vendor, pickup…" onChange={(e) => set(g.id, { notes: e.target.value || undefined })} /></td>
                <td data-label="">{!ro && !g.fromPlan && <button className="icon-btn" aria-label={`Remove ${g.name}`} onClick={() => remove(g)}>×</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {!gear.length && (
        <p className="muted pad"><Hint>{'No gear yet. Cameras and lights you place in Visualize → Shot Designer show up here on their own. Add anything else with ＋ Item, or double-click empty space.'}</Hint></p>
      )}
      {gear.length > 0 && <p className="muted small"><Hint>{'Rented and bought items are budget lines (in Camera, Grip & Electric, Sound…) that update when you change them here. Days come from the stripboard: the shoot days with the scenes an item is used in. Right-click a row for more.'}</Hint></p>}
    </div>
  );
}
