import { useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { Modal, toast } from '../components/common';
import { avRowsFromScript, type AVImportMode } from '../script/avImport';
import { newId } from '../model/ids';
import type { AVRow, AVScript } from '../model/types';
import { SHOT_TYPES } from '../model/defaults';
import { Empty, Select } from '../components/common';
import { download, safeName } from '../io/files';
import { deletedToast } from '../components/deleted';
import { csv } from '../io/reports';

// A/V scripts: two-column Video | Audio scripts for commercials, documentaries and corporate work.

const blankRow = (): AVRow => ({ id: newId(), video: '', audio: '', duration: '' });

function seconds(d: string): number {
  const m = d.trim().match(/^(?:(\d+):)?(\d+)(?:\.(\d+))?$/);
  if (!m) return 0;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function AVScriptTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const [id, setId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const script = p.avScripts.find((x) => x.id === id) ?? p.avScripts[0];
  const importDialog = importOpen && <ImportFromScreenplay current={script} onClose={() => setImportOpen(false)} onCreated={setId} />;

  const create = () => {
    const s: AVScript = { id: newId(), title: `A/V script ${p.avScripts.length + 1}`, rows: [{ ...blankRow(), segment: 'OPEN' }], updatedAt: new Date().toISOString() };
    update((d) => { d.avScripts.push(s); }, 'New A/V script');
    setId(s.id);
  };
  const edit = (fn: (s: AVScript) => void, label: string | null = null) => update((d) => {
    const s = d.avScripts.find((x) => x.id === script.id);
    if (s) { fn(s as AVScript); s.updatedAt = new Date().toISOString(); }
  }, label);
  const setRow = (rid: string, patch: Partial<AVRow>) => edit((s) => { Object.assign(s.rows.find((r) => r.id === rid)!, patch); });
  const addRow = (after?: number, segment?: string) => edit((s) => { s.rows.splice(after === undefined ? s.rows.length : after + 1, 0, { ...blankRow(), segment }); }, 'Add row');

  if (!script) {
    return (
      <Empty title="No A/V scripts yet">
        <p className="muted">Two-column scripts: what we see on the left, what we hear on the right.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={create}>New A/V script</button>
          <button onClick={() => setImportOpen(true)}>New from screenplay…</button>
        </div>
        {importDialog}
      </Empty>
    );
  }
  const total = script.rows.reduce((a, r) => a + seconds(r.duration), 0);

  const exportCsv = () => download(`${safeName(script.title)}.csv`, csv([['#', 'Segment', 'Shot', 'Video', 'Audio', 'Duration'], ...script.rows.map((r, i) => [i + 1, r.segment ?? '', r.shotType ?? '', r.video, r.audio, r.duration])]), 'text/csv');
  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'in', format: 'letter' });
    doc.setLineWidth(0.01);
    let y = 0.8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(script.title, 0.6, y);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(`${p.title} · Total ${fmt(total)}`, 7.9, y, { align: 'right' });
    y += 0.3;
    const head = () => { doc.setFont('helvetica', 'bold'); doc.text('VIDEO', 0.9, y); doc.text('AUDIO', 4.5, y); doc.text('TIME', 7.9, y, { align: 'right' }); doc.line(0.6, y + 0.06, 7.9, y + 0.06); y += 0.25; doc.setFont('helvetica', 'normal'); };
    head();
    script.rows.forEach((r, i) => {
      const v = doc.splitTextToSize((r.shotType ? `[${r.shotType}] ` : '') + r.video, 3.3);
      const a = doc.splitTextToSize(r.audio, 3.0);
      const h = Math.max(v.length, a.length) * 0.17 + (r.segment ? 0.3 : 0) + 0.1;
      if (y + h > 10.4) { doc.addPage(); y = 0.8; head(); }
      if (r.segment) { doc.setFont('helvetica', 'bold'); doc.text(r.segment.toUpperCase(), 0.6, y); doc.setFont('helvetica', 'normal'); y += 0.25; }
      doc.text(String(i + 1), 0.6, y);
      doc.text(v, 0.9, y);
      doc.text(a, 4.5, y);
      if (r.duration) doc.text(r.duration, 7.9, y, { align: 'right' });
      y += Math.max(v.length, a.length) * 0.17 + 0.1;
    });
    doc.save(`${safeName(script.title)}.pdf`);
  };

  return (
    <div className="with-side av-tab">
      <aside className="side" onDoubleClick={(e) => { if (e.target === e.currentTarget) create(); }}>
        <div className="side-head"><b>A/V scripts</b><button className="small" onClick={create}>+ New</button></div>
        <ul className="doc-list">
          {p.avScripts.map((s) => (
            <li key={s.id} className={script.id === s.id ? 'active' : ''} onClick={() => setId(s.id)}>
              <span>{s.title}</span><span className="muted small">{s.rows.length} rows</span>
            </li>
          ))}
        </ul>
      </aside>
      <section className="main">
        <div className="toolbar">
          <input className="doc-title" value={script.title} onChange={(e) => edit((s) => { s.title = e.target.value; })} />
          <span className="muted small">{script.rows.length} rows · total {fmt(total)}</span>
          <span className="spacer" />
          <button onClick={() => setImportOpen(true)} title="Bring in the screenplay's scenes as segments">Import from screenplay</button>
          <button onClick={() => addRow(undefined, 'NEW SEGMENT')}>+ Segment</button>
          <button onClick={() => addRow()}>+ Row</button>
          <button onClick={exportCsv}>CSV</button>
          <button className="primary" onClick={exportPdf}>PDF</button>
          <button onClick={() => { update((d) => { d.avScripts = d.avScripts.filter((x) => x.id !== script.id); }, 'Delete A/V script'); deletedToast(`“${script.title}”`); }}>Delete</button>
        </div>
        {importDialog}
        <div className="scroll pad av-body" onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains('av-body')) addRow(); }}>
          <table className="table av">
            <thead><tr><th /><th>#</th><th>Shot</th><th>Video</th><th>Audio</th><th>Time</th><th /></tr></thead>
            <tbody>
              {script.rows.map((r, i) => (
                <FragmentRow key={r.id}>
                  {r.segment !== undefined && (
                    <tr className="av-seg">
                      <td colSpan={7}><input value={r.segment} placeholder="Segment" onChange={(e) => setRow(r.id, { segment: e.target.value })} /></td>
                    </tr>
                  )}
                  <tr draggable onDragStart={() => setDragId(r.id)} onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragId && dragId !== r.id) edit((s) => { const from = s.rows.findIndex((x) => x.id === dragId); const [m] = s.rows.splice(from, 1); s.rows.splice(s.rows.findIndex((x) => x.id === r.id), 0, m); }, 'Reorder rows'); setDragId(null); }}>
                    <td><span className="grip handle" title="Drag to reorder">⋮⋮</span></td>
                    <td className="muted">{i + 1}</td>
                    <td><Select value={r.shotType ?? ''} options={SHOT_TYPES.map((t) => t.code)} onChange={(v) => setRow(r.id, { shotType: v || undefined })} /></td>
                    <td><textarea rows={3} value={r.video} placeholder="What we see" onChange={(e) => setRow(r.id, { video: e.target.value })} /></td>
                    <td><textarea rows={3} value={r.audio} placeholder="VO, dialogue, music, SFX" onChange={(e) => setRow(r.id, { audio: e.target.value })} /></td>
                    <td><input className="w-sm" value={r.duration} placeholder="0:05" onChange={(e) => setRow(r.id, { duration: e.target.value })} /></td>
                    <td className="actions">
                      <button className="icon-btn" title="Insert row below" onClick={() => addRow(i)}>+</button>
                      <button className="icon-btn" title="Toggle segment heading" onClick={() => setRow(r.id, { segment: r.segment === undefined ? 'SEGMENT' : undefined })}>§</button>
                      <button className="icon-btn" title="Delete row" onClick={() => edit((s) => { s.rows = s.rows.filter((x) => x.id !== r.id); }, 'Delete row')}>×</button>
                    </td>
                  </tr>
                </FragmentRow>
              ))}
            </tbody>
          </table>
          <p className="muted small">Double-click empty space to add a row · drag rows by ⋮⋮ to reorder</p>
        </div>
      </section>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/** Brings the screenplay's scenes into an A/V script: headings as segments, optionally action → Video and dialogue → Audio. */
function ImportFromScreenplay({ current, onClose, onCreated }: { current?: AVScript; onClose: () => void; onCreated: (id: string) => void }) {
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [mode, setMode] = useState<AVImportMode>('full');
  const [target, setTarget] = useState<'current' | 'new'>(current ? 'current' : 'new');
  const already = new Set(target === 'current' && current ? current.rows.map((r) => r.sceneId).filter((x): x is string => !!x) : []);
  const rows = avRowsFromScript(d, mode, already);
  const scenes = new Set(rows.map((r) => r.sceneId)).size;

  const run = () => {
    if (!rows.length) { onClose(); return; }
    if (target === 'new' || !current) {
      const s: AVScript = { id: newId(), title: 'A/V script from screenplay', rows, updatedAt: new Date().toISOString() };
      update((dr) => { dr.avScripts.push(s); }, 'A/V script from screenplay');
      onCreated(s.id);
    } else {
      update((dr) => {
        const s = dr.avScripts.find((x) => x.id === current.id);
        if (!s) return;
        // A brand-new script's empty starter row is replaced rather than kept above the scenes.
        if (s.rows.length === 1 && !s.rows[0].video && !s.rows[0].audio) s.rows = [];
        s.rows.push(...rows);
        s.updatedAt = new Date().toISOString();
      }, 'Import scenes from screenplay');
    }
    toast(`Imported ${scenes} scene${scenes === 1 ? '' : 's'} (${rows.length} rows)`);
    onClose();
  };

  return (
    <Modal title="Import from screenplay" onClose={onClose} footer={
      <><button onClick={onClose}>Cancel</button><button className="primary" disabled={!rows.length} onClick={run}>{rows.length ? `Import ${scenes} scene${scenes === 1 ? '' : 's'}` : 'Nothing to import'}</button></>
    }>
      {!d.scenes.length ? (
        <p>The screenplay has no scenes yet. Write or import a script in Write → Screenplay, then come back.</p>
      ) : (
        <>
          <div className="field"><span>Bring in</span>
            <label className="check"><input type="radio" checked={mode === 'headings'} onChange={() => setMode('headings')} /> Scene headings only (as segments)</label>
            <label className="check"><input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} /> Headings, plus action in Video and dialogue in Audio</label>
          </div>
          {current && (
            <div className="field"><span>Into</span>
              <label className="check"><input type="radio" checked={target === 'current'} onChange={() => setTarget('current')} /> “{current.title}” — adds scenes it doesn't have yet</label>
              <label className="check"><input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} /> A new A/V script</label>
            </div>
          )}
          <p className="muted small">
            {rows.length
              ? `${scenes} of ${d.scenes.length} scenes · ${rows.length} rows.`
              : 'Every scene is already in this A/V script.'}{' '}
            Rows stay linked to their scene, so importing again later only adds new scenes.
          </p>
          <div className="preview">
            {rows.slice(0, 14).map((r) => (
              <div key={r.id} className="av-preview-row">
                {r.segment && <b>{r.segment}</b>}
                {(r.video || r.audio) && <div className="av-preview-cols"><span>{r.video}</span><span>{r.audio}</span></div>}
              </div>
            ))}
            {rows.length > 14 && <div className="muted small">…and {rows.length - 14} more rows</div>}
          </div>
        </>
      )}
    </Modal>
  );
}
