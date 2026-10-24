import { useMemo } from 'react';
import type { Deliverable, DeliverableStatus, Outlet, OutletKind, OutletStatus } from '../../model/types';
import { useProject, useStore } from '../../store/project';
import { getMedia, putMedia } from '../../store/media';
import { canEdit, useSync } from '../../sync/state';
import { download } from '../../io/files';
import {
  DELIVERABLE_GROUPS, DELIVERABLE_STATUSES, OUTLET_KINDS, OUTLET_STATUSES, RIGHTS, deliverableTab, missingDeliverables, newDeliverable, newOutlet, scopeWarnings,
} from '../../release/distribution';
import { toast } from '../../components/common';
import { deletedToast } from '../../components/deleted';
import { Hint } from '../../components/Hint';
import { RefLink } from '../ReferenceTab';
import { useNarrow } from '../../ui/responsive';

// Release → Distribution: the deliverables checklist, the sales agents / distributors / platforms
// you're talking to, and a check that your licences cover where the film is going.

const MAX_FILE = 25_000_000;
const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));

export function DistributionTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const seesBudget = useSync((s) => s.write === null || s.admin || s.budget);
  const ro = !canEdit('deliverables');
  const list = p.deliverables ?? [];
  const outlets = p.outlets ?? [];
  const warnings = useMemo(() => (seesBudget ? scopeWarnings(p) : []), [seesBudget, p]);
  const done = list.filter((d) => d.status === 'done' || d.status === 'na').length;
  const narrow = useNarrow();
  const talking = outlets.filter((o) => o.status === 'talking' || o.status === 'offer').length;
  const signed = outlets.filter((o) => o.status === 'signed').length;

  const editD = (fn: (l: Deliverable[]) => void, label: string | null = 'Edit deliverables') => update((dr) => { dr.deliverables ??= []; fn(dr.deliverables as Deliverable[]); }, label);
  const setD = (id: string, patch: Partial<Deliverable>, label: string | null = null) => editD((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const editO = (fn: (l: Outlet[]) => void, label: string | null = 'Edit distribution') => update((dr) => { dr.outlets ??= []; fn(dr.outlets as Outlet[]); }, label);
  const setO = (id: string, patch: Partial<Outlet>, label: string | null = null) => editO((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const attach = async (id: string, f?: File) => {
    if (!f) return;
    if (f.size > MAX_FILE) { toast('That file is too big to keep with the project (25 MB at most). Write where it lives in the notes instead.'); return; }
    const mid = await putMedia(p.id, f);
    setD(id, { fileId: mid, fileName: f.name }, 'Attach file');
  };
  const open = async (d: Deliverable) => { const b = d.fileId ? await getMedia(d.fileId) : null; if (b) download(d.fileName || 'file', b); else toast('The file isn’t on this device yet.'); };
  const addUsual = () => { const add = missingDeliverables(list); if (add.length) editD((l) => { l.push(...add); }, 'Add the usual deliverables'); };

  return (
    <div className="distribution-tab pad scroll">
      <div className="toolbar flat wrap">
        <h3>Distribution</h3>
        <RefLink page="distribution" label="Distribution paths" />
      </div>

      {!narrow && (list.length > 0 || outlets.length > 0) && (
        <div className="fund-cards dist-summary">
          <div><span className="muted small">Deliverables</span><b>{done} of {list.length}</b><span className="muted small">done or not needed</span></div>
          <div><span className="muted small">Sales & distribution</span><b>{outlets.length}</b><span className="muted small">{talking} in talks or with an offer · {signed} signed</span></div>
          {seesBudget && <div className={warnings.length ? 'fund-raise' : ''}><span className="muted small">Licences</span><b>{warnings.length ? `${warnings.length} to check` : 'Cover the plan'}</b><span className="muted small">for the festivals and releases planned</span></div>}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="budget-warn">
          <b>Check your licences</b>
          {warnings.map((w, i) => <span key={i} className="small">{w.text}</span>)}
          <span><button className="small" onClick={() => goto('licenses')}>Open Licenses</button></span>
        </div>
      )}
      {!seesBudget && <p className="muted small"><Hint>{'Licences are kept with the budget, so people who can see it get a warning here when a licence doesn’t cover a planned release.'}</Hint></p>}

      <div className="dist-split">
      <section className="dist-deliverables">
        <div className="row wrap"><h4>Deliverables</h4><span className="muted small">{done} of {list.length} done</span><span className="spacer" />
          {!ro && <button className="small" onClick={() => editD((l) => { l.push(newDeliverable()); }, 'Add deliverable')}>＋ Deliverable</button>}
          {!ro && missingDeliverables(list).length > 0 && <button className="small primary" onClick={addUsual}>Add the usual list</button>}
        </div>
        {!list.length && <p className="muted small" onDoubleClick={() => !ro && addUsual()}><Hint>{'What festivals and distributors ask you to hand over: DCP, master, mixes, captions, cue sheet, E&O certificate, chain of title… “Add the usual list” puts them all here with a note on each.'}</Hint></p>}
        {!narrow && list.length > 0 && (
          <table className="table deliv-table">
            <thead><tr><th>Status</th><th>Deliverable</th><th>Due</th><th>File</th><th aria-label="Actions" /></tr></thead>
            {DELIVERABLE_GROUPS.map((g) => {
              const items = list.filter((d) => d.group === g.id);
              if (!items.length) return null;
              return (
                <tbody key={g.id}>
                  <tr className="deliv-group-row"><th colSpan={5}>{g.label} <span className="muted small">{items.filter((d) => d.status === 'done' || d.status === 'na').length} of {items.length}</span></th></tr>
                  {items.map((d) => {
                    const tab = deliverableTab(d);
                    return (
                      <tr key={d.id} className={`deliv-tr st-${d.status}`} onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (ro) return; e.preventDefault(); void attach(d.id, e.dataTransfer.files[0]); }}>
                        <td><select disabled={ro} value={d.status} aria-label="Status" onChange={(e) => setD(d.id, { status: e.target.value as DeliverableStatus }, 'Deliverable status')}>{DELIVERABLE_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></td>
                        <td className="deliv-main">
                          <input disabled={ro} className="deliv-name" value={d.name} placeholder="Deliverable" aria-label="Deliverable" onChange={(e) => setD(d.id, { name: e.target.value })} />
                          <input disabled={ro} className="deliv-notes small" value={d.notes ?? ''} placeholder="Notes: format, who it goes to, where it lives" aria-label="Notes" onChange={(e) => setD(d.id, { notes: e.target.value || undefined })} />
                        </td>
                        <td><input disabled={ro} type="date" value={d.due ?? ''} aria-label="Due" onChange={(e) => setD(d.id, { due: e.target.value || undefined })} /></td>
                        <td className="nowrap">{d.fileId ? <button className="link small" onClick={() => void open(d)} title="Download the attached file">📎 {d.fileName || 'file'}</button>
                          : !ro && <label className="button-like small" title="Attach a file (or drop one on the row)">📎 Attach<input type="file" hidden onChange={(e) => { void attach(d.id, e.target.files?.[0]); e.target.value = ''; }} /></label>}</td>
                        <td className="nowrap">{tab && <button className="link small" onClick={() => goto(tab)}>Open →</button>}{!ro && <button className="icon-btn" aria-label={`Delete ${d.name || 'deliverable'}`} onClick={() => { editD((l) => { const i = l.findIndex((x) => x.id === d.id); if (i >= 0) l.splice(i, 1); }, 'Delete deliverable'); deletedToast(d.name || 'deliverable'); }}>×</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}
        {narrow && DELIVERABLE_GROUPS.map((g) => {
          const items = list.filter((d) => d.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id} className="deliv-group">
              <h5>{g.label}</h5>
              {items.map((d) => {
                const tab = deliverableTab(d);
                return (
                  <div key={d.id} className={`deliv-row st-${d.status}`} onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (ro) return; e.preventDefault(); void attach(d.id, e.dataTransfer.files[0]); }}>
                    <select disabled={ro} value={d.status} aria-label="Status" onChange={(e) => setD(d.id, { status: e.target.value as DeliverableStatus }, 'Deliverable status')}>{DELIVERABLE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                    <div className="deliv-main">
                      <input disabled={ro} className="deliv-name" value={d.name} placeholder="Deliverable" aria-label="Deliverable" onChange={(e) => setD(d.id, { name: e.target.value })} />
                      <input disabled={ro} className="deliv-notes small" value={d.notes ?? ''} placeholder="Notes: format, who it goes to, where it lives" aria-label="Notes" onChange={(e) => setD(d.id, { notes: e.target.value || undefined })} />
                    </div>
                    <label className="check small">Due <input disabled={ro} type="date" value={d.due ?? ''} onChange={(e) => setD(d.id, { due: e.target.value || undefined })} /></label>
                    {d.fileId ? <button className="link small" onClick={() => void open(d)} title="Download the attached file">📎 {d.fileName || 'file'}</button>
                      : !ro && <label className="button-like small" title="Attach a file (or drop one on the row)">📎 Attach<input type="file" hidden onChange={(e) => { void attach(d.id, e.target.files?.[0]); e.target.value = ''; }} /></label>}
                    {tab && <button className="link small" onClick={() => goto(tab)}>Open →</button>}
                    {!ro && <button className="icon-btn" aria-label={`Delete ${d.name || 'deliverable'}`} onClick={() => { editD((l) => { const i = l.findIndex((x) => x.id === d.id); if (i >= 0) l.splice(i, 1); }, 'Delete deliverable'); deletedToast(d.name || 'deliverable'); }}>×</button>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className="dist-outlets">
        <div className="row wrap"><h4>Sales agents, distributors & platforms</h4><span className="spacer" />
          {!ro && <button className="small" onClick={() => editO((l) => { l.push(newOutlet()); }, 'Add outlet')}>＋ Add</button>}
        </div>
        {!outlets.length && <p className="muted small" onDoubleClick={() => !ro && editO((l) => { l.push(newOutlet()); }, 'Add outlet')}><Hint>{'Keep track of who you’ve contacted about releasing the film, what they’d use it for (festivals, streaming, TV…), and where it stands. Double-click here to add one.'}</Hint></p>}
        <div className="outlet-list">
          {outlets.map((o) => (
            <article key={o.id} className={`outlet-card st-${o.status}`}>
              <div className="row wrap">
                <input disabled={ro} className="outlet-name" value={o.name} placeholder="Name" aria-label="Name" onChange={(e) => setO(o.id, { name: e.target.value })} />
                <select disabled={ro} value={o.kind} aria-label="Kind" title={OUTLET_KINDS.find((k) => k.id === o.kind)?.hint} onChange={(e) => setO(o.id, { kind: e.target.value as OutletKind }, 'Outlet kind')}>{OUTLET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
                <select disabled={ro} value={o.status} aria-label="Status" className={`doc-status s-${o.status}`} onChange={(e) => setO(o.id, { status: e.target.value as OutletStatus }, 'Outlet status')}>{OUTLET_STATUSES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
                {o.url && <a className="icon-link" href={o.url} target="_blank" rel="noreferrer noopener" title="Open their site">↗</a>}
                <span className="spacer" />
                {!ro && <button className="icon-btn" aria-label={`Delete ${o.name || 'outlet'}`} onClick={() => { editO((l) => { const i = l.findIndex((x) => x.id === o.id); if (i >= 0) l.splice(i, 1); }, 'Delete outlet'); deletedToast(o.name || 'outlet'); }}>×</button>}
              </div>
              <div className="rights" role="group" aria-label="What they'd use it for">
                {RIGHTS.map((r) => <label key={r.id} className={`chip small ${o.rights.includes(r.id) ? 'on' : ''}`}><input disabled={ro} type="checkbox" hidden checked={o.rights.includes(r.id)} onChange={(e) => setO(o.id, { rights: e.target.checked ? [...o.rights, r.id] : o.rights.filter((x) => x !== r.id) }, null)} />{r.label}</label>)}
              </div>
              <div className="row wrap">
                <input disabled={ro} value={o.territory ?? ''} placeholder="Territory (e.g. North America, worldwide)" aria-label="Territory" onChange={(e) => setO(o.id, { territory: e.target.value || undefined })} />
                <label className="check small">Release <input disabled={ro} type="date" value={o.releaseDate ?? ''} onChange={(e) => setO(o.id, { releaseDate: e.target.value || undefined })} /></label>
                <input disabled={ro} value={o.contact ?? ''} placeholder="Contact" aria-label="Contact" onChange={(e) => setO(o.id, { contact: e.target.value || undefined })} />
                <input disabled={ro} value={o.url ?? ''} placeholder="Website" aria-label="Website" onChange={(e) => setO(o.id, { url: e.target.value || undefined })} />
              </div>
              <input disabled={ro} className="outlet-notes" value={o.notes ?? ''} placeholder="Notes: terms offered, length of deal, fees, deliverables they want" aria-label="Notes" onChange={(e) => setO(o.id, { notes: e.target.value || undefined })} />
            </article>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
