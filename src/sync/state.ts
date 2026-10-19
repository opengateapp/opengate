import { create } from 'zustand';
import { LEGACY_EXPAND, RESTRICTED, TAB_ACCESS, TAB_FOLLOWS, channelFormat, channelOf, type Channel } from './channels';

export interface Peer { id: number; name: string; color: string; tab?: string }
export type SyncStatus = 'off' | 'connecting' | 'live' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  error?: string;
  peers: Peer[];
  /** Channels this person may change: null = not shared (everything is theirs). */
  write: string[] | null;
  admin: boolean;
  /** Edits made here that the relay hasn't confirmed yet (e.g. while offline). */
  pending: number;
  lastSync?: number;
  /** Whether the owner shared the budget with this person (they hold its key). */
  budget: boolean;
  /** Channels hidden from this person by their link (not sent by the relay). */
  hidden?: string[];
}

export const useSync = create<SyncState>(() => ({ status: 'off', peers: [], write: null, admin: false, pending: 0, budget: true }));

export function canWrite(ch: Channel | string): boolean {
  const { write, admin, hidden } = useSync.getState();
  if (write === null || admin) return true;
  if (hidden?.includes(ch)) return false;
  // The budget is only editable when the owner said so explicitly ("everything" doesn't include it).
  if ((RESTRICTED as readonly string[]).includes(ch)) return write.includes(ch);
  // Links made before per-tab access name sections; they cover the matching tab channels.
  return write.includes('*') || write.includes(ch) || write.some((w) => LEGACY_EXPAND[w]?.includes(ch));
}

/** Whether this person may change a project field (e.g. 'characters', 'drafts', 'bible'). */
export function canEdit(field: string): boolean {
  return canWrite(channelOf(field));
}

/** Breakdown / Visualize editors may add highlights to the script but not change its words. */
export function scriptMarksOnly(): boolean {
  return canWrite('script') && !canEdit('titlePage');
}

/** Whether a tab is hidden from this person (per-tab access; everything shows otherwise). */
export function tabHidden(tab: string): boolean {
  const { write, admin, hidden } = useSync.getState();
  if (write === null || admin || !hidden?.length || channelFormat() !== 2) return false;
  const t = TAB_ACCESS.find((x) => x.id === (TAB_FOLLOWS[tab] ?? tab));
  if (!t) return false;
  const own = t.channels.filter((c) => c !== 'script' || t.id === 'screenplay');
  return own.every((c) => hidden.includes(c));
}

export function isViewOnly(): boolean {
  const { write, admin } = useSync.getState();
  return write !== null && !admin && write.length === 0;
}

/** Whether this person can see the budget (always, unless a shared project's owner didn't share it). */
export function budgetVisible(): boolean {
  const { write, admin, budget } = useSync.getState();
  return write === null || admin || budget;
}
