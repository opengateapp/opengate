import { useTheme, type ThemeMode } from '../theme';

const MODES: { id: ThemeMode; icon: string; label: string }[] = [
  { id: 'light', icon: '☀', label: 'Light' },
  { id: 'dark', icon: '☾', label: 'Dark' },
  { id: 'system', icon: '◐', label: 'System' },
];

/** Light / Dark / System switch. */
export function ThemeToggle() {
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Appearance">
      {MODES.map((m) => (
        <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} title={`${m.label} mode`} onClick={() => setMode(m.id)}>{m.icon}</button>
      ))}
    </div>
  );
}
