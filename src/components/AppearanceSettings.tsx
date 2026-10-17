import { useState } from 'react';
import { useTheme, DEFAULTS, PRESETS, resolvedMode, type Palette } from '../theme';
import { Logo } from './Logo';

const FIELDS: { key: keyof Palette; label: string; hint: string }[] = [
  { key: 'bg', label: 'Window background', hint: 'Behind everything' },
  { key: 'panel', label: 'Panels & windows', hint: 'Top bar, sidebars, menus, dialogs' },
  { key: 'text', label: 'Text', hint: 'Main text (secondary text and borders follow it)' },
  { key: 'accent', label: 'Accent', hint: 'Active tabs, buttons, highlights' },
  { key: 'logo', label: 'Logo', hint: 'The Open Gate logo (follows the text color unless set)' },
];

/** Settings → Appearance: Light / Dark / System and custom colors for each mode. */
export function AppearanceSettings() {
  const t = useTheme();
  const [which, setWhich] = useState<'light' | 'dark'>(resolvedMode(t.mode));
  const pal = t[which];
  return (
    <div className="appearance">
      <h3>Appearance</h3>
      <p className="muted small">Saved in this browser for all your projects.</p>
      <div className="field"><span>Mode</span>
        <div className="seg">
          {(['light', 'dark', 'system'] as const).map((m) => (
            <button key={m} className={t.mode === m ? 'active' : ''} onClick={() => { t.setMode(m); setWhich(resolvedMode(m)); }}>
              {{ light: '☀ Light', dark: '☾ Dark', system: '◐ System' }[m]}
            </button>
          ))}
        </div>
      </div>

      <h4>Color themes</h4>
      <div className="preset-grid">
        {PRESETS.map((pr) => {
          const prev = { ...DEFAULTS[which], ...pr[which] };
          const active = JSON.stringify(pr.light) === JSON.stringify(t.light) && JSON.stringify(pr.dark) === JSON.stringify(t.dark);
          return (
            <button key={pr.name} className={`preset ${active ? 'on' : ''}`} onClick={() => t.setPalettes(pr.light, pr.dark)}>
              <span className="preset-swatch" style={{ background: prev.bg }}>
                <i style={{ background: prev.panel, color: prev.text }}>Aa</i>
                <b style={{ background: prev.accent }} />
              </span>
              {pr.name}
            </button>
          );
        })}
      </div>

      <h4>Custom colors</h4>
      <div className="seg">
        <button className={which === 'light' ? 'active' : ''} onClick={() => setWhich('light')}>Light mode colors</button>
        <button className={which === 'dark' ? 'active' : ''} onClick={() => setWhich('dark')}>Dark mode colors</button>
      </div>
      {resolvedMode(t.mode) !== which && <p className="muted small">You're editing {which} mode while the app shows {resolvedMode(t.mode)} mode — switch Mode above to see these.</p>}
      <div className="color-fields">
        {FIELDS.map((f) => (
          <label key={f.key} className="color-field">
            <input type="color" value={pal[f.key] ?? DEFAULTS[which][f.key]} onChange={(e) => t.setColor(which, f.key, e.target.value)} />
            <span><b>{f.label}</b><small className="muted">{f.hint}</small></span>
            {pal[f.key] && <button className="link small" onClick={(e) => { e.preventDefault(); t.setColor(which, f.key, undefined); }}>Reset</button>}
          </label>
        ))}
      </div>
      <div className="logo-preview" style={{ background: pal.bg ?? DEFAULTS[which].bg, ['--logo' as string]: pal.logo ?? pal.text ?? DEFAULTS[which].logo }}>
        <Logo className="preview-logo" />
      </div>
      <button onClick={() => t.setPalettes({}, {})}>Reset all colors</button>
    </div>
  );
}
