import type { Project } from '../model/types';

// A shared project is split into channels (one per app section). The relay knows which
// channel an encrypted update belongs to, so links can be limited to sections.
// Inside a channel, data is stored as small entries (one per contact, strip day, shot,
// board item …) so two people editing different things never overwrite each other.

/**
 * Room formats. Format 1 (rooms shared before per-tab access): one channel per app section.
 * Format 2: one channel per tab, so a link can edit, only view, or not see each tab.
 */
export type RoomFormat = 1 | 2;
export const CHANNELS_V1 = ['script', 'write', 'breakdown', 'plan', 'visualize', 'shoot', 'settings', 'budget'] as const;
export const CHANNELS_V2 = ['script', 'screenplay', 'characters', 'bible', 'docs', 'av', 'breakdown', 'schedule', 'contacts', 'calendar', 'tasks',
  'storyboard', 'boards', 'shots', 'designer', 'gear', 'callsheets', 'locations', 'settings', 'budget'] as const;
export type Channel = string;

let format: RoomFormat = 1;
/** The open shared project's room format (set by the sync engine). */
export function setChannelFormat(f: RoomFormat) { format = f; }
export const channelFormat = () => format;
export const channelsFor = (f: RoomFormat): readonly string[] => (f === 2 ? CHANNELS_V2 : CHANNELS_V1);

/** Channels only sent to people the owner shared them with (encrypted with their own key). */
export const RESTRICTED: readonly Channel[] = ['budget'];

/** Format-1 section names a link may carry, and the format-2 channels each one covers. */
export const LEGACY_EXPAND: Record<string, string[]> = {
  write: ['screenplay', 'characters', 'bible', 'docs', 'av'],
  breakdown: ['breakdown', 'schedule'],
  plan: ['contacts', 'calendar', 'tasks'],
  visualize: ['storyboard', 'boards', 'shots', 'designer', 'gear'],
  shoot: ['callsheets', 'locations'],
};

/** App sections a format-1 link can be limited to, and the channels each one may write. */
export const SECTION_CHANNELS: Record<string, Channel[]> = {
  write: ['script', 'write'],
  // Tagging and "mark as shot" add highlights to the script, so these sections write the
  // script channel too; the app limits them to highlights (no text edits).
  breakdown: ['breakdown', 'script'],
  plan: ['plan'],
  visualize: ['visualize', 'script'],
  shoot: ['shoot'],
  settings: ['settings'],
  budget: ['budget'],
};

export const SECTION_LABELS: Record<string, string> = {
  write: 'Write (script, docs, A/V)',
  breakdown: 'Breakdown (tagging, stripboard, DOOD, sides)',
  plan: 'Plan (contacts, calendar events, tasks)',
  visualize: 'Visualize (storyboards, mood boards, shot lists)',
  shoot: 'Shoot (call sheets, locations)',
  settings: 'Project settings',
  budget: 'Budget (accounts, scenarios, expenses)',
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  script: 'Script', write: 'Write', breakdown: 'Breakdown', plan: 'Plan', visualize: 'Visualize', shoot: 'Shoot', settings: 'Settings', budget: 'Budget',
  screenplay: 'Screenplay', characters: 'Characters', bible: 'Story Bible', docs: 'Docs', av: 'A/V scripts', schedule: 'Stripboard',
  contacts: 'Contacts', calendar: 'Calendar', tasks: 'Tasks', storyboard: 'Storyboards', boards: 'Mood boards', shots: 'Shot lists',
  designer: 'Shot designer', gear: 'Gear', callsheets: 'Call sheets', locations: 'Locations',
};

/** Format 2: the tabs a link can grant, the channels each one writes, and what it needs to make sense. */
export interface TabAccess { id: string; label: string; section: string; channels: Channel[]; needs?: string[]; follows?: string }
export const TAB_ACCESS: TabAccess[] = [
  { id: 'screenplay', label: 'Screenplay', section: 'Write', channels: ['script', 'screenplay'] },
  { id: 'characters', label: 'Characters', section: 'Write', channels: ['characters'] },
  { id: 'bible', label: 'Story Bible', section: 'Write', channels: ['bible'] },
  { id: 'docs', label: 'Docs', section: 'Write', channels: ['docs'] },
  { id: 'av', label: 'A/V Scripts', section: 'Write', channels: ['av'] },
  { id: 'breakdown', label: 'Script Breakdown', section: 'Breakdown', channels: ['breakdown'], needs: ['screenplay'] },
  { id: 'stripboard', label: 'Stripboard, DOOD & Sides', section: 'Breakdown', channels: ['schedule'], needs: ['screenplay', 'breakdown'] },
  { id: 'budget', label: 'Budget & Expenses', section: 'Budget', channels: ['budget'] },
  { id: 'gear', label: 'Gear', section: 'Budget', channels: ['gear'] },
  { id: 'contacts', label: 'Contacts (cast & crew)', section: 'Plan', channels: ['contacts'] },
  { id: 'calendar', label: 'Calendar', section: 'Plan', channels: ['calendar'], needs: ['stripboard'] },
  { id: 'tasks', label: 'Tasks', section: 'Plan', channels: ['tasks'] },
  { id: 'storyboard', label: 'Storyboards', section: 'Visualize', channels: ['storyboard'], needs: ['shots'] },
  { id: 'boards', label: 'Mood Boards', section: 'Visualize', channels: ['boards'] },
  { id: 'shots', label: 'Shot Lists', section: 'Visualize', channels: ['shots'], needs: ['screenplay'] },
  { id: 'designer', label: 'Shot Designer', section: 'Visualize', channels: ['designer'], needs: ['shots'] },
  { id: 'callsheets', label: 'Call Sheets', section: 'Shoot', channels: ['callsheets'], needs: ['stripboard', 'contacts', 'locations'] },
  { id: 'locations', label: 'Locations', section: 'Shoot', channels: ['locations'] },
  { id: 'settings', label: 'Project settings', section: 'Settings', channels: ['settings'] },
];
/** App tabs that show another tab's data (they follow its access). */
export const TAB_FOLLOWS: Record<string, string> = { dood: 'stripboard', sides: 'stripboard', expenses: 'budget', licenses: 'budget', reports: 'stripboard' };

/** Tagging, shot marks and storyboards add highlights to the script, so these tabs may write marks to it. */
export const MARKS_TABS = ['breakdown', 'shots', 'storyboard'];

export type Access = 'edit' | 'view' | 'hidden';
export const ACCESS_PRESETS: { id: string; label: string; hint: string; access: Record<string, Access> }[] = [
  { id: 'cowriter', label: 'Co-writer', hint: 'Writes with you; sees the rest; no budget.', access: { screenplay: 'edit', characters: 'edit', bible: 'edit', docs: 'edit', av: 'edit', budget: 'hidden', gear: 'view' } },
  { id: 'ad', label: 'AD / scheduling', hint: 'Breakdown, stripboard, calendar, call sheets, contacts, locations, tasks.', access: { breakdown: 'edit', stripboard: 'edit', calendar: 'edit', callsheets: 'edit', contacts: 'edit', locations: 'edit', tasks: 'edit', budget: 'hidden' } },
  { id: 'dept', label: 'Department head', hint: 'Views everything; edits boards, shots, storyboards, gear and tasks.', access: { boards: 'edit', shots: 'edit', storyboard: 'edit', designer: 'edit', gear: 'edit', tasks: 'edit', budget: 'hidden' } },
  { id: 'investor', label: 'Investor view', hint: 'Reads the script, story and budget; nothing else.', access: { screenplay: 'view', characters: 'view', bible: 'view', budget: 'view', ...Object.fromEntries(['docs', 'av', 'breakdown', 'stripboard', 'gear', 'contacts', 'calendar', 'tasks', 'storyboard', 'boards', 'shots', 'designer', 'callsheets', 'locations', 'settings'].map((t) => [t, 'hidden' as Access])) } },
];

/** A link's permissions from per-tab access: channels it may write, restricted channels it may read, and channels hidden from it. */
export function linkFromAccess(access: Record<string, Access>): { write: string[]; read: string[]; hide: string[] } {
  const get = (t: string): Access => access[t] ?? (t === 'budget' ? 'hidden' : 'view');
  const write = new Set<string>(), hide = new Set<string>(), read = new Set<string>();
  for (const t of TAB_ACCESS) {
    const a = get(t.id);
    for (const ch of t.channels) {
      if (a === 'edit') write.add(ch);
      if (a === 'hidden' && ch !== 'script') hide.add(ch);
      if (a !== 'hidden' && ch === 'budget') read.add('budget');
    }
  }
  // Marks-only script access for tabs that tag or mark shots.
  if (MARKS_TABS.some((t) => get(t) === 'edit')) write.add('script');
  // The script text is hidden only when nothing that shows it is visible.
  if (['screenplay', ...MARKS_TABS, 'stripboard'].every((t) => get(t) === 'hidden')) hide.add('script');
  return { write: [...write], read: [...read], hide: [...hide] };
}

/** Per-tab access back from a link's permissions (for showing an existing link). */
export function accessFromLink(write: string[], hide: string[]): Record<string, Access> {
  const out: Record<string, Access> = {};
  const all = write.includes('*');
  for (const t of TAB_ACCESS) {
    const own = t.channels.filter((c) => c !== 'script' || t.id === 'screenplay');
    out[t.id] = own.every((c) => hide.includes(c)) ? 'hidden' : own.every((c) => write.includes(c) || (all && !RESTRICTED.includes(c))) ? 'edit' : 'view';
  }
  return out;
}

/** Tabs that need another tab this link can't see. */
export function accessWarnings(access: Record<string, Access>): string[] {
  const get = (t: string): Access => access[t] ?? 'view';
  const label = (t: string) => TAB_ACCESS.find((x) => x.id === t)?.label ?? t;
  return TAB_ACCESS.filter((t) => get(t.id) !== 'hidden' && t.needs?.some((n) => get(n) === 'hidden'))
    .map((t) => `${t.label} uses ${t.needs!.filter((n) => get(n) === 'hidden').map(label).join(' and ')}, which ${t.needs!.filter((n) => get(n) === 'hidden').length > 1 ? 'are' : 'is'} hidden — it will look empty.`);
}

/** Project fields that never sync (per-user, derived, or synced another way). */
export const LOCAL_ONLY = new Set(['schemaVersion', 'id', 'updatedAt', 'scriptDoc', 'share']);

const KEY_CHANNEL: Record<string, Channel> = {
  title: 'settings', createdAt: 'settings', production: 'settings',
  titlePage: 'write', notes: 'write', characters: 'write', drafts: 'write', revision: 'write', sceneVariants: 'write', sceneVariantActive: 'write', autoDrafts: 'write', structure: 'write', bible: 'write', credits: 'write', relationships: 'write', characterMap: 'write', characterOptions: 'write', docs: 'write', avScripts: 'write', sceneNumbersLocked: 'write',
  elements: 'breakdown', sceneMeta: 'breakdown', categories: 'breakdown', schedule: 'breakdown',
  contacts: 'plan', tasks: 'plan', events: 'plan', cast: 'plan', crew: 'plan',
  shots: 'visualize', gear: 'visualize', plans: 'visualize', storyboard: 'visualize', storyboardSettings: 'visualize', boards: 'visualize',
  callSheets: 'shoot', locations: 'shoot',
  budget: 'budget',
};

const KEY_CHANNEL_V2: Record<string, Channel> = {
  title: 'settings', createdAt: 'settings', production: 'settings',
  titlePage: 'screenplay', notes: 'screenplay', drafts: 'screenplay', revision: 'screenplay', sceneVariants: 'screenplay', sceneVariantActive: 'screenplay', autoDrafts: 'screenplay', structure: 'screenplay', sceneNumbersLocked: 'screenplay', credits: 'settings',
  characters: 'characters', relationships: 'characters', characterMap: 'characters', characterOptions: 'characters',
  bible: 'bible', docs: 'docs', avScripts: 'av',
  elements: 'breakdown', sceneMeta: 'breakdown', categories: 'breakdown', schedule: 'schedule',
  contacts: 'contacts', cast: 'contacts', crew: 'contacts', events: 'calendar', tasks: 'tasks',
  storyboard: 'storyboard', storyboardSettings: 'storyboard', boards: 'boards', shots: 'shots', plans: 'designer', gear: 'gear',
  callSheets: 'callsheets', locations: 'locations',
  budget: 'budget',
};

export function channelOf(key: string, f: RoomFormat = format): Channel {
  if (key === 'scriptDoc') return 'script';
  return (f === 2 ? KEY_CHANNEL_V2 : KEY_CHANNEL)[key] ?? 'settings';
}

const COLLECTIONS = new Set(['drafts', 'sceneVariants', 'characters', 'relationships', 'gear', 'plans', 'categories', 'elements', 'cast', 'locations', 'crew', 'shots', 'events', 'storyboard', 'contacts', 'tasks', 'docs', 'avScripts']);
const RECORDS = new Set(['sceneMeta', 'callSheets', 'characterMap']);
const BUDGET_LISTS = ['accounts', 'lines', 'fringes', 'scenarios', 'expenses', 'licenses'];

/** Which project field an entry key belongs to. */
export function fieldOf(entryKey: string): string {
  if (entryKey.startsWith('schedule')) return 'schedule';
  if (entryKey.startsWith('budget')) return 'budget';
  if (entryKey.startsWith('boardItems/') || entryKey.startsWith('boards')) return 'boards';
  const m = entryKey.match(/^([A-Za-z]+)/);
  return m ? m[1] : entryKey;
}

type Entries = Map<string, unknown>;
type WithId = { id: string };

function encodeCollection(prefix: string, list: WithId[], out: Entries) {
  for (const it of list) out.set(`${prefix}/${it.id}`, it);
  out.set(`${prefix}#order`, list.map((x) => x.id));
}

function decodeCollection(prefix: string, get: (k: string) => unknown, keys: string[]): WithId[] {
  const items = new Map<string, WithId>();
  for (const k of keys) if (k.startsWith(prefix + '/') && !k.slice(prefix.length + 1).includes('/')) items.set(k.slice(prefix.length + 1), get(k) as WithId);
  const order = (get(`${prefix}#order`) as string[] | undefined) ?? [];
  const out: WithId[] = [];
  for (const id of order) { const it = items.get(id); if (it) { out.push(it); items.delete(id); } }
  // Items added concurrently by someone else but missing from our order go last.
  for (const id of [...items.keys()].sort()) out.push(items.get(id)!);
  return out;
}

/** Project field → entries. Values are the project's own objects (used for change detection). */
export function encodeField(key: string, value: unknown): Entries {
  const out: Entries = new Map();
  if (value === undefined) return out;
  if (COLLECTIONS.has(key)) encodeCollection(key, value as WithId[], out);
  else if (RECORDS.has(key)) {
    // The marker keeps the field present when it's emptied (so "deleted the last one" syncs).
    out.set(`${key}#`, true);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out.set(`${key}/${k}`, v);
  }
  else if (key === 'schedule') {
    const { days, ...meta } = value as { days: WithId[] };
    out.set('schedule', meta);
    encodeCollection('schedule.days', days, out);
  } else if (key === 'budget') {
    const b = value as unknown as Record<string, unknown>;
    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) {
      if (BUDGET_LISTS.includes(k)) encodeCollection(`budget.${k}`, (v ?? []) as WithId[], out);
      else meta[k] = v;
    }
    out.set('budget', meta);
  } else if (key === 'boards') {
    const boards = value as (WithId & { items: WithId[] })[];
    for (const b of boards) {
      const { items, ...rest } = b;
      out.set(`boards/${b.id}`, rest);
      encodeCollection(`boardItems/${b.id}`, items, out);
    }
    out.set('boards#order', boards.map((b) => b.id));
  } else out.set(key, value);
  return out;
}

/** Entries → project field (undefined when the channel has nothing for it yet). */
export function decodeField(key: string, get: (k: string) => unknown, keys: string[]): unknown {
  const mine = keys.filter((k) => fieldOf(k) === key);
  if (!mine.length) return undefined;
  if (COLLECTIONS.has(key)) return decodeCollection(key, get, mine);
  if (RECORDS.has(key)) {
    const o: Record<string, unknown> = {};
    for (const k of mine) if (k.startsWith(key + '/')) o[k.slice(key.length + 1)] = get(k);
    return o;
  }
  if (key === 'schedule') {
    const meta = (get('schedule') ?? {}) as Record<string, unknown>;
    return { ...meta, days: decodeCollection('schedule.days', get, mine) };
  }
  if (key === 'budget') {
    const out: Record<string, unknown> = { ...((get('budget') ?? {}) as Record<string, unknown>) };
    for (const k of BUDGET_LISTS) out[k] = decodeCollection(`budget.${k}`, get, mine);
    return out;
  }
  if (key === 'boards') {
    const boards = decodeCollection('boards', get, mine) as unknown as Record<string, unknown>[];
    return boards.map((b) => ({ ...b, items: decodeCollection(`boardItems/${b.id}`, get, mine) }));
  }
  return get(key);
}

/** Every syncable field of a project, grouped by channel. */
export function projectFields(p: Project): string[] {
  return Object.keys(p).filter((k) => !LOCAL_ONLY.has(k));
}

/** A readable name for an entry, for the review list ("Contacts · Ana Ruiz"). */
export function describeEntry(entryKey: string, value: unknown): string {
  const field = fieldOf(entryKey);
  const v = (value ?? {}) as Record<string, unknown>;
  const name = (v.name ?? v.title ?? v.description ?? v.vendor ?? v.characterName ?? v.realName ?? v.actorName ?? v.shotNumber ?? v.caption ?? v.text ?? v.date ?? '') as string;
  const labels: Record<string, string> = {
    title: 'Project title', production: 'Production info', titlePage: 'Title page', notes: 'Notes', docs: 'Docs', avScripts: 'A/V scripts',
    sceneNumbersLocked: 'Scene numbering', elements: 'Breakdown elements', sceneMeta: 'Scene details', categories: 'Breakdown tags',
    schedule: entryKey.startsWith('schedule.days') ? 'Stripboard day' : 'Schedule settings', contacts: 'Contacts', tasks: 'Tasks', events: 'Calendar events',
    cast: 'Cast', crew: 'Crew', shots: 'Shots', storyboard: 'Storyboard frames', storyboardSettings: 'Storyboard layout', boards: entryKey.startsWith('boardItems') ? 'Board item' : 'Boards',
    callSheets: 'Call sheets', locations: 'Locations', createdAt: 'Project info', characters: 'Characters', drafts: 'Script drafts', revision: 'Script revisions', sceneVariants: 'Scene variants', sceneVariantActive: 'Scene variants', autoDrafts: 'Draft settings', structure: 'Story structure', bible: 'Story Bible', credits: 'End credits', relationships: 'Relationships', characterMap: 'Relationship map', characterOptions: 'Character builder settings', gear: 'Gear', plans: 'Shot designer plans',
    budget: entryKey.startsWith('budget.lines') ? 'Budget line' : entryKey.startsWith('budget.expenses') ? 'Expense' : entryKey.startsWith('budget.accounts') ? 'Budget account'
      : entryKey.startsWith('budget.scenarios') ? 'Budget scenario' : entryKey.startsWith('budget.fringes') ? 'Fringe' : 'Budget settings',
  };
  const base = labels[field] ?? field;
  if (entryKey.endsWith('#order') || entryKey.endsWith('#')) return `${base} (order)`;
  return name ? `${base} · ${String(name).slice(0, 60)}` : base;
}
