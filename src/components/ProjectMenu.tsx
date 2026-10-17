import { useEffect, useRef, useState } from 'react';
import { useStore, getDerived, flushSave } from '../store/project';
import { session } from '../script/session';
import { ImportDialog } from './ImportDialog';
import { download, safeName } from '../io/files';
import { saveToFile, saveIndependentCopy, setFileAutosave, reconnectFile, useFile, fileAccessSupported } from '../io/fileSave';
import { toFountain } from '../io/fountain';
import { toFDX } from '../io/fdx';
import { blocksToLines } from '../script/schema';
import { Logo } from './Logo';
import { toast } from './common';

export function ProjectMenu() {
  const title = useStore((s) => s.project!.title);
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="project-menu" ref={ref}>
      <button className="logo" onClick={() => setOpen(!open)} aria-haspopup="menu" title="Open Gate menu"><Logo className="topbar-logo" /></button>
      <input className="project-title" value={title} onChange={(e) => update((d) => { d.title = e.target.value; }, null)} aria-label="Project title" />
      {open && (
        <div className="menu" role="menu">
          <ProjectMenuItems onDone={() => setOpen(false)} onImport={() => setImporting(true)} />
        </div>
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

/** The project actions (all projects, import, export, save…), shared by the menu and the phone drawer. */
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
    const lines = blocksToLines(d.blocks);
    const nums = p.sceneNumbersLocked ? d.scenes.map((s) => s.number) : undefined;
    if (kind === 'fountain') download(`${name}.fountain`, toFountain(lines, p.titlePage, nums), 'text/plain');
    if (kind === 'fdx') download(`${name}.fdx`, toFDX(lines, p.titlePage, nums), 'application/xml');
    if (kind === 'pdf') {
      const { screenplayPdfAsync } = await import('../pdf/screenplayPdf');
      (await screenplayPdfAsync(p, d)).save(`${name}.pdf`);
    }
  };

  return (
    <>
      <button onClick={run(async () => { await flushSave(); session.reset(); try { localStorage.removeItem('slateline.last'); } catch { /* ignore */ } useStore.getState().close(); })}>All projects…</button>
      <hr />
      <button onClick={run(() => onImport())}>Import screenplay…</button>
      <hr />
      <button onClick={run(() => exportScript('pdf'))}>Export screenplay PDF</button>
      <button onClick={run(() => exportScript('fountain'))}>Export Fountain</button>
      <button onClick={run(() => exportScript('fdx'))}>Export Final Draft (.fdx)</button>
      <hr />
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
    </>
  );
}
