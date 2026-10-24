import { useEffect, useState } from 'react';
import { setPrefs, usePrefs, type DateStyle } from '../prefs';
import { formatClock12, formatDate, todayISO } from '../model/dates';
import { displayName, setDisplayName } from '../sync/engine';
import { BUILT_IN_RELAY, customRelay, setRelay } from '../sync/links';
import { listProjects, loadProject } from '../store/db';
import { download, exportProjectFile, PROJECT_EXT, safeName } from '../io/files';
import { ELEMENT_SHORTCUTS } from '../script/commands';
import { ELEMENT_LABELS } from '../script/schema';
import { toast } from './common';

// Settings → App preferences: things that belong to this device and person, not the project.

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = (k: string) => k.replace('Mod', MAC ? '⌘' : 'Ctrl').replace('Shift', MAC ? '⇧' : 'Shift').replace(/-/g, MAC ? '' : '+');

export function FormatPrefs() {
  const p = usePrefs();
  const today = todayISO();
  return (
    <div className="prefs">
      <h3>Dates, times & units</h3>
      <p className="muted small">How dates and times are shown on this device. Projects and exports to collaborators aren’t changed.</p>
      <div className="form-grid">
        <label className="field"><span>Dates</span>
          <select value={p.dateStyle} onChange={(e) => setPrefs({ dateStyle: e.target.value as DateStyle })}>
            <option value="auto">Like this device</option><option value="us">Oct 19 (US)</option><option value="intl">19 Oct (UK / international)</option><option value="iso">2026-10-19 (ISO)</option>
          </select>
        </label>
        <label className="field"><span>Times</span>
          <select value={p.clock} onChange={(e) => setPrefs({ clock: e.target.value as '12' | '24' })}><option value="12">12-hour (7:00 AM)</option><option value="24">24-hour (07:00)</option></select>
        </label>
        <label className="field"><span>Weeks start on</span>
          <select value={p.weekStart} onChange={(e) => setPrefs({ weekStart: Number(e.target.value) as 0 | 1 })}><option value={0}>Sunday</option><option value={1}>Monday</option></select>
        </label>
      </div>
      <p className="small">Looks like: <b>{formatDate(today)}</b> · <b>{formatDate(today, { year: 'numeric', month: 'long', day: 'numeric' })}</b> · <b>{formatClock12(7 * 60)}</b> – <b>{formatClock12(19 * 60 + 30)}</b></p>
    </div>
  );
}

export function ProfilePrefs() {
  const [name, setName] = useState(displayName());
  const color = usePrefs((s) => s.color);
  const [relay, setRelayInput] = useState(customRelay());
  const COLORS = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
  return (
    <div className="prefs">
      <h3>You & sharing</h3>
      <div className="form-grid">
        <label className="field"><span>Your name (shown to collaborators)</span><input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setDisplayName(name)} /></label>
      </div>
      <div className="field"><span>Your colour (cursor and presence)</span>
        <div className="swatch-row">
          {COLORS.map((c) => <button key={c || 'auto'} className={`swatch ${color === c ? 'on' : ''}`} aria-label={c || 'Automatic'} title={c || 'Automatic (different per project)'} style={c ? { background: c } : undefined} onClick={() => setPrefs({ color: c })}>{c ? '' : 'A'}</button>)}
        </div>
      </div>
      <label className="field"><span>Relay for new shares (leave empty for Open Gate’s built-in relay)</span>
        <input value={relay} placeholder={BUILT_IN_RELAY} onChange={(e) => setRelayInput(e.target.value)} onBlur={() => { setRelay(relay); toast(relay.trim() ? 'New shares will use your relay' : 'New shares will use the built-in relay'); }} />
      </label>
      <p className="muted small">Projects already shared keep the relay they started on.</p>
    </div>
  );
}

export function AccessibilityPrefs() {
  const p = usePrefs();
  const sizes: [number, string][] = [[0.9, 'Smaller'], [1, 'Normal'], [1.1, 'Larger'], [1.25, 'Largest']];
  return (
    <div className="prefs">
      <h3>Accessibility</h3>
      <div className="field"><span>Interface size</span>
        <div className="seg">{sizes.map(([z, l]) => <button key={z} className={p.textSize === z ? 'active' : ''} onClick={() => setPrefs({ textSize: z })}>{l}</button>)}</div>
      </div>
      <label className="check"><input type="checkbox" checked={p.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /> Reduce motion (no sliding sheets or animations)</label>
      <p className="muted small">Scales the whole app, the script page included. Page counts and PDFs don’t change.</p>
    </div>
  );
}

export function DataPrefs() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }));
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(0.1, n / 1e6).toFixed(1)} MB`);

  const exportAll = async () => {
    setBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const list = await listProjects();
      const names = new Set<string>();
      for (const row of list) {
        const p = await loadProject(row.id);
        if (!p) continue;
        let n = safeName(p.title); let i = 2;
        while (names.has(n)) n = `${safeName(p.title)} ${i++}`;
        names.add(n);
        zip.file(`${n}${PROJECT_EXT}`, await exportProjectFile(p));
      }
      download(`Open Gate projects ${todayISO()}.zip`, await zip.generateAsync({ type: 'blob' }), 'application/zip');
      toast(`Exported ${names.size} project${names.size === 1 ? '' : 's'}`);
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="prefs">
      <h3>Data on this device</h3>
      <p className="muted small">Projects live in this browser’s storage. Keep backups — a project file, or all of them at once.</p>
      {usage && (
        <div className="storage-meter"><div style={{ width: `${Math.min(100, (usage.used / Math.max(1, usage.quota)) * 100)}%` }} /></div>
      )}
      {usage && <p className="small">Using <b>{mb(usage.used)}</b>{usage.quota ? ` of about ${mb(usage.quota)} available` : ''}.</p>}
      {persisted === false && (
        <button className="small" onClick={async () => { const ok = await navigator.storage?.persist?.(); setPersisted(!!ok); toast(ok ? 'This browser will keep your projects even when space runs low' : 'The browser didn’t allow it — keep regular backups'); }}>Ask the browser to keep projects safe</button>
      )}
      {persisted && <p className="small muted">✓ The browser won’t clear your projects to free space.</p>}
      <div className="row wrap"><button className="primary" disabled={busy} onClick={() => void exportAll()}>{busy ? 'Exporting…' : 'Export all projects (.zip)'}</button></div>
    </div>
  );
}

export function ShortcutsPrefs() {
  const rows: [string, string][] = [
    ['Mod-z', 'Undo'], ['Mod-Shift-z', 'Redo'], ['Mod-s', 'Save to file'], ['Mod-f', 'Find & replace (screenplay)'],
    ['Tab', 'Next element type (screenplay)'], ['Enter', 'New line with the next element'],
    ...ELEMENT_SHORTCUTS.map(([k, t]) => [k, `${ELEMENT_LABELS[t]} (screenplay)`] as [string, string]),
    ['R', 'Turn the selected item (shot designer)'], ['Delete', 'Remove the selected item (boards, shot designer)'],
    ['Space + drag', 'Pan (boards)'], ['Mod + scroll', 'Zoom (boards, shot designer)'],
  ];
  return (
    <div className="prefs">
      <h3>Keyboard shortcuts</h3>
      <table className="table compact"><tbody>{rows.map(([k, l]) => <tr key={k + l}><td><kbd>{mod(k)}</kbd></td><td>{l}</td></tr>)}</tbody></table>
    </div>
  );
}
