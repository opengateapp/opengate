import { useEffect, useState } from 'react';
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

export function HomeScreen() {
  const [projects, setProjects] = useState<{ id: string; title: string; updatedAt: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const open = (p: Parameters<ReturnType<typeof useStore.getState>['open']>[0], dirty = false) => {
    session.reset();
    useStore.getState().open(p);
    if (dirty) useStore.setState({ saveState: 'dirty' });
  };

  const refresh = () => { void listProjects().then(setProjects); };
  useEffect(refresh, []);

  const openFile = async () => {
    // Chrome / Edge: remember the file so Save writes back to it.
    const picked = await openProjectFilePicker();
    const f = picked?.file ?? (fileAccessSupported() ? null : await pickFile(PROJECT_ACCEPT));
    if (!f) return;
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
      if (picked?.handle) await rememberFile(p.id, picked.handle);
      open(p, true);
      if (p.share) toast('Linked project — reconnecting to the shared copy and merging changes…');
    } catch (e) {
      toast(`Could not open ${f.name}: ${(e as Error).message}`);
    }
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

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-top"><ThemeToggle /></div>
        <h1 className="home-brand"><Logo className="home-logo" /><span className="sr-only">Open Gate</span></h1>
        <p className="tagline">Write, break down, shot-list and schedule — one synced project.</p>
        <div className="home-actions">
          <button className="primary" onClick={() => open(newProject(), true)}>New screenplay</button>
          <button onClick={() => setFromBudget(true)} title="Know your budget but not your story? Get limits to write within: shoot days, locations, speaking roles, pages">Start from a budget…</button>
          <button onClick={() => setImporting(true)}>Import a screenplay…</button>
          <button onClick={openFile}>Open project file…</button>
          <button onClick={() => void sampleProduction()} disabled={building} title="A filled-in short film: script, storyboards, breakdown, schedule, budget, paperwork and festivals, with a few problems to fix">{building ? 'Building the sample…' : 'Try the sample production'}</button>
        </div>
        {fromBudget && <StartFromBudget onClose={() => setFromBudget(false)} onCreate={(p) => {
          // Open on Write, where the Limits tab is.
          try { localStorage.setItem('slateline.tab', 'screenplay'); } catch { /* ignore */ }
          open(p, true);
        }} />}
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
        <div className="home-help"><HelpLinks home /></div>
        <HelpDialogs />
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
      </div>
      {importing && <ImportDialog asNewProject onClose={() => setImporting(false)} />}
      <DialogHost />
    </div>
  );
}
