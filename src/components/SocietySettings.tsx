import { useProject, useStore } from '../store/project';
import type { SocietyOption } from '../model/types';
import { SOCIETIES, societyOptions } from '../paperwork/societies';
import { askConfirm } from './dialogs';
import { Hint } from './Hint';
import { RefLink } from '../tabs/ReferenceTab';

/** Settings → Unions & Societies: which societies appear, and how their letters are written in credits. */
export function SocietySettings() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const list = societyOptions(p, true);
  const edit = (fn: (l: SocietyOption[]) => void, label: string | null = 'Edit societies') => update((d) => {
    d.societyOptions = d.societyOptions?.length ? d.societyOptions : SOCIETIES.map((s) => ({ ...s }));
    fn(d.societyOptions);
  }, label);
  const crafts = [...new Set(list.map((s) => s.craft))];
  return (
    <div className="union-settings">
      <div className="toolbar"><h3>Honorary societies <RefLink page="guild-unions-vs-societies" /></h3><span className="spacer" />
        <button onClick={() => edit((l) => { l.push({ id: 's' + Date.now().toString(36), abbr: 'NEW', name: 'New society', craft: 'Other', letters: 'NEW', custom: true }); }, 'Add society')}>＋ Society</button>
        {p.societyOptions?.length ? <button onClick={async () => { if (await askConfirm('Go back to the built-in society list?', { message: 'Your own societies and letter styles are removed. People keep the societies they have.' })) update((d) => { delete d.societyOptions; }, 'Reset societies'); }}>Reset</button> : null}
      </div>
      <p className="muted small"><Hint>{'Letters go after a name in End credits and on call sheets only for people ticked as members. Change a style if the society writes its letters differently (with or without periods). The p.g.a. mark is added only when certified for this production.'}</Hint></p>
      {crafts.map((c) => (
        <div key={c} className="union-group">
          <span className="settings-group">{c}</span>
          {list.filter((s) => s.craft === c).map((s) => {
            const i = list.indexOf(s);
            return (
              <div key={s.id} className="union-row">
                <label className="check"><input type="checkbox" aria-label={`Show ${s.abbr} in the pickers`} checked={!s.hidden} onChange={(e) => edit((l) => { l[i].hidden = !e.target.checked || undefined; }, e.target.checked ? 'Show society' : 'Hide society')} /></label>
                {s.custom ? <input className="w-sm" value={s.abbr} aria-label="Short name" onChange={(e) => edit((l) => { l[i].abbr = e.target.value; }, null)} /> : <b title={s.name}>{s.abbr}</b>}
                {s.custom && <input className="grow" value={s.name} aria-label="Full name" onChange={(e) => edit((l) => { l[i].name = e.target.value; }, null)} />}
                {!s.custom && <span className="muted small grow">{s.name}</span>}
                <label className="small">Letters <input className="w-sm" value={s.letters} aria-label={`Letters for ${s.abbr}`} onChange={(e) => edit((l) => { l[i].letters = e.target.value; }, null)} /></label>
                {s.custom && <input className="w-sm" value={s.craft} aria-label="Craft" onChange={(e) => edit((l) => { l[i].craft = e.target.value || 'Other'; }, null)} />}
                {s.custom && <button className="icon-btn" aria-label="Remove society" onClick={() => edit((l) => { l.splice(i, 1); }, 'Remove society')}>×</button>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
