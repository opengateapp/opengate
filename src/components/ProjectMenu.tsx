import { useEffect, useRef, useState } from 'react';
import { useStore, getDerived, flushSave } from '../store/project';
import { session } from '../script/session';
import { ImportDialog } from './ImportDialog';
import { download, safeName } from '../io/files';
import { saveToFile, saveIndependentCopy, setFileAutosave, reconnectFile, useFile, fileAccessSupported } from '../io/fileSave';
import { fdxText, fountainText } from '../io/exports';
import { Logo } from './Logo';
import { toast } from './common';
import { tabHidden } from '../sync/state';

/** Saves and goes back to the home page. If the save fails, the project stays open. */
export async function goHome() {
  session.flush();
  try { await flushSave(); } catch (e) { toast(`Couldn't save, so this project stays open: ${(e as Error).message}`); return; }
  session.reset();
  try { localStorage.removeItem('slateline.last'); } catch { /* ignore */ }
  useStore.getState().close();
}

export function ProjectMenu() {
  const title = useStore((s) => s.project?.title ?? '');
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  // Escape closes the menu and puts focus back on File.
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  return (
    <div className="project-menu" ref={ref}>
      <button className="logo" onClick={() => void goHome()} aria-label="Home" title="Home (saves this project first)"><Logo className="topbar-logo" /></button>
      <input className="project-title" value={title} onChange={(e) => update((d) => { d.title = e.target.value; }, null)} aria-label="Project title" />
      <div className="menu-wrap">
        <button ref={btn} className="file-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>File ▾</button>
        {open && (
          <div className="menu" role="menu">
            <input className="project-title file-title" value={title} onChange={(e) => update((d) => { d.title = e.target.value; }, null)} aria-label="Project title" />
            <ProjectMenuItems onDone={() => setOpen(false)} onImport={() => setImporting(true)} />
          </div>
        )}
      </div>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

/** The File actions (save, import, export), shared by the menu and the phone drawer. */
export function ProjectMenuItems({ onDone, onImport }: { onDone: () => void; onImport: () => void }) {
  const file = useFile();
  const run = (fn: () => void | Promise<void>) => async () => {
    onDone();
    session.flush();
    try { await fn(); } catch (e) { toast((e as Error).message); }
  };

  const exportScript = async (kind: 'pdf' | 'fountain' | 'fdx') => {
    const p = useStore.getState().project!;
    const d = getDerived();
    const name = safeName(p.title);
    if (kind === 'fountain') download(`${name}.fountain`, fountainText(p, d), 'text/plain');
    if (kind === 'fdx') download(`${name}.fdx`, fdxText(p, d), 'application/xml');
    if (kind === 'pdf') {
      const { screenplayPdfAsync } = await import('../pdf/screenplayPdf');
      (await screenplayPdfAsync(p, d)).save(`${name}.pdf`);
    }
  };

  return (
    <>
      <button onClick={run(() => { void saveToFile(false); })}><span>Save</span><kbd>⌘S</kbd></button>
      <button onClick={run(() => { void saveToFile(true); })}><span>{fileAccessSupported() ? 'Save As…' : 'Download project file'}</span><kbd>⇧⌘S</kbd></button>
      <button onClick={run(() => { void saveIndependentCopy(); })} title="A copy that isn't connected to the shared project — for archiving or starting a new version">Save independent copy…</button>
      {file.name && (
        <label className="menu-check keep-open" onMouseDown={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={file.autosave} onChange={(e) => void setFileAutosave(e.target.checked)} /> Autosave to {file.name}
        </label>
      )}
      {file.name && file.needsPermission && <button onClick={run(() => { void reconnectFile(); })}>Allow saving to {file.name} again…</button>}
      {file.savedAt && <div className="menu-note">Last written to the file {new Date(file.savedAt).toLocaleString()}</div>}
      <hr />
      <button onClick={run(() => onImport())}>Import screenplay…</button>
      <hr />
      <button onClick={run(() => exportScript('pdf'))}>Export screenplay PDF</button>
      <button onClick={run(() => exportScript('fountain'))}>Export Fountain</button>
      <button onClick={run(() => exportScript('fdx'))}>Export Final Draft (.fdx)</button>
      {!tabHidden('reports') && <button onClick={run(() => { window.dispatchEvent(new CustomEvent('opengate:goto', { detail: 'reports' })); })}>All exports…</button>}
    </>
  );
}
