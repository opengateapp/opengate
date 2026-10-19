import { useEffect, useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import { openCharacter } from '../script/characters';
import { COLOR_SLOT_LABELS, DEFAULT_STRIP_COLORS } from '../model/defaults';
import type { ColorSlot } from '../model/types';
import { formatDate } from '../model/dates';
import { Field } from '../components/common';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { PhoneLayoutSettings } from '../ui/PhoneLayoutSettings';
import { CharacterSettings } from '../components/CharacterSettings';
import { AccessibilityPrefs, DataPrefs, FormatPrefs, ProfilePrefs, ShortcutsPrefs } from '../components/AppPreferences';

type Section = 'production' | 'cast' | 'locations' | 'crew' | 'categories' | 'colors' | 'characters' | 'appearance' | 'phone' | 'formats' | 'profile' | 'access' | 'data' | 'shortcuts';
const GROUPS: { label: string; hint: string; items: Section[] }[] = [
  { label: 'This project', hint: 'Saved in the project and shared with collaborators', items: ['production', 'cast', 'locations', 'crew', 'categories', 'colors', 'characters'] },
  { label: 'This device', hint: 'Only on this device, for you', items: ['appearance', 'formats', 'profile', 'access', 'phone', 'data', 'shortcuts'] },
];
const LABELS: Record<Section, string> = {
  production: 'Production', cast: 'Cast', locations: 'Locations', crew: 'Crew', categories: 'Breakdown categories', colors: 'Strip colors', characters: 'Character builder',
  appearance: 'Appearance', formats: 'Dates & units', profile: 'You & sharing', access: 'Accessibility', phone: 'Phone layout', data: 'Data & backups', shortcuts: 'Keyboard shortcuts',
};

/** Production Setup (after CineSched's ProductionSetupSheet): company, cast roster, locations, crew, colors, categories. */
export function SetupTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [section, setSection] = useState<Section>('production');
  // The phone drawer's "Customize tabs…" opens the Phone layout panel.
  useEffect(() => {
    const go = () => setSection('phone');
    window.addEventListener('opengate:phone-layout', go);
    return () => window.removeEventListener('opengate:phone-layout', go);
  }, []);

  const rosterNames = new Set(p.cast.map((c) => c.characterName));
  const missingCast = d.characters.filter((c) => !rosterNames.has(c.name));
  const knownSets = new Set(p.locations.map((l) => l.setName));
  const missingSets = d.sets.filter((s) => !knownSets.has(s.name));

  return (
    <div className="setup-tab with-side">
      <aside className="side">
        {GROUPS.map((g) => [
          <span key={g.label} className="settings-group" title={g.hint}>{g.label}</span>,
          ...g.items.map((s) => (
            <button key={s} className={`side-link ${section === s ? 'active' : ''}`} onClick={(e) => { setSection(s); e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}>
              {LABELS[s]}
            </button>
          )),
        ])}
      </aside>
      <section className="main pad scroll">
        {section === 'appearance' && <AppearanceSettings />}
        {section === 'phone' && <PhoneLayoutSettings />}
        {section === 'characters' && <CharacterSettings />}
        {section === 'formats' && <FormatPrefs />}
        {section === 'profile' && <ProfilePrefs />}
        {section === 'access' && <AccessibilityPrefs />}
        {section === 'data' && <DataPrefs />}
        {section === 'shortcuts' && <ShortcutsPrefs />}
        {section === 'production' && (
          <div className="form-grid">
            {(['company', 'director', 'producer', 'ad', 'contactPhone'] as const).map((k) => (
              <Field key={k} label={{ company: 'Production company', director: 'Director', producer: 'Producer', ad: '1st AD', contactPhone: 'Production phone' }[k]}>
                <input value={p.production[k]} onChange={(e) => update((dr) => { dr.production[k] = e.target.value; }, null)} />
              </Field>
            ))}
            <Field label="Default crew call"><input type="time" value={p.production.defaultCall} onChange={(e) => update((dr) => { dr.production.defaultCall = e.target.value; }, null)} /></Field>
            <Field label="Default lunch"><input type="time" value={p.production.defaultLunch} onChange={(e) => update((dr) => { dr.production.defaultLunch = e.target.value; }, null)} /></Field>
            <Field label="Shooting time per ⅛ page (minutes)"><input type="number" min={1} max={120} value={p.production.minutesPerEighth ?? 15} onChange={(e) => update((dr) => { dr.production.minutesPerEighth = Math.max(1, Number(e.target.value) || 15); }, 'Minutes per eighth')} /></Field>
            <Field label="Currency"><select value={p.budget.currency} onChange={(e) => update((dr) => { dr.budget.currency = e.target.value; }, 'Currency')}>{['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD', 'JPY', 'INR', 'MXN', 'BRL', 'ZAR', 'SEK', 'NOK', 'DKK', 'CHF'].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Contingency (%)"><input type="number" min={0} max={50} value={p.budget.contingencyPct} onChange={(e) => update((dr) => { dr.budget.contingencyPct = Math.max(0, Number(e.target.value) || 0); }, 'Contingency')} /></Field>
            <p className="muted small wide">Shared with everyone on this project. Scene time estimates use the minutes per eighth ({(p.production.minutesPerEighth ?? 15) * 8 / 60} h per page) unless a scene has its own estimate.</p>
          </div>
        )}

        {section === 'cast' && (
          <>
            <div className="toolbar">
              <h3>Cast roster</h3>
              <span className="spacer" />
              {missingCast.length > 0 && <button onClick={() => update((dr) => {
                let n = Math.max(0, ...dr.cast.map((c) => c.castNumber));
                for (const c of missingCast) dr.cast.push({ id: newId(), castNumber: ++n, characterName: c.name, actorName: '', unavailable: [] });
              }, 'Add characters to roster')}>Add {missingCast.length} character{missingCast.length > 1 ? 's' : ''} from script</button>}
              <button onClick={() => update((dr) => { dr.cast.push({ id: newId(), castNumber: Math.max(0, ...dr.cast.map((c) => c.castNumber)) + 1, characterName: 'NEW CHARACTER', actorName: '', unavailable: [] }); }, 'Add cast member')}>+ Cast member</button>
            </div>
            <p className="muted small">Cast numbers appear on strips, call sheets and Day Out of Days. Unavailable dates are flagged as conflicts on the stripboard and calendar.</p>
            <table className="table cards-on-phone">
              <thead><tr><th>#</th><th>Character</th><th>Actor</th><th>Phone</th><th>Email</th><th>Scenes</th><th>Unavailable</th><th /></tr></thead>
              <tbody>
                {[...p.cast].sort((a, b) => a.castNumber - b.castNumber).map((c) => {
                  const set = (fn: (x: typeof c) => void, label: string | null = null) => update((dr) => { fn(dr.cast.find((x) => x.id === c.id)!); }, label);
                  const inScript = d.characters.find((x) => x.name === c.characterName);
                  return (
                    <tr key={c.id}>
                      <td><input className="w-xs" type="number" value={c.castNumber} onChange={(e) => set((x) => { x.castNumber = Number(e.target.value); })} /></td>
                      <td><input value={c.characterName} onChange={(e) => set((x) => { x.characterName = e.target.value.toUpperCase(); })} /> <button className="small" title="Open this character's profile" onClick={() => openCharacter(c.characterName)}>Profile →</button></td>
                      <td><input value={c.actorName} onChange={(e) => set((x) => { x.actorName = e.target.value; })} /></td>
                      <td><input value={c.phone ?? ''} onChange={(e) => set((x) => { x.phone = e.target.value; })} /></td>
                      <td><input value={c.email ?? ''} onChange={(e) => set((x) => { x.email = e.target.value; })} /></td>
                      <td className="muted small">{inScript ? inScript.sceneIds.length : <span className="warn">not in script</span>}</td>
                      <td>
                        {c.unavailable.map((r, i) => (
                          <span key={i} className="chip">{formatDate(r.start)}{r.end !== r.start ? `–${formatDate(r.end)}` : ''}
                            <button className="icon-btn" onClick={() => set((x) => { x.unavailable.splice(i, 1); }, 'Remove unavailable dates')}>×</button></span>
                        ))}
                        <UnavailableAdder onAdd={(start, end) => set((x) => { x.unavailable.push({ start, end }); }, 'Add unavailable dates')} />
                      </td>
                      <td><button className="icon-btn" onClick={() => update((dr) => { dr.cast = dr.cast.filter((x) => x.id !== c.id); }, 'Remove cast member')}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {section === 'locations' && (
          <>
            <div className="toolbar">
              <h3>Locations</h3>
              <span className="spacer" />
              {missingSets.length > 0 && <button onClick={() => update((dr) => { for (const s of missingSets) dr.locations.push({ id: newId(), setName: s.name, realName: '', address: '' }); }, 'Add sets')}>Add {missingSets.length} set{missingSets.length > 1 ? 's' : ''} from script</button>}
              <button onClick={() => update((dr) => { dr.locations.push({ id: newId(), setName: '', realName: '', address: '' }); }, 'Add location')}>+ Location</button>
            </div>
            <p className="muted small">Each script set (from scene headings) maps to a real shooting location and address for call sheets.</p>
            <table className="table cards-on-phone">
              <thead><tr><th>Script set</th><th>Real location</th><th>Address</th><th>Scenes</th><th /></tr></thead>
              <tbody>
                {p.locations.map((l) => {
                  const set = (fn: (x: typeof l) => void) => update((dr) => { fn(dr.locations.find((x) => x.id === l.id)!); }, null);
                  return (
                    <tr key={l.id}>
                      <td><input list="sets" value={l.setName} onChange={(e) => set((x) => { x.setName = e.target.value.toUpperCase(); })} /></td>
                      <td><input value={l.realName} onChange={(e) => set((x) => { x.realName = e.target.value; })} /></td>
                      <td><input value={l.address} onChange={(e) => set((x) => { x.address = e.target.value; })} /></td>
                      <td className="muted small">{d.sets.find((s) => s.name === l.setName)?.sceneIds.length ?? 0}</td>
                      <td><button className="icon-btn" onClick={() => update((dr) => { dr.locations = dr.locations.filter((x) => x.id !== l.id); }, 'Remove location')}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="sets">{d.sets.map((s) => <option key={s.name} value={s.name} />)}</datalist>
          </>
        )}

        {section === 'crew' && (
          <>
            <div className="toolbar"><h3>Crew</h3><span className="spacer" /><button onClick={() => update((dr) => { dr.crew.push({ id: newId(), name: '', role: '', dailyDefault: true }); }, 'Add crew')}>+ Crew member</button></div>
            <table className="table cards-on-phone">
              <thead><tr><th>Role</th><th>Name</th><th>Phone</th><th>On every call sheet</th><th /></tr></thead>
              <tbody>
                {p.crew.map((c) => {
                  const set = (fn: (x: typeof c) => void) => update((dr) => { fn(dr.crew.find((x) => x.id === c.id)!); }, null);
                  return (
                    <tr key={c.id}>
                      <td><input value={c.role} onChange={(e) => set((x) => { x.role = e.target.value; })} /></td>
                      <td><input value={c.name} onChange={(e) => set((x) => { x.name = e.target.value; })} /></td>
                      <td><input value={c.phone ?? ''} onChange={(e) => set((x) => { x.phone = e.target.value; })} /></td>
                      <td><input type="checkbox" checked={!!c.dailyDefault} onChange={(e) => set((x) => { x.dailyDefault = e.target.checked; })} /></td>
                      <td><button className="icon-btn" onClick={() => update((dr) => { dr.crew = dr.crew.filter((x) => x.id !== c.id); }, 'Remove crew')}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {section === 'categories' && (
          <>
            <div className="toolbar"><h3>Breakdown categories</h3><span className="spacer" /><button onClick={() => update((dr) => { dr.categories.push({ id: 'c' + newId().slice(0, 8), name: 'New category', color: '#64748b' }); }, 'Add category')}>+ Category</button></div>
            <table className="table cards-on-phone">
              <tbody>
                {p.categories.map((c, i) => (
                  <tr key={c.id}>
                    <td className="muted small">{i < 9 ? `Alt+${i + 1}` : ''}</td>
                    <td><input type="color" value={c.color} onChange={(e) => update((dr) => { dr.categories[i].color = e.target.value; }, null)} /></td>
                    <td><input value={c.name} onChange={(e) => update((dr) => { dr.categories[i].name = e.target.value; }, null)} /></td>
                    <td className="muted small">{p.elements.filter((e) => e.categoryId === c.id).length} elements</td>
                    <td>
                      <button className="icon-btn" disabled={i === 0} onClick={() => update((dr) => { const [x] = dr.categories.splice(i, 1); dr.categories.splice(i - 1, 0, x); }, 'Reorder')}>↑</button>
                      {!c.builtIn && <button className="icon-btn" disabled={p.elements.some((e) => e.categoryId === c.id)} title="Only empty categories can be removed" onClick={() => update((dr) => { dr.categories.splice(i, 1); }, 'Remove category')}>×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {section === 'colors' && (
          <>
            <div className="toolbar"><h3>Strip colors</h3><span className="spacer" /><button onClick={() => update((dr) => { dr.schedule.colors = {}; }, 'Reset colors')}>Reset to defaults</button></div>
            <p className="muted small">Used on the stripboard, calendar and PDF exports.</p>
            <div className="color-grid">
              {(Object.keys(COLOR_SLOT_LABELS) as ColorSlot[]).map((k) => (
                <label key={k} className="color-row">
                  <input type="color" value={p.schedule.colors[k] ?? DEFAULT_STRIP_COLORS[k]} onChange={(e) => update((dr) => { dr.schedule.colors[k] = e.target.value; }, null)} />
                  <span>{COLOR_SLOT_LABELS[k]}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function UnavailableAdder({ onAdd }: { onAdd: (start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  if (!open) return <button className="small" onClick={() => setOpen(true)}>+ dates</button>;
  return (
    <span className="row">
      <input type="date" value={a} onChange={(e) => { setA(e.target.value); if (!b) setB(e.target.value); }} />
      <input type="date" value={b} min={a} onChange={(e) => setB(e.target.value)} />
      <button className="small" disabled={!a} onClick={() => { onAdd(a, b || a); setOpen(false); setA(''); setB(''); }}>Add</button>
    </span>
  );
}
