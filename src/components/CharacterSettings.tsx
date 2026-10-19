import { useState } from 'react';
import { useProject, useStore } from '../store/project';
import type { CharacterOptions } from '../model/types';
import { newId } from '../model/ids';
import { PROFILE_SECTIONS, SPECIES_PACKS, characterOptions, defaultCharacterOptions } from '../script/characters';
import { canEdit, useSync } from '../sync/state';
import { askConfirm } from './dialogs';
import { SpeciesPacks } from './SpeciesPacks';

// Settings → Character builder: the project's own lists (roles, genders, species), which
// panel sits beside the profile (alignment, archetype or nothing) and which fields it has.
// Saved with the project, so collaborators see the same choices.

export function CharacterSettings() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('characterOptions');
  const o = characterOptions(p);
  const set = (fn: (x: CharacterOptions) => void, label: string | null = 'Character builder settings') =>
    update((dr) => {
      const cur = { ...defaultCharacterOptions(), ...dr.characterOptions };
      fn(cur);
      dr.characterOptions = cur;
    }, label);

  return (
    <div className="char-settings">
      <h3>Character builder</h3>
      <p className="muted small">The lists and fields on every character profile in this project. Collaborators see the same choices.</p>

      <h4>{o.speciesLabel}</h4>
      <label className="field narrow"><span>Call this field</span>
        <input disabled={ro} value={o.speciesLabel} placeholder="Species" onChange={(e) => set((x) => { x.speciesLabel = e.target.value || 'Species'; }, null)} />
      </label>
      <div className="pack-grid">
        {SPECIES_PACKS.map((pk) => (
          <label key={pk.id} className={`pack ${o.speciesPacks.includes(pk.id) ? 'on' : ''}`}>
            <input type="checkbox" disabled={ro} checked={o.speciesPacks.includes(pk.id)} onChange={(e) => set((x) => { x.speciesPacks = e.target.checked ? [...x.speciesPacks, pk.id] : x.speciesPacks.filter((y) => y !== pk.id); })} />
            <span><b>{pk.label}</b><small className="muted">{pk.items.join(', ')}</small></span>
          </label>
        ))}
      </div>
      <SpeciesPacks o={o} set={set} ro={ro} />
      <ListEditor title="Your own species" items={o.customSpecies} ro={ro} placeholder="e.g. Merfolk, Replicant" onChange={(items) => set((x) => { x.customSpecies = items; })} />

      <div className="two-col">
        <ListEditor title="Roles" items={o.roles} ro={ro} placeholder="e.g. Narrator" onChange={(items) => set((x) => { x.roles = items; })} />
        <ListEditor title="Genders" items={o.genders} ro={ro} placeholder="e.g. Genderfluid" onChange={(items) => set((x) => { x.genders = items; })} />
      </div>

      <h4>Beside the profile</h4>
      <div className="seg">
        {([['alignment', 'Alignment grid'], ['archetype', 'Archetypes'], ['none', 'Nothing']] as const).map(([id, label]) => (
          <button key={id} disabled={ro} className={o.compass === id ? 'active' : ''} onClick={() => set((x) => { x.compass = id; })}>{label}</button>
        ))}
      </div>
      <p className="muted small">{o.compass === 'alignment' ? 'The 3×3 good / evil, lawful / chaotic grid from tabletop games.' : o.compass === 'archetype' ? 'Pick one archetype per character from the list below.' : 'No panel; profiles keep everything else.'}</p>
      {o.compass === 'archetype' && <ListEditor title="Archetypes" items={o.archetypes} ro={ro} placeholder="e.g. Trickster" onChange={(items) => set((x) => { x.archetypes = items; })} />}

      <h4>Profile fields</h4>
      <p className="muted small">Untick fields you don't use; add your own to any section. Hidden fields keep what's already written in them.</p>
      <div className="field-sections">
        {PROFILE_SECTIONS.map((sec) => (
          <fieldset key={sec.id}>
            <legend>{sec.title}</legend>
            {sec.fields.map((f) => (
              <label key={f.k} className="check">
                <input type="checkbox" disabled={ro} checked={!o.hiddenFields.includes(f.k)} onChange={(e) => set((x) => { x.hiddenFields = e.target.checked ? x.hiddenFields.filter((k) => k !== f.k) : [...x.hiddenFields, f.k]; })} />
                {f.label}
              </label>
            ))}
            {o.customFields.filter((f) => f.section === sec.id).map((f) => (
              <div key={f.id} className="custom-field">
                <input disabled={ro} value={f.label} onChange={(e) => set((x) => { const c = x.customFields.find((y) => y.id === f.id); if (c) c.label = e.target.value; }, null)} />
                <label className="check small" title="A bigger box for longer text"><input type="checkbox" disabled={ro} checked={!!f.long} onChange={(e) => set((x) => { const c = x.customFields.find((y) => y.id === f.id); if (c) c.long = e.target.checked; })} /> Long</label>
                {!ro && <button className="icon-btn" title="Remove field" onClick={() => set((x) => { x.customFields = x.customFields.filter((y) => y.id !== f.id); })}>×</button>}
              </div>
            ))}
            {!ro && <button className="link small" onClick={() => set((x) => { x.customFields = [...x.customFields, { id: newId(), section: sec.id, label: 'New field' }]; })}>＋ Field</button>}
          </fieldset>
        ))}
      </div>

      {!ro && (
        <button onClick={async () => {
          if (await askConfirm('Reset the Character builder to its defaults?', { message: 'Lists, panel and fields go back to the defaults. Nothing written on profiles is deleted.', confirmLabel: 'Reset' })) {
            update((dr) => { delete dr.characterOptions; }, 'Reset character builder');
          }
        }}>Reset to defaults</button>
      )}
    </div>
  );
}

/** An editable list: add, rename, reorder, remove. */
function ListEditor({ title, items, onChange, ro, placeholder }: { title: string; items: string[]; onChange: (items: string[]) => void; ro: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  const move = (i: number, by: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x);
    onChange(next);
  };
  return (
    <div className="list-editor">
      <h5>{title} <span className="muted small">({items.length})</span></h5>
      <ul>
        {items.map((it, i) => (
          <li key={it + i}>
            <input disabled={ro} defaultValue={it} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it) onChange(items.map((x, j) => (j === i ? v : x))); else e.target.value = it; }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            {!ro && <>
              <button className="icon-btn" aria-label={`Move ${it} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="icon-btn" aria-label={`Move ${it} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="icon-btn" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
            </>}
          </li>
        ))}
      </ul>
      {!ro && (
        <div className="row">
          <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button disabled={!draft.trim()} onClick={add}>Add</button>
        </div>
      )}
    </div>
  );
}
