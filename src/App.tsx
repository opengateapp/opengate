import { useCallback, useEffect, useState } from 'react';
import { useStore, flushSave } from './store/project';
import { loadProject } from './store/db';
import { session } from './script/session';
import { HomeScreen } from './tabs/HomeScreen';
import { WriteTab } from './tabs/WriteTab';
import { BreakdownTab } from './tabs/BreakdownTab';
import { ShotsTab } from './tabs/ShotsTab';
import { ScheduleTab } from './tabs/ScheduleTab';
import { CalendarTab } from './tabs/CalendarTab';
import { SetupTab } from './tabs/SetupTab';
import { ShootTab } from './tabs/ShootTab';
import { StoryboardTab } from './tabs/StoryboardTab';
import { DoodView } from './tabs/reports/DoodView';
import { BudgetTab } from './tabs/budget/BudgetTab';
import { ExpensesTab } from './tabs/budget/ExpensesTab';
import { CallSheetsView } from './tabs/reports/CallSheetsView';
import { SidesView } from './tabs/reports/SidesView';
import { DocsTab } from './tabs/DocsTab';
import { AVScriptTab } from './tabs/AVScriptTab';
import { ContactsTab } from './tabs/ContactsTab';
import { TasksTab } from './tabs/TasksTab';
import { BoardsTab } from './tabs/boards/BoardsTab';
import { LocationsTab } from './tabs/LocationsTab';
import { CategoryStyles } from './components/CategoryStyles';
import { ProjectMenu } from './components/ProjectMenu';
import { SyncIssues } from './components/SyncIssues';
import { PinterestReceiver } from './tabs/boards/PinterestReceiver';
import { DialogHost } from './components/dialogs';
import { EditMenu } from './components/EditMenu';
import { ThemeToggle } from './components/ThemeToggle';
import { JoinHandler } from './sync/JoinHandler';
import { ShareBar } from './components/share/ShareBar';
import { AccessBanner } from './components/share/AccessBanner';
import { startSync, stopSync, currentSync } from './sync/engine';
import { saveToFile, loadFileState, useFile } from './io/fileSave';

export type SectionId = 'write' | 'breakdown' | 'budget' | 'plan' | 'visualize' | 'shoot' | 'settings';
export type TabId =
  | 'screenplay' | 'av' | 'docs'
  | 'breakdown' | 'stripboard' | 'dood' | 'sides'
  | 'budget' | 'expenses'
  | 'contacts' | 'calendar' | 'tasks'
  | 'storyboard' | 'boards' | 'shots'
  | 'callsheets' | 'locations' | 'reports'
  | 'setup';

export const SECTIONS: { id: SectionId; label: string; tabs: { id: TabId; label: string; hint: string }[] }[] = [
  { id: 'write', label: 'Write', tabs: [
    { id: 'screenplay', label: 'Screenplay', hint: 'Write or import a screenplay' },
    { id: 'av', label: 'A/V Scripts', hint: 'Two-column video / audio scripts' },
    { id: 'docs', label: 'Docs', hint: 'Treatments, notes and other documents' },
  ] },
  { id: 'breakdown', label: 'Breakdown', tabs: [
    { id: 'breakdown', label: 'Script Breakdown', hint: 'Tag elements in the script' },
    { id: 'stripboard', label: 'Stripboard', hint: 'Order scenes into shoot days' },
    { id: 'dood', label: 'Day Out of Days', hint: 'Cast work days across the shoot' },
    { id: 'sides', label: 'Script Sides', hint: 'Each day’s pages for cast and crew' },
  ] },
  { id: 'budget', label: 'Budget', tabs: [
    { id: 'budget', label: 'Budget', hint: 'Top sheet, accounts, targets, actuals and versions' },
    { id: 'expenses', label: 'Expenses', hint: 'Receipts and spending, imported from your bank or card' },
  ] },
  { id: 'plan', label: 'Plan', tabs: [
    { id: 'contacts', label: 'Contacts', hint: 'Cast, crew, vendors and other contacts' },
    { id: 'calendar', label: 'Calendar', hint: 'Shoot days, prep, events and tasks' },
    { id: 'tasks', label: 'Tasks', hint: 'Prep to-dos with due dates' },
  ] },
  { id: 'visualize', label: 'Visualize', tabs: [
    { id: 'storyboard', label: 'Storyboards', hint: 'Frames for each shot' },
    { id: 'boards', label: 'Mood Boards', hint: 'Mood boards and whiteboards' },
    { id: 'shots', label: 'Shot Lists', hint: 'Plan coverage per scene' },
  ] },
  { id: 'shoot', label: 'Shoot', tabs: [
    { id: 'callsheets', label: 'Call Sheets', hint: 'Daily call sheets' },
    { id: 'locations', label: 'Locations', hint: 'Locations, contacts, permits and photos' },
    { id: 'reports', label: 'Reports', hint: 'Every export in one place' },
  ] },
  { id: 'settings', label: 'Settings', tabs: [{ id: 'setup', label: 'Project settings', hint: 'Production info, categories, colors' }] },
];

const ALL_TABS = SECTIONS.flatMap((s) => s.tabs.map((t) => t.id));
const sectionOf = (t: TabId) => SECTIONS.find((s) => s.tabs.some((x) => x.id === t))!.id;
// Tab ids from before the sections layout.
const LEGACY: Record<string, TabId> = { write: 'screenplay', schedule: 'stripboard', shoot: 'reports', setup: 'setup' };

export function App() {
  const project = useStore((s) => s.project);
  const saveState = useStore((s) => s.saveState);
  const [tab, setTabState] = useState<TabId>(() => {
    const saved = localStorageGet('tab') ?? '';
    const t = (LEGACY[saved] ?? saved) as TabId;
    return ALL_TABS.includes(t) ? t : 'screenplay';
  });
  // Each section remembers its last sub-tab.
  const [lastInSection, setLastInSection] = useState<Partial<Record<SectionId, TabId>>>(() => {
    try { return JSON.parse(localStorageGet('sections') ?? '{}'); } catch { return {}; }
  });
  const setTab = (t: TabId) => {
    session.flush();
    setTabState(t);
    setLastInSection((m) => ({ ...m, [sectionOf(t)]: t }));
  };
  const section = sectionOf(tab);
  const openBoards = useCallback(() => setTab('boards'), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared projects: keep the open project connected to its room (works offline too).
  const shareKey = project?.share ? `${project.id}|${project.share.room}|${project.share.token}` : '';
  useEffect(() => {
    const p = useStore.getState().project;
    if (shareKey && p?.share) void startSync(p);
    else stopSync();
  }, [shareKey]);
  useEffect(() => () => stopSync(), []);
  useEffect(() => { if (project?.id) void loadFileState(project.id); }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const file = useFile();
  useEffect(() => {
    const t = SECTIONS.flatMap((s) => s.tabs).find((x) => x.id === tab);
    currentSync()?.setTab(t?.label ?? tab);
  }, [tab, shareKey]);

  useEffect(() => { localStorageSet('tab', tab); }, [tab]);
  useEffect(() => { localStorageSet('sections', JSON.stringify(lastInSection)); }, [lastInSection]);

  // Reopen the last project on launch; "All projects" clears this.
  useEffect(() => {
    if (project) localStorageSet('last', project.id);
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const last = localStorageGet('last');
    if (last && !useStore.getState().project) void loadProject(last).then((p) => { if (p && !useStore.getState().project) useStore.getState().open(p); });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        session.flush();
        void flushSave();
        // ⌘S saves to the project's file (asking where the first time); ⇧⌘S is Save As.
        void saveToFile(e.shiftKey);
      }
      // Project-level undo for non-script edits (script undo is handled inside the editor).
      const inEditor = (e.target as HTMLElement)?.closest?.('.ProseMirror, input, textarea, select');
      if (mod && !inEditor && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      }
    };
    const beforeUnload = () => { session.flush(); void flushSave(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  if (!project) return <><JoinHandler /><HomeScreen /></>;

  const sec = SECTIONS.find((x) => x.id === section)!;
  return (
    <div className="app">
      <CategoryStyles />
      <DialogHost />
      <PinterestReceiver onOpen={openBoards} />
      <JoinHandler />
      <header className="topbar">
        <ProjectMenu />
        <nav className="tabs sections" aria-label="Sections">
          {SECTIONS.filter((x) => x.id !== 'settings').map((x) => (
            <div key={x.id} className="section-wrap">
              <button className={section === x.id ? 'tab active' : 'tab'} onClick={(e) => { setTab(lastInSection[x.id] ?? x.tabs[0].id); (e.currentTarget as HTMLElement).blur(); }} aria-haspopup="menu">
                {x.label}
              </button>
              {/* Hover (or keyboard focus) shows the section's tabs so you can jump straight to one. */}
              <div className="section-flyout" role="menu">
                {x.tabs.map((t) => (
                  <button key={t.id} role="menuitem" className={tab === t.id ? 'active' : ''} onClick={(e) => { setTab(t.id); (e.currentTarget as HTMLElement).blur(); }}>
                    <b>{t.label}</b><span>{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="topbar-right">
          <ShareBar />
          <ThemeToggle />
          <EditMenu />
          <SyncIssues onGo={setTab} />
          <span className={`save-state ${saveState}`} title={file.name ? `Saved in this browser${file.savedAt ? ` · last written to ${file.name} at ${new Date(file.savedAt).toLocaleTimeString()}` : ''}${file.autosave ? ' · autosaving to the file' : ''}` : 'Saved in this browser. ⌘S saves a file too.'}>
            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved'}{file.name && file.autosave && !file.needsPermission ? ' · file' : ''}
          </span>
          <button className={`icon-btn settings-btn ${section === 'settings' ? 'active' : ''}`} title="Project settings" onClick={() => setTab('setup')}>⚙</button>
        </div>
      </header>
      {sec.tabs.length > 1 && (
        <nav className="subtabs" aria-label={`${sec.label} tabs`}>
          {sec.tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'subtab active' : 'subtab'} title={t.hint} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}
      <AccessBanner />
      <main className="tab-body">
        {tab === 'screenplay' && <WriteTab />}
        {tab === 'av' && <AVScriptTab />}
        {tab === 'docs' && <DocsTab />}
        {tab === 'breakdown' && <BreakdownTab />}
        {tab === 'stripboard' && <ScheduleTab />}
        {tab === 'dood' && <DoodView />}
        {tab === 'sides' && <SidesView />}
        {tab === 'budget' && <BudgetTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'calendar' && <CalendarTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'storyboard' && <StoryboardTab />}
        {tab === 'boards' && <BoardsTab />}
        {tab === 'shots' && <ShotsTab />}
        {tab === 'callsheets' && <CallSheetsView />}
        {tab === 'locations' && <LocationsTab />}
        {tab === 'reports' && <ShootTab />}
        {tab === 'setup' && <SetupTab />}
      </main>
    </div>
  );
}

function localStorageGet(k: string): string | null {
  try { return localStorage.getItem('slateline.' + k); } catch { return null; }
}
function localStorageSet(k: string, v: string) {
  try { localStorage.setItem('slateline.' + k, v); } catch { /* ignore */ }
}
