// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import * as Y from 'yjs';
import { newKey, importKey, encryptToString, decryptString, seal, unseal, sha256Hex, b64url, fromB64url } from './sync/crypto';
import { CHANNELS, SECTION_CHANNELS, channelOf, decodeField, encodeField, fieldOf, LOCAL_ONLY } from './sync/channels';
import { diffBlocks, findSlice } from './sync/review';
import { newProject } from './model/defaults';
import type { Project } from './model/types';

describe('end-to-end encryption', () => {
  it('round-trips with the right key and fails with a wrong one', async () => {
    const key = await importKey(await newKey());
    const data = seal({ n: 'Casey', c: 42, t: 1 }, new TextEncoder().encode('INT. DINER - NIGHT'));
    const ct = await encryptToString(key, data);
    expect(ct).not.toContain('DINER');
    const { author, payload } = unseal(await decryptString(key, ct));
    expect(author.n).toBe('Casey');
    expect(new TextDecoder().decode(payload)).toBe('INT. DINER - NIGHT');
    const other = await importKey(await newKey());
    await expect(decryptString(other, ct)).rejects.toThrow();
  });
  it('encodes base64url and hashes tokens', async () => {
    const bytes = new Uint8Array([0, 255, 128, 64, 1]);
    expect(fromB64url(b64url(bytes))).toEqual(bytes);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('project ↔ sync channels', () => {
  const sample = (): Project => produce(newProject('Chan'), (d) => {
    d.contacts.push({ id: 'c1', name: 'Ana', kind: 'vendor', role: 'Grip', company: '', phone: '', email: '', notes: '' });
    d.contacts.push({ id: 'c2', name: 'Sam', kind: 'agent', role: '', company: '', phone: '', email: '', notes: '' });
    d.sceneMeta.s1 = { synopsis: 'x' };
    d.boards.push({ id: 'b1', title: 'Look', kind: 'mood', updatedAt: '', items: [{ id: 'i1', type: 'note', x: 0, y: 0, w: 1, h: 1, z: 2 }, { id: 'i2', type: 'note', x: 0, y: 0, w: 1, h: 1, z: 1 }] });
  });

  it('round-trips every syncable field through entries', () => {
    const p = sample() as unknown as Record<string, unknown>;
    for (const field of Object.keys(p)) {
      if (LOCAL_ONLY.has(field)) continue;
      const entries = encodeField(field, p[field]);
      const keys = [...entries.keys()];
      const back = decodeField(field, (k) => JSON.parse(JSON.stringify(entries.get(k))), keys);
      expect(back, field).toEqual(JSON.parse(JSON.stringify(p[field])));
      for (const k of keys) expect(fieldOf(k), k).toBe(field);
    }
  });

  it('merges concurrent edits to different contacts and board items (no overwrite)', () => {
    const p = sample();
    const a = new Y.Doc();
    const b = new Y.Doc();
    const fill = (doc: Y.Doc, proj: Project) => doc.transact(() => { for (const [k, v] of encodeField('contacts', proj.contacts)) doc.getMap('data').set(k, JSON.parse(JSON.stringify(v))); });
    fill(a, p);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    // Offline at the same time: A renames Ana, B adds a contact and renames Sam.
    a.getMap('data').set('contacts/c1', { ...p.contacts[0], name: 'Ana Ruiz' });
    b.getMap('data').set('contacts/c2', { ...p.contacts[1], name: 'Sam Lee' });
    b.getMap('data').set('contacts/c3', { id: 'c3', name: 'Jo', kind: 'other', role: '', company: '', phone: '', email: '', notes: '' });
    b.getMap('data').set('contacts#order', ['c1', 'c2', 'c3']);
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    for (const doc of [a, b]) {
      const m = doc.getMap('data');
      const list = decodeField('contacts', (k) => m.get(k), [...m.keys()]) as { name: string }[];
      expect(list.map((c) => c.name)).toEqual(['Ana Ruiz', 'Sam Lee', 'Jo']);
    }
  });

  it('maps sections to channels the relay can enforce', () => {
    expect(channelOf('schedule')).toBe('breakdown');
    expect(channelOf('callSheets')).toBe('shoot');
    expect(channelOf('boards')).toBe('visualize');
    expect(channelOf('scriptDoc')).toBe('script');
    for (const chs of Object.values(SECTION_CHANNELS)) for (const c of chs) expect(CHANNELS).toContain(c);
  });
});

describe('reviewing merged script changes', () => {
  it('finds the changed blocks and where they are now', () => {
    const before = ['h1', 'a', 'b', 'c', 'h2', 'd'];
    const after = ['h1', 'a', 'B!', 'new', 'c', 'h2', 'd'];
    const d = diffBlocks(before, after);
    expect(d).toEqual({ start: 2, before: ['b'], after: ['B!', 'new'] });
    // Later someone inserted a block above: the change is still found.
    expect(findSlice(['h0', ...after], d.after, d.start)).toBe(3);
    expect(findSlice(['h1', 'a', 'changed again', 'c'], d.after, d.start)).toBe(-1);
  });
});

