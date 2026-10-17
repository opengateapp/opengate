import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { exportProjectFile, readProjectFile, type SyncBundle } from './io/files';
import { newProject } from './model/defaults';
import type { Project } from './model/types';

describe('linked and independent .opengate files', () => {
  const shared = (): Project => ({ ...newProject('Shared'), share: { relay: 'https://r.example', room: 'room-abcdefghijklmnop', key: 'KEY', token: 'TOKEN', admin: false, write: ['*'], joinedAt: '' } });

  it('a linked file carries the share access and sync state, and merges it on open', async () => {
    const p = shared();
    const doc = new Y.Doc();
    doc.getMap('data').set('title', 'Shared');
    const bundle: SyncBundle = { settings: { state: Y.encodeStateAsUpdate(doc), seq: 7, pending: [{ id: 'u1', u: new Uint8Array([1, 2]) }] } };
    const blob = await exportProjectFile(p, async () => null, { sync: bundle });
    let merged: SyncBundle | null = null;
    const back = await readProjectFile(new File([blob], 'x.opengate'), false, async () => {}, async (_id, b) => { merged = b; });
    expect(back.share?.room).toBe('room-abcdefghijklmnop');
    expect(back.id).toBe(p.id);
    expect(merged!.settings.seq).toBe(7);
    expect(merged!.settings.pending[0].u).toEqual(new Uint8Array([1, 2]));
  });

  it('an independent copy has no share access, a new id and no sync state', async () => {
    const p = { ...shared(), storyboard: [{ id: 'f', shotId: 's', order: 0, imageId: 'img1', rev: 0, caption: '' }] } as Project;
    const blob = await exportProjectFile(p, async (id) => (id === 'img1' ? new Blob([new Uint8Array([9])], { type: 'image/png' }) : null), { independent: true });
    const saved: string[] = [];
    let synced = false;
    const back = await readProjectFile(new File([blob], 'copy.opengate'), false, async (_p, _b, id) => { saved.push(id); }, async () => { synced = true; });
    expect(back.share).toBeUndefined();
    expect(back.id).not.toBe(p.id);
    expect(back.storyboard[0].imageId).not.toBe('img1');
    expect(saved).toEqual([back.storyboard[0].imageId]);
    expect(synced).toBe(false);
  });
});
