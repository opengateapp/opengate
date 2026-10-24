import { useEffect, useMemo, useState } from 'react';
import { RateLink } from '../../components/PlanBudget';
import { MoneyInput, NumberInput } from '../../components/NumberInput';
import { create } from 'zustand';
import { useDerived, useProject, useStore } from '../../store/project';
import type { Clearance, ClearanceKind, ClearanceStatus, DealTerms, PaperDoc, PaperKind, PaperStatus, PersonRef, Project, TimeCard } from '../../model/types';
import { newId } from '../../model/ids';
import { formatDate } from '../../model/dates';
import { money } from '../../budget/calc';
import { breakdownFacts, personWorkDays } from '../../budget/fromBreakdown';
import {
  PAPER_KINDS, dealWarnings, docsFor, isDone, isForm, missingFor, newDoc, paperLabel, people, personOf, refKey, signable, statusesFor,
  syncPaperworkLines, unionCounts, type Person,
} from '../../paperwork/paperwork';
import { CLEARANCE_KINDS, CLEARANCE_STATUSES, applyScan, clearanceLabel, clearanceReportCsv, newClearance, scanScript } from '../../paperwork/clearanceScan';
import { openLocation } from '../LocationsTab';
import { cardHours, cardsFromCallSheet, contractorCsv, payrollCsv, payrollRows, rulesOf, timecardsCsv } from '../../paperwork/timecards';
import { taftHartleyNeeded, unionBadge } from '../../paperwork/unions';
import { LAWYER_NOTE, builtInTemplate } from '../../paperwork/templates';
import { clearanceReportPdf, docText, paperDocPdfAsync } from '../../pdf/paperworkPdf';
import { canEdit, useSync } from '../../sync/state';
import { getMedia, putMedia } from '../../store/media';
import { download, safeName } from '../../io/files';
import { openActions } from '../../components/ActionSheet';
import { askConfirm } from '../../components/dialogs';
import { deletedToast } from '../../components/deleted';
import { toast } from '../../components/common';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';
import { UnionPicker } from '../../components/UnionPicker';
import { SocietiesPicker } from '../../components/SocietiesPicker';
import { RefLink } from '../ReferenceTab';
import { societyLetters } from '../../paperwork/societies';
import { SignaturePad } from '../../components/SignaturePad';
import { BudgetHidden } from './BudgetTab';

// Plan → Paperwork: deal memos (rates go into the budget), releases signed on a phone or iPad,
// start forms (tracked, never their contents), the clearances log and time cards. It travels with
// the budget's private key, so only people who can see the budget see it.

type View = 'people' | 'docs' | 'clearances' | 'time';
const VIEWS: { id: View; label: string }[] = [{ id: 'people', label: 'People' }, { id: 'docs', label: 'Documents' }, { id: 'clearances', label: 'Clearances' }, { id: 'time', label: 'Time cards' }];
const FILE_TYPES = /^(image\/|application\/pdf$|text\/|message\/)/;
const okFiles = (files: File[]) => files.filter((f) => FILE_TYPES.test(f.type) || /\.(pdf|eml|txt|png|jpe?g|heic)$/i.test(f.name));

/** Opens Paperwork at a view (and document) from another tab, e.g. a location's clearance. */
const usePaperFocus = create<{ view?: View; doc?: string; n?: number }>(() => ({}));
export function openPaperwork(view: View, doc?: string) {
  usePaperFocus.setState({ view, doc, n: Date.now() });
  window.dispatchEvent(new CustomEvent('opengate:goto', { detail: 'paperwork' }));
}

export function PaperworkTab() {
  const visible = useSync((s) => s.write === null || s.admin || s.budget);
  return visible ? <PaperworkScreen /> : <BudgetHidden />;
}

async function openFile(fileId: string) {
  const blob = await getMedia(fileId);
  if (!blob) { toast('This file hasn’t arrived on this device yet'); return; }
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function usePaperwork() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('budget');
  const editDocs = (fn: (docs: PaperDoc[], d: Project) => void, label: string | null = 'Edit paperwork') => update((d) => {
    d.budget.paperwork ??= [];
    fn(d.budget.paperwork, d as Project);
    syncPaperworkLines(d);
  }, label);
  const setDoc = (id: string, patch: Partial<PaperDoc>, label: string | null = null) => editDocs((docs) => {
    const x = docs.find((y) => y.id === id);
    if (x) { Object.assign(x, patch); x.updated = new Date().toISOString(); }
  }, label);
  const addDoc = (kind: PaperKind, person: PersonRef, extra: Partial<PaperDoc> = {}) => {
    const doc = { ...newDoc(p, kind, person), ...extra };
    editDocs((docs) => { docs.push(doc); }, `Add ${paperLabel(kind).toLowerCase()}`);
    return doc;
  };
  return { p, update, ro, editDocs, setDoc, addDoc };
}

function PaperworkScreen() {
  const { p, ro } = usePaperwork();
  const focus = usePaperFocus();
  const [view, setView] = useState<View>(focus.view ?? 'people');
  const [openDoc, setOpenDoc] = useState<string | null>(focus.doc ?? null);
  useEffect(() => { if (focus.view) { setView(focus.view); setOpenDoc(focus.doc ?? null); } }, [focus.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const goDoc = (id: string) => { setOpenDoc(id); setView('docs'); };
  return (
    <div className="paperwork-tab pad scroll">
      <div className="toolbar flat wrap">
        <h3>Paperwork</h3>
        <div className="seg" role="tablist" aria-label="Paperwork view">
          {VIEWS.map((v) => <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'active' : ''} onClick={() => setView(v.id)}>{v.label}</button>)}
        </div>
        <span className="spacer" />
        {ro && <span className="muted small">View only</span>}
      </div>
      <p className="muted small paper-privacy"><Hint>{'Private like the budget: only people whose invite includes the Budget see this. Open Gate never stores SSNs, tax IDs, bank details or union member numbers; for start forms it records only that one was received and where it’s kept.'}</Hint></p>
      {view === 'people' && <PeopleView onOpenDoc={goDoc} />}
      {view === 'docs' && <DocsView open={openDoc} setOpen={setOpenDoc} />}
      {view === 'clearances' && <ClearancesView onOpenDoc={goDoc} />}
      {view === 'time' && <TimeView />}
      {p.budget.paperwork?.length === 0 && view === 'people' && !ro && null}
    </div>
  );
}

// ---------------------------------------------------------------------------------- People

function PeopleView({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const { p, update, ro, addDoc, editDocs } = usePaperwork();
  const d = useDerived();
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const facts = useMemo(() => breakdownFacts(p, d), [p, d]);
  const list = people(p, { locations: true }).filter((x) => x.group !== 'Location' || docsFor(p, x.ref).length > 0 || x.name);
  const shown = list.filter((x) => (!q || `${x.name} ${x.role}`.toLowerCase().includes(q.toLowerCase())) && (!onlyMissing || missingFor(p, x).length));
  const th = taftHartleyNeeded(p);
  const warnings = dealWarnings(p, (r) => personWorkDays(p, facts, r));
  const counts = unionCounts(p, d);
  const setUnion = (x: Person, patch: Partial<Person>) => update((dr) => {
    const c = x.ref.kind === 'cast' ? dr.cast.find((y) => y.id === x.ref.id) : x.ref.kind === 'crew' ? dr.crew.find((y) => y.id === x.ref.id) : dr.contacts.find((y) => y.id === x.ref.id);
    if (!c) return;
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete (c as Record<string, unknown>)[k]; else (c as Record<string, unknown>)[k] = v; }
    syncPaperworkLines(dr);
  }, 'Union');
  const addMenu = (x: Person, at: { x: number; y: number }) => openActions(`Add for ${x.name}`, PAPER_KINDS.filter((k) => x.group !== 'Location' || k.id === 'location' || k.id === 'other').map((k) => ({
    label: k.label, run: () => { const doc = addDoc(k.id, x.ref); onOpenDoc(doc.id); },
  })), at);
  const attach = (x: Person, files: File[], at: { x: number; y: number }) => {
    const ok = okFiles(files);
    if (!ok.length) { toast('Drop a PDF, photo or email'); return; }
    openActions(`What is ${ok.length > 1 ? 'this' : `“${ok[0].name}”`}?`, PAPER_KINDS.map((k) => ({
      label: k.label, run: async () => {
        for (const f of ok) {
          const fileId = await putMedia(p.id, f);
          addDoc(k.id, x.ref, { fileId, status: isForm(k.id) ? 'received' : 'signed', title: `${k.label} — ${x.name}` });
        }
        toast(`Attached to ${x.name}`);
      },
    })), at);
  };

  return (
    <>
      <div className="toolbar flat wrap">
        <input placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check small"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Missing paperwork only</label>
      </div>
      {(th.length > 0 || warnings.length > 0) && (
        <ul className="license-warnings">
          {th.map((x) => <li key={x.id}>⚠ {x.name} isn’t marked as SAG-AFTRA, and this is a SAG-AFTRA show: file a Taft-Hartley report for them, or set their union. <RefLink page="guild-taft-hartley" /></li>)}
          {warnings.map((w) => <li key={w.docId}><button className="link small" onClick={() => onOpenDoc(w.docId)}>⚠ {w.text}</button></li>)}
        </ul>
      )}
      {counts.length > 0 && (
        <p className="muted small union-counts">Union / non-union on set: {counts.map((c) => <span key={c.day.id} className="chip small">{formatDate(c.day.date)} · {c.union} / {c.nonUnion}</span>)}</p>
      )}
      <div className="people-list">
        {shown.map((x) => {
          const docs = docsFor(p, x.ref);
          const missing = missingFor(p, x);
          const isOpen = open === x.key;
          return (
            <div key={x.key} className={`person-card ${isOpen ? 'open' : ''} ${over === x.key ? 'drop-hover' : ''}`}
              onContextMenu={(e) => { if (ro) return; e.preventDefault(); addMenu(x, { x: e.clientX, y: e.clientY }); }}
              onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(x.key); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (!ro) attach(x, [...e.dataTransfer.files], { x: e.clientX, y: e.clientY }); }}>
              <div className="person-head" role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : x.key)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(isOpen ? null : x.key); }}>
                <span className={`pill g-${x.group}`}>{x.group}</span>
                <b className="grow">{x.name}<span className="muted"> {x.role}</span></b>
                {unionBadge(x) && <span className="union-badge">{unionBadge(x)}</span>}{societyLetters(p, x).map((l) => <span key={l} className="union-badge society">{l}</span>)}
                <span className="paper-chips">
                  {docs.filter((d) => !isForm(d.kind)).map((d) => <span key={d.id} className={`paper-chip ${isDone(d) ? 'done' : 'todo'}`} title={`${paperLabel(d.kind)}: ${d.status}`}>{isDone(d) ? '✓' : '○'} {shortKind(d.kind)}</span>)}
                  {missing.filter((k) => !docs.some((d) => d.kind === k)).map((k) => <span key={k} className="paper-chip missing" title={`No ${paperLabel(k).toLowerCase()} yet`}>✕ {shortKind(k)}</span>)}
                </span>
                <span className="muted">{isOpen ? '▾' : '▸'}</span>
              </div>
              {isOpen && (
                <div className="person-body">
                  {(x.ref.kind === 'cast' || x.ref.kind === 'crew' || x.ref.kind === 'location') && <div className="field"><span>{x.ref.kind === 'location' ? 'Fee' : 'Rate'}</span><RateLink target={x.ref as never} /></div>}
                  {x.group !== 'Location' && <div className="field"><span>Union</span><UnionPicker ro={ro} value={x} onChange={(patch) => setUnion(x, patch)} /></div>}
                  {x.group !== 'Location' && <div className="field"><span>Honorary societies (letters in the credits)</span><SocietiesPicker ro={ro} value={x} onChange={(patch) => setUnion(x, patch)} /></div>}
                  <ul className="doc-rows">
                    {docs.map((doc) => (
                      <li key={doc.id}>
                        <button className="link" onClick={() => onOpenDoc(doc.id)}>{paperLabel(doc.kind)}</button>
                        <span className={`doc-status s-${doc.status}`}>{statusesFor(doc.kind).find((s) => s.id === doc.status)?.label ?? doc.status}</span>
                        {doc.kind === 'deal' && doc.deal?.rate ? <span className="muted small">{money(doc.deal.rate, p.budget.currency)} / {doc.deal.per}</span> : null}
                        {doc.fileId && <button className="small" onClick={() => void openFile(doc.fileId!)}>📄</button>}
                      </li>
                    ))}
                    {!docs.length && <li className="muted small">No paperwork yet.</li>}
                  </ul>
                  {!ro && (
                    <div className="row wrap">
                      {missing.filter((k) => !docs.some((d) => d.kind === k)).map((k) => <button key={k} className="small" onClick={() => { const doc = addDoc(k, x.ref); onOpenDoc(doc.id); }}>＋ {paperLabel(k)}</button>)}
                      <button className="small" onClick={(e) => addMenu(x, { x: e.clientX, y: e.clientY })}>＋ Other…</button>
                      <label className="button-like small">📎 Attach…<input type="file" hidden multiple accept="application/pdf,image/*,.eml,.txt" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; const r = e.target.getBoundingClientRect(); attach(x, f, { x: r.left, y: r.bottom }); }} /></label>
                      <span className="spacer" />
                      {docs.some((dd) => dd.kind === 'w4' || dd.kind === 'w9' || dd.kind === 'i9') || (
                        <button className="small" onClick={() => editDocs((all) => { for (const k of (docs.find((dd) => dd.kind === 'deal')?.deal?.contractor ? ['w9'] : ['w4', 'i9']) as PaperKind[]) all.push(newDoc(p, k, x.ref)); }, 'Track start forms')}>Track start forms</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!shown.length && <p className="muted pad"><Hint>{list.length ? 'Nobody matches.' : 'Add cast and crew in Plan → Contacts or Settings, then track their deal memos, releases and start forms here.'}</Hint></p>}
      </div>
      <p className="muted small"><Hint>{'Tap a person to see their paperwork · drop a signed PDF or photo on a person to attach it · right-click (long-press) for the add menu.'}</Hint></p>
    </>
  );
}

const SHORT: Partial<Record<PaperKind, string>> = { deal: 'Deal', crew: 'Agreement', talent: 'Release', appearance: 'Release', location: 'Location', nda: 'NDA', minor: 'Permit', w9: 'W-9', w4: 'W-4', i9: 'I-9', other: 'Doc' };
const shortKind = (k: PaperKind) => SHORT[k] ?? k;

// ---------------------------------------------------------------------------------- Documents

function DocsView({ open, setOpen }: { open: string | null; setOpen: (id: string | null) => void }) {
  const { p, ro, editDocs, setDoc, addDoc, update } = usePaperwork();
  const [group, setGroup] = useState<'' | 'Deal' | 'Release' | 'Start form'>('');
  const [status, setStatus] = useState<PaperStatus | ''>('');
  const [signing, setSigning] = useState<PaperDoc | null>(null);
  const list = p.budget.paperwork ?? [];
  const shown = list.filter((d) => (!group || PAPER_KINDS.find((k) => k.id === d.kind)?.group === group) && (!status || d.status === status))
    .sort((a, b) => (open === a.id ? -1 : open === b.id ? 1 : b.updated.localeCompare(a.updated)));
  const everyone = people(p, { contacts: true, locations: true });
  const addMenu = (at: { x: number; y: number }) => openActions('New document', PAPER_KINDS.map((k) => ({
    label: k.label, run: () => {
      const first = everyone.find((x) => (k.id === 'location' ? x.group === 'Location' : x.group === 'Cast' || x.group === 'Crew'));
      if (!first) { toast('Add cast, crew or a location first'); return; }
      const doc = addDoc(k.id, first.ref); setOpen(doc.id);
    },
  })), at);
  const remove = async (doc: PaperDoc) => {
    if (!(await askConfirm(`Delete “${doc.title}”?`, { message: doc.kind === 'deal' ? 'Its kit fee line leaves the budget; the person’s rate stays.' : 'Its attached file and signature go too.' }))) return;
    editDocs((all) => { const i = all.findIndex((x) => x.id === doc.id); if (i >= 0) all.splice(i, 1); }, 'Delete paperwork');
    deletedToast(doc.title);
  };
  const sign = async (doc: PaperDoc, r: { name: string; png: Blob | null }) => {
    const mediaId = r.png ? await putMedia(p.id, r.png) : undefined;
    setDoc(doc.id, { status: 'signed', signature: { name: r.name, mediaId, at: new Date().toISOString() }, body: docText(p, doc) }, 'Sign');
    setSigning(null);
    toast(`Signed by ${r.name}`);
  };
  const pdf = async (doc: PaperDoc) => (await paperDocPdfAsync(useStore.getState().project!, doc)).save(`${safeName(doc.title)}.pdf`);

  return (
    <div onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('doc-list')) addMenu({ x: e.clientX, y: e.clientY }); }}>
      <div className="toolbar flat wrap">
        <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} aria-label="Kind"><option value="">Every kind</option><option value="Deal">Deal memos</option><option value="Release">Releases & agreements</option><option value="Start form">Start forms</option></select>
        <select value={status} onChange={(e) => setStatus(e.target.value as PaperStatus | '')} aria-label="Status"><option value="">Every status</option>{[...new Set(PAPER_KINDS.flatMap((k) => statusesFor(k.id)))].filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        {!ro && <button className="primary" onClick={(e) => addMenu({ x: e.clientX, y: e.clientY })}>＋ Document</button>}
      </div>
      <div className="doc-list license-list">
        {shown.map((doc) => (
          <DocCard key={doc.id} doc={doc} ro={ro} open={open === doc.id} everyone={everyone}
            onToggle={() => setOpen(open === doc.id ? null : doc.id)} set={(patch, label) => setDoc(doc.id, patch, label)}
            onRemove={() => void remove(doc)} onSign={() => setSigning(doc)} onPdf={() => void pdf(doc)}
            onAttach={async (files) => { const f = okFiles(files)[0]; if (!f) { toast('Attach a PDF, photo or email'); return; } setDoc(doc.id, { fileId: await putMedia(p.id, f), status: isForm(doc.kind) ? 'received' : doc.status === 'draft' || doc.status === 'sent' ? 'signed' : doc.status }, 'Attach file'); }}
            onSaveTemplate={(text) => update((d) => { d.budget.templates = { ...d.budget.templates, [doc.kind]: text }; }, 'Save template')} />
        ))}
        {!shown.length && <p className="muted pad"><Hint>{list.length ? 'Nothing matches these filters.' : 'No documents yet. Add one with ＋ Document (or double-click here), or open a person in People.'}</Hint></p>}
      </div>
      {signing && <SignaturePad title={`Sign: ${signing.title}`} text={docText(p, signing)} defaultName={personOf(p, signing.person)?.name.replace(/^\(.*\)$/, '') ?? ''} onCancel={() => setSigning(null)} onDone={(r) => void sign(signing, r)} />}
    </div>
  );
}

function DocCard({ doc, ro, open, everyone, onToggle, set, onRemove, onSign, onPdf, onAttach, onSaveTemplate }: {
  doc: PaperDoc; ro: boolean; open: boolean; everyone: Person[]; onToggle: () => void; set: (patch: Partial<PaperDoc>, label?: string | null) => void;
  onRemove: () => void; onSign: () => void; onPdf: () => void; onAttach: (f: File[]) => void; onSaveTemplate: (text: string) => void;
}) {
  const p = useProject();
  const who = personOf(p, doc.person);
  const signed = !!doc.signature;
  const deal = doc.deal;
  const setDeal = (patch: Partial<DealTerms>, label: string | null = null) => set({ deal: { ...(deal ?? { rate: 0, per: 'day' }), ...patch } }, label);
  const kindInfo = PAPER_KINDS.find((k) => k.id === doc.kind);
  const pool = everyone.filter((x) => (doc.kind === 'location' ? x.group === 'Location' : x.group !== 'Location'));
  return (
    <div className={`license-card paper-card st-${doc.status} ${open ? 'open' : ''}`}>
      <div className="license-head" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onToggle(); }}>
        <span className="chip small">{paperLabel(doc.kind)}</span>
        <b className="grow">{who?.name ?? <span className="muted">Nobody</span>}<span className="muted"> {who?.role}</span></b>
        {signed && <span className="muted small">✍ {formatDate(doc.signature!.at.slice(0, 10))}</span>}
        <span className={`doc-status s-${doc.status}`}>{statusesFor(doc.kind).find((s) => s.id === doc.status)?.label ?? doc.status}</span>
        <span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div className="license-body">
          <div className="seg small wrap" role="radiogroup" aria-label="Status">
            {statusesFor(doc.kind).map((s) => <button key={s.id} role="radio" aria-checked={doc.status === s.id} disabled={ro} className={doc.status === s.id ? 'active' : ''} onClick={() => set({ status: s.id }, 'Paperwork status')}>{s.label}</button>)}
          </div>
          {kindInfo?.hint && <p className="muted small">{kindInfo.hint}.</p>}
          <div className="form-grid">
            <label className="field"><span>For</span>
              <select disabled={ro || signed} value={refKey(doc.person)} onChange={(e) => { const x = pool.find((y) => y.key === e.target.value); if (x) set({ person: x.ref, title: `${paperLabel(doc.kind)} — ${x.name}` }, 'Change person'); }}>
                {!who && <option value="">—</option>}
                {pool.map((x) => <option key={x.key} value={x.key}>{x.name} ({x.group}{x.role ? `, ${x.role}` : ''})</option>)}
              </select>
            </label>
            {(doc.kind === 'minor' || doc.kind === 'location' || doc.kind === 'other') && <label className="field"><span>Expires</span><input type="date" disabled={ro} value={doc.expires ?? ''} onChange={(e) => set({ expires: e.target.value || undefined })} /></label>}
            {isForm(doc.kind) && <label className="field wide"><span>Where it’s kept</span><input disabled={ro} value={doc.where ?? ''} placeholder="Accountant’s folder, payroll company…" onChange={(e) => set({ where: e.target.value || undefined })} /></label>}
          </div>
          {doc.kind === 'deal' && (
            <div className="form-grid deal-grid">
              <label className="field"><span>Rate</span><MoneyInput min={0} disabled={ro} per={deal?.per === 'flat' ? 'flat' : deal?.per === 'week' ? 'week' : 'day'} value={deal?.rate ?? 0} onChange={(n) => setDeal({ rate: n ?? 0 })} /></label>
              <label className="field"><span>Per</span><select disabled={ro} value={deal?.per ?? 'day'} onChange={(e) => setDeal({ per: e.target.value as DealTerms['per'] }, 'Deal rate basis')}><option value="day">Day</option><option value="week">Week</option><option value="flat">Flat (whole job)</option></select></label>
              <label className="field"><span>Kit / box fee</span><MoneyInput min={0} disabled={ro} per={deal?.kitPer === 'flat' ? 'flat' : deal?.kitPer === 'week' ? 'week' : 'day'} value={deal?.kitFee} onChange={(n) => setDeal({ kitFee: n })} /></label>
              <label className="field"><span>Kit per</span><select disabled={ro} value={deal?.kitPer ?? 'day'} onChange={(e) => setDeal({ kitPer: e.target.value as DealTerms['per'] }, 'Kit basis')}><option value="day">Day</option><option value="week">Week</option><option value="flat">Flat</option></select></label>
              <label className="field"><span>Guaranteed days</span><NumberInput suffix="days" min={0} decimals={1} disabled={ro} value={deal?.guaranteedDays} onChange={(n) => setDeal({ guaranteedDays: n })} /></label>
              <label className="field"><span>Overtime after</span><NumberInput suffix="h" min={1} decimals={1} disabled={ro} value={deal?.otAfter} placeholder={String(rulesOf(p).otAfter)} onChange={(n) => setDeal({ otAfter: n })} /></label>
              <label className="field"><span>Overtime pay</span><NumberInput suffix="×" min={1} decimals={2} disabled={ro} value={deal?.otMult} placeholder="1.5" onChange={(n) => setDeal({ otMult: n })} /></label>
              <label className="check field"><input type="checkbox" disabled={ro} checked={!!deal?.contractor} onChange={(e) => setDeal({ contractor: e.target.checked || undefined }, 'Contractor')} /> Contractor (W-9 / 1099)</label>
              <p className="muted small wide">The rate goes into {who?.name ?? 'this person'}’s budget line{deal?.kitFee ? ', and the kit fee becomes its own line' : ''}.</p>
            </div>
          )}
          {!isForm(doc.kind) && doc.kind !== 'minor' && (
            <div className="field wide"><span>Text {signed ? '(signed — locked)' : doc.kind === 'deal' && !doc.body ? '(filled from the terms above)' : ''}</span>
              <textarea rows={10} className="doc-text" disabled={ro || signed} value={doc.body ?? docText(p, doc)} onChange={(e) => set({ body: e.target.value })} />
              <span className="muted small">⚖ {LAWYER_NOTE}</span>
              {!ro && !signed && doc.body && builtInTemplate(doc.kind) && (
                <span className="row wrap">
                  <button className="link small" onClick={() => onSaveTemplate(doc.body!)}>Use this wording for new {paperLabel(doc.kind).toLowerCase()}s</button>
                  {doc.kind === 'deal' && <button className="link small" onClick={() => set({ body: undefined }, 'Refill from terms')}>Refill from the terms</button>}
                </span>
              )}
            </div>
          )}
          <label className="field wide"><span>Notes</span><textarea rows={2} disabled={ro} value={doc.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></label>
          <div className="row wrap">
            {!ro && signable(doc.kind) && !signed && <button className="primary small" onClick={onSign}>✍ Sign here…</button>}
            {!isForm(doc.kind) && <button className="small" onClick={onPdf}>PDF</button>}
            {doc.fileId && <button className="small" onClick={() => void openFile(doc.fileId!)}>📄 Open file</button>}
            {!ro && <label className="button-like small">{doc.fileId ? 'Replace file…' : '📎 Attach signed copy…'}<input type="file" hidden accept="application/pdf,image/*,.eml,.txt" onChange={(e) => { onAttach([...(e.target.files ?? [])]); e.target.value = ''; }} /></label>}
            <span className="spacer" />
            {!ro && signed && <button className="small" onClick={async () => { if (await askConfirm('Remove the signature?', { message: 'The document goes back to Sent, and its text can be edited again.' })) set({ signature: undefined, status: 'sent' }, 'Remove signature'); }}>Unsign</button>}
            {!ro && <button className="small danger-text" onClick={onRemove}>Delete</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------- Clearances

function ClearancesView({ onOpenDoc }: { onOpenDoc: (id: string) => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('budget');
  const [status, setStatus] = useState<ClearanceStatus | ''>('');
  const list = p.budget.clearances ?? [];
  const shown = list.filter((c) => !status || c.status === status);
  const edit = (fn: (l: Clearance[]) => void, label: string | null = 'Edit clearance') => update((dr) => { dr.budget.clearances ??= []; fn(dr.budget.clearances); }, label);
  const set = (id: string, patch: Partial<Clearance>, label: string | null = null) => edit((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const add = (kind: ClearanceKind = 'other') => edit((l) => { l.unshift(newClearance(kind)); }, 'Add clearance');
  const scan = () => {
    const hits = scanScript(p, d);
    let n = 0;
    update((dr) => { n = applyScan(dr, hits); }, 'Scan script for clearances');
    toast(n ? `Found ${n} new item${n > 1 ? 's' : ''} to check` : hits.length ? 'Nothing new: everything found is already in the log' : 'Nothing found to clear in the script');
  };
  const done = list.filter((c) => c.status === 'cleared' || c.status === 'na').length;
  const docs = p.budget.paperwork ?? [];

  return (
    <div onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('clearance-list')) add(); }}>
      <div className="toolbar flat wrap">
        {!ro && <button className="primary" onClick={scan}>Scan script</button>}
        {!ro && <button onClick={(e) => openActions('Add a clearance', CLEARANCE_KINDS.map((k) => ({ label: k.label, run: () => add(k.id) })), { x: e.clientX, y: e.clientY })}>＋ Clearance</button>}
        <select value={status} onChange={(e) => setStatus(e.target.value as ClearanceStatus | '')} aria-label="Status"><option value="">Every status</option>{CLEARANCE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <span className="spacer" />
        <span className="muted small">{done} of {list.length} done</span>
        <More label="Clearance exports">
          <button onClick={() => download(`${safeName(p.title)} - script clearance report.csv`, clearanceReportCsv(p, d), 'text/csv')}>Clearance report (CSV)</button>
          <button onClick={() => clearanceReportPdf(p, d).save(`${safeName(p.title)} - script clearance report.pdf`)}>Clearance report (PDF)</button>
        </More>
      </div>
      <p className="muted small"><Hint>{'Scan script lists every location the script shoots at (one per script set or real location), and looks for phone numbers, addresses, websites, brand names, full character names and tagged props, wardrobe and signage that may need clearing. It only suggests: you decide. E&O insurers usually ask for this report.'}</Hint></p>
      <div className="clearance-list">
        {shown.map((c) => (
          <div key={c.id} className={`clearance-row st-${c.status}`}>
            <select disabled={ro} value={c.kind} aria-label="Kind" onChange={(e) => set(c.id, { kind: e.target.value as ClearanceKind }, 'Clearance kind')}>{CLEARANCE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <input disabled={ro} className="grow" value={c.item} placeholder="What needs clearing" aria-label="Item" onChange={(e) => set(c.id, { item: e.target.value })} />
            <span className="chips">
              {c.sceneIds.map((id) => <span key={id} className="chip small">Sc {d.sceneById.get(id)?.number ?? '?'}</span>)}
              {!ro && <select value="" aria-label="Add scene" onChange={(e) => e.target.value && set(c.id, { sceneIds: [...c.sceneIds, e.target.value] }, 'Tie scene')}><option value="">＋ Sc</option>{d.scenes.filter((s) => !c.sceneIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.number}. {s.heading}</option>)}</select>}
            </span>
            <select disabled={ro} value={c.status} aria-label="Status" className={`doc-status s-${c.status}`} onChange={(e) => set(c.id, { status: e.target.value as ClearanceStatus }, 'Clearance status')}>{CLEARANCE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <select disabled={ro} value={c.docId ?? ''} aria-label="Covered by" onChange={(e) => set(c.id, { docId: e.target.value || undefined, status: e.target.value ? 'cleared' : c.status }, 'Link release')}>
              <option value="">No release linked</option>
              {docs.filter((x) => !isForm(x.kind)).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
            {c.docId && <button className="link small" onClick={() => onOpenDoc(c.docId!)}>Open</button>}
            {c.locationId && p.locations.some((l) => l.id === c.locationId) && <button className="link small" title="Open this location in Plan → Locations" onClick={() => openLocation(c.locationId!)}>📍 Location</button>}
            {!ro && c.status !== 'cleared' && c.docId && docs.find((x) => x.id === c.docId)?.status === 'signed' && <button className="small" onClick={() => set(c.id, { status: 'cleared' }, 'Mark cleared')}>Mark cleared</button>}
            <input disabled={ro} className="clearance-notes" value={c.notes ?? ''} placeholder="Notes" aria-label="Notes" onChange={(e) => set(c.id, { notes: e.target.value || undefined })} />
            {c.fileId && <button className="small" onClick={() => void openFile(c.fileId!)}>📄</button>}
            {!ro && <label className="button-like small" title="Attach a permission letter or photo">📎<input type="file" hidden accept="application/pdf,image/*,.eml,.txt" onChange={async (e) => { const f = okFiles([...(e.target.files ?? [])])[0]; e.target.value = ''; if (f) set(c.id, { fileId: await putMedia(p.id, f) }, 'Attach clearance'); }} /></label>}
            {!ro && <button className="icon-btn" aria-label="Delete clearance" onClick={() => { edit((l) => { const i = l.findIndex((x) => x.id === c.id); if (i >= 0) l.splice(i, 1); }, 'Delete clearance'); deletedToast(c.item || clearanceLabel(c.kind)); }}>×</button>}
          </div>
        ))}
        {!shown.length && <p className="muted pad"><Hint>{list.length ? 'Nothing with this status.' : 'No clearances yet. Scan the script, or add items by hand (double-click here).'}</Hint></p>}
      </div>
      {(p.budget.licenses ?? []).length > 0 && (
        <>
          <h4>Licenses</h4>
          <ul className="doc-rows">
            {(p.budget.licenses ?? []).map((l) => <li key={l.id}><span className="chip small">{l.kind}</span> {l.title || 'Untitled'} <span className={`doc-status s-${l.status}`}>{l.status}</span></li>)}
          </ul>
          <button className="link small" onClick={() => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: 'licenses' }))}>Edit in Budget → Licenses</button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------- Time cards

function TimeView() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('budget');
  const shootDays = p.schedule.days.filter((x) => x.items.some((i) => i.kind === 'scene'));
  const [dayId, setDayId] = useState(shootDays[0]?.id ?? '');
  const day = shootDays.find((x) => x.id === dayId) ?? shootDays[0];
  const rules = rulesOf(p);
  const cards = (p.budget.timecards ?? []).filter((c) => c.dayId === day?.id);
  const edit = (fn: (l: TimeCard[]) => void, label: string | null = 'Edit time card') => update((dr) => { dr.budget.timecards ??= []; fn(dr.budget.timecards); }, label);
  const set = (id: string, patch: Partial<TimeCard>) => edit((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, null);
  const fill = () => {
    if (!day) return;
    const add = cardsFromCallSheet(p, d, day);
    if (!add.length) { toast('Everyone on this call sheet already has a card'); return; }
    edit((l) => { l.push(...add); }, 'Fill time cards from call sheet');
  };
  const everyone = people(p);
  const addPerson = (at: { x: number; y: number }) => openActions('Add a time card', everyone.filter((x) => !cards.some((c) => refKey(c.person) === x.key)).map((x) => ({
    label: `${x.name} — ${x.role}`, run: () => edit((l) => { l.push({ id: newId(), dayId: day!.id, person: x.ref }); }, 'Add time card'),
  })), at);
  const setRules = (patch: Partial<typeof rules>) => update((dr) => { dr.budget.payrollRules = { ...rulesOf(dr as Project), ...patch }; }, 'Payroll rules');
  const pay = payrollRows(p, day?.id);
  const $ = (n: number) => money(n, p.budget.currency);

  if (!shootDays.length) return <p className="muted pad"><Hint>{'Schedule scenes on shoot days (Breakdown → Stripboard) and time cards can be filled in from each day’s call sheet.'}</Hint></p>;
  return (
    <>
      <div className="toolbar flat wrap">
        <select value={day?.id} onChange={(e) => setDayId(e.target.value)} aria-label="Shoot day">
          {shootDays.map((x, i) => <option key={x.id} value={x.id}>Day {i + 1} · {formatDate(x.date)}</option>)}
        </select>
        {!ro && <button className="primary" onClick={fill}>Fill from call sheet</button>}
        {!ro && <button onClick={(e) => addPerson({ x: e.clientX, y: e.clientY })}>＋ Person</button>}
        <span className="spacer" />
        <More label="Payroll exports">
          <button disabled={!(p.budget.timecards ?? []).length} onClick={() => download(`${safeName(p.title)} - payroll.csv`, payrollCsv(p), 'text/csv')}>Payroll (CSV)</button>
          <button disabled={!(p.budget.timecards ?? []).length} onClick={() => download(`${safeName(p.title)} - time cards.csv`, timecardsCsv(p), 'text/csv')}>All time cards (CSV)</button>
          <button disabled={!payrollRows(p).some((r) => r.contractor)} onClick={() => download(`${safeName(p.title)} - contractor totals.csv`, contractorCsv(p), 'text/csv')}>Contractor totals for 1099s (CSV)</button>
        </More>
      </div>
      <div className="timecards-wrap">
      <table className="table timecards cards-on-phone">
        <thead><tr><th>Person</th><th>In</th><th>Meal out</th><th>Meal in</th><th>Out</th><th>Hours</th><th>OT</th><th>DT</th><th>Meal pen.</th><th>Notes</th><th /></tr></thead>
        <tbody onDoubleClick={(e) => { if (!ro && !(e.target as HTMLElement).closest('input,button,select')) addPerson({ x: e.clientX, y: e.clientY }); }}>
          {cards.map((c) => {
            const who = personOf(p, c.person);
            const deal = docsFor(p, c.person).find((x) => x.kind === 'deal')?.deal;
            const h = cardHours(c, rules, deal?.otAfter ?? rules.otAfter);
            const t = (k: 'in' | 'mealOut' | 'mealIn' | 'out') => <input type="time" disabled={ro} value={c[k] ?? ''} onChange={(e) => set(c.id, { [k]: e.target.value || undefined })} />;
            return (
              <tr key={c.id}>
                <td><b>{who?.name ?? '?'}</b> <span className="muted small">{who?.role}</span></td>
                <td>{t('in')}</td><td>{t('mealOut')}</td><td>{t('mealIn')}</td><td>{t('out')}</td>
                <td>{h.complete ? h.worked : '—'}</td>
                <td className={h.ot ? 'warn' : ''}>{h.complete ? h.ot : ''}</td>
                <td className={h.dt ? 'warn' : ''}>{h.complete ? h.dt : ''}</td>
                <td className={h.penalties ? 'warn' : ''}>{h.complete ? h.penalties : ''}</td>
                <td><input disabled={ro} value={c.notes ?? ''} onChange={(e) => set(c.id, { notes: e.target.value || undefined })} /></td>
                <td>{!ro && <button className="icon-btn" aria-label="Delete time card" onClick={() => edit((l) => { const i = l.findIndex((x) => x.id === c.id); if (i >= 0) l.splice(i, 1); }, 'Delete time card')}>×</button>}</td>
              </tr>
            );
          })}
          {!cards.length && <tr><td colSpan={11} className="muted pad"><Hint>{'No time cards for this day. Fill from the call sheet (call, lunch and wrap times come in; type the actual times), or add a person.'}</Hint></td></tr>}
        </tbody>
      </table>
      </div>
      {pay.length > 0 && <p className="muted small">This day: {pay.map((r) => `${r.name} ${$(r.gross)}`).join(' · ')}{pay.some((r) => !r.rate) ? ' (people without a deal memo count as 0)' : ''}</p>}
      <details className="payroll-rules">
        <summary>Overtime & meal rules</summary>
        <div className="form-grid">
          <label className="field"><span>Overtime (1.5×) after</span><NumberInput suffix="h" min={1} decimals={1} disabled={ro} value={rules.otAfter} onChange={(n) => setRules({ otAfter: Math.max(1, n ?? 8) })} /></label>
          <label className="field"><span>Double time after</span><NumberInput suffix="h" min={1} decimals={1} disabled={ro} value={rules.dtAfter} onChange={(n) => setRules({ dtAfter: Math.max(1, n ?? 12) })} /></label>
          <label className="field"><span>Meal due within</span><NumberInput suffix="h" min={1} decimals={1} disabled={ro} value={rules.mealEvery} onChange={(n) => setRules({ mealEvery: Math.max(0, n ?? 6) })} /></label>
          <label className="field"><span>Meal penalty</span><MoneyInput per="halfhour" min={0} disabled={ro} value={rules.mealPenalty} onChange={(n) => setRules({ mealPenalty: n ?? 0 })} /></label>
        </div>
        <p className="muted small">Union agreements set their own overtime and meal rules: check yours. The payroll CSV is a generic layout that payroll services can map on import; Open Gate doesn’t run payroll.</p>
      </details>
    </>
  );
}
