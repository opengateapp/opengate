import { useEffect, useMemo, useRef, useState } from 'react';
import type { Draft } from 'immer';
import type { CallSheet, CallSheetSection, ShootDay } from '../../model/types';
import { useDerived, useProject, useStore, getDerived } from '../../store/project';
import { Empty, toast } from '../../components/common';
import { newId } from '../../model/ids';
import { formatClock12, formatDate, formatEighths, parseClock } from '../../model/dates';
import {
  autofillCallSheet, ensureLayout, resolveCallSheet, infoValue, advanceSchedule, callDayLabel, parseCoords, sunriseSunset,
  SECTION_LABELS, SECTION_TEMPLATES, type ResolvedCallSheet,
} from '../../schedule/callsheet';
import { buildDood, shootDays } from '../../schedule/dood';
import { download, safeName } from '../../io/files';
import { putMedia, useMediaUrl } from '../../store/media';
import { prepareImage } from '../storyboard/images';
import { deletedToast } from '../../components/deleted';
import { sceneCast, sceneEighths } from '../../script/derive';

/** Call sheets as an editable page: header blocks, a big call time, and sections you can hide, reorder, add and remove. */
export function CallSheetsView({ onBack }: { onBack?: () => void }) {
  const p = useProject();
  // Shoot days, plus any other day you've made a call sheet for (prep, tech scouts, rehearsals…).
  const shoot = shootDays(p);
  const days = [
    ...shoot,
    ...p.schedule.days.filter((x) => p.callSheets[x.id] && !shoot.some((s) => s.day.id === x.id)).map((day) => ({ day, number: 0 })),
  ].sort((a, b) => a.day.date.localeCompare(b.day.date));
  const otherDays = p.schedule.days.filter((x) => !days.some((s) => s.day.id === x.id));
  const createFor = (id: string) => {
    useStore.getState().update((dr) => {
      const pr = useStore.getState().project!;
      const day = pr.schedule.days.find((x) => x.id === id)!;
      dr.callSheets[id] = autofillCallSheet(pr, getDerived(), day) as Draft<CallSheet>;
    }, 'New call sheet');
    setDayId(id);
  };
  const [dayId, setDayId] = useState<string | null>(null);
  const current = days.find((x) => x.day.id === dayId) ?? days[0];

  const exportAll = async () => {
    const { callSheetPdfAsync } = await import('../../pdf/callSheetPdf');
    const pr = useStore.getState().project!;
    download(`${safeName(p.title)} - call sheets.pdf`, (await callSheetPdfAsync(pr, getDerived(), days.map((x) => x.day))).output('blob'));
  };

  return (
    <div className="with-side reports-sub">
      <aside className="side" data-panel="Shoot days" data-panel-pick>
        {onBack && <div className="side-head"><button className="link" onClick={onBack}>← Reports</button></div>}
        <div className="side-head"><h3>Call sheets</h3></div>
        {days.length === 0 && <p className="muted small pad">No shoot days yet. Pick a date below, or put scenes on days in the Stripboard and they'll show up here.</p>}
        {days.map(({ day, number }) => (
          <button key={day.id} className={`side-link ${current?.day.id === day.id ? 'active' : ''}`} onClick={() => setDayId(day.id)}>
            <b>{number ? `Day ${number}` : 'Other'}</b> <span className="muted small">{formatDate(day.date)}</span>
            {p.callSheets[day.id] && <span className="badge" style={{ marginLeft: 6 }}>edited</span>}
          </button>
        ))}
        {otherDays.length > 0 && (
          <div className="pad">
            <select className="full" value="" onChange={(e) => e.target.value && createFor(e.target.value)}>
              <option value="">+ Call sheet for another date…</option>
              {otherDays.map((x) => <option key={x.id} value={x.id}>{formatDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' })}</option>)}
            </select>
            <p className="muted small">Dates come from the production range (Stripboard / Calendar).</p>
          </div>
        )}
        {days.length > 1 && <div className="pad"><button className="full" onClick={() => void exportAll()}>Download all {days.length} days</button></div>}
      </aside>
      <div className="main scroll cs-scroll">
        {current
          ? <CallSheetPage key={current.day.id} day={current.day} number={current.number} onGoToDay={setDayId} />
          : <Empty title="No call sheets yet"><p className="muted">Choose a date on the left to start one — scenes, cast and locations fill in once the day is scheduled.</p></Empty>}
      </div>
    </div>
  );
}

type Edit = (fn: (s: Draft<CallSheet>) => void, label?: string | null) => void;

function CallSheetPage({ day, number, onGoToDay }: { day: ShootDay; number: number; onGoToDay: (id: string) => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const dood = useMemo(() => buildDood(p, d), [p, d]);
  const r = resolveCallSheet(p, d, day, dood);
  const cs = r.sheet;
  const [menu, setMenu] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) { setMenu(false); setAddOpen(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /** Edits the stored sheet, creating it (with layout) on first edit. */
  const edit: Edit = (fn, label = null) => update((dr) => {
    const pr = useStore.getState().project!;
    const dd = pr.schedule.days.find((x) => x.id === day.id)!;
    const existing = pr.callSheets[day.id];
    if (!existing) dr.callSheets[day.id] = autofillCallSheet(pr, getDerived(), dd) as Draft<CallSheet>;
    else if (!existing.sections || !existing.infoRows || !existing.keyContacts) dr.callSheets[day.id] = ensureLayout(pr, dd, existing) as Draft<CallSheet>;
    fn(dr.callSheets[day.id]);
  }, label);
  const setDayTime = (k: keyof ShootDay['times'], v: string) => update((dr) => { dr.schedule.days.find((x) => x.id === day.id)!.times[k] = v || undefined; }, null);

  const pdfBlob = async () => {
    const { callSheetPdfAsync } = await import('../../pdf/callSheetPdf');
    return (await callSheetPdfAsync(useStore.getState().project!, getDerived(), [day])).output('blob');
  };
  const fileName = `${safeName(cs.fileName || `${p.title} call sheet day ${number}`)}.pdf`;

  const downloadPdf = async () => {
    setBusy(true);
    try { download(fileName, await pdfBlob()); } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const sendPdf = async () => {
    setBusy(true);
    try {
      const blob = await pdfBlob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: cs.fileName || 'Call sheet', text: `Call sheet — Day ${number}, ${formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}` });
      } else {
        // No system share sheet: download the PDF and open an email to the cast and crew to attach it to.
        download(fileName, blob);
        const emails = [...new Set([
          ...cs.crew.map((c) => c.email ?? ''),
          ...cs.cast.map((c) => p.cast.find((m) => m.characterName.toUpperCase() === c.characterName.toUpperCase())?.email ?? ''),
        ].filter((e) => /@/.test(e)))];
        const subject = `Call sheet — ${p.title} — Day ${number} (${formatDate(day.date)})`;
        const body = `Hi all,\n\nAttached is the call sheet for Day ${number}, ${formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric' })}. General call ${r.clock.generalCall !== null ? formatClock12(r.clock.generalCall) : 'TBA'}.\n\n(Attach the downloaded file: ${fileName})`;
        window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        toast('PDF downloaded — attach it to the email that just opened.');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast((e as Error).message);
    } finally { setBusy(false); }
  };

  const otherDays = shootDays(p).filter((x) => x.day.id !== day.id);
  const duplicateTo = (targetId: string) => {
    update((dr) => {
      const pr = useStore.getState().project!;
      const target = pr.schedule.days.find((x) => x.id === targetId)!;
      const source = ensureLayout(pr, day, pr.callSheets[day.id] ?? autofillCallSheet(pr, getDerived(), day));
      // Copy the layout, notes, contacts and crew; cast, scenes and locations come from the target day.
      const fresh = autofillCallSheet(pr, getDerived(), target);
      const copy: CallSheet = JSON.parse(JSON.stringify({
        ...fresh,
        ...source,
        // Default names follow the day; custom names get "(copy)".
        fileName: /^Call sheet( – Day \d+)?$/.test(source.fileName ?? '') ? fresh.fileName : `${source.fileName} (copy)`,
        cast: fresh.cast, locations: fresh.locations, sceneNotes: {},
      }));
      dr.callSheets[targetId] = copy as Draft<CallSheet>;
    }, 'Duplicate call sheet');
    setMenu(false);
    onGoToDay(targetId);
    toast('Duplicated — cast, scenes and locations were refreshed for that day.');
  };
  const copyLayoutToAll = () => {
    update((dr) => {
      const pr = useStore.getState().project!;
      const src = ensureLayout(pr, day, pr.callSheets[day.id] ?? autofillCallSheet(pr, getDerived(), day));
      for (const { day: other } of otherDays) {
        const base = pr.callSheets[other.id] ?? autofillCallSheet(pr, getDerived(), other);
        dr.callSheets[other.id] = JSON.parse(JSON.stringify({
          ...base, logoId: src.logoId, productionTitle: src.productionTitle, companyInfo: src.companyInfo, keyContacts: src.keyContacts,
          infoRows: src.infoRows?.map((x) => ({ ...x, value: x.bind ? '' : x.value })),
          sections: src.sections?.map((s) => ({ ...s, text: s.kind === 'notes' ? base.sections?.find((b) => b.id === s.id)?.text ?? '' : s.text })),
        }));
      }
    }, 'Copy layout to all days');
    setMenu(false);
    toast(`Layout copied to ${otherDays.length} other day${otherDays.length === 1 ? '' : 's'}.`);
  };

  const sections = cs.sections ?? [];
  const missingBuiltIns = (['scenes', 'cast', 'crew', 'locations', 'advance'] as const).filter((k) => !sections.some((s) => s.kind === k));
  const addSection = (s: CallSheetSection) => { edit((x) => { x.sections!.push(s); }, 'Add section'); setAddOpen(false); };

  return (
    <div className="cs-wrap">
      <div className="cs-filebar">
        <div className="cs-file">
          <span className="cs-file-label">FILE NAME</span>
          <input className="cs-file-name" value={cs.fileName ?? ''} placeholder="Untitled" onChange={(e) => { const v = e.target.value; edit((s) => { s.fileName = v; }); }} />
        </div>
        <span className="spacer" />
        <button className="cs-btn" disabled={busy} onClick={() => void downloadPdf()}>Download PDF</button>
        <button className="cs-btn" disabled={busy} onClick={() => void sendPdf()}>Send PDF</button>
        <div className="menu-wrap" ref={menuRef}>
          <button className="cs-btn" onClick={() => setMenu(!menu)} aria-label="More">…</button>
          {menu && (
            <div className="menu right-0 cs-menu">
              {otherDays.length > 0 && (
                <label className="menu-select">Duplicate to…
                  <select value="" onChange={(e) => e.target.value && duplicateTo(e.target.value)}>
                    <option value="">Choose a day</option>
                    {otherDays.map(({ day: o, number: n }) => <option key={o.id} value={o.id}>Day {n} — {formatDate(o.date)}{p.callSheets[o.id] ? ' (replace)' : ''}</option>)}
                  </select>
                </label>
              )}
              {otherDays.length > 0 && <button onClick={copyLayoutToAll}>Copy layout to all days</button>}
              <button onClick={() => { update((dr) => { const pr = useStore.getState().project!; dr.callSheets[day.id] = autofillCallSheet(pr, getDerived(), day, pr.callSheets[day.id]) as Draft<CallSheet>; }, 'Refresh call sheet'); setMenu(false); }}>Refresh from schedule</button>
              <hr />
              <button className="danger" onClick={() => { update((dr) => { delete dr.callSheets[day.id]; }, 'Delete call sheet'); setMenu(false); deletedToast('call sheet — it was rebuilt from the schedule'); }}>Delete</button>
            </div>
          )}
        </div>
      </div>
      <p className="cs-autosave">Every change you make is saved automatically · {number ? `Day ${number} of ${r.totalDays}` : 'Not a shoot day'} — {formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      {r.missingCast.length > 0 && <p className="warn small cs-note">In today's scenes but not on this sheet: {r.missingCast.join(', ')} — use … → Refresh from schedule.</p>}

      <div className="cs-page">
        <div className="cs-row3">
          <CompanyBox cs={cs} edit={edit} />
          <LogoTitle cs={cs} edit={edit} projectId={p.id} />
          <InfoBox cs={cs} r={r} day={day} edit={edit} />
        </div>
        <div className="cs-row3">
          <MapBox cs={cs} edit={edit} />
          <div className="cs-call">
            <div className="cs-call-ring">
              <span className="cs-call-label">CALL</span>
              <label className="cs-call-edit" title="General crew call — click to change (same time as the stripboard day)"
                onClick={(e) => { const i = (e.currentTarget as HTMLElement).querySelector('input') as HTMLInputElement & { showPicker?: () => void }; try { i.showPicker?.(); } catch { i.focus(); } }}>
                <span className="cs-call-big">{compactTime(r.clock.generalCall)}</span>
                <input type="time" value={day.times.generalCall ?? p.production.defaultCall ?? ''} onChange={(e) => setDayTime('generalCall', e.target.value)} />
              </label>
              <span className="cs-call-day">{callDayLabel(day.date)}</span>
            </div>
          </div>
          <div className="cs-box">
            <textarea className="cs-notes" value={cs.topNotes ?? ''} placeholder="Additional notes: parking, safety, walkie channels…" onChange={(e) => { const v = e.target.value; edit((s) => { s.topNotes = v; }); }} />
          </div>
        </div>

        {sections.map((sec, i) => (
          <SectionView key={sec.id} sec={sec} index={i} count={sections.length} r={r} day={day} edit={edit} />
        ))}

        <div className="cs-add-section menu-wrap">
          <button className="cs-add" onClick={() => setAddOpen(!addOpen)}>+ Add section</button>
          {addOpen && (
            <div className="menu cs-menu">
              {missingBuiltIns.map((k) => <button key={k} onClick={() => addSection({ id: newId(), kind: k, title: SECTION_LABELS[k] })}>{SECTION_LABELS[k]}</button>)}
              {missingBuiltIns.length > 0 && <hr />}
              {SECTION_TEMPLATES.filter((t) => !(t.label.startsWith('Locations') && missingBuiltIns.includes('locations')) && !(t.label.startsWith('Advance') && missingBuiltIns.includes('advance'))).map((t) => (
                <button key={t.label} onClick={() => addSection(t.make())}>{t.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 9:00 AM → "9AM", 7:30 AM → "7:30AM" (the big call-time style). */
export function compactTime(m: number | null): string {
  if (m === null) return '—';
  return formatClock12(m).replace(':00 ', '').replace(' ', '');
}

// ---- Header blocks ----

function CompanyBox({ cs, edit }: { cs: CallSheet; edit: Edit }) {
  const contacts = cs.keyContacts ?? [];
  return (
    <div className="cs-box cs-company">
      <textarea className="cs-company-info" rows={5} value={cs.companyInfo ?? ''} placeholder={'Company name\nAddress\nCity\nWebsite\nPhone'} onChange={(e) => { const v = e.target.value; edit((s) => { s.companyInfo = v; }); }} />
      <table className="cs-table compact">
        <tbody>
          {contacts.map((c, i) => (
            <tr key={c.id}>
              <td><input value={c.role} placeholder="Role" onChange={(e) => { const v = e.target.value; edit((s) => { s.keyContacts![i].role = v; }); }} /></td>
              <td><input value={c.name} placeholder="Name" onChange={(e) => { const v = e.target.value; edit((s) => { s.keyContacts![i].name = v; }); }} /></td>
              <td><input value={c.phone} placeholder="Phone" onChange={(e) => { const v = e.target.value; edit((s) => { s.keyContacts![i].phone = v; }); }} /></td>
              <td className="cs-x"><button className="icon-btn" onClick={() => edit((s) => { s.keyContacts!.splice(i, 1); }, 'Remove contact')}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="cs-addrow" onClick={() => edit((s) => { s.keyContacts!.push({ id: newId(), role: '', name: '', phone: '' }); }, 'Add contact')}>+ Add contact</button>
    </div>
  );
}

function LogoTitle({ cs, edit, projectId }: { cs: CallSheet; edit: Edit; projectId: string }) {
  const url = useMediaUrl(cs.logoId);
  const [over, setOver] = useState(false);
  const upload = async (f?: File | null) => {
    if (!f) return;
    try {
      const id = await putMedia(projectId, await prepareImage(f));
      edit((s) => { s.logoId = id; }, 'Add logo');
    } catch (e) { toast((e as Error).message); }
  };
  return (
    <div className="cs-logo-title">
      <label className={`cs-logo ${url ? 'has' : ''} ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]); }}
        title="Click or drop an image">
        {url ? <img src={url} alt="Logo" /> : <span className="cs-logo-btn">Upload logo</span>}
        <input type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {url && <button className="link small" onClick={() => edit((s) => { s.logoId = undefined; }, 'Remove logo')}>Remove logo</button>}
      <input className="cs-title" value={cs.productionTitle ?? ''} placeholder="Production Title" onChange={(e) => { const v = e.target.value; edit((s) => { s.productionTitle = v; }); }} />
    </div>
  );
}

function InfoBox({ cs, r, day, edit }: { cs: CallSheet; r: ResolvedCallSheet; day: ShootDay; edit: Edit }) {
  const [weather, setWeather] = useState(false);
  const rows = cs.infoRows ?? [];
  const calcSun = () => {
    const c = parseCoords(cs.coords);
    if (!c) { toast('Enter coordinates as "latitude, longitude", e.g. 34.05, -118.24'); return; }
    const t = sunriseSunset(day.date, c.lat, c.lon);
    edit((s) => { s.sunTimes = `Sunrise ${t.sunrise !== null ? formatClock12(t.sunrise) : '—'} · Sunset ${t.sunset !== null ? formatClock12(t.sunset) : '—'}`; }, 'Sun times');
  };
  return (
    <div className="cs-box cs-info">
      <table className="cs-table compact">
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id}>
              <td className="cs-k"><input value={row.label} onChange={(e) => { const v = e.target.value; edit((s) => { s.infoRows![i].label = v; }); }} /></td>
              <td><input value={row.value} placeholder={infoValue({ ...row, value: '' }, r, day)} onChange={(e) => { const v = e.target.value; edit((s) => { s.infoRows![i].value = v; }); }} /></td>
              <td className="cs-x"><button className="icon-btn" onClick={() => edit((s) => { s.infoRows!.splice(i, 1); }, 'Remove row')}>×</button></td>
            </tr>
          ))}
          <tr>
            <td className="cs-k">Nearest hospital</td>
            <td colSpan={2}><textarea rows={3} value={cs.nearestHospital} placeholder="Name, address, phone" onChange={(e) => { const v = e.target.value; edit((s) => { s.nearestHospital = v; }); }} /></td>
          </tr>
        </tbody>
      </table>
      <div className="row">
        <button className="cs-addrow" onClick={() => edit((s) => { s.infoRows!.push({ id: newId(), label: '', value: '' }); }, 'Add row')}>+ Add row</button>
        <button className="cs-addrow" onClick={() => setWeather(!weather)}>{weather ? 'Hide' : 'Weather & sun…'}</button>
      </div>
      {weather && (
        <div className="cs-weather">
          {(['weatherTemp', 'weatherCondition', 'weatherPrecipWind'] as const).map((k) => (
            <input key={k} value={cs[k]} placeholder={{ weatherTemp: 'Temp, e.g. 72°F / 58°F', weatherCondition: 'Conditions', weatherPrecipWind: 'Rain / wind' }[k]} onChange={(e) => { const v = e.target.value; edit((s) => { s[k] = v; }); }} />
          ))}
          <div className="row"><input value={cs.coords} placeholder="Lat, long for sun times" onChange={(e) => { const v = e.target.value; edit((s) => { s.coords = v; }); }} /><button onClick={calcSun}>Sun</button></div>
        </div>
      )}
    </div>
  );
}

function MapBox({ cs, edit }: { cs: CallSheet; edit: Edit }) {
  const loc = cs.locations[0];
  const address = loc?.address ?? '';
  const setAddress = (v: string) => edit((s) => {
    if (!s.locations.length) s.locations.push({ id: newId(), name: '', address: '' });
    s.locations[0].address = v;
  });
  // Reload the map only after typing pauses.
  const [mapAddr, setMapAddr] = useState(address);
  useEffect(() => { const t = setTimeout(() => setMapAddr(address), 900); return () => clearTimeout(t); }, [address]);
  const show = cs.showMap !== false && !!mapAddr.trim();
  return (
    <div className="cs-box cs-map">
      <input className="cs-map-addr" value={address} placeholder="Location address" onChange={(e) => setAddress(e.target.value)} />
      {show
        ? <iframe title="Map" src={`https://maps.google.com/maps?q=${encodeURIComponent(mapAddr)}&z=15&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        : <div className="cs-map-empty">{address ? 'Map hidden' : 'Type the address to show a map'}</div>}
      <div className="row cs-map-foot">
        <input value={cs.basecamp} placeholder="Basecamp / parking" onChange={(e) => { const v = e.target.value; edit((s) => { s.basecamp = v; }); }} />
        {address && <button className="cs-addrow" onClick={() => edit((s) => { s.showMap = !(s.showMap !== false); }, 'Toggle map')}>{cs.showMap !== false ? 'Hide map' : 'Show map'}</button>}
      </div>
    </div>
  );
}

// ---- Sections ----

function SectionView({ sec, index, count, r, day, edit }: { sec: CallSheetSection; index: number; count: number; r: ResolvedCallSheet; day: ShootDay; edit: Edit }) {
  const setSec = (fn: (s: Draft<CallSheetSection>) => void, label: string | null = null) => edit((s) => { const x = s.sections!.find((y) => y.id === sec.id); if (x) fn(x); }, label);
  const move = (dir: -1 | 1) => edit((s) => {
    const i = s.sections!.findIndex((y) => y.id === sec.id);
    const j = i + dir;
    if (j < 0 || j >= s.sections!.length) return;
    [s.sections![i], s.sections![j]] = [s.sections![j], s.sections![i]];
  }, 'Move section');

  return (
    <div className={`cs-section ${sec.hidden ? 'hidden' : ''}`}>
      <div className="cs-section-bar">
        <input className="cs-section-title" value={sec.title} onChange={(e) => { const v = e.target.value; setSec((s) => { s.title = v; }); }} />
        <span className="spacer" />
        <button className="cs-link" disabled={index === 0} onClick={() => move(-1)} title="Move up">↑</button>
        <button className="cs-link" disabled={index === count - 1} onClick={() => move(1)} title="Move down">↓</button>
        <button className="cs-link" onClick={() => setSec((s) => { s.hidden = !s.hidden; }, sec.hidden ? 'Show section' : 'Hide section')}>{sec.hidden ? '⌃ Show section' : '⌄ Hide section'}</button>
        <button className="cs-link" title="Remove section" onClick={() => { edit((s) => { s.sections = s.sections!.filter((y) => y.id !== sec.id); }, 'Remove section'); deletedToast(`“${sec.title}” section`); }}>×</button>
      </div>
      {!sec.hidden && (
        <>
          {sec.kind === 'scenes' && <ScenesSection r={r} edit={edit} />}
          {sec.kind === 'cast' && <CastSection r={r} edit={edit} />}
          {sec.kind === 'crew' && <CrewSection r={r} edit={edit} />}
          {sec.kind === 'notes' && (
            <div className="cs-notes2">
              <textarea value={sec.text ?? ''} onChange={(e) => { const v = e.target.value; setSec((s) => { s.text = v; }); }} />
              <textarea value={sec.text2 ?? ''} onChange={(e) => { const v = e.target.value; setSec((s) => { s.text2 = v; }); }} />
            </div>
          )}
          {sec.kind === 'locations' && <LocationsSection r={r} edit={edit} />}
          {sec.kind === 'advance' && <AdvanceSection day={day} />}
          {sec.kind === 'table' && <CustomTable sec={sec} setSec={setSec} />}
        </>
      )}
    </div>
  );
}

function ScenesSection({ r, edit }: { r: ResolvedCallSheet; edit: Edit }) {
  const cs = r.sheet;
  const extra = cs.extraScenes ?? [];
  const setExtra = (i: number, k: keyof (typeof extra)[number], v: string) => edit((s) => { (s.extraScenes![i] as unknown as Record<string, string>)[k] = v; });
  const extraPages = extra.reduce((a, x) => a + (Number(x.pages) || 0), 0);
  return (
    <>
      <table className="cs-table">
        <thead><tr><th className="w-sc">Scenes</th><th>Set and description</th><th className="w-ch">Character #</th><th className="w-dn">D/N</th><th className="w-pg">Pages</th><th>Location / notes</th><th className="cs-x" /></tr></thead>
        <tbody>
          {r.scenes.map((s) => (
            <tr key={s.scene.id}>
              <td className="center"><b>{s.number}</b></td>
              <td><div className="cs-strong">{s.intExt}. {s.set}</div><div className="cs-sub">{s.synopsis}</div></td>
              <td className="center">{s.cast}</td>
              <td className="center">{s.time === 'CUSTOM' ? '' : s.time[0] + s.time.slice(1).toLowerCase()}</td>
              <td className="center">{formatEighths(s.eighths)}</td>
              <td><input value={cs.sceneNotes?.[s.scene.id] ?? ''} placeholder={[r.locations[Number(s.loc) - 1]?.name, s.address].filter(Boolean).join(' · ')} onChange={(e) => { const v = e.target.value; edit((x) => { (x.sceneNotes ??= {})[s.scene.id] = v; }); }} /></td>
              <td className="cs-x" title="From the stripboard" />
            </tr>
          ))}
          {extra.map((x, i) => (
            <tr key={x.id}>
              <td><input className="center" value={x.scene} placeholder="#" onChange={(e) => setExtra(i, 'scene', e.target.value)} /></td>
              <td><input value={x.set} placeholder="Set" onChange={(e) => setExtra(i, 'set', e.target.value)} /><input className="cs-sub" value={x.description} placeholder="Description" onChange={(e) => setExtra(i, 'description', e.target.value)} /></td>
              <td><input className="center" value={x.cast} onChange={(e) => setExtra(i, 'cast', e.target.value)} /></td>
              <td><select value={x.dn} onChange={(e) => setExtra(i, 'dn', e.target.value)}><option value="" /><option>Day</option><option>Night</option><option>Dawn</option><option>Dusk</option></select></td>
              <td><input className="center" value={x.pages} placeholder="0/8" onChange={(e) => setExtra(i, 'pages', e.target.value)} /></td>
              <td><input value={x.notes} onChange={(e) => setExtra(i, 'notes', e.target.value)} /></td>
              <td className="cs-x"><button className="icon-btn" onClick={() => edit((s) => { s.extraScenes!.splice(i, 1); }, 'Remove row')}>×</button></td>
            </tr>
          ))}
          {!r.scenes.length && !extra.length && <tr><td colSpan={7} className="muted center">No scenes on this day — schedule them on the stripboard or add a row.</td></tr>}
          <tr className="cs-total"><td colSpan={3} /><td className="right">Total pages:</td><td className="center"><b>{formatEighths(r.totalEighths)}{extraPages ? ` + ${extraPages}` : ''}</b></td><td colSpan={2} /></tr>
        </tbody>
      </table>
      <button className="cs-addrow" onClick={() => edit((s) => { (s.extraScenes ??= []).push({ id: newId(), scene: '', set: '', description: '', cast: '', dn: '', pages: '', notes: '' }); }, 'Add row')}>+ Add new row</button>
    </>
  );
}

function CastSection({ r, edit }: { r: ResolvedCallSheet; edit: Edit }) {
  const cs = r.sheet;
  return (
    <>
      <table className="cs-table">
        <thead><tr><th className="w-sc">#</th><th>Cast</th><th>Character</th><th className="w-pg">Scenes</th><th className="w-dn" title="Day Out of Days status">Status</th><th className="w-t">Pick up</th><th className="w-t">H/MU</th><th className="w-t">Call time</th><th>Special instructions</th><th className="cs-x" /></tr></thead>
        <tbody>
          {r.cast.map((c, i) => {
            const raw = cs.cast[i];
            const set = (k: keyof typeof raw) => (e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value; edit((s) => { (s.cast[i] as unknown as Record<string, string>)[k] = v; }); };
            return (
              <tr key={c.id} className={c.inToday ? '' : 'cs-dim'} title={c.inToday ? '' : 'Not in any of today’s scenes'}>
                <td className="center">{c.castNumber ?? i + 1}</td>
                <td><input value={raw.actorName} placeholder="Actor" onChange={set('actorName')} /></td>
                <td><input value={raw.characterName} onChange={set('characterName')} /></td>
                <td><input className="center" value={raw.sceneNumbers} placeholder={c.sceneNumbers} onChange={set('sceneNumbers')} /></td>
                <td><input className="center" value={raw.status} placeholder={c.status} onChange={set('status')} /></td>
                <td><input type="time" value={raw.pickup} onChange={set('pickup')} /></td>
                <td><input type="time" value={raw.hmu} onChange={set('hmu')} /></td>
                <td><input type="time" value={raw.onSet || c.onSet} onChange={set('onSet')} /></td>
                <td><input value={raw.notes ?? ''} onChange={set('notes')} /></td>
                <td className="cs-x"><button className="icon-btn" onClick={() => edit((s) => { s.cast.splice(i, 1); }, 'Remove cast')}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="cs-addrow" onClick={() => edit((s) => { s.cast.push({ id: newId(), characterName: '', actorName: '', sceneNumbers: '', status: '', pickup: '', hmu: '', onSet: '', wrap: '', loc: '' }); }, 'Add cast')}>+ Add new row</button>
    </>
  );
}

function CrewSection({ r, edit }: { r: ResolvedCallSheet; edit: Edit }) {
  const p = useProject();
  const cs = r.sheet;
  const available = p.crew.filter((m) => !cs.crew.some((c) => c.crewId === m.id));
  return (
    <>
      <table className="cs-table">
        <thead><tr><th>Position</th><th>Name</th><th>Phone</th><th>Email</th><th className="w-t">Call time</th><th className="cs-x" /></tr></thead>
        <tbody>
          {r.crew.map((c, i) => {
            const raw = cs.crew[i];
            const set = (k: 'role' | 'name' | 'call' | 'phone' | 'email') => (e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value; edit((s) => { s.crew[i][k] = v; }); };
            return (
              <tr key={c.id}>
                <td><input value={raw.role} onChange={set('role')} /></td>
                <td><input value={raw.name} onChange={set('name')} /></td>
                <td><input value={raw.phone} onChange={set('phone')} /></td>
                <td><input value={raw.email ?? ''} onChange={set('email')} /></td>
                <td><input type="time" value={raw.call || c.call} onChange={set('call')} /></td>
                <td className="cs-x"><button className="icon-btn" onClick={() => edit((s) => { s.crew.splice(i, 1); }, 'Remove crew')}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <button className="cs-addrow" onClick={() => edit((s) => { s.crew.push({ id: newId(), role: '', name: '', call: '', phone: '', email: '' }); }, 'Add crew')}>+ Add new row</button>
        {available.length > 0 && (
          <select className="cs-addfrom" value="" onChange={(e) => {
            const m = p.crew.find((x) => x.id === e.target.value);
            if (m) edit((s) => { s.crew.push({ id: newId(), crewId: m.id, role: m.role, name: m.name, call: '', phone: m.phone ?? '' }); }, 'Add crew');
          }}>
            <option value="">+ Add from crew list…</option>
            {available.map((m) => <option key={m.id} value={m.id}>{m.role ? `${m.role}: ` : ''}{m.name}</option>)}
          </select>
        )}
      </div>
    </>
  );
}

function LocationsSection({ r, edit }: { r: ResolvedCallSheet; edit: Edit }) {
  return (
    <>
      <table className="cs-table">
        <thead><tr><th className="w-sc">#</th><th>Location</th><th>Address</th><th className="cs-x" /></tr></thead>
        <tbody>
          {r.locations.map((l, i) => (
            <tr key={l.id}>
              <td className="center">{i + 1}</td>
              <td><input value={l.name} onChange={(e) => { const v = e.target.value; edit((s) => { s.locations[i].name = v; }); }} /></td>
              <td><input value={l.address} onChange={(e) => { const v = e.target.value; edit((s) => { s.locations[i].address = v; }); }} /></td>
              <td className="cs-x"><button className="icon-btn" onClick={() => edit((s) => { s.locations.splice(i, 1); }, 'Remove location')}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="cs-addrow" onClick={() => edit((s) => { s.locations.push({ id: newId(), name: '', address: '' }); }, 'Add location')}>+ Add new row</button>
    </>
  );
}

function AdvanceSection({ day }: { day: ShootDay }) {
  const p = useProject();
  const d = useDerived();
  const adv = advanceSchedule(p, d, day);
  if (!adv) return <p className="muted small cs-pad">No later shoot day scheduled.</p>;
  return (
    <table className="cs-table">
      <thead><tr><th colSpan={5} className="left">Day {adv.number} — {formatDate(adv.day.date, { weekday: 'long', month: 'long', day: 'numeric' })}{adv.day.times.generalCall ? ` · Call ${formatClock12(parseClock(adv.day.times.generalCall)!)}` : ''}</th></tr>
        <tr><th className="w-sc">Sc</th><th>Set</th><th className="w-dn">D/N</th><th>Cast</th><th className="w-pg">Pages</th></tr></thead>
      <tbody>
        {adv.scenes.map((s) => (
          <tr key={s.id}>
            <td className="center"><b>{s.number}</b></td>
            <td>{s.intExt}. {s.set}</td>
            <td className="center">{s.time}</td>
            <td>{sceneCast(p, s).map((c) => p.cast.find((m) => m.characterName === c)?.castNumber ?? c).join(', ')}</td>
            <td className="center">{formatEighths(sceneEighths(p, s))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CustomTable({ sec, setSec }: { sec: CallSheetSection; setSec: (fn: (s: Draft<CallSheetSection>) => void, label?: string | null) => void }) {
  const cols = sec.columns ?? [];
  const rows = sec.rows ?? [];
  return (
    <>
      <table className="cs-table">
        <thead>
          <tr>
            {cols.map((c, j) => (
              <th key={j}>
                <div className="cs-colhead">
                  <input value={c} onChange={(e) => { const v = e.target.value; setSec((s) => { s.columns![j] = v; }); }} />
                  {cols.length > 1 && <button className="icon-btn" title="Remove column" onClick={() => setSec((s) => { s.columns!.splice(j, 1); s.rows!.forEach((r) => r.cells.splice(j, 1)); }, 'Remove column')}>×</button>}
                </div>
              </th>
            ))}
            <th className="cs-x"><button className="icon-btn" title="Add column" onClick={() => setSec((s) => { s.columns!.push(`Column ${s.columns!.length + 1}`); s.rows!.forEach((r) => r.cells.push('')); }, 'Add column')}>+</button></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              {cols.map((_, j) => <td key={j}><input value={r.cells[j] ?? ''} onChange={(e) => { const v = e.target.value; setSec((s) => { s.rows![i].cells[j] = v; }); }} /></td>)}
              <td className="cs-x"><button className="icon-btn" onClick={() => setSec((s) => { s.rows!.splice(i, 1); }, 'Remove row')}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="cs-addrow" onClick={() => setSec((s) => { (s.rows ??= []).push({ id: newId(), cells: cols.map(() => '') }); }, 'Add row')}>+ Add new row</button>
    </>
  );
}
