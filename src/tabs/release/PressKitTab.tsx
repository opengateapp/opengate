import { useMemo, useState } from 'react';
import { LaurelsSection } from './LaurelsSection';
import type { Draft } from 'immer';
import type { PressKit } from '../../model/types';
import { useDerived, useProject, useStore } from '../../store/project';
import { putMedia, useMediaUrl } from '../../store/media';
import { canEdit, useSync } from '../../sync/state';
import { prepareImage } from '../storyboard/images';
import { emptyPressKit, pressKitOf, pressKitView, pressPeople, pressSpecs } from '../../release/pressKit';
import { exportPressKit } from '../../release/pressKitExport';
import { Modal, toast } from '../../components/common';
import { Hint } from '../../components/Hint';
import { RefLink } from '../ReferenceTab';

// Release → Press kit (EPK). Most of it comes from the project; you write the rest here. Exports a
// PDF and a one-page website (a single HTML file you can host anywhere for free).

const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));
const images = (files: FileList | File[] | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith('image/'));

export function PressKitTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('pressKit');
  const kit = pressKitOf(p);
  const view = useMemo(() => pressKitView(p, d), [p, d]);
  const people = useMemo(() => pressPeople(p), [p]);
  const specs = useMemo(() => pressSpecs(p, d), [p, d]);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (fn: (k: Draft<PressKit>) => void, label: string | null = null) => update((dr) => { dr.pressKit ??= emptyPressKit(); dr.pressKit.stills ??= []; dr.pressKit.specs ??= {}; dr.pressKit.contact ??= {}; fn(dr.pressKit); }, label);
  const upload = async (files: File[]) => {
    const ids: string[] = [];
    for (const f of files) { try { ids.push(await putMedia(p.id, await prepareImage(f))); } catch (e) { toast((e as Error).message); } }
    return ids;
  };
  const addStills = async (files: File[]) => {
    if (ro || !files.length) return;
    const ids = await upload(files);
    if (ids.length) set((k) => { k.stills.push(...ids); }, `Add ${ids.length} still${ids.length === 1 ? '' : 's'}`);
  };
  const setPoster = async (files: File[]) => { const [id] = await upload(files.slice(0, 1)); if (id) set((k) => { k.posterId = id; }, 'Poster'); };
  const run = async (kind: 'pdf' | 'html') => { setBusy(true); try { await exportPressKit(p, kind); } catch (e) { toast((e as Error).message); } finally { setBusy(false); } };
  const txt = (key: 'logline' | 'shortSynopsis' | 'longSynopsis' | 'directorStatement', label: string, rows: number, from?: string, hint?: string) => (
    <label className="field">
      <span>{label}{hint && <span className="muted small"> · {hint}</span>}</span>
      <textarea disabled={ro} rows={rows} value={kit[key] ?? ''} placeholder={from ?? label} onChange={(e) => set((k) => { k[key] = e.target.value || undefined; })} />
    </label>
  );
  const fileDrop = (fn: (f: File[]) => void) => ({
    onDragOver: (e: React.DragEvent) => { if (!ro && e.dataTransfer.types.includes('Files')) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { if (ro) return; e.preventDefault(); fn(images(e.dataTransfer.files)); },
  });

  return (
    <div className="presskit-tab pad scroll">
      <div className="toolbar flat wrap">
        <h3>Press kit</h3>
        <button className="primary" disabled={busy} onClick={() => void run('pdf')}>PDF</button>
        <button disabled={busy} onClick={() => void run('html')} title="A single web page with everything in it, to upload to any free host">One-page website</button>
        <RefLink page="marketing" label="Marketing your film" />
      </div>
      {view.missing.length > 0 && <p className="fund-warn small">Still missing: {view.missing.join(', ')}.</p>}
      <p className="muted small"><Hint>{'Festivals, journalists and distributors ask for an EPK (electronic press kit). Cast, crew, laurels and tech specs come from the project; grey text is filled in for you and changes when the project does, until you type over it.'}</Hint></p>

      <div className="presskit-grid">
        <section className="presskit-col">
          <h4>The film</h4>
          {txt('logline', 'Logline', 2, p.bible?.logline || undefined, 'one sentence')}
          {txt('shortSynopsis', 'Short synopsis', 3, undefined, 'about 50 words')}
          {txt('longSynopsis', 'Long synopsis', 7, p.bible?.synopsis || undefined, 'a few paragraphs')}
          {txt('directorStatement', 'Director’s statement', 6, undefined, 'why you made it')}

          <LaurelsSection ro={ro} set={set} />

          <h4>Stills <span className="muted small">{kit.stills.length}</span></h4>
          <div className="presskit-stills" {...fileDrop((f) => void addStills(f))} onDoubleClick={(e) => { if (!ro && e.target === e.currentTarget) document.getElementById('pk-stills')?.click(); }}>
            {kit.stills.map((id, i) => <Still key={id} id={id} ro={ro} onRemove={() => set((k) => { k.stills.splice(i, 1); }, 'Remove still')} onPoster={() => set((k) => { k.posterId = id; }, 'Poster')} />)}
            {!ro && <label className="presskit-add">＋ Stills<input id="pk-stills" type="file" accept="image/*" multiple hidden onChange={(e) => { void addStills(images(e.target.files)); e.target.value = ''; }} /></label>}
          </div>
          {!ro && <button className="small" onClick={() => setPick(true)}>Pick from storyboards & mood boards…</button>}
          <p className="muted small">Drop photos here or double-click. Use production stills and behind-the-scenes photos that the people in them have signed releases for.</p>
        </section>

        <section className="presskit-col">
          <h4>Poster & links</h4>
          <div className="presskit-poster" {...fileDrop((f) => void setPoster(f))}>
            <Poster id={kit.posterId} />
            {!ro && <label className="button-like small">{kit.posterId ? 'Replace poster' : '＋ Poster'}<input type="file" accept="image/*" hidden onChange={(e) => { void setPoster(images(e.target.files)); e.target.value = ''; }} /></label>}
            {!ro && kit.posterId && <button className="small danger-text" onClick={() => set((k) => { delete k.posterId; }, 'Remove poster')}>Remove</button>}
          </div>
          <label className="field"><span>Trailer link</span><input disabled={ro} value={kit.trailerUrl ?? ''} placeholder="https://vimeo.com/…" onChange={(e) => set((k) => { k.trailerUrl = e.target.value || undefined; })} /></label>
          <label className="field"><span>Website</span><input disabled={ro} value={kit.website ?? ''} placeholder="https://…" onChange={(e) => set((k) => { k.website = e.target.value || undefined; })} /></label>


          <h4>Technical details</h4>
          <div className="presskit-specs">
            {(['runtime', 'genre', 'aspect', 'camera', 'sound', 'color', 'language', 'country', 'year'] as const).map((k) => {
              const label = { runtime: 'Runtime', genre: 'Genre', aspect: 'Aspect ratio', camera: 'Shot on', sound: 'Sound', color: 'Colour', language: 'Language', country: 'Country', year: 'Year' }[k];
              const auto = specs.find((s) => s.label === label && s.auto)?.value;
              const ph = { sound: 'Stereo / 5.1', color: 'Colour', language: 'English', country: 'United States', year: String(new Date().getFullYear()) }[k as string];
              return <label key={k} className="field"><span>{label}</span><input disabled={ro} value={kit.specs[k] ?? ''} placeholder={auto ?? ph ?? ''} onChange={(e) => set((x) => { x.specs[k] = e.target.value || undefined; })} /></label>;
            })}
          </div>

          <h4>Press contact</h4>
          <div className="presskit-specs">
            <label className="field"><span>Name</span><input disabled={ro} value={kit.contact.name ?? ''} onChange={(e) => set((k) => { k.contact.name = e.target.value || undefined; })} /></label>
            <label className="field"><span>Email</span><input disabled={ro} type="email" value={kit.contact.email ?? ''} onChange={(e) => set((k) => { k.contact.email = e.target.value || undefined; })} /></label>
            <label className="field"><span>Phone</span><input disabled={ro} value={kit.contact.phone ?? ''} onChange={(e) => set((k) => { k.contact.phone = e.target.value || undefined; })} /></label>
          </div>
        </section>
      </div>

      <h4>Filmmakers & cast <span className="muted small">from Contacts and the cast list</span></h4>
      {!people.length && <p className="muted small">Add crew in <button className="link small" onClick={() => goto('contacts')}>Contacts</button> (director, writer, producer, DP, editor, composer) and cast your characters; they show here.</p>}
      <div className="presskit-people">
        {people.map((x) => (
          <div key={x.key} className={`presskit-person ${x.hidden ? 'muted-card' : ''}`}>
            <Headshot id={x.photoId} ro={ro} onFile={async (f) => { const [id] = await upload([f]); if (id) set((k) => { (k.photos ??= {})[x.key] = id; }, 'Headshot'); }} />
            <div className="grow-0">
              <div className="row"><b>{x.name}</b><span className="muted small">{x.character ? `as ${x.character}` : x.role}</span><span className="spacer" />
                <label className="check small" title="Include in the press kit"><input disabled={ro} type="checkbox" checked={!x.hidden} onChange={(e) => set((k) => { const h = new Set(k.hidden ?? []); if (e.target.checked) h.delete(x.key); else h.add(x.key); k.hidden = [...h]; }, null)} /> Include</label>
              </div>
              <textarea disabled={ro || x.hidden} rows={2} value={x.bio ?? ''} placeholder="A short bio (two or three sentences)" onChange={(e) => set((k) => { (k.bios ??= {})[x.key] = e.target.value; })} />
            </div>
          </div>
        ))}
      </div>
      {pick && <PickStills onClose={() => setPick(false)} chosen={kit.stills} onPick={(ids) => { set((k) => { for (const id of ids) if (!k.stills.includes(id)) k.stills.push(id); }, 'Add stills'); setPick(false); }} />}
    </div>
  );
}

function Still({ id, ro, onRemove, onPoster }: { id: string; ro: boolean; onRemove: () => void; onPoster: () => void }) {
  const url = useMediaUrl(id);
  return (
    <figure className="presskit-still">
      {url ? <img src={url} alt="Still" /> : <span className="muted small">…</span>}
      {!ro && <div className="presskit-still-actions"><button className="small" onClick={onPoster} title="Use as the poster">Poster</button><button className="icon-btn" aria-label="Remove still" onClick={onRemove}>×</button></div>}
    </figure>
  );
}

function Poster({ id }: { id?: string }) {
  const url = useMediaUrl(id);
  return url ? <img className="presskit-poster-img" src={url} alt="Poster" /> : <div className="presskit-poster-empty muted small">Drop a poster here</div>;
}

function Headshot({ id, ro, onFile }: { id?: string; ro: boolean; onFile: (f: File) => void }) {
  const url = useMediaUrl(id);
  return (
    <label className={`presskit-headshot ${ro ? '' : 'can-drop'}`} title={ro ? undefined : 'Headshot: click or drop a photo'}
      onDragOver={(e) => { if (!ro) e.preventDefault(); }} onDrop={(e) => { if (ro) return; e.preventDefault(); const f = images(e.dataTransfer.files)[0]; if (f) onFile(f); }}>
      {url ? <img src={url} alt="" /> : <span aria-hidden>＋</span>}
      {!ro && <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />}
    </label>
  );
}

/** Images already in the project: storyboard images and mood board pictures. */
function PickStills({ chosen, onPick, onClose }: { chosen: string[]; onPick: (ids: string[]) => void; onClose: () => void }) {
  const p = useProject();
  const ids = useMemo(() => [...new Set([
    ...p.storyboard.map((f) => f.imageId),
    ...p.boards.flatMap((b) => b.items.map((i) => i.imageId)),
    ...p.locations.flatMap((l) => l.photoIds ?? []),
  ].filter((x): x is string => !!x && !chosen.includes(x)))], [p, chosen]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  return (
    <Modal title="Pick stills" onClose={onClose} wide footer={<><span className="muted small">{sel.size} chosen</span><span className="spacer" /><button onClick={onClose}>Cancel</button><button className="primary" disabled={!sel.size} onClick={() => onPick([...sel])}>Add</button></>}>
      {!ids.length ? <p className="muted">No pictures in storyboards, mood boards or locations yet.</p> : (
        <div className="presskit-stills pick">
          {ids.map((id) => <PickOne key={id} id={id} on={sel.has(id)} toggle={() => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />)}
        </div>
      )}
    </Modal>
  );
}

function PickOne({ id, on, toggle }: { id: string; on: boolean; toggle: () => void }) {
  const url = useMediaUrl(id);
  return <button className={`presskit-still ${on ? 'on' : ''}`} aria-pressed={on} onClick={toggle} onDoubleClick={toggle}>{url ? <img src={url} alt="" /> : '…'}</button>;
}
