import { useState } from 'react';
import { MoneyInput } from '../../components/NumberInput';
import { useDerived, useProject, useStore } from '../../store/project';
import type { License, LicenseKind, LicenseStatus } from '../../model/types';
import { money } from '../../budget/calc';
import {
  LICENSE_KINDS, LICENSE_TYPES, MEDIA_OPTIONS, STATUSES, USE_TYPES, clearanceLogCsv, creditLine, cueSheetCsv, duration, kindLabel,
  licenseWarnings, newLicense, suggestedCredit, syncLicenseLines,
} from '../../budget/licenses';
import { canEdit, useSync } from '../../sync/state';
import { getMedia, putMedia } from '../../store/media';
import { download, safeName } from '../../io/files';
import { openActions } from '../../components/ActionSheet';
import { askConfirm } from '../../components/dialogs';
import { deletedToast } from '../../components/deleted';
import { toast } from '../../components/common';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';
import { BudgetHidden } from './BudgetTab';
import { RefLink } from '../ReferenceTab';

// Budget → Licenses: music, stock footage, archival, photos, fonts and software. Each license with
// a fee is a budget line; licensed music and footage feed the end credits and the music cue sheet.

const FILE_TYPES = /^(image\/|application\/pdf$|text\/|message\/)/;

export function LicensesTab() {
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  return visible ? <LicensesScreen /> : <BudgetHidden />;
}

function LicensesScreen() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('budget');
  const list = p.budget.licenses ?? [];
  const $ = (n: number) => money(n, p.budget.currency);
  const [kind, setKind] = useState<LicenseKind | ''>('');
  const [status, setStatus] = useState<LicenseStatus | ''>('');
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const edit = (fn: (l: License[]) => void, label: string | null = 'Edit license') => update((d) => { d.budget.licenses ??= []; fn(d.budget.licenses); syncLicenseLines(d); }, label);
  const set = (id: string, patch: Partial<License>, label: string | null = null) => edit((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const add = (k: LicenseKind, extra: Partial<License> = {}) => { const l = { ...newLicense(k), ...extra }; edit((x) => { x.push(l); }, `Add ${kindLabel(k).toLowerCase()} license`); setOpen(l.id); return l; };
  const addMenu = (at: { x: number; y: number }) => openActions('Add a license', LICENSE_KINDS.map((k) => ({ label: k.label, run: () => add(k.id) })), at);
  const remove = async (l: License) => {
    if (!(await askConfirm(`Delete “${l.title || kindLabel(l.kind)}”?`, { message: 'Its budget line goes too.' }))) return;
    edit((x) => { const i = x.findIndex((y) => y.id === l.id); if (i >= 0) x.splice(i, 1); }, 'Delete license');
    deletedToast(l.title || 'license');
  };
  const attach = async (files: File[], id?: string) => {
    const ok = files.filter((f) => FILE_TYPES.test(f.type) || /\.(pdf|eml|txt)$/i.test(f.name));
    if (!ok.length) { toast('Drop the license as a PDF, image or email'); return; }
    for (const f of ok) {
      const fileId = await putMedia(p.id, f);
      if (id) set(id, { fileId }, 'Attach license');
      else add('music', { title: f.name.replace(/\.[a-z0-9]+$/i, ''), fileId });
    }
  };
  const openFile = async (fileId: string) => {
    const blob = await getMedia(fileId);
    if (!blob) { toast('This file hasn’t arrived on this device yet'); return; }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const shown = list.filter((l) => (!kind || l.kind === kind) && (!status || l.status === status));
  const licensed = list.filter((l) => l.status === 'licensed').reduce((n, l) => n + l.fee, 0);
  const pending = list.filter((l) => l.status !== 'licensed' && l.status !== 'declined').reduce((n, l) => n + l.fee, 0);
  const warnings = licenseWarnings(p);

  return (
    <div className={`licenses-tab pad scroll ${over ? 'drop-hover' : ''}`}
      onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('licenses-tab')) addMenu({ x: e.clientX, y: e.clientY }); }}
      onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!ro) void attach([...e.dataTransfer.files]); }}>
      <div className="toolbar flat wrap">
        <h3>Licenses</h3>
        <RefLink page="legal-music" label="Music licensing" />
        <select value={kind} onChange={(e) => setKind(e.target.value as LicenseKind | '')} aria-label="Kind"><option value="">Every kind</option>{LICENSE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value as LicenseStatus | '')} aria-label="Status"><option value="">Every status</option>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        {!ro && <button className="primary" onClick={(e) => addMenu({ x: e.clientX, y: e.clientY })}>＋ License</button>}
        <span className="spacer" />
        <More label="License exports">
          <button disabled={!list.some((l) => l.kind === 'music')} onClick={() => download(`${safeName(p.title)} - music cue sheet.csv`, cueSheetCsv(p), 'text/csv')}>Music cue sheet (CSV)</button>
          <button disabled={!list.length} onClick={() => download(`${safeName(p.title)} - clearance log.csv`, clearanceLogCsv(p), 'text/csv')}>Clearance log (CSV)</button>
        </More>
      </div>

      <div className="gear-totals">
        <div><span className="muted small">Licensed</span><b>{$(licensed)}</b></div>
        <div><span className="muted small">Still to clear</span><b>{$(pending)}</b></div>
        <div><span className="muted small">Music cues</span><b>{list.filter((l) => l.kind === 'music').length}</b></div>
        <div><span className="muted small">In the credits</span><b>{list.filter((l) => l.inCredits && l.status !== 'declined').length}</b></div>
      </div>
      {warnings.length > 0 && <ul className="license-warnings">{warnings.map((w, i) => <li key={i}><button className="link small" onClick={() => setOpen(w.id)}>⚠ {w.text}</button></li>)}</ul>}

      <div className="license-list">
        {shown.map((l) => <LicenseCard key={l.id} l={l} ro={ro} open={open === l.id} onToggle={() => setOpen(open === l.id ? null : l.id)}
          set={(patch, label) => set(l.id, patch, label)} onRemove={() => void remove(l)} onAttach={(f) => void attach(f, l.id)} onOpenFile={() => l.fileId && void openFile(l.fileId)} $={$} />)}
      </div>
      {!list.length && (
        <p className="muted pad"><Hint>{'No licenses yet. Add music, stock footage, archival, photos, fonts or software with ＋ License (or double-click empty space), or drop a license PDF here. Each one with a fee becomes a budget line, and licensed music and footage go into the end credits.'}</Hint></p>
      )}
    </div>
  );
}

function LicenseCard({ l, ro, open, onToggle, set, onRemove, onAttach, onOpenFile, $ }: {
  l: License; ro: boolean; open: boolean; onToggle: () => void; set: (patch: Partial<License>, label?: string | null) => void;
  onRemove: () => void; onAttach: (f: File[]) => void; onOpenFile: () => void; $: (n: number) => string;
}) {
  const d = useDerived();
  const text = (k: keyof License, label: string, opts: { list?: string; placeholder?: string; wide?: boolean } = {}) => (
    <label className={`field ${opts.wide ? 'wide' : ''}`}><span>{label}</span>
      <input disabled={ro} list={opts.list} value={(l[k] as string | undefined) ?? ''} placeholder={opts.placeholder} onChange={(e) => set({ [k]: e.target.value || undefined } as Partial<License>)} />
    </label>
  );
  const music = l.kind === 'music';
  return (
    <div className={`license-card st-${l.status} ${open ? 'open' : ''}`}>
      <div className="license-head" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onToggle(); }}>
        <span className="chip small">{kindLabel(l.kind)}</span>
        <b className="grow">{l.title || <span className="muted">Untitled</span>}{l.performer ? <span className="muted"> — {l.performer}</span> : null}</b>
        <span className={`license-status s-${l.status}`}>{STATUSES.find((s) => s.id === l.status)?.label}</span>
        <span className="license-fee">{l.fee ? $(l.fee) : ''}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="license-body">
          <div className="seg small wrap" role="radiogroup" aria-label="Status">
            {STATUSES.map((s) => <button key={s.id} role="radio" aria-checked={l.status === s.id} disabled={ro} className={l.status === s.id ? `active s-${s.id}` : ''} onClick={() => set({ status: s.id }, 'License status')}>{s.label}</button>)}
          </div>
          <div className="form-grid">
            <label className="field"><span>Kind</span><select disabled={ro} value={l.kind} onChange={(e) => set({ kind: e.target.value as LicenseKind }, 'License kind')}>{LICENSE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></label>
            {text('title', music ? 'Song / track title' : 'Title / clip')}
            {music && text('performer', 'Performed by')}
            {music && text('writers', 'Written by (composers)')}
            {music && text('publisher', 'Publisher')}
            {text('label', music ? 'Label / master owner' : 'Owner')}
            {text('source', 'Licensed from', { placeholder: music ? 'Artlist, Epidemic, the label…' : 'Pond5, Getty, an archive…' })}
            {text('licenseType', 'License type', { list: 'lic-types' })}
            {text('licenseNumber', 'License / order #')}
            {text('media', 'Media', { list: 'lic-media' })}
            {text('territory', 'Territory', { placeholder: 'Worldwide' })}
            {text('term', 'Term', { placeholder: 'Perpetual, 5 years…' })}
            <label className="field"><span>Starts</span><input type="date" disabled={ro} value={l.start ?? ''} onChange={(e) => set({ start: e.target.value || undefined })} /></label>
            <label className="field"><span>Expires</span><input type="date" disabled={ro} value={l.expires ?? ''} onChange={(e) => set({ expires: e.target.value || undefined })} /></label>
            <label className="field"><span>Fee</span><MoneyInput min={0} disabled={ro} value={l.fee} onChange={(n) => set({ fee: n ?? 0 })} /></label>
            {music && text('useType', 'Use', { list: 'lic-use' })}
            {text('tcIn', 'Timecode in', { placeholder: '01:02:03:00' })}
            {text('tcOut', 'Timecode out')}
            {duration(l) && <div className="field"><span>Duration</span><b>{duration(l)}</b></div>}
          </div>
          <div className="field"><span>Scenes</span>
            <div className="chips">
              {l.sceneIds.map((id) => <span key={id} className="chip">Sc {d.sceneById.get(id)?.number ?? '?'}{!ro && <button className="icon-btn" aria-label="Remove scene" onClick={() => set({ sceneIds: l.sceneIds.filter((x) => x !== id) }, 'Untie scene')}>×</button>}</span>)}
              {!ro && <select value="" onChange={(e) => e.target.value && set({ sceneIds: [...l.sceneIds, e.target.value] }, 'Tie scene')}><option value="">＋ Scene</option>{d.scenes.filter((s) => !l.sceneIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}</option>)}</select>}
            </div>
          </div>
          <div className="field wide"><span>Credit line <label className="check small inline"><input type="checkbox" disabled={ro} checked={l.inCredits} onChange={(e) => set({ inCredits: e.target.checked }, 'In credits')} /> in the end credits</label></span>
            <textarea rows={music ? 3 : 2} disabled={ro} value={l.credit ?? ''} placeholder={suggestedCredit(l) || 'Credit line'} onChange={(e) => set({ credit: e.target.value || undefined })} />
            {!l.credit && creditLine(l) && <span className="muted small">Using the suggested line above — type to change it.</span>}
          </div>
          <label className="field wide"><span>Notes</span><textarea rows={2} disabled={ro} value={l.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></label>
          <div className="row wrap">
            {l.fileId ? <button className="small" onClick={onOpenFile}>📄 Open license</button> : null}
            {!ro && <label className="button-like small">{l.fileId ? 'Replace file…' : '📎 Attach license…'}<input type="file" hidden accept="application/pdf,image/*,.eml,.txt" onChange={(e) => { onAttach([...(e.target.files ?? [])]); e.target.value = ''; }} /></label>}
            <span className="spacer" />
            {!ro && <button className="small danger-text" onClick={onRemove}>Delete</button>}
          </div>
          <datalist id="lic-types">{LICENSE_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="lic-media">{MEDIA_OPTIONS.map((x) => <option key={x} value={x} />)}</datalist>
          <datalist id="lic-use">{USE_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
      )}
    </div>
  );
}
