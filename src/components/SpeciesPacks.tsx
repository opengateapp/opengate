import { useRef, useState } from 'react';
import type { CharacterOptions, SpeciesPack } from '../model/types';
import { newId } from '../model/ids';
import { SPECIES_PACKS } from '../script/characters';
import { PACK_EXT, exportPack, forgetPack, mergePacks, parsePackFile, rememberPack, usePackLibrary } from '../script/speciesPacks';
import { download, safeName } from '../io/files';
import { displayName } from '../sync/engine';
import { Modal, toast } from './common';
import { askConfirm } from './dialogs';

// Settings → Character builder → Your packs: make, edit, switch on, export and import custom
// species packs. A pack switched on is stored in the project; every pack is also kept on this device.

type Set = (fn: (x: CharacterOptions) => void, label?: string | null) => void;

export function SpeciesPacks({ o, set, ro }: { o: CharacterOptions; set: Set; ro: boolean }) {
  const library = usePackLibrary((s) => s.packs);
  const [editing, setEditing] = useState<SpeciesPack | null>(null);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const project = o.customPacks ?? [];
  const elsewhere = library.filter((x) => !project.some((y) => y.id === x.id));

  const save = (p: SpeciesPack) => {
    rememberPack(p);
    set((x) => {
      const list = x.customPacks ?? [];
      x.customPacks = list.some((y) => y.id === p.id) ? list.map((y) => (y.id === p.id ? p : y)) : [...list, p];
      if (!x.speciesPacks.includes(p.id)) x.speciesPacks = [...x.speciesPacks, p.id];
    }, 'Save species pack');
  };
  const addToProject = (p: SpeciesPack) => set((x) => { x.customPacks = [...(x.customPacks ?? []), p]; x.speciesPacks = [...x.speciesPacks, p.id]; }, `Add “${p.name}”`);

  const importText = (text: string) => {
    try {
      const incoming = parsePackFile(text);
      const { added } = mergePacks([...project, ...elsewhere], incoming);
      if (!added.length) { toast('You already have that pack.'); return; }
      if (!ro) for (const p of added) save(p); else added.forEach(rememberPack);
      toast(added.length === 1 ? `Added “${added[0].name}” (${added[0].entries.length} species)` : `Added ${added.length} packs`);
    } catch (e) { toast((e as Error).message); }
  };
  const importFiles = async (files: File[]) => { for (const f of files) importText(await f.text()); };

  return (
    <div className={`species-packs ${over ? 'drop-hover' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void importFiles([...e.dataTransfer.files]); }}>
      <h5>Your packs <span className="muted small">— build your own from any pack, then share it as a file</span></h5>
      <div className="pack-grid">
        {project.map((pk) => (
          <div key={pk.id} className={`pack custom ${o.speciesPacks.includes(pk.id) ? 'on' : ''}`}>
            <input type="checkbox" disabled={ro} aria-label={`Use ${pk.name}`} checked={o.speciesPacks.includes(pk.id)}
              onChange={(e) => set((x) => { x.speciesPacks = e.target.checked ? [...x.speciesPacks, pk.id] : x.speciesPacks.filter((y) => y !== pk.id); })} />
            <span className="grow" onClick={() => !ro && setEditing(pk)} role="button" tabIndex={0}>
              <b>{pk.name}</b>
              <small className="muted">{pk.entries.map((e) => e.name).join(', ') || 'Empty'}</small>
              {pk.author && <small className="muted">by {pk.author}</small>}
            </span>
            <div className="pack-actions">
              {!ro && <button className="small" onClick={() => setEditing(pk)}>Edit</button>}
              <button className="small" onClick={() => download(`${safeName(pk.name)}${PACK_EXT}`, exportPack(pk), 'application/json')}>Export</button>
              {!ro && <button className="small danger-text" onClick={async () => {
                if (await askConfirm(`Remove “${pk.name}” from this project?`, { message: 'Profiles keep their species. The pack stays in your library on this device.', confirmLabel: 'Remove' })) {
                  set((x) => { x.customPacks = (x.customPacks ?? []).filter((y) => y.id !== pk.id); x.speciesPacks = x.speciesPacks.filter((y) => y !== pk.id); }, 'Remove species pack');
                }
              }}>Remove</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="row wrap">
        {!ro && <button onClick={() => setEditing({ id: newId(), name: 'My pack', author: displayName() !== 'Guest' ? displayName() : undefined, entries: [] })}>＋ New pack</button>}
        <button onClick={() => file.current?.click()}>Import pack…</button>
        <input ref={file} type="file" accept={`${PACK_EXT},application/json,.json`} multiple hidden onChange={(e) => { void importFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <span className="muted small">or drop an {PACK_EXT} file here</span>
      </div>
      {elsewhere.length > 0 && (
        <details className="pack-library">
          <summary className="small">From your library on this device ({elsewhere.length})</summary>
          <ul className="plain-list">
            {elsewhere.map((pk) => (
              <li key={pk.id} className="row">
                <span className="grow"><b>{pk.name}</b> <span className="muted small">{pk.entries.length} species</span></span>
                {!ro && <button className="small" onClick={() => addToProject(pk)}>Add to project</button>}
                <button className="small danger-text" onClick={() => forgetPack(pk.id)} title="Forget on this device">×</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {editing && <PackEditor pack={editing} o={o} library={library} onClose={() => setEditing(null)} onSave={(p) => { save(p); setEditing(null); }} />}
    </div>
  );
}

function PackEditor({ pack, o, library, onClose, onSave }: { pack: SpeciesPack; o: CharacterOptions; library: SpeciesPack[]; onClose: () => void; onSave: (p: SpeciesPack) => void }) {
  const [p, setP] = useState<SpeciesPack>(pack);
  const [text, setText] = useState('');
  const has = (n: string) => p.entries.some((e) => e.name.toLowerCase() === n.toLowerCase());
  const add = (name: string, note?: string) => {
    const n = name.trim();
    if (!n || has(n)) return;
    setP((x) => ({ ...x, entries: [...x.entries, note ? { name: n, note } : { name: n }] }));
  };
  const toggle = (name: string, note?: string) => (has(name) ? setP((x) => ({ ...x, entries: x.entries.filter((e) => e.name.toLowerCase() !== name.toLowerCase()) })) : add(name, note));
  const move = (i: number, by: number) => setP((x) => { const e = [...x.entries]; const [m] = e.splice(i, 1); e.splice(i + by, 0, m); return { ...x, entries: e }; });

  // Everything you can pick from: built-in packs, your own species, other custom packs.
  const sources: { id: string; label: string; items: { name: string; note?: string }[] }[] = [
    ...SPECIES_PACKS.map((s) => ({ id: s.id, label: s.label, items: s.items.map((name) => ({ name })) })),
    ...(o.customSpecies.length ? [{ id: 'own', label: 'Your own species', items: o.customSpecies.map((name) => ({ name })) }] : []),
    ...[...(o.customPacks ?? []), ...library].filter((x, i, all) => x.id !== p.id && all.findIndex((y) => y.id === x.id) === i).map((x) => ({ id: x.id, label: x.name, items: x.entries })),
  ];

  return (
    <Modal title={pack.entries.length || pack.name !== 'My pack' ? `Edit “${pack.name}”` : 'New species pack'} onClose={onClose} wide
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!p.name.trim()} onClick={() => onSave({ ...p, name: p.name.trim() })}>Save pack</button></>}>
      <div className="form-grid tight">
        <label className="field"><span>Pack name</span><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="field"><span>Made by (shown when shared)</span><input value={p.author ?? ''} onChange={(e) => setP({ ...p, author: e.target.value || undefined })} /></label>
      </div>
      <div className="pack-editor">
        <section>
          <h5>In this pack <span className="muted small">({p.entries.length})</span></h5>
          <ul className="pack-entries">
            {p.entries.map((e, i) => (
              <li key={e.name}>
                <input value={e.name} aria-label="Species" onChange={(ev) => setP((x) => ({ ...x, entries: x.entries.map((y, j) => (j === i ? { ...y, name: ev.target.value } : y)) }))} />
                <input value={e.note ?? ''} placeholder="Note (optional)" aria-label="Note" onChange={(ev) => setP((x) => ({ ...x, entries: x.entries.map((y, j) => (j === i ? { name: y.name, ...(ev.target.value ? { note: ev.target.value } : {}) } : y)) }))} />
                <button className="icon-btn" aria-label={`Move ${e.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="icon-btn" aria-label={`Move ${e.name} down`} disabled={i === p.entries.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="icon-btn" aria-label={`Remove ${e.name}`} onClick={() => setP((x) => ({ ...x, entries: x.entries.filter((_, j) => j !== i) }))}>×</button>
              </li>
            ))}
          </ul>
          {!p.entries.length && <p className="muted small">Tap species on the right to add them, or type new ones below.</p>}
          <div className="row">
            <input value={text} placeholder="Type a species, Enter to add (commas for several)" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { text.split(',').forEach((t) => add(t)); setText(''); } }} />
            <button disabled={!text.trim()} onClick={() => { text.split(',').forEach((t) => add(t)); setText(''); }}>Add</button>
          </div>
        </section>
        <section>
          <h5>Pick from</h5>
          {sources.map((src) => (
            <div key={src.id} className="pick-source">
              <div className="row"><b className="small grow">{src.label}</b>
                <button className="link small" onClick={() => src.items.forEach((it) => add(it.name, it.note))}>Add all</button>
              </div>
              <div className="chips">
                {src.items.map((it) => (
                  <button key={it.name} className={`chip pick ${has(it.name) ? 'on' : ''}`} title={it.note} aria-pressed={has(it.name)} onClick={() => toggle(it.name, it.note)}>
                    {has(it.name) ? '✓ ' : '+ '}{it.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </Modal>
  );
}
