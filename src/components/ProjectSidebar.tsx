import { useEffect, useState } from 'react';

// The sections and tabs inside a project (wider than 900 px; phones and iPad portrait use the
// drawer). Open, it lists the tabs under each section; collapsed, it shows icons, and hovering
// one shows its tabs.

interface Tab { id: string; label: string; hint: string }
interface Section { id: string; label: string; tabs: Tab[] }

const ICONS: Record<string, string> = {
  write: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  visualize: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  breakdown: 'M4 6h16M4 12h16M4 18h16',
  plan: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
  budget: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  shoot: 'M3 8h18v12H3zM3 8l3-5M9 8l3-5M15 8l3-5',
  release: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  reference: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h14',
  exports: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
};
const TOOLS = ['reference', 'exports', 'settings'];

const Icon = ({ id }: { id: string }) => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[id]} /></svg>;

export function ProjectSidebar({ sections, tab, setTab, firstTabIn, collapsed, onToggle }: {
  sections: Section[]; tab: string; setTab: (t: string) => void; firstTabIn: (s: Section) => string; collapsed: boolean; onToggle: () => void;
}) {
  const current = sections.find((s) => s.tabs.some((t) => t.id === tab))?.id;
  const [open, setOpen] = useState<string[]>(current ? [current] : []);
  // Jumping to a tab from elsewhere opens its section.
  useEffect(() => { if (current) setOpen((o) => (o.includes(current) ? o : [...o, current])); }, [current]);
  const main = sections.filter((s) => !TOOLS.includes(s.id));
  const tools = sections.filter((s) => TOOLS.includes(s.id));
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <aside className={`project-side ${collapsed ? 'collapsed' : ''}`}>
      <button className="project-side-toggle" title={label} aria-label={label} onClick={onToggle}>{collapsed ? '⇥' : '⇤'}</button>
      <nav className="project-side-sections" aria-label="Sections">
        {main.map((s) => {
          const isOpen = !collapsed && open.includes(s.id);
          const here = s.id === current;
          return (
            <div key={s.id} className={`section-wrap ${here ? 'here' : ''}`}>
              <button
                className="project-side-section"
                title={collapsed ? s.label : undefined}
                aria-label={collapsed ? s.label : undefined}
                aria-expanded={collapsed ? undefined : isOpen}
                onClick={(e) => {
                  if (collapsed) { setTab(firstTabIn(s)); (e.currentTarget as HTMLElement).blur(); }
                  else setOpen((o) => (o.includes(s.id) ? o.filter((x) => x !== s.id) : [...o, s.id]));
                }}
              >
                <Icon id={s.id} />
                {!collapsed && <span>{s.label}</span>}
              </button>
              {isOpen && (
                <div className="project-side-tabs">
                  {s.tabs.map((t) => (
                    <button key={t.id} className={t.id === tab ? 'active' : ''} aria-current={t.id === tab ? 'page' : undefined} title={t.hint} onClick={() => setTab(t.id)}>
                      <span>{t.label}</span>{t.id === 'paperwork' && <span className="project-side-private">private</span>}
                    </button>
                  ))}
                </div>
              )}
              {collapsed && (
                <div className="section-flyout" role="menu" aria-label={s.label}>
                  {s.tabs.map((t) => (
                    <button key={t.id} role="menuitem" className={t.id === tab ? 'active' : ''} onClick={(e) => { setTab(t.id); (e.currentTarget as HTMLElement).blur(); }}>
                      <b>{t.label}</b><span>{t.hint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <nav className="project-side-tools" aria-label="Tools">
        {tools.map((s) => (
          <button key={s.id} className={`project-side-section ${s.id === current ? 'active' : ''}`} aria-current={s.id === current ? 'page' : undefined} title={collapsed ? s.label : s.tabs[0].hint} aria-label={collapsed ? s.label : undefined} onClick={() => setTab(s.tabs[0].id)}>
            <Icon id={s.id} />
            {!collapsed && <span>{s.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
