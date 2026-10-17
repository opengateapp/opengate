import { create } from 'zustand';

// Open Gate Lite: on phones, show a short list of tabs (chosen per device). Desktop always
// shows everything. Tab ids are plain strings here so this file doesn't depend on App.tsx.

export const LITE_DEFAULT = ['screenplay', 'callsheets', 'stripboard', 'calendar', 'tasks', 'contacts', 'locations', 'shots', 'expenses'];

export interface PhoneTabs {
  /** Lite on: only `tabs` are shown on phones. */
  lite: boolean;
  /** The tabs to show, in order. */
  tabs: string[];
}

const KEY = 'opengate.mobileTabs';

/** Reads saved settings, keeping only known tabs (and falling back to the defaults). */
export function parsePhoneTabs(raw: unknown, known: string[]): PhoneTabs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<PhoneTabs>;
  const tabs = Array.isArray(v.tabs) ? [...new Set(v.tabs.filter((t): t is string => typeof t === 'string' && known.includes(t)))] : LITE_DEFAULT.filter((t) => known.includes(t));
  return { lite: v.lite !== false, tabs: tabs.length ? tabs : LITE_DEFAULT.filter((t) => known.includes(t)) };
}

function load(): PhoneTabs {
  try { return parsePhoneTabs(JSON.parse(localStorage.getItem(KEY) ?? 'null'), ALL_KNOWN); } catch { return { lite: true, tabs: [...LITE_DEFAULT] }; }
}

export interface SectionInfo { id: string; label: string; tabs: { id: string; label: string; hint: string }[] }

// Every section and tab the app has; App.tsx registers them on start.
let ALL_KNOWN: string[] = [...LITE_DEFAULT];
let SECTIONS: SectionInfo[] = [];
export function registerSections(sections: SectionInfo[]) {
  SECTIONS = sections.filter((s) => s.id !== 'settings');
  ALL_KNOWN = SECTIONS.flatMap((s) => s.tabs.map((t) => t.id));
  usePhoneTabs.setState(load());
}
export const allSections = () => SECTIONS;

export const usePhoneTabs = create<PhoneTabs & {
  setLite: (on: boolean) => void;
  toggle: (tab: string, on: boolean) => void;
  move: (tab: string, by: -1 | 1) => void;
  reorder: (tab: string, before: string | null) => void;
  reset: () => void;
}>((set) => ({
  lite: true,
  tabs: [...LITE_DEFAULT],
  setLite: (lite) => set({ lite }),
  toggle: (tab, on) => set((s) => ({ tabs: on ? (s.tabs.includes(tab) ? s.tabs : [...s.tabs, tab]) : s.tabs.filter((t) => t !== tab) })),
  move: (tab, by) => set((s) => {
    const i = s.tabs.indexOf(tab);
    const j = i + by;
    if (i < 0 || j < 0 || j >= s.tabs.length) return {};
    const tabs = [...s.tabs];
    [tabs[i], tabs[j]] = [tabs[j], tabs[i]];
    return { tabs };
  }),
  reorder: (tab, before) => set((s) => {
    const rest = s.tabs.filter((t) => t !== tab);
    const at = before ? rest.indexOf(before) : rest.length;
    rest.splice(at < 0 ? rest.length : at, 0, tab);
    return { tabs: rest };
  }),
  reset: () => set({ lite: true, tabs: LITE_DEFAULT.filter((t) => ALL_KNOWN.includes(t)) }),
}));

usePhoneTabs.subscribe((s) => {
  try { localStorage.setItem(KEY, JSON.stringify({ lite: s.lite, tabs: s.tabs })); } catch { /* ignore */ }
});

/**
 * The sections and tabs to show. On phones with Lite on: only the chosen tabs, in the
 * chosen order within each section; sections with none left are dropped.
 */
export function visibleSections<S extends { id: string; tabs: { id: string }[] }>(sections: S[], settings: PhoneTabs, phone: boolean): S[] {
  if (!phone || !settings.lite) return sections;
  const rank = new Map(settings.tabs.map((t, i) => [t, i]));
  return sections
    .map((s) => ({ ...s, tabs: s.tabs.filter((t) => rank.has(t.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!) }))
    .filter((s) => s.tabs.length);
}
