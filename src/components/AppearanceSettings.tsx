import { useRef, useState } from 'react';
import { useTheme, DEFAULTS, PRESETS, resolvedMode, exportThemes, samePalettes, type Palette } from '../theme';
import { Logo } from './Logo';
import { askConfirm, askText } from './dialogs';
import { toast } from './common';
import { download } from '../io/files';

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
  const fileRef = useRef<HTMLInputElement>(null);
  const current = { light: t.light, dark: t.dark };
  const isSaved = PRESETS.some((pr) => samePalettes(pr, current)) || t.saved.some((x) => samePalettes(x, current));
  const swatch = (light: Palette, dark: Palette) => {
    const prev = { ...DEFAULTS[which], ...(which === 'light' ? light : dark) };
    return (
      <span className="preset-swatch" style={{ background: prev.bg }}>
        <i style={{ background: prev.panel, color: prev.text }}>Aa</i>
        <b style={{ background: prev.accent }} />
      </span>
    );
  };
  const saveAs = async () => {
    const name = await askText('Save these colors as a theme', { placeholder: 'e.g. Night shoot', confirmLabel: 'Save theme' });
    if (name) { t.saveTheme(name); toast(`Saved theme "${name.trim()}"`); }
  };
  const rename = async (id: string, old: string) => {
    const name = await askText('Rename theme', { initial: old, confirmLabel: 'Rename' });
    if (name) t.renameTheme(id, name);
  };
  const remove = async (id: string, name: string) => {
    if (await askConfirm(`Delete the theme "${name}"?`, { message: 'Your current colors stay as they are.', confirmLabel: 'Delete', danger: true })) t.deleteTheme(id);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const n = t.importThemes(JSON.parse(await f.text()));
      toast(n ? `Imported ${n} theme${n === 1 ? '' : 's'}` : 'No new themes in that file');
    } catch { toast("That file isn't an Open Gate themes file"); }
  };
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
        {PRESETS.map((pr) => (
          <button key={pr.name} className={`preset ${samePalettes(pr, current) ? 'on' : ''}`} onClick={() => t.setPalettes(pr.light, pr.dark)}>
            {swatch(pr.light, pr.dark)}
            {pr.name}
          </button>
        ))}
      </div>

      <h4>Your themes</h4>
      {t.saved.length > 0 ? (
        <div className="preset-grid">
          {t.saved.map((th) => (
            <div key={th.id} className="preset-wrap">
              <button
                className={`preset ${samePalettes(th, current) ? 'on' : ''}`}
                onClick={() => t.setPalettes(th.light, th.dark)}
                onDoubleClick={() => rename(th.id, th.name)}
                onContextMenu={(e) => { e.preventDefault(); void remove(th.id, th.name); }}
                title="Click to use · double-click to rename · right-click to delete"
              >
                {swatch(th.light, th.dark)}
                {th.name}
              </button>
              <span className="preset-actions">
                <button className="icon-btn" title="Rename" onClick={() => rename(th.id, th.name)}>✎</button>
                <button className="icon-btn" title="Delete" onClick={() => remove(th.id, th.name)}>×</button>
              </span>
            </div>
          ))}
        </div>
      ) : <p className="muted small">Pick custom colors below, then save them here as a theme.</p>}
      <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <button className="primary" disabled={isSaved} title={isSaved ? 'These colors are already a theme' : undefined} onClick={saveAs}>Save as theme…</button>
        <button disabled={!t.saved.length} onClick={() => download('open-gate-themes.json', exportThemes(t.saved), 'application/json')}>Export themes</button>
        <button onClick={() => fileRef.current?.click()}>Import themes…</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
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
