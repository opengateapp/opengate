import { useEffect, useState } from 'react';
import { openFaq } from '../help/HelpMenu';
import { helpItems } from '../help/HelpMenu';
import { useStore } from '../store/project';
import { useSync } from '../sync/state';
import { useReview } from '../sync/review';
import { useTheme, type ThemeMode } from '../theme';
import { runEdit } from '../components/EditMenu';
import { ShareBar } from '../components/share/ShareBar';
import { SyncIssues } from '../components/SyncIssues';
import { ProjectMenuItems } from '../components/ProjectMenu';
import { ImportDialog } from '../components/ImportDialog';
import { MoreMenu } from '../components/More';
import { Logo } from '../components/Logo';
import { usePhoneTabs } from './phoneTabs';
import { useHideOnScroll } from './responsive';

// Phone chrome: a slim top bar (☰, where you are, sync state, ⋯) and a drawer with the
// sections and tabs (Open Gate Lite shows only the chosen ones) plus project actions.

interface Tab { id: string; label: string; hint: string }
interface Section { id: string; label: string; tabs: Tab[] }

export function PhoneTopbar({ sections, allSections, tab, setTab, saveState }: {
  sections: Section[]; allSections: Section[]; tab: string; setTab: (t: never) => void; saveState: string;
}) {
  const title = useStore((s) => s.project!.title);
  const shared = useStore((s) => !!s.project!.share);
  const toReview = useReview((s) => s.changes.filter((c) => c.status === 'pending').length);
  const mode = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  const [drawer, setDrawer] = useState(false);
  const [importing, setImporting] = useState(false);
  const hidden = useHideOnScroll(!drawer);
  const current = allSections.flatMap((s) => s.tabs).find((t) => t.id === tab);
  const go = (t: string) => (setTab as (t: string) => void)(t);

  return (
    <>
      <header className={`topbar phone-bar ${hidden ? 'hide' : ''}`}>
        <button className="icon-btn burger" aria-label="Menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>☰</button>
        <button className="phone-where" onClick={() => setDrawer(true)}>
          <b>{current?.label ?? 'Open Gate'}</b>
          <span>{title || 'Untitled'}</span>
        </button>
        <SyncIssues compact onGo={(t) => go(t)} />
        <ShareBar compact />
        <MoreMenu label="More actions" sheet>
          <button onClick={() => window.dispatchEvent(new Event('opengate:share'))}>{shared ? 'Share & invite…' : 'Share…'}</button>
          {shared && <button onClick={() => window.dispatchEvent(new Event('opengate:review'))}>Review changes{toReview ? ` (${toReview})` : ''}</button>}
          <hr />
          <div className="sheet-row">
            <button onClick={() => runEdit('undo')}>↶ Undo</button>
            <button onClick={() => runEdit('redo')}>↷ Redo</button>
          </div>
          <hr />
          <div className="sheet-row keep-open" role="radiogroup" aria-label="Appearance">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
              <button key={m} className={mode === m ? 'on' : ''} aria-checked={mode === m} role="radio" onClick={() => setMode(m)}>
                {{ light: '☀ Light', dark: '☾ Dark', system: '◐ Auto' }[m]}
              </button>
            ))}
          </div>
          <hr />
          <button onClick={() => go('reports')}>⤓ Exports</button>
          <button onClick={() => go('setup')}>⚙ Settings</button>
          <button onClick={() => openFaq()}>? Help &amp; FAQ</button>
          <div className="menu-note">{saveState === 'saved' ? 'All changes saved on this device' : saveState === 'saving' ? 'Saving…' : 'Unsaved changes'}</div>
        </MoreMenu>
      </header>
      {drawer && <Drawer sections={sections} allSections={allSections} tab={tab} onPick={(t) => { go(t); setDrawer(false); }} onClose={() => setDrawer(false)} onImport={() => setImporting(true)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}

function Drawer({ sections, allSections, tab, onPick, onClose, onImport }: { sections: Section[]; allSections: Section[]; tab: string; onPick: (t: string) => void; onClose: () => void; onImport: () => void }) {
  const lite = usePhoneTabs((s) => s.lite);
  const [showAll, setShowAll] = useState(false);
  const title = useStore((s) => s.project!.title);
  const update = useStore((s) => s.update);
  const status = useSync((s) => s.status);
  const list = showAll ? allSections : sections;
  // Sections are dropdowns: the one you're in starts open.
  const [open, setOpen] = useState<string[]>(() => list.filter((s) => s.tabs.some((t) => t.id === tab)).map((s) => s.id));
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <nav className="drawer" aria-label="Sections">
        <div className="drawer-head">
          <Logo className="topbar-logo" />
          <input className="project-title" value={title} aria-label="Project title" onChange={(e) => update((d) => { d.title = e.target.value; }, null)} />
          <button className="icon-btn" aria-label="Close menu" onClick={onClose}>✕</button>
        </div>
        {status !== 'off' && <div className={`drawer-sync s-${status}`}>{status === 'live' ? '● Connected' : status === 'offline' ? '○ Offline — saved here, will sync later' : status === 'connecting' ? '◌ Connecting…' : '⚠ Not syncing'}</div>}
        <div className="drawer-sections">
          {list.filter((s) => s.id !== 'settings' && s.id !== 'exports').map((s) => (
            <div key={s.id} className={`drawer-section ${open.includes(s.id) ? 'open' : ''}`}>
              <button className="drawer-section-head" aria-expanded={open.includes(s.id)} onClick={() => toggle(s.id)}>
                <span>{s.label}</span>
                <span className="muted small">{s.tabs.some((t) => t.id === tab) && !open.includes(s.id) ? '● ' : ''}{s.tabs.length}</span>
                <span className="chev" aria-hidden>{open.includes(s.id) ? '▾' : '▸'}</span>
              </button>
              {open.includes(s.id) && s.tabs.map((t) => (
                <button key={t.id} className={t.id === tab ? 'active' : ''} onClick={() => onPick(t.id)}>
                  <b>{t.label}</b><span>{t.hint}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="drawer-sections drawer-extra">
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => onPick('reports')}><b>⤓ Exports</b><span>Every PDF, spreadsheet, calendar and the end credits</span></button>
        </div>
        <div className="drawer-sections drawer-extra drawer-help">
          <span className="muted small">? Help</span>
          {helpItems(tab).filter((it) => it.id !== 'reference').map((it) => <button key={it.id} onClick={() => { onClose(); it.run(); }}><b>{it.label}</b><span>{it.hint}</span></button>)}
        </div>
        <div className="drawer-foot">
          {lite && sections !== allSections && (
            <label className="check">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all tabs
            </label>
          )}
          <button className="link" onClick={() => { onPick('setup'); setTimeout(() => window.dispatchEvent(new Event('opengate:phone-layout')), 50); }}>
            {lite ? 'Open Gate Lite · Customize tabs…' : 'Phone layout…'}
          </button>
        </div>
        <details className="drawer-project">
          <summary>Project</summary>
          <div className="menu-list">
            <ProjectMenuItems onDone={onClose} onImport={onImport} />
          </div>
        </details>
      </nav>
    </>
  );
}
