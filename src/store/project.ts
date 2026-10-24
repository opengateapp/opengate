import { create } from 'zustand';
import { setMoneyFormat } from '../budget/calc';
import { unitsOf } from '../model/units';
import { enablePatches, produceWithPatches, applyPatches, type Patch, type Draft } from 'immer';
import type { Project } from '../model/types';
import { derive, type Derived } from '../script/derive';
import { loadProject, saveProject } from './db';
import { claimProject, onHandOver, releaseProject, takeOver, useTabLock } from './tabLock';

enablePatches();

interface HistoryEntry { label: string; patches: Patch[]; inverse: Patch[] }

interface State {
  project: Project | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  saveState: 'saved' | 'saving' | 'dirty';
  open: (p: Project) => void;
  close: () => void;
  /** Mutates the project. Undoable unless `label` is null (e.g. script typing, which ProseMirror undoes). */
  update: (recipe: (draft: Draft<Project>) => void, label?: string | null) => void;
  undo: () => void;
  redo: () => void;
}

const MAX_HISTORY = 100;

/** Checks which project fields a change touches; returning false drops the change (shared-project permissions). */
type WriteGuard = (fields: string[]) => boolean;
let writeGuard: WriteGuard | null = null;
export function setWriteGuard(g: WriteGuard | null) { writeGuard = g; }

export const useStore = create<State>((set, get) => ({
  project: null,
  past: [],
  future: [],
  saveState: 'saved',
  open: (p) => { set({ project: p, past: [], future: [], saveState: 'saved' }); void claimProject(p.id); },
  close: () => { set({ project: null, past: [], future: [] }); releaseProject(); },
  update: (recipe, label = 'Edit') => {
    const p = get().project;
    if (!p) return;
    const [next, patches, inverse] = produceWithPatches(p, (d) => {
      recipe(d);
      d.updatedAt = new Date().toISOString();
    });
    if (!patches.some((x) => x.path[0] !== 'updatedAt')) return; // nothing but the timestamp changed
    if (writeGuard && !writeGuard([...new Set(patches.map((x) => String(x.path[0])))])) return;
    if (label === null) {
      set({ project: next, saveState: 'dirty' });
      return;
    }
    set((s) => ({
      project: next,
      saveState: 'dirty',
      past: [...s.past.slice(-MAX_HISTORY + 1), { label, patches, inverse }],
      future: [],
    }));
  },
  undo: () => {
    const { past, project } = get();
    const e = past[past.length - 1];
    if (!e || !project) return;
    if (writeGuard && !writeGuard([...new Set(e.inverse.map((x) => String(x.path[0])))])) return;
    set((s) => ({ project: applyPatches(project, e.inverse), past: s.past.slice(0, -1), future: [e, ...s.future], saveState: 'dirty' }));
  },
  redo: () => {
    const { future, project } = get();
    const e = future[0];
    if (!e || !project) return;
    if (writeGuard && !writeGuard([...new Set(e.patches.map((x) => String(x.path[0])))])) return;
    set((s) => ({ project: applyPatches(project, e.patches), future: s.future.slice(1), past: [...s.past, e], saveState: 'dirty' }));
  },
}));

export function useProject(): Project {
  const p = useStore((s) => s.project);
  if (!p) throw new Error('No project open');
  return p;
}

export function useDerived(): Derived {
  const doc = useStore((s) => s.project?.scriptDoc);
  const locked = useStore((s) => s.project?.sceneNumbersLocked ?? false);
  return derive(doc, locked);
}

export function getDerived(): Derived {
  const p = useStore.getState().project;
  return derive(p?.scriptDoc, p?.sceneNumbersLocked ?? false);
}

// ---- Autosave to IndexedDB (debounced) ----
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: Project | null = null;

export function startAutosave(): () => void {
  return useStore.subscribe((s) => {
    if (!s.project || s.project === lastSaved || s.saveState !== 'dirty') return;
    // Read-only here: another tab is editing this project and saves it.
    if (useTabLock.getState().readOnly) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const p = useStore.getState().project;
      if (!p) return;
      useStore.setState({ saveState: 'saving' });
      try {
        await saveProject(p);
        lastSaved = p;
        if (useStore.getState().project === p) useStore.setState({ saveState: 'saved' });
        else useStore.setState({ saveState: 'dirty' });
      } catch (err) {
        console.error('Autosave failed', err);
        useStore.setState({ saveState: 'dirty' });
      }
    }, 700);
  });
}

export async function flushSave(): Promise<void> {
  clearTimeout(timer);
  const p = useStore.getState().project;
  if (p && !useTabLock.getState().readOnly) {
    await saveProject(p);
    lastSaved = p;
    useStore.setState({ saveState: 'saved' });
  }
}

// Before handing the project to another tab, save this tab's copy.
onHandOver(flushSave);

/** "Use it here": take the project over from the other tab and load what it saved. */
export async function editProjectHere(): Promise<void> {
  const id = useStore.getState().project?.id;
  if (!id) return;
  await takeOver(id);
  const p = await loadProject(id);
  if (p) { lastSaved = p; useStore.setState({ project: p, past: [], future: [], saveState: 'saved' }); }
}

/** Money everywhere follows the open project's currency, number format and symbol style (before screens re-render). */
export function startMoneyFormat(): () => void {
  let last: unknown;
  const apply = (p: Project | null) => {
    const key = p ? `${p.units?.currency}|${p.units?.locale}|${p.units?.symbolStyle}|${p.budget.currency}` : null;
    if (key === last) return;
    last = key;
    if (!p) { setMoneyFormat(null); return; }
    const u = unitsOf(p);
    setMoneyFormat({ currency: u.currency, locale: u.locale, display: u.symbolStyle === 'clear' ? 'symbol' : 'narrowSymbol' });
  };
  apply(useStore.getState().project);
  return useStore.subscribe((s) => apply(s.project));
}
