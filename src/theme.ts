import { create } from 'zustand';

// Appearance: Light / Dark / System mode, plus optional custom colors for each mode.
// Stored per browser (it's a preference, not part of a project).

export type ThemeMode = 'light' | 'dark' | 'system';
/** User colors for one mode. Missing values keep the built-in theme. */
export interface Palette { bg?: string; panel?: string; text?: string; accent?: string; /** Open Gate logo color (defaults to the text color). */ logo?: string }
export interface ThemePrefs { mode: ThemeMode; light: Palette; dark: Palette }

const KEY = 'slateline.theme';

export const DEFAULTS: Record<'light' | 'dark', Required<Palette>> = {
  light: { bg: '#f4f4f5', panel: '#ffffff', text: '#18181b', accent: '#c2410c', logo: '#000000' },
  dark: { bg: '#0f0f12', panel: '#18181b', text: '#f4f4f5', accent: '#fb923c', logo: '#ffffff' },
};

export const PRESETS: { name: string; light: Palette; dark: Palette }[] = [
  { name: 'Open Gate (default)', light: {}, dark: {} },
  { name: 'Midnight blue', light: { bg: '#eef2f7', panel: '#ffffff', text: '#0f172a', accent: '#2563eb' }, dark: { bg: '#0b1120', panel: '#111a2e', text: '#e2e8f0', accent: '#60a5fa' } },
  { name: 'Warm paper', light: { bg: '#f5efe4', panel: '#fffaf1', text: '#2b2118', accent: '#b45309' }, dark: { bg: '#17130e', panel: '#211b14', text: '#f3e9da', accent: '#f59e0b' } },
  { name: 'Forest', light: { bg: '#eef3ee', panel: '#ffffff', text: '#14241a', accent: '#15803d' }, dark: { bg: '#0c1410', panel: '#131f18', text: '#e3efe6', accent: '#4ade80' } },
  { name: 'Studio purple', light: { bg: '#f3f0fa', panel: '#ffffff', text: '#1e1530', accent: '#7c3aed' }, dark: { bg: '#110d1a', panel: '#1a1426', text: '#ece6fa', accent: '#a78bfa' } },
  { name: 'High contrast', light: { bg: '#ffffff', panel: '#ffffff', text: '#000000', accent: '#c2410c' }, dark: { bg: '#000000', panel: '#0a0a0a', text: '#ffffff', accent: '#ffb020' } },
];

function load(): ThemePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (v && (v.mode === 'light' || v.mode === 'dark' || v.mode === 'system')) return { mode: v.mode, light: v.light ?? {}, dark: v.dark ?? {} };
  } catch { /* defaults */ }
  return { mode: 'system', light: {}, dark: {} };
}

export const useTheme = create<ThemePrefs & {
  setMode: (m: ThemeMode) => void;
  setColor: (which: 'light' | 'dark', key: keyof Palette, value: string | undefined) => void;
  setPalettes: (light: Palette, dark: Palette) => void;
}>((set) => ({
  ...load(),
  setMode: (mode) => set({ mode }),
  setColor: (which, key, value) => set((s) => ({ [which]: { ...s[which], [key]: value } }) as Partial<ThemePrefs>),
  setPalettes: (light, dark) => set({ light: { ...light }, dark: { ...dark } }),
}));

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function resolvedMode(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (media()?.matches ? 'dark' : 'light') : mode;
}

/** CSS for custom colors: the four you pick, plus the in-between shades derived from them. */
export function paletteCss(which: 'light' | 'dark', pal: Palette): string {
  const vars: string[] = [];
  if (pal.bg) vars.push(`--bg:${pal.bg}`);
  if (pal.panel) vars.push(`--panel:${pal.panel}`);
  if (pal.text) vars.push(`--text:${pal.text}`);
  if (pal.accent) vars.push(`--accent:${pal.accent}`);
  if (pal.logo) vars.push(`--logo:${pal.logo}`);
  if (pal.panel || pal.text) {
    vars.push('--panel-2:color-mix(in srgb, var(--panel) 92%, var(--text))', '--border:color-mix(in srgb, var(--panel) 80%, var(--text))', '--muted:color-mix(in srgb, var(--text) 58%, var(--panel))');
  }
  if (pal.accent || pal.panel) {
    vars.push(`--accent-2:color-mix(in srgb, var(--accent) 85%, ${which === 'dark' ? 'white' : 'black'})`, '--accent-soft:color-mix(in srgb, var(--accent) 16%, var(--panel))');
  }
  return vars.length ? `:root[data-theme="${which}"]{${vars.join(';')}}` : '';
}

export function applyTheme(prefs: ThemePrefs = useTheme.getState()) {
  const root = document.documentElement;
  root.dataset.theme = resolvedMode(prefs.mode);
  let el = document.getElementById('slateline-theme') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'slateline-theme';
    document.head.appendChild(el);
  }
  el.textContent = paletteCss('light', prefs.light) + paletteCss('dark', prefs.dark);
}

/** Applies the theme now, keeps it in sync with saved changes and the OS setting. */
export function startTheme() {
  applyTheme();
  useTheme.subscribe((s) => {
    try { localStorage.setItem(KEY, JSON.stringify({ mode: s.mode, light: s.light, dark: s.dark })); } catch { /* ignore */ }
    applyTheme(s);
  });
  media()?.addEventListener('change', () => applyTheme());
}
