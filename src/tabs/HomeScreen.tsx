import { useEffect, useRef, useState } from 'react';
import { HelpDialogs, HelpLinks } from '../help/HelpMenu';
import { listProjects, loadProject, deleteProject } from '../store/db';
import { useStore } from '../store/project';
import { newProject } from '../model/defaults';
import { ImportDialog } from '../components/ImportDialog';
import { pickFile, readProjectFile, PROJECT_ACCEPT } from '../io/files';
import { openProjectFilePicker, rememberFile, fileAccessSupported } from '../io/fileSave';
import { isCineSchedProject, importCineSched } from '../io/cinesched';
import { session } from '../script/session';
import { toast } from '../components/common';
import { askConfirm, DialogHost } from '../components/dialogs';
import { migrate } from '../store/migrate';
import { ThemeToggle } from '../components/ThemeToggle';
import { Logo } from '../components/Logo';
import { StartFromBudget } from '../components/StartFromBudget';
import { PROJECT_FOLDERS_URL } from '../model/links';

// Home: a sidebar with the Open Gate tools. It always opens on Open Gate, where projects start.

type Section = 'app' | 'folders' | 'resources';
const SECTIONS: { id: Section; label: string; soon?: boolean }[] = [
  { id: 'app', label: 'Open Gate' },
  { id: 'folders', label: 'Project Folders' },
  { id: 'resources', label: 'Resources', soon: true },
];

const Benefit = ({ title, children }: { title: string; children: string }) => <div className="home-benefit"><b>{title}</b><span className="muted">{children}</span></div>;

export function HomeScreen() {
  const [projects, setProjects] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [section, setSection] = useState<Section>('app');
  const [dropping, setDropping] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const pick = (id: Section) => {
    setSection(id);
    // The main area scrolls on wide screens; the whole page scrolls on phones.
    main.current?.scrollTo?.(0, 0);
    page.current?.scrollTo?.(0, 0);
  };
  const open = (p: Parameters<ReturnType<typeof useStore.getState>['open']>[0], dirty = false) => {
    session.reset();
    useStore.getState().open(p);
    if (dirty) useStore.setState({ saveState: 'dirty' });
  };

  const refresh = () => { void listProjects().then(setProjects); };
  useEffect(refresh, []);

  const openProject = async (f: File, handle?: FileSystemFileHandle) => {
    try {
      if (f.name.toLowerCase().endsWith('.json')) {
        const json = JSON.parse(await f.text());
        if (isCineSchedProject(json)) {
          open(importCineSched(json), true);
          toast('Opened CineSched project');
          return;
        }
        open(migrate(json), true);
        return;
      }
      const p = await readProjectFile(f);
      if (handle) await rememberFile(p.id, handle);
      open(p, true);
      if (p.share) toast('Linked project — reconnecting to the shared copy and merging changes…');
    } catch (e) {
      toast(`Could not open ${f.name}: ${(e as Error).message}`);
    }
  };
  const openFile = async () => {
    // Chrome / Edge: remember the file so Save writes back to it.
    const picked = await openProjectFilePicker();
    const f = picked?.file ?? (fileAccessSupported() ? null : await pickFile(PROJECT_ACCEPT));
    if (f) await openProject(f, picked?.handle);
  };
  const dropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (PROJECT_ACCEPT.split(',').some((x) => f.name.toLowerCase().endsWith(x))) void openProject(f);
    else toast('Drop a project file (.opengate) to open it.');
  };

  // The sample production: every section filled in, with a few problems to fix. A fresh copy each time.
  const [building, setBuilding] = useState(false);
  const [fromBudget, setFromBudget] = useState(false);
  const sampleProduction = async () => {
    setBuilding(true);
    try {
      const { buildSampleProduction } = await import('../model/sampleProduction');
      const { addSampleMedia } = await import('../model/sampleMedia');
      open(await addSampleMedia(buildSampleProduction()), true);
    } catch (e) {
      toast(`Could not build the sample production: ${(e as Error).message}`);
    } finally { setBuilding(false); }
  };

  const help = <div className="home-help"><HelpLinks home /></div>;
  return (
    <div className="home" ref={page}>
      <aside className="home-side">
        <Logo className="home-logo" />
        <div className="home-side-theme"><ThemeToggle /></div>
        <nav className="home-nav" aria-label="Open Gate tools">
          {SECTIONS.map((x) => (
            <button key={x.id} className={section === x.id ? 'on' : ''} aria-current={section === x.id ? 'page' : undefined} onClick={() => pick(x.id)}>
              <span>{x.label}</span>{x.soon && <span className="home-soon">Coming soon</span>}
            </button>
          ))}
        </nav>
        <div className="home-side-foot">
          {help}
          <p className="muted small">Free and open source (GPL-3.0)</p>
        </div>
      </aside>
      <main className="home-main" ref={main}>
        <div className="home-inner">
          {section === 'app' && <div className={`home-app ${dropping ? 'drop-hover' : ''}`} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false); }} onDrop={dropFile}>
        <h1>Start a project</h1>
        <p className="tagline">Write, break down, shot-list and schedule — one synced project.</p>
        <div className="home-actions">
          <button className="home-card primary" onClick={() => open(newProject(), true)}><b>New screenplay</b><span>Start with a blank page</span></button>
          <button className="home-card" onClick={() => setFromBudget(true)} title="Know your budget but not your story? Get limits to write within: shoot days, locations, speaking roles, pages"><b>Start from a budget</b><span>Get limits to write within</span></button>
          <button className="home-card" onClick={() => setImporting(true)}><b>Import a screenplay</b><span>Bring in a script you've written</span></button>
          <button className="home-card" onClick={openFile}><b>Open project file</b><span>Open a saved .opengate file<span className="home-drop-hint">, or drop one here</span></span></button>
          <button className="home-card" onClick={() => void sampleProduction()} disabled={building} title="A filled-in short film: script, storyboards, breakdown, schedule, budget, paperwork and festivals, with a few problems to fix"><b>{building ? 'Building the sample…' : 'Try the sample production'}</b><span>A filled-in short film to explore</span></button>
        </div>
        <h2>Recent projects</h2>
        {projects.length === 0 && <p className="muted">No projects yet. Projects are saved in this browser automatically.</p>}
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id}>
              <button className="link" onClick={async () => { const pr = await loadProject(p.id); if (pr) open(pr); }}>
                <b>{p.title || 'Untitled'}</b>
                <span className="muted small">Edited {new Date(p.updatedAt).toLocaleString()}</span>
              </button>
              <button className="icon-btn" title="Delete project" onClick={async () => {
                if (await askConfirm(`Delete “${p.title}”?`, { message: "This removes it from this browser and can't be undone. Save a project file first if you want a copy." })) {
                  await deleteProject(p.id);
                  refresh();
                }
              }}>🗑</button>
            </li>
          ))}
        </ul>
        <div className="credits muted small">
          <p>Free and open source (GPL-3.0). Built on the work of:</p>
          <ul>
            <li>
              <b>CineSched</b> — scheduling, stripboard and call sheet features, by{' '}
              <a href="https://github.com/ChrisTempel" target="_blank" rel="noreferrer noopener">Christopher Tempel</a>{' '}
              (<a href="https://github.com/ChrisTempel/CineSched" target="_blank" rel="noreferrer noopener">ChrisTempel/CineSched</a>) and{' '}
              <a href="https://github.com/alucardGonza" target="_blank" rel="noreferrer noopener">alucardGonza</a>{' '}
              (<a href="https://github.com/alucardGonza/CineSched_D.G.D" target="_blank" rel="noreferrer noopener">alucardGonza/CineSched_D.G.D</a>)
            </li>
            <li>
              <b>Inwood Park Productions</b> —{' '}
              <a href="https://github.com/InwoodParkProductions" target="_blank" rel="noreferrer noopener">github.com/InwoodParkProductions</a>:{' '}
              <a href="https://github.com/InwoodParkProductions/Don-t-Pay-for-Screenwriting-Software" target="_blank" rel="noreferrer noopener">Don't Pay for Screenwriting Software</a>,{' '}
              <a href="https://github.com/InwoodParkProductions/DontPayforStoryboardingSoftware" target="_blank" rel="noreferrer noopener">Don't Pay for Storyboarding Software</a>,{' '}
              <a href="https://github.com/InwoodParkProductions/Shot-List-For-Free" target="_blank" rel="noreferrer noopener">Shot List for Free</a>
            </li>
            <li>
              <b>Open Shot Designer</b> — the free production planning suite by{' '}
              <a href="https://github.com/koosoli" target="_blank" rel="noreferrer noopener">koosoli</a>{' '}
              (<a href="https://github.com/koosoli/OpenShotDesigner" target="_blank" rel="noreferrer noopener">koosoli/OpenShotDesigner</a>), which inspired our shot blocking and gear planning.
              If it helps you too, support its developer:{' '}
              <a href="https://github.com/sponsors/koosoli" target="_blank" rel="noreferrer noopener">GitHub Sponsors</a> ·{' '}
              <a href="https://buymeacoffee.com/koosoli" target="_blank" rel="noreferrer noopener">Buy me a coffee</a>
            </li>
          </ul>
        </div>
          </div>}
          {section === 'folders' && <>
            <h1>Project Folders</h1>
            <p className="tagline">Right-click a folder and your whole project layout appears, on Mac or Windows. Set it up in a few minutes, with nothing to download.</p>
            <div className="home-benefits">
              <Benefit title="Start every project organized">Footage, audio, graphics and documents each have a place from day one.</Benefit>
              <Benefit title="Use a layout or make your own">Pick one for video, Resolve teams, photography or podcasts, then change anything you like.</Benefit>
              <Benefit title="Safe to run anywhere">It only adds folders. It never deletes, moves or renames your files.</Benefit>
            </div>
            <div className="home-get">
              <a className="home-get-link" href={PROJECT_FOLDERS_URL} target="_blank" rel="noreferrer noopener">Get Project Folders ↗</a>
              <span className="muted">Opens in a new tab. Free, and works without Open Gate.</span>
            </div>
          </>}
          {section === 'resources' && <>
            <div className="home-heading"><h1>Resources</h1><span className="home-soon strong">Coming soon</span></div>
            <p className="tagline">A free guide to the best open filmmaking sources: places to learn and gear information, sorted by department and tool.</p>
            <div className="home-benefits">
              <Benefit title="Find good sources">Videos, books, podcasts, websites and gear information, in one place to search.</Benefit>
              <Benefit title="See where it came from">Every source is credited, with its licence and a link to the original.</Benefit>
              <Benefit title="Help the projects behind it">Spot a mistake or a gap? We'll point you to the project that looks after it.</Benefit>
            </div>
            <div className="home-why">
              <h2>Why it isn't open yet</h2>
              <p>Other open source projects already do great work keeping this information. We're still lining up how Resources connects to them, and how it connects to Open Gate, so credit and corrections go to the right people.</p>
              <p className="muted">Until then, the Reference section inside any project has guides and learning links.</p>
            </div>
          </>}
          <div className="home-help-below">{help}</div>
        </div>
      </main>
      {fromBudget && <StartFromBudget onClose={() => setFromBudget(false)} onCreate={(p) => {
        // Open on Write, where the Limits tab is.
        try { localStorage.setItem('slateline.tab', 'screenplay'); } catch { /* ignore */ }
        open(p, true);
      }} />}
      <HelpDialogs />
      {importing && <ImportDialog asNewProject onClose={() => setImporting(false)} />}
      <DialogHost />
    </div>
  );
}
