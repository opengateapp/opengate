import { create } from 'zustand';

// App preferences: how Open Gate looks and behaves on this device (not shared with collaborators,
// not saved in projects). Project-wide settings live in the project instead.

export type DateStyle = 'auto' | 'us' | 'intl' | 'iso';
export interface Prefs {
  dateStyle: DateStyle;
  clock: '12' | '24';
  /** 0 = Sunday, 1 = Monday. */
  weekStart: 0 | 1;
  units: 'ft' | 'm';
  /** Interface size, as a zoom factor. */
  textSize: number;
  reduceMotion: boolean;
  /** Your colour when you share a project (presence dot, cursor). '' = automatic. */
  color: string;
}

const KEY = 'opengate.prefs';
const DEFAULTS: Prefs = { dateStyle: 'auto', clock: '12', weekStart: 0, units: 'ft', textSize: 1, reduceMotion: false, color: '' };

function load(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    const units = (localStorage.getItem('opengate.units') as Prefs['units'] | null) ?? v.units;
    return { ...DEFAULTS, ...v, ...(units === 'm' || units === 'ft' ? { units } : {}) };
  } catch { return { ...DEFAULTS }; }
}

export const usePrefs = create<Prefs>(() => (typeof localStorage === 'undefined' ? { ...DEFAULTS } : load()));

export function setPrefs(patch: Partial<Prefs>) {
  usePrefs.setState(patch);
  const s = usePrefs.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem('opengate.units', s.units);
  } catch { /* storage blocked */ }
  applyPrefs();
}

export const prefs = () => usePrefs.getState();

/** Page-level preferences: text size and reduced motion. */
export function applyPrefs() {
  if (typeof document === 'undefined') return;
  const s = usePrefs.getState();
  const root = document.documentElement;
  root.style.setProperty('--ui-zoom', String(s.textSize));
  root.dataset.reduceMotion = s.reduceMotion ? 'true' : 'false';
}

/** Locale for dates: the browser's, or a fixed style. */
export function dateLocale(): string | undefined {
  return { auto: undefined, us: 'en-US', intl: 'en-GB', iso: 'sv-SE' }[usePrefs.getState().dateStyle];
}

/** Current interface zoom (Accessibility → Interface size). Screen pixels ÷ this = layout pixels inside the app. */
export function uiZoom(): number {
  if (typeof document === 'undefined') return 1;
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
}
