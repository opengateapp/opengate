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
import { EditMenuItems } from './EditMenu';
import { helpItems } from '../help/HelpMenu';
import { useTheme, type ThemeMode } from '../theme';

/** Saves and goes back to the home page. If the save fails, the project stays open. */
export async function goHome() {
  session.flush();
  try { await flushSave(); } catch (e) { toast(`Couldn't save, so this project stays open: ${(e as Error).message}`); return; }
  session.reset();
  try { localStorage.removeItem('slateline.last'); } catch { /* ignore */ }
  useStore.getState().close();
}

/** What the View menu controls (the app owns these). */
export interface ViewControls { sidebarCollapsed: boolean; toggleSidebar: () => void; sidePanel?: { hidden: boolean; toggle: () => void } }

type MenuId = 'file' | 'edit' | 'view' | 'help';
const MENUS: { id: MenuId; label: string }[] = [{ id: 'file', label: 'File' }, { id: 'edit', label: 'Edit' }, { id: 'view', label: 'View' }, { id: 'help', label: 'Help' }];
const THEMES: { id: ThemeMode; label: string }[] = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' }];

/** Logo (goes Home), project title and the File, Edit, View and Help menus. */
export function ProjectMenu({ tab, view }: { tab?: string; view?: ViewControls }) {
  const title = useStore((s) => s.project?.title ?? '');
  const update = useStore((s) => s.update);
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const [open, setOpen] = useState<MenuId | null>(null);
  const [importing, setImporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const close = () => setOpen(null);

  useEffect(() => {
    const outside = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);
  // Escape closes the menu and puts focus back on its button.
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); opener.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  return (
    <div className="project-menu" ref={ref}>
      <button className="logo" onClick={() => void goHome()} aria-label="Home" title="Home (saves this project first)"><Logo className="topbar-logo" /></button>
      <input className="project-title" value={title} onChange={(e) => update((d) => { d.title = e.target.value; }, null)} aria-label="Project title" />
      <nav className="menu-row" aria-label="Menus">
        {MENUS.map((m) => (
          <div key={m.id} className="menu-wrap">
            <button
              className={`menu-btn ${m.id === 'file' ? 'file-btn' : ''}`}
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              // Keeps focus (and the text selection) where it was, for Edit's commands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { opener.current = e.currentTarget; setOpen(open === m.id ? null : m.id); }}
              onMouseEnter={(e) => { if (open && open !== m.id) { opener.current = e.currentTarget; setOpen(m.id); } }}
            >{m.label}</button>
            {open === m.id && (
              <div className="menu" role="menu" aria-label={m.label}>
                {m.id === 'file' && <ProjectMenuItems onDone={close} onImport={() => setImporting(true)} />}
                {m.id === 'edit' && <EditMenuItems onDone={close} />}
                {m.id === 'view' && (
                  <>
                    {THEMES.map((t) => <button key={t.id} role="menuitemradio" aria-checked={mode === t.id} onClick={() => { setMode(t.id); close(); }}><span>{t.label}</span>{mode === t.id && <span aria-hidden>✓</span>}</button>)}
                    {view && <hr />}
                    {view && <button onClick={() => { view.toggleSidebar(); close(); }}>{view.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</button>}
                    {view?.sidePanel && <button onClick={() => { view.sidePanel!.toggle(); close(); }}><span>{view.sidePanel.hidden ? 'Show side panel' : 'Hide side panel'}</span><kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}\</kbd></button>}
                  </>
                )}
                {m.id === 'help' && helpItems(tab).map((it) => <button key={it.id} title={it.hint} onClick={() => { close(); it.run(); }}>{it.label}</button>)}
              </div>
            )}
          </div>
        ))}
      </nav>
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
