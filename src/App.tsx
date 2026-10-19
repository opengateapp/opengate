import { usePrefs } from './prefs';
import { tabHidden, useSync } from './sync/state';
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
import { CharactersTab } from './tabs/CharactersTab';
import { StoryBibleTab } from './tabs/StoryBibleTab';
import { ShotDesignerTab } from './tabs/designer/ShotDesignerTab';
import { GearTab } from './tabs/budget/GearTab';
import { ReferenceTab, useRefFocus } from './tabs/ReferenceTab';
import { CATEGORIES as REF_CATEGORIES, PAGES as REF_PAGES } from './reference/topics';
import { CategoryStyles } from './components/CategoryStyles';
import { ProjectMenu } from './components/ProjectMenu';
import { SyncIssues } from './components/SyncIssues';
import { PinterestReceiver } from './tabs/boards/PinterestReceiver';
import { DialogHost } from './components/dialogs';
import { EditMenu } from './components/EditMenu';
import { usePhone, useNarrow } from './ui/responsive';
import { usePhoneTabs, visibleSections, registerSections } from './ui/phoneTabs';
import { PhoneTopbar } from './ui/PhoneChrome';
import { PhonePanels } from './ui/PhonePanels';
import { ActionSheetHost } from './components/ActionSheet';
import { TabBoundary } from './components/TabBoundary';
import { ThemeToggle } from './components/ThemeToggle';
import { JoinHandler } from './sync/JoinHandler';
import { ShareBar } from './components/share/ShareBar';
import { AccessBanner } from './components/share/AccessBanner';
import { startSync, stopSync, currentSync } from './sync/engine';
import { saveToFile, loadFileState, useFile } from './io/fileSave';

export type SectionId = 'write' | 'breakdown' | 'budget' | 'plan' | 'visualize' | 'shoot' | 'reference' | 'settings';
export type TabId =
  | 'screenplay' | 'av' | 'docs' | 'characters' | 'bible'
  | 'breakdown' | 'stripboard' | 'dood' | 'sides'
  | 'budget' | 'expenses' | 'gear'
  | 'contacts' | 'calendar' | 'tasks'
  | 'storyboard' | 'boards' | 'shots' | 'designer'
  | 'callsheets' | 'locations' | 'reports'
  | 'reference'
  | 'setup';

export const SECTIONS: { id: SectionId; label: string; tabs: { id: TabId; label: string; hint: string }[] }[] = [
  { id: 'write', label: 'Write', tabs: [
    { id: 'screenplay', label: 'Screenplay', hint: 'Write or import a screenplay' },
    { id: 'characters', label: 'Characters', hint: 'Character builder: traits, alignment, profile and continuity photos' },
    { id: 'bible', label: 'Story Bible', hint: 'The world of the story: overview, story days, places, groups, glossary, rules' },
    { id: 'docs', label: 'Docs', hint: 'Treatments, notes and other documents' },
    { id: 'av', label: 'A/V Scripts', hint: 'Two-column video / audio scripts' },
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
    { id: 'gear', label: 'Gear', hint: 'Gear manifest: own, rent, borrow or buy — rentals become budget lines' },
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
    { id: 'designer', label: 'Shot Designer', hint: 'Top-down plan per scene: actors, cameras with lens-accurate angles, lights, moves' },
  ] },
  { id: 'shoot', label: 'Shoot', tabs: [
    { id: 'callsheets', label: 'Call Sheets', hint: 'Daily call sheets' },
    { id: 'locations', label: 'Locations', hint: 'Locations, contacts, permits and photos' },
    { id: 'reports', label: 'Reports', hint: 'Every export in one place' },
  ] },
  { id: 'reference', label: 'Reference', tabs: [{ id: 'reference', label: 'Reference', hint: 'Story, camera, lenses, lighting, sound, data and production — explainers, calculators and a library' }] },
  { id: 'settings', label: 'Settings', tabs: [{ id: 'setup', label: 'Settings', hint: 'This project (shared) and this device (yours)' }] },
];

const ALL_TABS = SECTIONS.flatMap((s) => s.tabs.map((t) => t.id));
registerSections(SECTIONS);
const sectionOf = (t: TabId) => SECTIONS.find((s) => s.tabs.some((x) => x.id === t))!.id;
// Tab ids from before the sections layout.
const LEGACY: Record<string, TabId> = { write: 'screenplay', schedule: 'stripboard', shoot: 'reports', setup: 'setup' };

export function App() {
  const project = useStore((s) => s.project);
  usePrefs(); // date / clock / week-start preferences re-render everything
  const hiddenSync = useSync((s) => s.hidden);
  const saveState = useStore((s) => s.saveState);
  const phone = usePhone();
  const narrow = useNarrow();
  const phoneTabs = usePhoneTabs();
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
  // A tab hidden by this person's link: go to the first one they can see.
  useEffect(() => {
    if (!tabHidden(tab)) return;
    const first = SECTIONS.flatMap((x) => x.tabs).find((t) => !tabHidden(t.id));
    if (first) setTab(first.id);
  }, [hiddenSync, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Other tabs can jump somewhere (e.g. a cast row's "Profile →" opens Characters).
  useEffect(() => {
    const go = (e: Event) => { const t = (e as CustomEvent).detail as TabId; if (ALL_TABS.includes(t)) setTab(t); };
    window.addEventListener('opengate:goto', go);
    return () => window.removeEventListener('opengate:goto', go);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Shared projects: keep the open project connected to its room (works offline too).
  const shareKey = project?.share ? `${project.id}|${project.share.room}|${project.share.token}|${project.share.format ?? 1}` : '';
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

  // Per-tab access: tabs hidden by this person's link aren't shown at all.
  const allowed = hiddenSync?.length ? SECTIONS.map((x) => ({ ...x, tabs: x.tabs.filter((t) => !tabHidden(t.id)) })).filter((x) => x.tabs.length) : SECTIONS;
  const fullSec = allowed.find((x) => x.id === section) ?? allowed[0];
  // Open Gate Lite: on phones, only the chosen tabs (a hidden one opened from "Show all tabs" still shows its section).
  const shown = visibleSections(allowed, phoneTabs, phone);
  const sec = shown.find((x) => x.id === section && x.tabs.some((t) => t.id === tab)) ?? fullSec;
  return (
    <div className={`app ${phone ? 'is-phone' : ''}`}>
      <CategoryStyles />
      <DialogHost />
      <ActionSheetHost />
      <PinterestReceiver onOpen={openBoards} />
      <JoinHandler />
      {narrow ? (
        <PhoneTopbar sections={shown} allSections={SECTIONS} tab={tab} setTab={setTab as never} saveState={saveState} />
      ) : (
        <header className="topbar">
          <ProjectMenu />
          <nav className="tabs sections" aria-label="Sections">
            {allowed.filter((x) => x.id !== 'settings').map((x) => (
              <div key={x.id} className="section-wrap">
                <button className={section === x.id ? 'tab active' : 'tab'} onClick={(e) => { setTab(lastInSection[x.id] ?? x.tabs[0].id); (e.currentTarget as HTMLElement).blur(); }} aria-haspopup="menu">
                  {x.label}
                </button>
                {/* Hover (or keyboard focus) shows the section's tabs so you can jump straight to one. */}
                {x.id === 'reference' ? (
                  <div className="section-flyout ref-flyout" role="menu">
                    {REF_CATEGORIES.map((c) => (
                      <div key={c.id} className="ref-fly-col">
                        <span className="ref-fly-cat">{c.icon} {c.label}</span>
                        {REF_PAGES.filter((pg) => pg.category === c.id).map((pg) => (
                          <button key={pg.id} role="menuitem" onClick={(e) => { useRefFocus.setState({ page: pg.id }); setTab('reference'); (e.currentTarget as HTMLElement).blur(); }}>{pg.title}</button>
                        ))}
                      </div>
                    ))}
                    <div className="ref-fly-col"><span className="ref-fly-cat">❖ More</span><button role="menuitem" onClick={(e) => { useRefFocus.setState({ page: 'library' }); setTab('reference'); (e.currentTarget as HTMLElement).blur(); }}>Learn-more library</button></div>
                  </div>
                ) : (
                <div className="section-flyout" role="menu">
                  {x.tabs.map((t) => (
                    <button key={t.id} role="menuitem" className={tab === t.id ? 'active' : ''} onClick={(e) => { setTab(t.id); (e.currentTarget as HTMLElement).blur(); }}>
                      <b>{t.label}</b><span>{t.hint}</span>
                    </button>
                  ))}
                </div>
                )}
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
            <button className={`icon-btn settings-btn ${section === 'settings' ? 'active' : ''}`} title="Settings" onClick={() => setTab('setup')}>⚙</button>
          </div>
        </header>
      )}
      {sec.tabs.length > 1 && (
        <nav className="subtabs" aria-label={`${sec.label} tabs`}>
          {sec.tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'subtab active' : 'subtab'} title={t.hint} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}
      <AccessBanner />
      {phone && <PhonePanels tab={tab} />}
      <main className="tab-body">
        <TabBoundary tab={tab}>
        {tab === 'screenplay' && <WriteTab />}
        {tab === 'av' && <AVScriptTab />}
        {tab === 'docs' && <DocsTab />}
        {tab === 'breakdown' && <BreakdownTab />}
        {tab === 'stripboard' && <ScheduleTab />}
        {tab === 'dood' && <DoodView />}
        {tab === 'sides' && <SidesView />}
        {tab === 'budget' && <BudgetTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'gear' && <GearTab />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'calendar' && <CalendarTab />}
        {tab === 'tasks' && <TasksTab />}
        {tab === 'storyboard' && <StoryboardTab />}
        {tab === 'boards' && <BoardsTab />}
        {tab === 'shots' && <ShotsTab />}
        {tab === 'designer' && <ShotDesignerTab />}
        {tab === 'callsheets' && <CallSheetsView />}
        {tab === 'locations' && <LocationsTab />}
        {tab === 'characters' && <CharactersTab />}
        {tab === 'bible' && <StoryBibleTab />}
        {tab === 'reports' && <ShootTab />}
        {tab === 'setup' && <SetupTab />}
        {tab === 'reference' && <ReferenceTab />}
        </TabBoundary>
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
