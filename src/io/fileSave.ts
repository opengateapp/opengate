import { create } from 'zustand';
import type { Project } from '../model/types';
import { useStore, flushSave } from '../store/project';
import { db } from '../store/db';
import { session } from '../script/session';
import { toast } from '../components/common';
import { currentSync } from '../sync/engine';
import { download, exportProjectFile, safeName, PROJECT_EXT } from './files';

// Save / Save As / autosave to a real .opengate file on disk.
//
// Chrome and Edge let a web app keep a file handle and write to it again (like a desktop app).
// Safari and Firefox don't, so there "Save As" downloads a copy and autosave stays in the browser.
// Projects are always autosaved in the browser too, so nothing depends on the file alone.

interface FileState {
  name?: string;
  savedAt?: string;
  autosave: boolean;
  /** The browser needs a click to allow writing to the file again (after a reload). */
  needsPermission: boolean;
  writing: boolean;
}

export const useFile = create<FileState>(() => ({ autosave: false, needsPermission: false, writing: false }));

type Handle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
};
type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<Handle>;
  showOpenFilePicker?: (o: unknown) => Promise<Handle[]>;
};

const TYPES = [{ description: 'Open Gate project', accept: { 'application/octet-stream': [PROJECT_EXT, '.slateline'] } }];

export function fileAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';
}

async function bundle(p: Project, independent = false): Promise<Blob> {
  session.flush();
  const sync = !independent && p.share ? currentSync()?.exportState() : undefined;
  return exportProjectFile(useStore.getState().project ?? p, undefined, { independent, sync });
}

async function write(handle: Handle, blob: Blob) {
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
}

async function permitted(handle: Handle, ask: boolean): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!ask || !handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Loads the remembered file for the open project into useFile. */
export async function loadFileState(projectId: string) {
  const row = await db.fileHandles.get(projectId).catch(() => undefined);
  if (!row) { useFile.setState({ name: undefined, savedAt: undefined, autosave: false, needsPermission: false }); return; }
  const ok = await permitted(row.handle as Handle, false).catch(() => false);
  useFile.setState({ name: row.name, savedAt: row.savedAt, autosave: row.autosave, needsPermission: !ok });
}

/**
 * Save: write to the project's file (asking where the first time).
 * Save As (`as`): always ask where. Without file access (Safari / Firefox) both download a copy.
 */
export async function saveToFile(as = false): Promise<boolean> {
  const p = useStore.getState().project;
  if (!p) return false;
  await flushSave().catch(() => {});
  const row = await db.fileHandles.get(p.id).catch(() => undefined);
  try {
    useFile.setState({ writing: true });
    if (!as && row && await permitted(row.handle as Handle, true)) {
      await write(row.handle as Handle, await bundle(p));
      const savedAt = new Date().toISOString();
      await db.fileHandles.update(p.id, { savedAt });
      useFile.setState({ savedAt, needsPermission: false });
      return true;
    }
    if (!fileAccessSupported()) {
      if (!as) { toast('Saved in this browser. Use Save As to download a copy of the file.'); return true; }
      download(`${safeName(p.title)}${PROJECT_EXT}`, await bundle(p));
      return true;
    }
    const handle = await (window as PickerWindow).showSaveFilePicker!({ suggestedName: `${safeName(p.title)}${PROJECT_EXT}`, types: TYPES });
    await write(handle, await bundle(p));
    const savedAt = new Date().toISOString();
    const autosave = row?.autosave ?? true;
    await db.fileHandles.put({ projectId: p.id, handle, name: handle.name, autosave, savedAt });
    useFile.setState({ name: handle.name, savedAt, autosave, needsPermission: false });
    toast(`Saved to ${handle.name}${autosave ? ' — changes will autosave to this file' : ''}`);
    return true;
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast(`Couldn't save: ${(e as Error).message}`);
    return false;
  } finally {
    useFile.setState({ writing: false });
  }
}

/** A copy that isn't connected to the shared project (new ids, no share access). */
export async function saveIndependentCopy(): Promise<void> {
  const p = useStore.getState().project;
  if (!p) return;
  const name = `${safeName(p.title)} (copy)${PROJECT_EXT}`;
  try {
    const blob = await bundle(p, true);
    if (fileAccessSupported()) {
      const handle = await (window as PickerWindow).showSaveFilePicker!({ suggestedName: name, types: TYPES });
      await write(handle, blob);
      toast(`Saved an independent copy to ${handle.name}`);
    } else download(name, blob);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast(`Couldn't save: ${(e as Error).message}`);
  }
}

export async function setFileAutosave(on: boolean) {
  const p = useStore.getState().project;
  if (!p) return;
  await db.fileHandles.update(p.id, { autosave: on });
  useFile.setState({ autosave: on });
}

/** Re-allow writing to the file after a reload (browsers require a click). */
export async function reconnectFile() {
  const p = useStore.getState().project;
  const row = p && await db.fileHandles.get(p.id);
  if (!row) return;
  if (await permitted(row.handle as Handle, true)) { useFile.setState({ needsPermission: false }); void saveToFile(); }
}

/** Open a project file, remembering it so Save writes back to it. */
export async function openProjectFilePicker(): Promise<{ file: File; handle?: FileSystemFileHandle } | null> {
  if (typeof (window as PickerWindow).showOpenFilePicker !== 'function') return null;
  try {
    const [handle] = await (window as PickerWindow).showOpenFilePicker!({ types: [...TYPES, { description: 'Project JSON', accept: { 'application/json': ['.json'] } }] });
    return { file: await handle.getFile(), handle };
  } catch { return null; }
}

export async function rememberFile(projectId: string, handle: FileSystemFileHandle) {
  await db.fileHandles.put({ projectId, handle, name: handle.name, autosave: true, savedAt: new Date().toISOString() });
}

// ---------- autosave to the file ----------

let timer: ReturnType<typeof setTimeout> | undefined;
let lastWritten: Project | null = null;

export function startFileAutosave(): () => void {
  return useStore.subscribe((s) => {
    const p = s.project;
    if (!p || p === lastWritten || !useFile.getState().autosave || !useFile.getState().name) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const cur = useStore.getState().project;
      if (!cur || useFile.getState().writing) return;
      const row = await db.fileHandles.get(cur.id).catch(() => undefined);
      if (!row?.autosave) return;
      if (!(await permitted(row.handle as Handle, false).catch(() => false))) { useFile.setState({ needsPermission: true }); return; }
      try {
        useFile.setState({ writing: true });
        await write(row.handle as Handle, await bundle(cur));
        lastWritten = cur;
        const savedAt = new Date().toISOString();
        await db.fileHandles.update(cur.id, { savedAt });
        useFile.setState({ savedAt });
      } catch (e) {
        console.warn('File autosave failed', e);
      } finally { useFile.setState({ writing: false }); }
    }, 5000);
  });
}
