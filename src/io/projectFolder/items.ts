import type { Project, StoryBible } from '../../model/types';
import { derive, type Derived } from '../../script/derive';
import { blocksToLines } from '../../script/schema';
import { unpackDoc } from '../../script/drafts';
import { shootDays } from '../../schedule/dood';
import { buildICS } from '../../schedule/ics';
import { TAB_ACCESS } from '../../sync/channels';
import { budgetVisible, tabHidden } from '../../sync/state';
import { avCsv, avPdf, contactRows, contactsCsv, contactsVcf, expensesCsv, fdxText, festivalsCsv, fountainText, gearCsv, locationsCsv, mediaExt, socialCalendarFiles, storedDocHtml } from '../exports';
import { exportProjectFile, mediaIds } from '../files';
import { toFountain } from '../fountain';
import { breakdownCsv, shotListCsv, shotListXlsx, sortedShots } from '../reports';
import { buildCredits, creditsOf, suggestedRuntime } from '../../credits/credits';
import { creditsCsv, creditsFcpxml, creditsJsx, creditsText } from '../../credits/exportCredits';
import { payrollCsv, timecardsCsv, contractorCsv } from '../../paperwork/timecards';
import { clearanceReportCsv } from '../../paperwork/clearanceScan';
import { clearanceLogCsv, cueSheetCsv } from '../../budget/licenses';
import { pressKitView } from '../../release/pressKit';
import { pressKitHtmlFile, pressKitPdfFile } from '../../release/pressKitExport';
import { buildStoryboardPdf, renderFrame } from '../../tabs/storyboard/render';

// Everything that can go in the Export everything ZIP: one list, and the single place to add a
// future export. Each item says where its files go, whether it applies, and how to build them.

export interface FolderFile { /** Folders and file name, each cleaned when the ZIP is built. */ path: string[]; data: Blob | string }

export interface BuildContext {
  p: Project;
  d: Derived;
  media: (id: string) => Promise<Blob | null | undefined>;
  /** Draws a storyboard frame (a canvas in the browser; tests pass their own). */
  render: typeof renderFrame;
  /** Called between steps inside a long item: lets the page breathe, and stops if cancelled. */
  tick: () => Promise<void>;
}

export type ItemGroup = 'project' | 'scripts' | 'notes' | 'characters' | 'storyboards' | 'shots' | 'breakdown' | 'schedule' | 'callsheets' | 'contacts' | 'locations' | 'budget' | 'contracts' | 'reference' | 'release';

export const GROUP_LABEL: Record<ItemGroup, string> = {
  project: 'Project file', scripts: 'Scripts', notes: 'Treatments & notes', characters: 'Characters', storyboards: 'Storyboards', shots: 'Shot lists', breakdown: 'Breakdown', schedule: 'Schedule',
  callsheets: 'Call sheets', contacts: 'Contacts', locations: 'Locations', budget: 'Budget & gear', contracts: 'Releases & contracts', reference: 'Reference', release: 'Release',
};

export interface FolderItem {
  id: string;
  label: string;
  group: ItemGroup;
  /** Inside the layout's documents folder; null for the top folder. */
  folder: string | null;
  /** Tabs that must be visible to include this. */
  tabs?: string[];
  /** Needs the budget to be visible. */
  budget?: boolean;
  /** Why there's nothing to export, when there isn't. */
  empty?: (p: Project, d: Derived) => string | undefined;
  /** Unticked unless you tick it. */
  offByDefault?: boolean;
  /** Media files it copies, for the likely size. */
  media?: (p: Project) => (string | undefined)[];
  build: (c: BuildContext) => Promise<FolderFile[]>;
}

/** Can't see the whole project: a project file would hold more than these folders do. */
export const limitedAccess = () => !budgetVisible() || TAB_ACCESS.some((t) => tabHidden(t.id));

const pdfOf = (x: { output(kind: 'blob'): Blob }) => x.output('blob');
const hasScript = (d: Derived) => d.blocks.some((b) => b.text.trim());
const noScript = (_: Project, d: Derived) => (hasScript(d) ? undefined : 'The script is empty');
const noScenes = (_: Project, d: Derived) => (d.scenes.length && hasScript(d) ? undefined : 'No scenes yet');
const noPressKit = (p: Project, d: Derived) => { const v = pressKitView(p, d); return v.logline || v.shortSynopsis || v.longSynopsis || v.people.length || v.stills.length || v.posterId ? undefined : 'The press kit is empty'; };
const noDays = (p: Project) => (shootDays(p).length ? undefined : 'No shoot days yet');
const file = (name: string, data: Blob | string, ...folders: string[]): FolderFile => ({ path: [...folders, name], data });

/** Copies media files, skipping any that have gone missing. */
async function copies(c: BuildContext, list: { id?: string; name: string; folders?: string[]; ext?: string }[]): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  for (const x of list) {
    if (!x.id) continue;
    const b = await c.media(x.id);
    if (b) out.push(file(`${x.name}.${x.ext ?? mediaExt(b.type)}`, b, ...(x.folders ?? [])));
    await c.tick();
  }
  return out;
}

const hasFrameArt = (f: Project['storyboard'][number]) => !!(f.imageId || f.drawingId || f.ghosts?.length);
const visibleBoards = (p: Project) => p.boards.filter((b) => b.kind !== 'story');
const budgetFiles = (p: Project) => p.budget.expenses.filter((e) => e.receiptId);
const draftFile = (when: string) => when.slice(0, 10);

function dataUrlBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
  return new Blob([bytes], { type: head.match(/^data:([^;]+)/)?.[1] ?? 'image/jpeg' });
}

function bibleText(b: StoryBible): string {
  const out: string[] = [];
  const section = (title: string, lines: (string | false | undefined)[]) => { const l = lines.filter(Boolean) as string[]; if (l.length) out.push(title.toUpperCase(), ...l, ''); };
  section('Logline', [b.logline]);
  section('Synopsis', [b.synopsis]);
  section('Tone', [b.tone]);
  section('Themes', b.themes);
  section('Places', b.places.map((x) => `${x.name}: ${x.description}`));
  section('Groups', b.groups.map((x) => `${x.name}: ${x.description}${x.members.length ? ` (${x.members.join(', ')})` : ''}`));
  section('Glossary', b.glossary.map((x) => `${x.term}: ${x.meaning}`));
  section('Rules of the world', b.rules.map((x) => `${x.title}: ${x.text}`));
  section('Timeline', b.events.map((x) => `Day ${x.day}: ${x.title}${x.text ? ` (${x.text})` : ''}`));
  return out.join('\r\n');
}
const bibleEmpty = (b?: StoryBible) => !b || !bibleText(b).trim();

/** A draft as Fountain and, using the same layout as the script, a PDF. */
async function draftFiles(c: BuildContext, auto: boolean): Promise<FolderFile[]> {
  const { screenplayPdfAsync } = await import('../../pdf/screenplayPdf');
  const out: FolderFile[] = [];
  for (const x of (c.p.drafts ?? []).filter((y) => !!y.auto === auto)) {
    const doc = await unpackDoc(x.data);
    const d = derive(doc, c.p.sceneNumbersLocked);
    const name = `${x.name} ${draftFile(x.createdAt)}`;
    const nums = c.p.sceneNumbersLocked ? d.scenes.map((s) => s.number) : undefined;
    out.push(file(`${name}.fountain`, toFountain(blocksToLines(d.blocks), c.p.titlePage, nums)));
    const copy: Project = { ...c.p, scriptDoc: doc };
    delete copy.revision;
    out.push(file(`${name}.pdf`, pdfOf(await screenplayPdfAsync(copy, d))));
    await c.tick();
  }
  return out;
}

export const ITEMS: FolderItem[] = [
  {
    id: 'project-file', label: 'Project file (.opengate)', group: 'project', folder: null,
    empty: () => (limitedAccess() ? 'Left out: your access to this project is limited, and a project file holds more than these folders do' : undefined),
    media: mediaIds,
    build: async (c) => {
      const clean: Project = { ...c.p, boards: c.p.boards.map(({ roomId: _room, ...b }) => b) };
      return [file('.opengate', await exportProjectFile(clean, async (id) => (await c.media(id)) ?? null, { independent: true }))];
    },
  },

  { id: 'script-pdf', label: 'Screenplay PDF', group: 'scripts', folder: 'SCRIPTS', tabs: ['screenplay'], empty: noScript, build: async ({ p, d }) => [file('Screenplay.pdf', pdfOf(await (await import('../../pdf/screenplayPdf')).screenplayPdfAsync(p, d)))] },
  { id: 'script-fountain', label: 'Fountain', group: 'scripts', folder: 'SCRIPTS', tabs: ['screenplay'], empty: noScript, build: async ({ p, d }) => [file('Screenplay.fountain', fountainText(p, d))] },
  { id: 'script-fdx', label: 'Final Draft (.fdx)', group: 'scripts', folder: 'SCRIPTS', tabs: ['screenplay'], empty: noScript, build: async ({ p, d }) => [file('Screenplay.fdx', fdxText(p, d))] },
  {
    id: 'sides', label: 'Sides for all days', group: 'scripts', folder: 'SCRIPTS', tabs: ['screenplay', 'stripboard'], empty: noDays,
    build: async ({ p, d }) => [file('Sides - all days.pdf', pdfOf((await import('../../pdf/sidesPdf')).sidesPdf(p, d, shootDays(p).map((x) => x.day), { crossOut: true })))],
  },
  {
    id: 'av', label: 'A/V scripts', group: 'scripts', folder: 'SCRIPTS', tabs: ['av'], empty: (p) => (p.avScripts.length ? undefined : 'No A/V scripts yet'),
    build: async (c) => {
      const out: FolderFile[] = [];
      for (const s of c.p.avScripts) {
        out.push(file(`${s.title}.pdf`, pdfOf(await avPdf(c.p.title, s))), file(`${s.title}.csv`, avCsv(s)));
        await c.tick();
      }
      return out;
    },
  },
  { id: 'drafts', label: 'Named drafts', group: 'scripts', folder: 'SCRIPTS/DRAFTS', tabs: ['screenplay'], empty: (p) => ((p.drafts ?? []).some((x) => !x.auto) ? undefined : 'No named drafts yet'), build: (c) => draftFiles(c, false) },
  { id: 'drafts-auto', label: 'Auto-saved drafts', group: 'scripts', folder: 'SCRIPTS/DRAFTS', tabs: ['screenplay'], offByDefault: true, empty: (p) => ((p.drafts ?? []).some((x) => x.auto) ? undefined : 'No auto-saved drafts yet'), build: (c) => draftFiles(c, true) },

  { id: 'docs', label: 'Documents', group: 'notes', folder: 'TREATMENTS_AND_NOTES', tabs: ['docs'], empty: (p) => (p.docs.length ? undefined : 'No documents yet'), build: async ({ p }) => p.docs.map((x) => file(`${x.title || 'Untitled'}.html`, storedDocHtml(x))) },
  { id: 'bible', label: 'Story bible', group: 'notes', folder: 'TREATMENTS_AND_NOTES', tabs: ['bible'], empty: (p) => (bibleEmpty(p.bible) ? 'The story bible is empty' : undefined), build: async ({ p }) => [file('Story bible.txt', bibleText(p.bible!))] },
  { id: 'notes', label: 'Project notes', group: 'notes', folder: 'TREATMENTS_AND_NOTES', tabs: ['screenplay'], empty: (p) => (p.notes?.trim() ? undefined : 'No project notes yet'), build: async ({ p }) => [file('Project notes.txt', p.notes)] },

  { id: 'characters', label: 'Character profiles', group: 'characters', folder: 'CHARACTERS', tabs: ['characters'], empty: (p) => (p.characters.length ? undefined : 'No character profiles yet'), build: async ({ p, d }) => [file('Character profiles.pdf', pdfOf(await (await import('../../pdf/characterPdf')).characterPdfAsync(p, d)))] },

  { id: 'storyboard-pdf', label: 'Storyboard PDF', group: 'storyboards', folder: 'STORYBOARDS', tabs: ['storyboard'], empty: (p) => (p.storyboard.length ? undefined : 'No storyboard frames yet'), build: async ({ p, d, render }) => [file('Storyboard.pdf', pdfOf(await buildStoryboardPdf(p, d, render)))] },
  {
    id: 'storyboard-frames', label: 'Frame images', group: 'storyboards', folder: 'STORYBOARDS/FRAMES', tabs: ['storyboard'], empty: (p) => (p.storyboard.some(hasFrameArt) ? undefined : 'No drawn or uploaded frames yet'),
    build: async (c) => {
      const order = new Map(sortedShots(c.p, c.d).map((s, i) => [s.id, i]));
      const shots = new Map(c.p.shots.map((s) => [s.id, s]));
      const out: FolderFile[] = [];
      for (const f of [...c.p.storyboard].filter(hasFrameArt).sort((a, b) => (order.get(a.shotId) ?? 1e9) - (order.get(b.shotId) ?? 1e9) || a.order - b.order)) {
        const shot = shots.get(f.shotId);
        const scene = shot?.sceneId ? c.d.sceneById.get(shot.sceneId)?.number : undefined;
        const name = [scene != null ? `Scene ${scene}` : '', shot ? `Shot ${shot.shotNumber}` : 'Frame'].filter(Boolean).join(' - ');
        out.push(file(`${name}.jpg`, dataUrlBlob(await c.render(f, 1600, 'frame', c.p.storyboardSettings))));
        await c.tick();
      }
      return out;
    },
  },

  { id: 'shots-csv', label: 'Shot list CSV', group: 'shots', folder: 'SHOT_LISTS', tabs: ['shots'], empty: (p) => (p.shots.length ? undefined : 'No shots yet'), build: async ({ p, d }) => [file('Shot list.csv', shotListCsv(p, d))] },
  { id: 'shots-xlsx', label: 'Shot list Excel', group: 'shots', folder: 'SHOT_LISTS', tabs: ['shots'], empty: (p) => (p.shots.length ? undefined : 'No shots yet'), build: async ({ p, d }) => [file('Shot list.xlsx', await shotListXlsx(p, d))] },

  { id: 'breakdown-sheets', label: 'Breakdown sheets', group: 'breakdown', folder: 'BREAKDOWN', tabs: ['breakdown'], empty: noScenes, build: async ({ p, d }) => [file('Breakdown sheets.pdf', pdfOf((await import('../../pdf/breakdownPdf')).breakdownSheetsPdf(p, d)))] },
  { id: 'breakdown-csv', label: 'Breakdown report', group: 'breakdown', folder: 'BREAKDOWN', tabs: ['breakdown'], empty: noScenes, build: async ({ p, d }) => [file('Breakdown report.csv', breakdownCsv(p, d))] },

  { id: 'stripboard', label: 'Stripboard', group: 'schedule', folder: 'SCHEDULE', tabs: ['stripboard'], empty: noScenes, build: async ({ p, d }) => [file('Stripboard.pdf', pdfOf((await import('../../pdf/schedulePdf')).stripboardPdf(p, d)))] },
  { id: 'schedule', label: 'Shooting schedule', group: 'schedule', folder: 'SCHEDULE', tabs: ['stripboard'], empty: noDays, build: async ({ p, d }) => [file('Shooting schedule.pdf', pdfOf((await import('../../pdf/schedulePdf')).shootingSchedulePdf(p, d)))] },
  { id: 'dood', label: 'Day Out of Days', group: 'schedule', folder: 'SCHEDULE', tabs: ['stripboard'], empty: noDays, build: async ({ p, d }) => [file('Day Out of Days.pdf', pdfOf((await import('../../pdf/doodPdf')).doodPdf(p, d)))] },
  { id: 'calendar', label: 'Calendar (.ics)', group: 'schedule', folder: 'SCHEDULE', tabs: ['calendar'], empty: (p) => (shootDays(p).length || p.events.length ? undefined : 'No shoot days or events yet'), build: async ({ p, d }) => [file('Calendar.ics', buildICS(p, d))] },

  {
    id: 'callsheets', label: 'Call sheets', group: 'callsheets', folder: 'CALL_SHEETS', tabs: ['callsheets'], empty: noDays,
    build: async (c) => {
      const { callSheetPdfAsync } = await import('../../pdf/callSheetPdf');
      const out: FolderFile[] = [];
      for (const { day, number } of shootDays(c.p)) {
        out.push(file(`Day ${String(number).padStart(2, '0')} - ${day.date}.pdf`, pdfOf(await callSheetPdfAsync(c.p, c.d, [day]))));
        await c.tick();
      }
      return out;
    },
  },

  {
    id: 'contacts', label: 'Contacts (CSV and .vcf)', group: 'contacts', folder: 'CONTACTS', tabs: ['contacts'], empty: (p) => (contactRows(p).length ? undefined : 'No contacts yet'),
    build: async ({ p }) => { const rows = contactRows(p); return [file('Contacts.csv', contactsCsv(rows)), file('Contacts.vcf', contactsVcf(rows))]; },
  },

  { id: 'locations', label: 'Locations CSV', group: 'locations', folder: 'LOCATIONS', tabs: ['locations'], empty: (p) => (p.locations.length ? undefined : 'No locations yet'), build: async ({ p }) => [file('Locations.csv', locationsCsv(p, budgetVisible()))] },
  {
    id: 'location-photos', label: 'Location photos', group: 'locations', folder: 'LOCATIONS/PHOTOS', tabs: ['locations'], empty: (p) => (p.locations.some((l) => l.photoIds?.length) ? undefined : 'No location photos yet'),
    media: (p) => p.locations.flatMap((l) => l.photoIds ?? []),
    build: (c) => copies(c, c.p.locations.flatMap((l) => (l.photoIds ?? []).map((id, i) => ({ id, name: `Photo ${i + 1}`, folders: [l.realName || l.setName || 'Unnamed'] })))),
  },

  { id: 'budget-pdf', label: 'Budget PDF', group: 'budget', folder: 'BUDGET', budget: true, empty: (p) => (p.budget.lines.length ? undefined : 'No budget lines yet'), build: async ({ p, d }) => [file('Budget.pdf', pdfOf((await import('../../pdf/budgetPdf')).budgetPdf(p, d)))] },
  { id: 'budget-xlsx', label: 'Budget Excel', group: 'budget', folder: 'BUDGET', budget: true, empty: (p) => (p.budget.lines.length ? undefined : 'No budget lines yet'), build: async ({ p, d }) => [file('Budget.xlsx', await (await import('../../budget/exportXlsx')).budgetXlsx(p, d))] },
  { id: 'expenses', label: 'Expenses CSV', group: 'budget', folder: 'BUDGET', budget: true, empty: (p) => (p.budget.expenses.length ? undefined : 'No expenses yet'), build: async ({ p }) => [file('Expenses.csv', expensesCsv(p))] },
  {
    id: 'receipts', label: 'Receipts', group: 'budget', folder: 'BUDGET/RECEIPTS', budget: true, empty: (p) => (budgetFiles(p).length ? undefined : 'No receipts yet'),
    media: (p) => budgetFiles(p).map((e) => e.receiptId),
    build: (c) => copies(c, budgetFiles(c.p).map((e) => ({ id: e.receiptId, name: `${e.date} ${e.vendor || e.description || 'Receipt'}` }))),
  },
  { id: 'gear-csv', label: 'Gear CSV', group: 'budget', folder: 'BUDGET', budget: true, empty: (p) => (p.gear?.length ? undefined : 'No gear yet'), build: async ({ p }) => [file('Gear.csv', gearCsv(p))] },
  { id: 'gear-pdf', label: 'Gear manifest', group: 'budget', folder: 'BUDGET', tabs: ['gear'], empty: (p) => (p.gear?.length ? undefined : 'No gear yet'), build: async ({ p, d }) => [file('Gear manifest.pdf', pdfOf((await import('../../pdf/gearPdf')).gearPdf(p, d, budgetVisible())))] },
  { id: 'payroll', label: 'Payroll', group: 'budget', folder: 'BUDGET', budget: true, build: async ({ p }) => [file('Payroll.csv', payrollCsv(p))], empty: (p) => (p.budget.timecards?.length ? undefined : 'No time cards yet') },
  { id: 'timecards', label: 'Time cards', group: 'budget', folder: 'BUDGET', budget: true, build: async ({ p }) => [file('Time cards.csv', timecardsCsv(p))], empty: (p) => (p.budget.timecards?.length ? undefined : 'No time cards yet') },
  { id: 'contractors', label: 'Contractor totals', group: 'budget', folder: 'BUDGET', budget: true, build: async ({ p }) => [file('Contractor totals.csv', contractorCsv(p))], empty: (p) => (p.budget.timecards?.length ? undefined : 'No time cards yet') },

  {
    id: 'paperwork', label: 'Paperwork as PDFs', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS', budget: true, empty: (p) => (p.budget.paperwork?.length ? undefined : 'No paperwork yet'),
    build: async (c) => {
      const { paperDocPdfAsync } = await import('../../pdf/paperworkPdf');
      const out: FolderFile[] = [];
      for (const x of c.p.budget.paperwork ?? []) {
        out.push(file(`${x.title || 'Paperwork'}.pdf`, pdfOf(await paperDocPdfAsync(c.p, x))));
        await c.tick();
      }
      return out;
    },
  },
  {
    id: 'paper-files', label: 'Attached and signed files', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS/SIGNED', budget: true, empty: (p) => ((p.budget.paperwork ?? []).some((x) => x.fileId) || (p.budget.clearances ?? []).some((x) => x.fileId) ? undefined : 'No attached files yet'),
    media: (p) => [...(p.budget.paperwork ?? []).map((x) => x.fileId), ...(p.budget.clearances ?? []).map((x) => x.fileId)],
    build: (c) => copies(c, [...(c.p.budget.paperwork ?? []).map((x) => ({ id: x.fileId, name: x.title || 'Paperwork' })), ...(c.p.budget.clearances ?? []).map((x) => ({ id: x.fileId, name: `Clearance - ${x.item || x.kind}` }))]),
  },
  {
    id: 'agreements', label: 'Union agreements', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS/UNION_AGREEMENTS', budget: true, empty: (p) => (p.budget.agreements?.length ? undefined : 'No signed agreements yet'),
    media: (p) => (p.budget.agreements ?? []).map((x) => x.fileId),
    build: (c) => copies(c, (c.p.budget.agreements ?? []).map((x) => ({ id: x.fileId, name: x.title }))),
  },
  {
    id: 'license-files', label: 'License files', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS/LICENSES', budget: true, empty: (p) => (p.budget.licenses.some((x) => x.fileId) ? undefined : 'No license files yet'),
    media: (p) => p.budget.licenses.map((x) => x.fileId),
    build: (c) => copies(c, c.p.budget.licenses.map((x) => ({ id: x.fileId, name: x.title || 'License' }))),
  },
  { id: 'cue-sheet', label: 'Music cue sheet', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS', budget: true, empty: (p) => (p.budget.licenses.length ? undefined : 'No licenses yet'), build: async ({ p }) => [file('Cue sheet.csv', cueSheetCsv(p))] },
  { id: 'clearance-log', label: 'Clearance log', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS', budget: true, empty: (p) => (p.budget.licenses.length ? undefined : 'No licenses yet'), build: async ({ p }) => [file('Clearance log.csv', clearanceLogCsv(p))] },
  {
    id: 'clearance-report', label: 'Script clearance report', group: 'contracts', folder: 'RELEASES_AND_CONTRACTS', budget: true, empty: (p) => (p.budget.clearances?.length ? undefined : 'No clearances yet'),
    build: async ({ p, d }) => [file('Script clearance report.pdf', pdfOf((await import('../../pdf/paperworkPdf')).clearanceReportPdf(p, d))), file('Script clearance report.csv', clearanceReportCsv(p, d))],
  },

  {
    id: 'moodboards', label: 'Mood board images', group: 'reference', folder: 'REFERENCE', tabs: ['boards'], empty: (p) => (visibleBoards(p).some((b) => b.items.some((i) => i.imageId)) ? undefined : 'No mood board images yet'),
    media: (p) => visibleBoards(p).flatMap((b) => b.items.map((i) => i.imageId)),
    build: (c) => copies(c, visibleBoards(c.p).flatMap((b) => b.items.filter((i) => i.imageId).map((i, n) => ({ id: i.imageId, name: `Image ${n + 1}`, folders: [b.title || 'Board'] })))),
  },

  {
    id: 'credits', label: 'End credits', group: 'release', folder: 'RELEASE/END_CREDITS', tabs: ['contacts'], empty: (p) => (p.cast.length || p.crew.length ? undefined : 'No cast or crew yet'),
    build: async ({ p, d }) => {
      const blocks = buildCredits(p, d, { includeLicenses: budgetVisible() });
      const c = creditsOf(p);
      const roll = { width: 1920, height: 1080, fps: 24, runtime: c.runtime ?? suggestedRuntime(blocks, c.secondsPerScreen), title: p.title || 'Untitled' };
      const { creditsPdf } = await import('../../pdf/creditsPdf');
      return [
        file('End credits.pdf', pdfOf(creditsPdf(p.title, blocks))),
        file('End credits.txt', creditsText(blocks, 'columns')),
        file('End credits.csv', creditsCsv(blocks)),
        file('End credits.jsx', creditsJsx(blocks, roll)),
        file('End credits.fcpxml', creditsFcpxml(blocks, roll)),
      ];
    },
  },
  { id: 'press-pdf', label: 'Press kit PDF', group: 'release', folder: 'RELEASE/PRESS_KIT', tabs: ['release'], empty: noPressKit, build: async ({ p, d }) => [file('Press kit.pdf', await pressKitPdfFile(p, d))] },
  { id: 'press-html', label: 'Press kit web page', group: 'release', folder: 'RELEASE/PRESS_KIT', tabs: ['release'], empty: noPressKit, build: async ({ p, d }) => [file('Press kit.html', await pressKitHtmlFile(p, d))] },
  {
    id: 'press-stills', label: 'Press stills and poster', group: 'release', folder: 'RELEASE/PRESS_KIT', tabs: ['release'], empty: (p) => (p.pressKit?.stills?.length || p.pressKit?.posterId ? undefined : 'No stills or poster yet'),
    media: (p) => [p.pressKit?.posterId, ...(p.pressKit?.stills ?? [])],
    build: (c) => copies(c, [{ id: c.p.pressKit?.posterId, name: 'Poster' }, ...(c.p.pressKit?.stills ?? []).map((id, i) => ({ id, name: `Still ${i + 1}` }))]),
  },
  { id: 'festivals', label: 'Festival list', group: 'release', folder: 'RELEASE', tabs: ['release'], empty: (p) => (p.festivals?.length || p.budget.festivals?.length ? undefined : 'No festivals yet'), build: async ({ p }) => [file('Festivals.csv', festivalsCsv(p, budgetVisible()))] },
  {
    id: 'social', label: 'Social calendar and media', group: 'release', folder: 'RELEASE/SOCIAL', tabs: ['release'], empty: (p) => (p.socialPosts?.length ? undefined : 'No social posts yet'),
    media: (p) => (p.socialPosts ?? []).flatMap((x) => x.mediaIds),
    build: async (c) => (await socialCalendarFiles(c.p.socialPosts ?? [], c.media)).map((f) => ({ path: f.path.split('/'), data: f.data })),
  },
  {
    id: 'deliverables', label: 'Deliverable files', group: 'release', folder: 'RELEASE/DELIVERABLES', tabs: ['release'], empty: (p) => ((p.deliverables ?? []).some((x) => x.fileId) ? undefined : 'No files attached in Distribution yet'),
    media: (p) => (p.deliverables ?? []).map((x) => x.fileId),
    build: async (c) => {
      const out: FolderFile[] = [];
      for (const x of c.p.deliverables ?? []) {
        const b = x.fileId ? await c.media(x.fileId) : undefined;
        if (b) out.push(file(x.fileName || `${x.name}.${mediaExt(b.type)}`, b));
        await c.tick();
      }
      return out;
    },
  },
];

export interface ItemState { item: FolderItem; /** Why it's greyed out. */ empty?: string }

/** The items this person may export: anything hidden from them isn't listed at all. */
export const visibleItems = () => ITEMS.filter((i) => (!i.budget || budgetVisible()) && !(i.tabs ?? []).some(tabHidden));

export const availableItems = (p: Project, d: Derived): ItemState[] => visibleItems().map((item) => ({ item, empty: item.empty?.(p, d) }));
