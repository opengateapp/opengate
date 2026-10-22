import { useProject, useStore } from '../store/project';
import type { UnionOption } from '../model/types';
import { SAG_LINK, SAG_TIERS, UNIONS, unionOptions } from '../paperwork/unions';
import { askConfirm } from './dialogs';
import { Hint } from './Hint';

/** Settings → Unions: the production's agreement, and which unions appear in the pickers. */
export function UnionSettings() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const list = unionOptions(p, true);
  const edit = (fn: (l: UnionOption[]) => void, label: string | null = 'Edit unions') => update((d) => {
    d.unionOptions = d.unionOptions?.length ? d.unionOptions : UNIONS.map((u) => ({ ...u, locals: u.locals ? [...u.locals] : undefined }));
    fn(d.unionOptions);
  }, label);
  const ag = p.production.agreement ?? {};
  const setAg = (patch: Partial<typeof ag>) => update((d) => {
    const next = { ...d.production.agreement, ...patch };
    if (!next.union) delete next.tier;
    d.production.agreement = next.union || next.tier ? next : undefined;
  }, 'Production agreement');
  const sag = (ag.union ?? '').toUpperCase().startsWith('SAG');
  const groups = [...new Set(list.map((u) => u.group))];

  return (
    <div className="union-settings">
      <h3>Production agreement</h3>
      <div className="form-grid">
        <label className="field"><span>Union agreement</span>
          <select value={ag.union ?? ''} onChange={(e) => setAg({ union: e.target.value || undefined })}>
            <option value="">Non-union production</option>
            {unionOptions(p).map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </select>
        </label>
        {ag.union && (
          <label className="field"><span>Agreement / tier</span>
            <input list="sag-tiers" value={ag.tier ?? ''} placeholder={sag ? 'Ultra Low Budget…' : 'Agreement name'} onChange={(e) => setAg({ tier: e.target.value || undefined })} />
            <datalist id="sag-tiers">{(sag ? SAG_TIERS : []).map((t) => <option key={t} value={t} />)}</datalist>
          </label>
        )}
      </div>
      <p className="muted small">
        New cast members start out marked as {ag.union ? `${ag.union} (pending)` : 'no union'}. On a SAG-AFTRA show, Paperwork warns about non-union performers who'd need a Taft-Hartley report.
        {sag && <> Budget limits, rates and rules change: check <a href={SAG_LINK} target="_blank" rel="noreferrer">SAG-AFTRA's production center</a>.</>}
      </p>

      <div className="toolbar"><h3>Unions in the pickers</h3><span className="spacer" />
        <button onClick={() => edit((l) => { l.push({ id: 'u' + Date.now().toString(36), name: 'New union', group: 'Custom', custom: true }); }, 'Add union')}>＋ Union</button>
        {p.unionOptions?.length ? <button onClick={async () => { if (await askConfirm('Go back to the built-in union list?', { message: 'Your own unions and changes to this list are removed. People keep the union they have.' })) update((d) => { delete d.unionOptions; }, 'Reset unions'); }}>Reset</button> : null}
      </div>
      <p className="muted small"><Hint>{'Untick unions you never work with to keep the pickers short. Locals (like IATSE 600) are suggestions; anyone can type their own.'}</Hint></p>
      {groups.map((g) => (
        <div key={g} className="union-group">
          <span className="settings-group">{g}</span>
          {list.filter((u) => u.group === g).map((u) => {
            const i = list.indexOf(u);
            return (
              <div key={u.id} className="union-row">
                <label className="check"><input type="checkbox" aria-label={`Show ${u.name} in the pickers`} checked={!u.hidden} onChange={(e) => edit((l) => { l[i].hidden = !e.target.checked || undefined; }, e.target.checked ? 'Show union' : 'Hide union')} /></label>
                {u.custom
                  ? <input value={u.name} aria-label="Union name" onChange={(e) => edit((l) => { l[i].name = e.target.value; }, null)} />
                  : <b>{u.name}</b>}
                <input className="grow" value={(u.locals ?? []).join(', ')} placeholder="Locals (comma-separated)" aria-label="Locals"
                  onChange={(e) => edit((l) => { const v = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); l[i].locals = v.length ? v : undefined; }, null)} />
                {u.custom && <input className="w-sm" value={u.group} aria-label="Group" onChange={(e) => edit((l) => { l[i].group = e.target.value || 'Custom'; }, null)} />}
                {u.custom && <button className="icon-btn" aria-label="Remove union" onClick={() => edit((l) => { l.splice(i, 1); }, 'Remove union')}>×</button>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
