import { useEffect, useRef, useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import type { CharacterProfile, ContinuityPhoto } from '../model/types';
import { putMedia, useMediaUrl } from '../store/media';
import { prepareImage } from './storyboard/images';
import { readTransfer } from './boards/boardOps';
import { Empty, Modal, toast } from '../components/common';
import { askConfirm } from '../components/dialogs';
import { deletedToast } from '../components/deleted';
import { More } from '../components/More';
import { openActions } from '../components/ActionSheet';
import { download, safeName } from '../io/files';
import {
  ALIGNMENTS, GENDERS, PROFILE_SECTIONS, RACES, ROLES, TRAIT_LISTS, alignmentLabel, characterEntries, newProfile, normName, scenesFor, useCharacterFocus,
} from '../script/characters';

// Character builder: a stripped-down D&D-style sheet per character — race, gender, role,
// alignment, strengths / weaknesses / faults / actions — plus the profile template's sections
// and continuity photos (wardrobe, hair & makeup) tied to scenes.

type TraitKey = (typeof TRAIT_LISTS)[number]['k'];
const DRAG = 'application/x-opengate-continuity';

/** Images from a drop or paste: files, or web images when the site allows copying them. */
async function blobsFrom(dt: DataTransfer): Promise<Blob[]> {
  const c = readTransfer(dt);
  if (c.files.length) return c.files;
  const out: Blob[] = [];
  for (const img of c.images) {
    try {
      const res = await fetch(img.url, { mode: 'cors', credentials: 'omit' });
      const b = await res.blob();
      if (res.ok && b.type.startsWith('image/')) out.push(b);
    } catch { /* blocked */ }
  }
  if (c.images.length && !out.length) toast("That site doesn't allow copying its images. Save the image, then drop the file here.");
  return out;
}

async function store(projectId: string, blobs: Blob[]): Promise<string[]> {
  const ids: string[] = [];
  for (const b of blobs) ids.push(await putMedia(projectId, await prepareImage(b)));
  return ids;
}

export function CharactersTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const focus = useCharacterFocus((s) => s.name);
  const [sel, setSel] = useState<string | null>(focus);
  useEffect(() => { if (focus) { setSel(focus); useCharacterFocus.setState({ name: null }); } }, [focus]);
  const entries = characterEntries(p, d);
  const current = entries.find((e) => e.name === sel) ?? entries[0];

  const ensure = (name: string): CharacterProfile => {
    const existing = useStore.getState().project!.characters.find((c) => c.name === normName(name));
    if (existing) return existing;
    const prof = newProfile(name);
    update((dr) => { dr.characters.push(prof); }, 'Add character profile');
    return prof;
  };
  const addNew = () => {
    let n = 1;
    while (p.characters.some((c) => c.name === `NEW CHARACTER${n > 1 ? ` ${n}` : ''}`)) n++;
    const prof = ensure(`NEW CHARACTER${n > 1 ? ` ${n}` : ''}`);
    setSel(prof.name);
  };

  return (
    <div className="with-side characters-tab">
      <aside className="side" data-panel="Characters" data-panel-pick onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('doc-list')) addNew(); }}>
        <div className="side-head"><b>Characters</b><button className="small" onClick={addNew}>+ Character</button></div>
        <ul className="doc-list char-list">
          {entries.map((e) => (
            <li key={e.name} className={`${current?.name === e.name ? 'active' : ''} ${e.profile ? '' : 'no-profile'}`} onClick={() => setSel(e.name)} title={e.profile ? '' : 'No profile yet — click to start one'}>
              <Thumb id={e.profile?.portraitId} name={e.name} />
              <span className="grow">
                <b>{e.name}</b><br />
                <span className="muted small">{[e.profile?.role, e.actor, `${e.scenes} sc`].filter(Boolean).join(' · ')}</span>
              </span>
              {e.profile?.alignment && <span className="align-chip" title={alignmentLabel(e.profile.alignment)}>{e.profile.alignment}</span>}
            </li>
          ))}
        </ul>
        {!entries.length && <p className="muted small pad">Characters from your script show up here. Double-click to add one by hand.</p>}
      </aside>
      {current
        ? current.profile
          ? <CharacterSheet key={current.profile.id} prof={current.profile} onRenamed={setSel} />
          : (
            <Empty title={current.name}>
              <p className="muted">{current.scenes} scene{current.scenes === 1 ? '' : 's'}{current.lines ? ` · ${current.lines} lines` : ''}{current.actor ? ` · played by ${current.actor}` : ''}</p>
              <button className="primary" onClick={() => ensure(current.name)}>Build this character</button>
            </Empty>
          )
        : <Empty title="No characters yet"><p className="muted">Write or import a script, or add a character by hand.</p><button className="primary" onClick={addNew}>+ Character</button></Empty>}
    </div>
  );
}

function Thumb({ id, name }: { id?: string; name: string }) {
  const url = useMediaUrl(id);
  return <span className="char-thumb">{url ? <img src={url} alt="" /> : name[0]}</span>;
}

function CharacterSheet({ prof, onRenamed }: { prof: CharacterProfile; onRenamed: (n: string) => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [name, setName] = useState(prof.name);
  useEffect(() => setName(prof.name), [prof.name]);
  const set = (fn: (c: CharacterProfile) => void, label: string | null = null) => update((dr) => { const c = dr.characters.find((x) => x.id === prof.id); if (c) fn(c); }, label);
  const scenes = scenesFor(p, d, prof.name);
  const lines = d.characters.find((c) => c.name === prof.name)?.lines ?? 0;
  const cast = p.cast.find((c) => normName(c.characterName) === prof.name);

  const rename = () => {
    const n = normName(name);
    if (!n || n === prof.name) { setName(prof.name); return; }
    if (p.characters.some((c) => c.name === n)) { toast(`${n} already has a profile.`); setName(prof.name); return; }
    set((c) => { c.name = n; }, 'Rename character');
    onRenamed(n);
  };

  const remove = async () => {
    if (!(await askConfirm(`Delete ${prof.name}'s profile?`, { message: 'The character stays in the script; only this sheet and its photos are removed.' }))) return;
    update((dr) => { dr.characters = dr.characters.filter((c) => c.id !== prof.id); }, 'Delete character profile');
    deletedToast(`${prof.name}'s profile`);
  };

  const exportPdf = async () => {
    const { characterPdfAsync } = await import('../pdf/characterPdf');
    const doc = await characterPdfAsync(useStore.getState().project!, d, [prof.id]);
    download(`${safeName(p.title)} - ${safeName(prof.name)}.pdf`, doc.output('blob'), 'application/pdf');
  };

  return (
    <section className="main pad scroll char-sheet">
      <div className="toolbar flat">
        <input className="doc-title" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <span className="spacer" />
        <More label="Character actions">
          <button onClick={() => void exportPdf()}>Export PDF</button>
          <button className="danger-text" onClick={() => void remove()}>Delete</button>
        </More>
      </div>

      <div className="char-top">
        <Portrait prof={prof} set={set} />
        <div className="char-core card">
          <div className="char-stats">
            <span><b>{scenes.length}</b> scenes</span>
            <span><b>{lines}</b> lines</span>
            {scenes.length > 0 && <span>Sc <b>{scenes[0].number}</b>–<b>{scenes[scenes.length - 1].number}</b></span>}
            <span>{cast ? <>Played by <b>{cast.actorName || '—'}</b>{cast.castNumber ? ` (#${cast.castNumber})` : ''}</> : <span className="muted">Not in cast list</span>}</span>
          </div>
          <div className="form-grid tight">
            <label className="field"><span>Race / species</span><input list="char-races" value={prof.race} onChange={(e) => set((c) => { c.race = e.target.value; })} /></label>
            <label className="field"><span>Gender</span><input list="char-genders" value={prof.gender} onChange={(e) => set((c) => { c.gender = e.target.value; })} /></label>
            <label className="field"><span>Role</span><input list="char-roles" value={prof.role} placeholder="Protagonist, mentor…" onChange={(e) => set((c) => { c.role = e.target.value; })} /></label>
            <label className="field"><span>Introvert ↔ Extrovert</span>
              <input type="range" min={0} max={100} value={prof.introExtro ?? 50} onChange={(e) => set((c) => { c.introExtro = Number(e.target.value); })} />
            </label>
          </div>
          <datalist id="char-races">{RACES.map((r) => <option key={r} value={r} />)}</datalist>
          <datalist id="char-genders">{GENDERS.map((r) => <option key={r} value={r} />)}</datalist>
          <datalist id="char-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div className="char-align card">
          <span className="small"><b>Alignment</b> <span className="muted">{alignmentLabel(prof.alignment)}</span></span>
          <div className="align-grid" role="radiogroup" aria-label="Alignment">
            {ALIGNMENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={prof.alignment === a.id} className={prof.alignment === a.id ? 'on' : ''} title={a.label}
                onClick={() => set((c) => { c.alignment = c.alignment === a.id ? undefined : a.id; }, 'Set alignment')}>
                {a.label.replace('True ', '').split(' ').map((w) => <span key={w}>{w}</span>)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="char-traits">
        {TRAIT_LISTS.map((t) => <TraitList key={t.k} label={t.label} hint={t.hint} items={prof[t.k as TraitKey]} onChange={(items, label) => set((c) => { c[t.k as TraitKey] = items; }, label)} />)}
      </div>

      {PROFILE_SECTIONS.map((sec) => (
        <details key={sec.id} className="char-section" open>
          <summary><h4>{sec.title}</h4></summary>
          <div className="form-grid">
            {sec.fields.map((f) => (
              <label key={f.k} className={`field ${f.long ? 'wide' : ''}`}><span>{f.label}</span>
                {f.long
                  ? <textarea rows={2} value={prof.info[f.k] ?? ''} onChange={(e) => set((c) => { c.info[f.k] = e.target.value; })} />
                  : <input value={prof.info[f.k] ?? ''} onChange={(e) => set((c) => { c.info[f.k] = e.target.value; })} />}
              </label>
            ))}
          </div>
        </details>
      ))}

      <h4>Continuity <span className="muted small">— drop photos on a strip, or double-click it to choose files. Drag photos between looks.</span></h4>
      <ContinuityStrip prof={prof} kind="wardrobe" title="Wardrobe" set={set} />
      <ContinuityStrip prof={prof} kind="hair" title="Hair & Makeup" set={set} />
    </section>
  );
}

type SetFn = (fn: (c: CharacterProfile) => void, label?: string | null) => void;

function Portrait({ prof, set }: { prof: CharacterProfile; set: SetFn }) {
  const p = useProject();
  const url = useMediaUrl(prof.portraitId);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const put = async (blobs: Blob[]) => {
    if (!blobs.length) return;
    try { const [id] = await store(p.id, blobs.slice(0, 1)); set((c) => { c.portraitId = id; }, 'Set portrait'); } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className={`char-portrait ${over ? 'drop-hover' : ''}`} title="Drop a photo, or click to choose one"
      onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void blobsFrom(e.dataTransfer).then(put); }}>
      {url ? <img src={url} alt="" /> : <span className="muted small">+ Portrait</span>}
      {url && <button className="icon-btn" title="Remove portrait" onClick={(e) => { e.stopPropagation(); set((c) => { delete c.portraitId; }, 'Remove portrait'); }}>×</button>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { void put([...(e.target.files ?? [])]); e.target.value = ''; }} />
    </div>
  );
}

function TraitList({ label, hint, items, onChange }: { label: string; hint: string; items: string[]; onChange: (items: string[], label: string | null) => void }) {
  const [text, setText] = useState('');
  const [drag, setDrag] = useState<number | null>(null);
  const add = () => {
    const parts = text.split(/[,;\n]/).map((s) => s.trim()).filter((s) => s && !items.includes(s));
    if (parts.length) onChange([...items, ...parts], `Add to ${label}`);
    setText('');
  };
  return (
    <div className="card trait-list">
      <b className="small">{label}</b>
      <div className="chips">
        {items.map((it, i) => (
          <span key={it} className="chip" draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (drag === null || drag === i) return; const next = [...items]; const [m] = next.splice(drag, 1); next.splice(i, 0, m); onChange(next, `Reorder ${label}`); setDrag(null); }}>
            {it}<button className="icon-btn" title="Remove" onClick={() => onChange(items.filter((x) => x !== it), `Remove from ${label}`)}>×</button>
          </span>
        ))}
      </div>
      <input placeholder={`${hint} — Enter to add`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}

function ContinuityStrip({ prof, kind, title, set }: { prof: CharacterProfile; kind: ContinuityPhoto['kind']; title: string; set: SetFn }) {
  const p = useProject();
  const d = useDerived();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const photos = prof.continuity.filter((x) => x.kind === kind);
  const looks = [...new Set(photos.map((x) => x.look ?? ''))];
  if (!looks.includes('')) looks.push('');
  const allLooks = [...new Set(prof.continuity.map((x) => x.look).filter(Boolean) as string[])];
  const scenes = scenesFor(p, d, prof.name);
  const sceneNum = (id: string) => d.sceneById.get(id)?.number ?? '?';

  const addPhotos = async (blobs: Blob[], look = '') => {
    if (!blobs.length) return;
    try {
      const ids = await store(p.id, blobs);
      set((c) => { for (const imageId of ids) c.continuity.push({ id: newId(), kind, imageId, caption: '', ...(look ? { look } : {}), sceneIds: [] }); }, `Add ${title.toLowerCase()} photo${ids.length > 1 ? 's' : ''}`);
    } catch (e) { toast((e as Error).message); }
  };
  const move = (id: string, look: string, beforeId?: string) => set((c) => {
    const i = c.continuity.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [ph] = c.continuity.splice(i, 1);
    ph.kind = kind;
    if (look) ph.look = look; else delete ph.look;
    const at = beforeId ? c.continuity.findIndex((x) => x.id === beforeId) : -1;
    c.continuity.splice(at < 0 ? c.continuity.length : at, 0, ph);
  }, 'Move continuity photo');
  const edit = (id: string, fn: (x: ContinuityPhoto) => void, label: string | null = null) => set((c) => { const x = c.continuity.find((y) => y.id === id); if (x) fn(x); }, label);
  const remove = (id: string) => { set((c) => { c.continuity = c.continuity.filter((x) => x.id !== id); }, 'Remove continuity photo'); deletedToast('photo'); };

  const onDrop = (e: React.DragEvent, look: string, beforeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const moved = e.dataTransfer.getData(DRAG);
    if (moved) { if (moved !== beforeId) move(moved, look, beforeId); return; }
    void blobsFrom(e.dataTransfer).then((b) => addPhotos(b, look));
  };

  return (
    <div className="continuity" onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('.continuity-photo, input, select, button')) return; input.current?.click(); }}
      onPaste={(e) => { const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); void addPhotos(files); } }}>
      <div className="continuity-head">
        <b>{title}</b><span className="muted small">{photos.length} photo{photos.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <button className="small" onClick={() => input.current?.click()}>+ Photos</button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </div>
      {looks.map((look) => {
        const group = photos.filter((x) => (x.look ?? '') === look);
        if (!group.length && look && !over) return null;
        return (
          <div key={look || '_'} className={`look-group ${over === look ? 'drop-hover' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(look); }} onDragLeave={() => setOver(null)} onDrop={(e) => onDrop(e, look)}>
            <span className="look-name small">{look || (group.length ? 'No look' : 'Drop photos here')}</span>
            <div className="photo-row">
              {group.map((ph) => (
                <ContinuityCard key={ph.id} ph={ph} looks={allLooks} scenes={scenes.map((s) => ({ id: s.id, label: `${s.number} ${s.heading}` }))} sceneNum={sceneNum}
                  onOpen={() => setView(ph.imageId)} onEdit={(fn, label) => edit(ph.id, fn, label)} onRemove={() => remove(ph.id)}
                  onDrop={(e) => onDrop(e, look, ph.id)} />
              ))}
            </div>
          </div>
        );
      })}
      {view && <Lightbox id={view} onClose={() => setView(null)} />}
    </div>
  );
}

function ContinuityCard({ ph, looks, scenes, sceneNum, onOpen, onEdit, onRemove, onDrop }: {
  ph: ContinuityPhoto; looks: string[]; scenes: { id: string; label: string }[]; sceneNum: (id: string) => string;
  onOpen: () => void; onEdit: (fn: (x: ContinuityPhoto) => void, label?: string | null) => void; onRemove: () => void; onDrop: (e: React.DragEvent) => void;
}) {
  const url = useMediaUrl(ph.imageId);
  const free = scenes.filter((s) => !ph.sceneIds.includes(s.id));
  return (
    <div className="continuity-photo card" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG, ph.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      onContextMenu={(e) => { e.preventDefault(); openActions('Photo', [
        { label: 'View large', run: onOpen },
        { label: 'Move to look…', items: [...looks, ''].map((l) => ({ label: l || 'No look', current: (ph.look ?? '') === l, run: () => onEdit((x) => { if (l) x.look = l; else delete x.look; }, 'Set look') })) },
        { label: 'Remove photo', danger: true, run: onRemove },
      ], { x: e.clientX, y: e.clientY }); }}>
      <div className="photo" onClick={onOpen}>{url && <img src={url} alt="" />}<button className="icon-btn" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button></div>
      <input placeholder="Caption" value={ph.caption} onChange={(e) => onEdit((x) => { x.caption = e.target.value; })} />
      <LookInput value={ph.look ?? ''} onCommit={(v) => onEdit((x) => { if (v) x.look = v; else delete x.look; }, 'Set look')} />
      <datalist id="char-looks">{looks.map((l) => <option key={l} value={l} />)}</datalist>
      <div className="chips">
        {ph.sceneIds.map((id) => <span key={id} className="chip">Sc {sceneNum(id)}<button className="icon-btn" title="Remove scene" onClick={() => onEdit((x) => { x.sceneIds = x.sceneIds.filter((y) => y !== id); }, 'Untie scene')}>×</button></span>)}
        {free.length > 0 && (
          <select value="" onChange={(e) => { const v = e.target.value; if (v === '*') onEdit((x) => { x.sceneIds = scenes.map((s) => s.id); }, 'Tie all scenes'); else if (v) onEdit((x) => { x.sceneIds.push(v); }, 'Tie scene'); }}>
            <option value="">+ Scene</option>
            {free.length > 1 && <option value="*">All their scenes</option>}
            {free.map((s) => <option key={s.id} value={s.id}>{s.label.slice(0, 50)}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

/** The look name is saved when you leave the field: saving moves the photo into that look's group. */
function LookInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { const t = v.trim(); if (t !== value) onCommit(t); };
  return <input placeholder="Look (e.g. Look 2 — torn jacket)" list="char-looks" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function Lightbox({ id, onClose }: { id: string; onClose: () => void }) {
  const url = useMediaUrl(id);
  return <Modal title="Continuity photo" onClose={onClose} wide>{url && <img className="lightbox-img" src={url} alt="" />}</Modal>;
}
