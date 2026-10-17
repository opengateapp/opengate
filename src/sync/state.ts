import { create } from 'zustand';
import type { Channel } from './channels';

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
}

export const useSync = create<SyncState>(() => ({ status: 'off', peers: [], write: null, admin: false, pending: 0 }));

export function canWrite(ch: Channel | string): boolean {
  const { write, admin } = useSync.getState();
  return write === null || admin || write.includes('*') || write.includes(ch);
}

/** Breakdown / Visualize editors may add highlights to the script but not change its words. */
export function scriptMarksOnly(): boolean {
  return canWrite('script') && !canWrite('write');
}

export function isViewOnly(): boolean {
  const { write, admin } = useSync.getState();
  return write !== null && !admin && write.length === 0;
}
