import { create } from 'zustand';
import { RESTRICTED, type Channel } from './channels';

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
}

export const useSync = create<SyncState>(() => ({ status: 'off', peers: [], write: null, admin: false, pending: 0, budget: true }));

export function canWrite(ch: Channel | string): boolean {
  const { write, admin } = useSync.getState();
  if (write === null || admin) return true;
  // The budget is only editable when the owner said so explicitly ("everything" doesn't include it).
  if ((RESTRICTED as readonly string[]).includes(ch)) return write.includes(ch);
  return write.includes('*') || write.includes(ch);
}

/** Breakdown / Visualize editors may add highlights to the script but not change its words. */
export function scriptMarksOnly(): boolean {
  return canWrite('script') && !canWrite('write');
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
