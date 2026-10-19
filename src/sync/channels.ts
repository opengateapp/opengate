import type { Project } from '../model/types';

// A shared project is split into channels (one per app section). The relay knows which
// channel an encrypted update belongs to, so links can be limited to sections.
// Inside a channel, data is stored as small entries (one per contact, strip day, shot,
// board item …) so two people editing different things never overwrite each other.

export const CHANNELS = ['script', 'write', 'breakdown', 'plan', 'visualize', 'shoot', 'settings', 'budget'] as const;
/** Channels only sent to people the owner shared them with (encrypted with their own key). */
export const RESTRICTED: readonly Channel[] = ['budget'];
export type Channel = (typeof CHANNELS)[number];

/** App sections a link can be limited to, and the channels each one may write. */
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
};

/** Project fields that never sync (per-user, derived, or synced another way). */
export const LOCAL_ONLY = new Set(['schemaVersion', 'id', 'updatedAt', 'scriptDoc', 'share']);

const KEY_CHANNEL: Record<string, Channel> = {
  title: 'settings', createdAt: 'settings', production: 'settings',
  titlePage: 'write', notes: 'write', characters: 'write', drafts: 'write', revision: 'write', sceneVariants: 'write', sceneVariantActive: 'write', autoDrafts: 'write', structure: 'write', bible: 'write', relationships: 'write', characterMap: 'write', characterOptions: 'write', docs: 'write', avScripts: 'write', sceneNumbersLocked: 'write',
  elements: 'breakdown', sceneMeta: 'breakdown', categories: 'breakdown', schedule: 'breakdown',
  contacts: 'plan', tasks: 'plan', events: 'plan', cast: 'plan', crew: 'plan',
  shots: 'visualize', gear: 'visualize', plans: 'visualize', storyboard: 'visualize', storyboardSettings: 'visualize', boards: 'visualize',
  callSheets: 'shoot', locations: 'shoot',
  budget: 'budget',
};

export function channelOf(key: string): Channel {
  if (key === 'scriptDoc') return 'script';
  return KEY_CHANNEL[key] ?? 'settings';
}

const COLLECTIONS = new Set(['drafts', 'sceneVariants', 'characters', 'relationships', 'gear', 'plans', 'categories', 'elements', 'cast', 'locations', 'crew', 'shots', 'events', 'storyboard', 'contacts', 'tasks', 'docs', 'avScripts']);
const RECORDS = new Set(['sceneMeta', 'callSheets', 'characterMap']);
const BUDGET_LISTS = ['accounts', 'lines', 'fringes', 'scenarios', 'expenses'];

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
    callSheets: 'Call sheets', locations: 'Locations', createdAt: 'Project info', characters: 'Characters', drafts: 'Script drafts', revision: 'Script revisions', sceneVariants: 'Scene variants', sceneVariantActive: 'Scene variants', autoDrafts: 'Draft settings', structure: 'Story structure', bible: 'Story Bible', relationships: 'Relationships', characterMap: 'Relationship map', characterOptions: 'Character builder settings', gear: 'Gear', plans: 'Shot designer plans',
    budget: entryKey.startsWith('budget.lines') ? 'Budget line' : entryKey.startsWith('budget.expenses') ? 'Expense' : entryKey.startsWith('budget.accounts') ? 'Budget account'
      : entryKey.startsWith('budget.scenarios') ? 'Budget scenario' : entryKey.startsWith('budget.fringes') ? 'Fringe' : 'Budget settings',
  };
  const base = labels[field] ?? field;
  if (entryKey.endsWith('#order') || entryKey.endsWith('#')) return `${base} (order)`;
  return name ? `${base} · ${String(name).slice(0, 60)}` : base;
}
