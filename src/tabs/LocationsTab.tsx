import { useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import type { Location } from '../model/types';
import { putMedia, useMediaUrl } from '../store/media';
import { prepareImage } from './storyboard/images';
import { LinkedImages } from '../components/LinkedImages';
import { Empty, Field, toast } from '../components/common';
import { formatDate } from '../model/dates';
import { download, safeName } from '../io/files';
import { deletedToast } from '../components/deleted';
import { More } from '../components/More';
import { csv } from '../io/reports';

// Location manager: each real location, the script sets it plays, contacts, permits,
// logistics, scout photos, linked mood images and the shoot days it's used.

const STATUS: { id: NonNullable<Location['status']>; label: string }[] = [
  { id: 'scouting', label: 'Scouting' }, { id: 'hold', label: 'On hold' }, { id: 'confirmed', label: 'Confirmed' }, { id: 'passed', label: 'Passed' },
];

export function LocationsTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [id, setId] = useState<string | null>(null);
  const loc = p.locations.find((l) => l.id === id) ?? p.locations[0];
  const missing = d.sets.filter((s) => !p.locations.some((l) => l.setName === s.name));

  const add = (setName = '') => {
    const l: Location = { id: newId(), setName, realName: '', address: '', status: 'scouting', photoIds: [] };
    update((dr) => { dr.locations.push(l); }, 'Add location');
    setId(l.id);
  };

  return (
    <div className="with-side locations-tab">
      <aside className="side" data-panel="Locations" data-panel-pick onDoubleClick={(e) => { if (e.target === e.currentTarget) add(); }}>
        <div className="side-head"><b>Locations</b><button className="small" onClick={() => add()}>+ Location</button></div>
        {missing.length > 0 && (
          <button className="small full" onClick={() => update((dr) => { for (const s of missing) dr.locations.push({ id: newId(), setName: s.name, realName: '', address: '', status: 'scouting', photoIds: [] }); }, 'Add sets from script')}>
            + {missing.length} set{missing.length > 1 ? 's' : ''} from the script
          </button>
        )}
        <ul className="doc-list">
          {p.locations.map((l) => (
            <li key={l.id} className={loc?.id === l.id ? 'active' : ''} onClick={() => setId(l.id)}>
              <span><b>{l.realName || <span className="muted">Unnamed</span>}</b><br /><span className="muted small">{l.setName || 'No script set'}</span></span>
              <span className={`status-dot s-${l.status ?? 'scouting'}`} title={l.status ?? 'scouting'} />
            </li>
          ))}
        </ul>
        {!p.locations.length && <p className="muted small pad">Double-click here to add a location.</p>}
        {p.locations.length > 0 && <button className="small full" onClick={() => download(`${safeName(p.title)} locations.csv`, csv([['Real location', 'Script set', 'Address', 'Status', 'Contact', 'Phone', 'Email', 'Permit', 'Parking', 'Power', 'Restrooms', 'Hospital', 'Fee', 'Notes'], ...p.locations.map((l) => [l.realName, l.setName, l.address, l.status ?? '', l.contactName ?? '', l.contactPhone ?? '', l.contactEmail ?? '', l.permit ?? '', l.parking ?? '', l.power ?? '', l.restrooms ?? '', l.nearestHospital ?? '', l.fee ?? '', l.notes ?? ''])]), 'text/csv')}>Export CSV</button>}
      </aside>
      {loc ? <LocationDetail loc={loc} /> : <Empty title="No locations yet"><p className="muted">Add the places you'll shoot, or pull the sets from your script.</p><button className="primary" onClick={() => add()}>Add location</button></Empty>}
    </div>
  );
}

function LocationDetail({ loc }: { loc: Location }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [over, setOver] = useState(false);
  const set = (patch: Partial<Location>, label: string | null = null) => update((dr) => { Object.assign(dr.locations.find((x) => x.id === loc.id)!, patch); }, label);
  const scenes = d.scenes.filter((s) => s.set === loc.setName || p.sceneMeta[s.id]?.locationId === loc.id);
  const sceneIds = new Set(scenes.map((s) => s.id));
  const days = p.schedule.days.filter((day) => day.items.some((i) => i.kind === 'scene' && sceneIds.has(i.sceneId)));

  const addPhotos = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    try {
      const ids: string[] = [];
      for (const f of imgs) ids.push(await putMedia(p.id, await prepareImage(f)));
      set({ photoIds: [...(loc.photoIds ?? []), ...ids] }, `Add ${ids.length} photo${ids.length > 1 ? 's' : ''}`);
    } catch (e) { toast((e as Error).message); }
  };

  const text = (k: keyof Location, label: string, wide = false, placeholder = '') => (
    <Field label={label} wide={wide}><input value={(loc[k] as string | undefined) ?? ''} placeholder={placeholder} onChange={(e) => set({ [k]: e.target.value } as Partial<Location>)} /></Field>
  );

  return (
    <section className={`main pad scroll ${over ? 'drop-hover' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void addPhotos([...e.dataTransfer.files]); }}>
      <div className="toolbar flat">
        <input className="doc-title" value={loc.realName} placeholder="Location name" onChange={(e) => set({ realName: e.target.value })} />
        <select value={loc.status ?? 'scouting'} onChange={(e) => set({ status: e.target.value as Location['status'] }, 'Set status')}>
          {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="spacer" />
        <More label="Location actions">
        {loc.address && <a className="button-like" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}`} target="_blank" rel="noreferrer noopener">Open in Maps ↗</a>}
        <button onClick={() => { update((dr) => { dr.locations = dr.locations.filter((x) => x.id !== loc.id); }, 'Remove location'); deletedToast(loc.realName || 'location'); }}>Delete</button>
        </More>
      </div>
      <div className="form-grid">
        <Field label="Script set (from scene headings)">
          <input list="loc-sets" value={loc.setName} onChange={(e) => set({ setName: e.target.value.toUpperCase() })} />
        </Field>
        {text('address', 'Address', true)}
        {text('contactName', 'Contact')}
        {text('contactPhone', 'Contact phone')}
        {text('contactEmail', 'Contact email')}
        {text('fee', 'Fee / rate')}
        {text('permit', 'Permit', false, 'Status, number, dates')}
        {text('parking', 'Parking / basecamp')}
        {text('power', 'Power')}
        {text('restrooms', 'Restrooms')}
        {text('nearestHospital', 'Nearest hospital', true)}
        <Field label="Notes" wide><textarea rows={3} value={loc.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
      <datalist id="loc-sets">{d.sets.map((s) => <option key={s.name} value={s.name} />)}</datalist>

      <h4>Photos <span className="muted small">— drop scout photos anywhere on this page</span></h4>
      <div className="photo-grid">
        {(loc.photoIds ?? []).map((pid) => <Photo key={pid} id={pid} onRemove={() => set({ photoIds: (loc.photoIds ?? []).filter((x) => x !== pid) }, 'Remove photo')} />)}
        <label className="photo-add">+ Add photos<input type="file" accept="image/*" multiple hidden onChange={(e) => { void addPhotos([...(e.target.files ?? [])]); e.target.value = ''; }} /></label>
      </div>

      <LinkedImages match={(i) => !!i.locationIds?.includes(loc.id) || (!!loc.setName && !!i.sceneIds?.some((s) => sceneIds.has(s)))} />

      <h4>Scenes here <span className="muted small">{scenes.length}</span></h4>
      <ul className="plain-list">{scenes.map((s) => <li key={s.id}><b>{s.number}</b> {s.heading}</li>)}{!scenes.length && <li className="muted small">Set the script set above to link scenes.</li>}</ul>
      <h4>Shoot days</h4>
      <ul className="plain-list">{days.map((day) => <li key={day.id}>{formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</li>)}{!days.length && <li className="muted small">Not scheduled yet.</li>}</ul>
    </section>
  );
}

function Photo({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useMediaUrl(id);
  return (
    <div className="photo">
      {url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a>}
      <button className="icon-btn" onClick={onRemove} title="Remove">×</button>
    </div>
  );
}
