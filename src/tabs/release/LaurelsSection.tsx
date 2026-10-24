import { useMemo, useRef, useState } from 'react';
import type { Draft } from 'immer';
import type { PressKit, PressLaurel } from '../../model/types';
import { useProject } from '../../store/project';
import { putMedia, useMediaUrl } from '../../store/media';
import { newId } from '../../model/ids';
import { joinFestivals } from '../../budget/festivals';
import { LAUREL_KINDS, laurelsMissingImages } from '../../release/pressKit';
import { prepareLaurel } from '../../release/pressKitExport';
import { toast } from '../../components/common';
import { Hint } from '../../components/Hint';

// Release → Press kit → Laurels: the wreath images festivals send, kept as PNG/SVG with their
// transparency, linked to the festival, in your order, with a dark-background version if there is one.

const images = (files: FileList | File[] | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
const clean = (n: string) => n.replace(/\s*\(fictional\)\s*$/i, '');

export function LaurelsSection({ ro, set }: { ro: boolean; set: (fn: (k: Draft<PressKit>) => void, label?: string | null) => void }) {
  const p = useProject();
  const [dark, setDark] = useState(false);
  const drag = useRef<string | null>(null);
  const list = p.pressKit?.laurels ?? [];
  const fests = useMemo(() => joinFestivals(p), [p]);
  const accepted = fests.filter((f) => f.status === 'accepted');
  const missing = useMemo(() => laurelsMissingImages(p), [p]);

  const upload = async (f: File) => { try { return await putMedia(p.id, await prepareLaurel(f)); } catch (e) { toast((e as Error).message); return null; } };
  const add = async (files: File[], festivalId?: string) => {
    if (ro || !files.length) return;
    const made: PressLaurel[] = [];
    for (const file of files) {
      const id = await upload(file);
      if (!id) continue;
      const f = festivalId ? fests.find((x) => x.id === festivalId) : undefined;
      made.push({ id: newId(), imageId: id, festivalId, festival: f ? clean(f.name) : '', text: f?.laurel || 'Official Selection', year: f?.eventStart?.slice(0, 4), include: true });
    }
    if (!made.length) return;
    set((k) => {
      k.laurels ??= [];
      for (const m of made) {
        // A festival's text-only laurel gets the image instead of a second entry.
        const same = m.festivalId ? k.laurels.find((x) => x.festivalId === m.festivalId && !x.imageId) : undefined;
        if (same) same.imageId = m.imageId; else k.laurels.push(m);
      }
    }, made.length === 1 ? 'Add laurel' : `Add ${made.length} laurels`);
  };
  const setL = (id: string, patch: Partial<PressLaurel>, label: string | null = null) => set((k) => { const x = k.laurels?.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const move = (from: string, to: string) => set((k) => {
    const l = k.laurels ?? [];
    const a = l.findIndex((x) => x.id === from), b = l.findIndex((x) => x.id === to);
    if (a < 0 || b < 0 || a === b) return;
    const [x] = l.splice(a, 1);
    l.splice(b, 0, x);
  }, 'Reorder laurels');

  return (
    <section className="laurels-section" onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
      onDrop={(e) => { if (ro || !e.dataTransfer.files.length) return; e.preventDefault(); void add(images(e.dataTransfer.files)); }}>
      <div className="row wrap">
        <h4>Laurels <span className="muted small">{list.length}</span></h4>
        <span className="spacer" />
        <div className="seg small" role="radiogroup" aria-label="Preview background">
          <button role="radio" aria-checked={!dark} className={!dark ? 'active' : ''} onClick={() => setDark(false)}>Light</button>
          <button role="radio" aria-checked={dark} className={dark ? 'active' : ''} onClick={() => setDark(true)}>Dark</button>
        </div>
        {!ro && <label className="button-like small">＋ Laurel<input id="pk-laurels" type="file" accept="image/png,image/svg+xml,image/webp,image/*" multiple hidden onChange={(e) => { void add(images(e.target.files)); e.target.value = ''; }} /></label>}
      </div>
      <p className="muted small"><Hint>{'Use the official laurel files the festival sends, and follow its rules: most don’t allow changing the wreath or the wording. PNG or SVG with a transparent background works best; add a white version for dark backgrounds if they sent one.'}</Hint></p>
      {!ro && missing.map((f) => (
        <label key={f.id} className="laurel-missing button-like small">＋ Add the laurel image from {clean(f.name)}<input type="file" accept="image/*" hidden onChange={(e) => { void add(images(e.target.files).slice(0, 1), f.id); e.target.value = ''; }} /></label>
      ))}
      <div className={`laurel-grid ${dark ? 'dark' : ''}`} onDoubleClick={(e) => { if (!ro && e.target === e.currentTarget) document.getElementById('pk-laurels')?.click(); }}>
        {list.map((l) => (
          <div key={l.id} className={`laurel-card ${l.include ? '' : 'muted-card'}`} draggable={!ro}
            onDragStart={(e) => { drag.current = l.id; e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { if (drag.current) e.preventDefault(); }}
            onDrop={(e) => { if (!drag.current) return; e.preventDefault(); e.stopPropagation(); move(drag.current, l.id); drag.current = null; }}>
            <LaurelImage id={(dark && l.darkImageId) || l.imageId} text={l.text} />
            <input disabled={ro} list="laurel-fests" value={l.festival} placeholder="Festival" aria-label="Festival" onChange={(e) => { const v = e.target.value; const f = fests.find((x) => clean(x.name) === v || x.name === v); setL(l.id, { festival: v, festivalId: f?.id }); }} />
            <div className="row">
              <input disabled={ro} list="laurel-kinds-pk" value={l.text} placeholder="Official Selection" aria-label="Laurel" onChange={(e) => setL(l.id, { text: e.target.value })} />
              <input disabled={ro} className="laurel-year" inputMode="numeric" value={l.year ?? ''} placeholder="Year" aria-label="Year" onChange={(e) => setL(l.id, { year: e.target.value.replace(/[^\d]/g, '').slice(0, 4) || undefined })} />
            </div>
            <div className="row wrap">
              <label className="check small"><input disabled={ro} type="checkbox" checked={l.include} onChange={(e) => setL(l.id, { include: e.target.checked }, 'Include laurel')} /> In the press kit</label>
              {!ro && <label className="link small" title="A version for dark backgrounds (usually white)">{l.darkImageId ? 'Replace dark version' : '＋ Dark version'}<input type="file" accept="image/*" hidden onChange={async (e) => { const f = images(e.target.files)[0]; e.target.value = ''; if (!f) return; const id = await upload(f); if (id) setL(l.id, { darkImageId: id }, 'Dark laurel'); }} /></label>}
              {!ro && !l.imageId && <label className="link small">＋ Image<input type="file" accept="image/*" hidden onChange={async (e) => { const f = images(e.target.files)[0]; e.target.value = ''; if (!f) return; const id = await upload(f); if (id) setL(l.id, { imageId: id }, 'Laurel image'); }} /></label>}
              <span className="spacer" />
              {!ro && <button className="icon-btn" aria-label="Remove laurel" onClick={() => set((k) => { k.laurels = (k.laurels ?? []).filter((x) => x.id !== l.id); }, 'Remove laurel')}>×</button>}
            </div>
          </div>
        ))}
        {!list.length && !missing.length && <p className="muted small">No laurels yet. Drop the laurel files here, or mark a festival Accepted in Festivals.</p>}
      </div>
      <datalist id="laurel-fests">{[...accepted, ...fests.filter((f) => f.status !== 'accepted')].map((f) => <option key={f.id} value={clean(f.name)} />)}</datalist>
      <datalist id="laurel-kinds-pk">{LAUREL_KINDS.map((x) => <option key={x} value={x} />)}</datalist>
    </section>
  );
}

function LaurelImage({ id, text }: { id?: string; text: string }) {
  const url = useMediaUrl(id);
  return <div className="laurel-img">{url ? <img src={url} alt={text} /> : <span className="muted small">{text || 'Laurel'}</span>}</div>;
}
