import { useEffect, useRef, useState } from 'react';
import { getDerived, useDerived, useProject, useStore } from '../../store/project';
import { session } from '../../script/session';
import { budgetVisible, useSync } from '../../sync/state';
import { useTouch } from '../../ui/responsive';
import { download } from '../../io/files';
import { Cancelled, WARN_BYTES, buildProjectFolder, defaultSelection, likelySize, mediaSizes, type FolderProgress, type FolderResult } from '../../io/projectFolder/build';
import { GROUP_LABEL, availableItems, type ItemGroup, type ItemState } from '../../io/projectFolder/items';
import { LAYOUTS, layoutById, topFolders } from '../../io/projectFolder/layouts';
import { PROJECT_FOLDERS_URL } from '../../model/links';

// Exports → Export everything: the whole project in one ZIP, sorted into a Project Folders layout.

const LAYOUT_KEY = 'opengate.folderLayout';
const readLayout = () => { try { return localStorage.getItem(LAYOUT_KEY); } catch { return null; } };
const saveLayout = (id: string) => { try { localStorage.setItem(LAYOUT_KEY, id); } catch { /* ignore */ } };

const sizeLabel = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

function GroupChecks({ group, states, selected, disabled, set }: { group: ItemGroup; states: ItemState[]; selected: ReadonlySet<string>; disabled: boolean; set: (ids: string[], on: boolean) => void }) {
  const box = useRef<HTMLInputElement>(null);
  const usable = states.filter((s) => !s.empty).map((s) => s.item.id);
  const on = usable.filter((id) => selected.has(id)).length;
  useEffect(() => { if (box.current) box.current.indeterminate = on > 0 && on < usable.length; }, [on, usable.length]);
  return (
    <fieldset className="ee-group">
      <legend>
        <label className="check ee-check"><input ref={box} type="checkbox" checked={usable.length > 0 && on === usable.length} disabled={disabled || !usable.length} onChange={(e) => set(usable, e.target.checked)} /> <b>{GROUP_LABEL[group]}</b></label>
      </legend>
      {states.map(({ item, empty }) => (
        <label key={item.id} className={`check ee-check ee-item ${empty ? 'muted' : ''}`}>
          <input type="checkbox" checked={!empty && selected.has(item.id)} disabled={disabled || !!empty} onChange={(e) => set([item.id], e.target.checked)} />
          <span>{item.label}{empty && <span className="small ee-why">{empty}</span>}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ExportEverything() {
  const p = useProject();
  const d = useDerived();
  useSync((s) => s.write);
  useSync((s) => s.hidden);
  useSync((s) => s.budget);
  useSync((s) => s.admin);
  const touch = useTouch();
  const [layoutId, setLayoutId] = useState(() => layoutById(readLayout()).id);
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(new Map());
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [progress, setProgress] = useState<FolderProgress | null>(null);
  const [result, setResult] = useState<FolderResult | null>(null);
  const abort = useRef<AbortController | null>(null);
  const layout = layoutById(layoutId);
  const states = availableItems(p, d);

  useEffect(() => {
    let live = true;
    void mediaSizes(p).then((s) => { if (live) setSizes(s); }).catch(() => {});
    return () => { live = false; };
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => abort.current?.abort(), []);

  // Worked out on every render: access can change at any time, not only the project.
  const selected = defaultSelection(states, sizes);
  for (const [id, v] of overrides) { if (v) selected.add(id); else selected.delete(id); }
  const groups = new Map<ItemGroup, ItemState[]>();
  for (const s of states) groups.set(s.item.group, [...(groups.get(s.item.group) ?? []), s]);

  const set = (ids: string[], on: boolean) => { setResult(null); setOverrides((o) => { const n = new Map(o); for (const id of ids) n.set(id, on); return n; }); };
  const size = likelySize(sizes, selected);
  const big = size > WARN_BYTES;
  const keepsPrivate = selected.has('project-file') && states.some((s) => !s.empty && (s.item.group === 'budget' || s.item.group === 'contracts') && !selected.has(s.item.id));

  const run = async () => {
    session.flush();
    const ctl = new AbortController();
    abort.current = ctl;
    setResult(null);
    setProgress({ done: 0, total: selected.size, label: 'Starting' });
    try {
      const r = await buildProjectFolder(useStore.getState().project!, getDerived(), { layout, selected, signal: ctl.signal, onProgress: setProgress });
      download(r.name, r.blob, 'application/zip');
      setResult(r);
    } catch (e) {
      if (!(e instanceof Cancelled)) { console.error(e); setResult({ blob: new Blob(), name: '', included: [], paths: [], skipped: [{ label: 'The ZIP', reason: (e as Error).message }] }); }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };
  const busy = !!progress;

  return (
    <section className="report-card export-everything" aria-label="Export everything">
      <h3>Export everything</h3>
      <p className="muted small">Saves everything in this project into one ZIP, sorted into folders.</p>

      <label className="ee-layout">
        <span className="small">Folder layout</span>
        <select value={layoutId} disabled={busy} onChange={(e) => { setLayoutId(e.target.value); saveLayout(e.target.value); }}>
          {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </label>
      <p className="muted small ee-preview">{topFolders(layout).join('  ·  ')}</p>

      <details className="ee-choose">
        <summary>Choose what’s included</summary>
        <div className="ee-groups">
          {[...groups].map(([g, list]) => <GroupChecks key={g} group={g} states={list} selected={selected} disabled={busy} set={set} />)}
        </div>
      </details>

      {size > 0 && <p className="small ee-size">Likely size: about {sizeLabel(size)}</p>}
      {big && <p className={`small warn ee-warn ${touch ? 'strong' : ''}`} role="status">{touch ? 'This ZIP is very large, and phones and iPads can run out of memory building it. Use a computer if you can, or untick the biggest items.' : 'This ZIP is very large and may take a while. Untick the biggest items if you don’t need them.'}</p>}
      {keepsPrivate && <p className="small warn ee-warn" role="status">The project file still contains your budget and paperwork. Untick it too if this ZIP is going to someone else.</p>}
      <p className="muted small">{budgetVisible() ? 'The ZIP includes contracts, contact details and budget unless you untick them.' : 'The ZIP includes everything you can see in this project, such as contact details, unless you untick it.'}</p>

      {busy ? (
        <div className="ee-progress" role="status">
          <span className="small">{progress.label}… {Math.min(progress.done + 1, progress.total)} of {progress.total}</span>
          <progress value={progress.done} max={progress.total || 1} />
          <button onClick={() => abort.current?.abort()}>Cancel</button>
        </div>
      ) : (
        <button className="primary" onClick={() => void run()}>Export ZIP</button>
      )}

      {result && (
        <div className="small ee-result" role="status">
          {result.name && <p><b>Saved {result.name}.</b></p>}
          {result.name && <details><summary>{result.included.length ? `${result.included.length} ${result.included.length === 1 ? 'part' : 'parts'} included` : 'Just the folders'}</summary><p>{result.included.map((x) => x.label).join(', ')}</p></details>}
          {result.skipped.length > 0 && <p className="warn ee-warn">Skipped: {result.skipped.map((x) => `${x.label} (${x.reason})`).join('; ')}.</p>}
        </div>
      )}
      <p className="muted small">Want this layout on every new folder? <a href={PROJECT_FOLDERS_URL} target="_blank" rel="noreferrer noopener">Get Project Folders ↗</a></p>
    </section>
  );
}
