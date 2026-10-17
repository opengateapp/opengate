import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror';
import type { Project, ShareInfo } from '../model/types';
import { useStore } from '../store/project';
import { db } from '../store/db';
import { getMedia, putMedia } from '../store/media';
import { mediaIds } from '../io/files';
import { schema } from '../script/schema';
import { session } from '../script/session';
import { newId } from '../model/ids';
import { CHANNELS, LOCAL_ONLY, channelOf, decodeField, describeEntry, encodeField, fieldOf, type Channel } from './channels';
import { importKey, encrypt, decrypt, encryptToString, decryptString, seal, unseal, type Author } from './crypto';
import { WebSocketTransport, type RelayMessage, type Transport } from './transport';
import { useSync, canWrite, type Peer } from './state';
import { recordData, recordScript, diffBlocks, findSlice, sameJson, useReview, setStatus, type ReviewChange } from './review';

// Keeps the open project in sync with its shared room.
//
//   store (Zustand)  ⇄  per-channel Yjs docs  ⇄  encrypted updates  ⇄  relay  ⇄  everyone else
//
// Everything works offline: edits land in the local Yjs docs (saved in IndexedDB) and are
// queued; when the connection comes back the queue is sent and others' edits are merged in.

const REMOTE = Symbol('remote');
const LOAD = Symbol('load');
const INIT = Symbol('init');
const LOCAL = Symbol('local');

const MAX_WS = 600_000;
const COMPACT_AFTER = 250;
const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export function displayName(): string {
  try { return localStorage.getItem('slateline.displayName') || 'Guest'; } catch { return 'Guest'; }
}
export function setDisplayName(n: string) {
  try { localStorage.setItem('slateline.displayName', n.trim() || 'Guest'); } catch { /* ignore */ }
}

interface Last { ref: unknown; json?: string }

export class ProjectSync {
  readonly docs = {} as Record<Channel, Y.Doc>;
  readonly maps = {} as Record<Channel, Y.Map<unknown>>;
  readonly fragment: Y.XmlFragment;
  readonly awareness: Awareness;
  private key!: CryptoKey;
  private seq = {} as Record<Channel, number>;
  private pending = {} as Record<Channel, { id: string; u: Uint8Array }[]>;
  private applied = {} as Record<Channel, number>;
  private last = new Map<string, Map<string, Last>>();
  private lastProject: Project | null = null;
  private applying = false;
  private author: Author | null = null;
  private ready = false;
  private hadState = false;
  private queue: Promise<void> = Promise.resolve();
  private persistTimers = {} as Record<Channel, ReturnType<typeof setTimeout>>;
  private mediaTimer: ReturnType<typeof setTimeout> | undefined;
  private uploaded = new Set<string>();
  private failedMedia = new Set<string>();
  private peerOf = new Map<string, number>();
  private unsub: (() => void)[] = [];
  private stopped = false;
  private me: { name: string; color: string };
  private scriptBatch: { before: string[]; author: Author; timer: ReturnType<typeof setTimeout> } | null = null;
  transport: Transport;
  get isApplying() { return this.applying; }

  constructor(private projectId: string, private share: ShareInfo, transport?: Transport) {
    for (const ch of CHANNELS) {
      this.docs[ch] = new Y.Doc();
      this.maps[ch] = this.docs[ch].getMap('data');
      this.seq[ch] = -1;
      this.pending[ch] = [];
      this.applied[ch] = 0;
    }
    this.fragment = this.docs.script.getXmlFragment('script');
    this.awareness = new Awareness(this.docs.script);
    this.me = { name: displayName(), color: COLORS[Math.abs(hash(this.projectId + this.docs.script.clientID)) % COLORS.length] };
    this.awareness.setLocalStateField('user', this.me);
    this.transport = transport ?? new WebSocketTransport(share.relay, share.room, share.token);
  }

  // ---------- lifecycle ----------

  async start(): Promise<void> {
    this.key = await importKey(this.share.key);
    useSync.setState({ status: 'connecting', error: undefined, peers: [], write: this.share.admin ? ['*'] : this.share.write, admin: this.share.admin, pending: 0 });

    // 1. Local copy of the shared state (works offline).
    const rows = await db.sync.where('projectId').equals(this.projectId).toArray();
    for (const r of rows) {
      const ch = r.key.split(':').pop() as Channel;
      if (!this.docs[ch]) continue;
      if (r.state?.length) Y.applyUpdate(this.docs[ch], r.state, LOAD);
      this.seq[ch] = r.seq;
      this.pending[ch] = r.pending ?? [];
    }
    this.hadState = rows.length > 0;
    const uploaded = await db.meta.get(`${this.projectId}:uploaded`);
    if (Array.isArray(uploaded?.value)) uploaded!.value.forEach((x) => this.uploaded.add(x as string));
    const review = await db.meta.get(`${this.projectId}:review`);
    useReview.setState({ changes: Array.isArray(review?.value) ? (review!.value as ReviewChange[]) : [] });

    const p = useStore.getState().project!;
    if (!this.hadState && this.share.fresh) {
      // The owner just started sharing: the project becomes the room's starting point.
      this.fillFromProject(p, INIT);
      for (const ch of CHANNELS) this.seq[ch] = 0;
    } else if (this.hadState) {
      // Bring the store up to date with the shared state, then send any edits made meanwhile.
      this.pullAll();
      this.pushChanges(useStore.getState().project!, true);
    }
    this.lastProject = useStore.getState().project;

    // 2. Wire up: Yjs → queue/persist; store → Yjs; Yjs → store.
    for (const ch of CHANNELS) {
      this.docs[ch].on('update', (u: Uint8Array, origin: unknown) => this.onDocUpdate(ch, u, origin));
      this.maps[ch].observe((ev, txn) => this.onMapChange(ch, ev, txn));
    }
    this.unsub.push(useStore.subscribe((s) => {
      if (this.applying || !s.project || s.project === this.lastProject) return;
      this.pushChanges(s.project);
      this.lastProject = s.project;
      this.scheduleMedia();
    }));
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'remote') { this.emitPeers(); return; }
      void this.sendPresence(false, [...added, ...updated, ...removed]);
    });
    this.awareness.on('change', () => this.emitPeers());

    // 3. Script co-editing (cursors, merging) in the shared editor session. Someone joining
    // for the first time connects the script only after downloading it, so their empty
    // starting page never merges into the shared script.
    session.flush();
    if (this.hadState || this.share.fresh) this.bindScript(p);

    // 4. Owner's first upload: one snapshot per section.
    if (this.share.fresh) await this.uploadSnapshots();

    // 5. Connect.
    this.transport.onOpen = () => {
      const since: Record<string, number> = {};
      for (const ch of CHANNELS) since[ch] = this.seq[ch];
      this.transport.send({ t: 'sub', since } as RelayMessage);
      void this.sendPresence(true);
    };
    this.transport.onMessage = (m) => { this.queue = this.queue.then(() => this.handle(m)).catch((e) => console.warn('sync', e)); };
    this.transport.onClose = (code, fatal) => {
      if (this.stopped) return;
      this.ready = false;
      if (fatal || code === 1008) {
        const msg = code === 4003 ? 'Your access to this project was removed by its owner.' : code === 4004 ? 'The owner stopped sharing this project. Your copy is kept here.' : 'This share link is no longer valid.';
        useSync.setState({ status: 'error', error: msg, peers: [] });
      } else useSync.setState({ status: 'offline', peers: [] });
    };
    const online = () => (this.transport as WebSocketTransport).kick?.();
    window.addEventListener('online', online);
    this.unsub.push(() => window.removeEventListener('online', online));
    this.transport.connect();
    this.updatePendingCount();
  }

  private scriptBound = false;

  private bindScript(p: Project | null) {
    if (this.scriptBound) return;
    this.scriptBound = true;
    if (!this.fragment.length && p?.scriptDoc) {
      // First share, or a project whose script was never put in the room yet.
      this.docs.script.transact(() => prosemirrorJSONToYXmlFragment(schema, p.scriptDoc, this.fragment), this.share.fresh ? INIT : LOCAL);
    }
    session.setCollab({
      fragment: this.fragment,
      awareness: this.awareness,
      onRemoteChange: (before, after) => this.onRemoteScript(before, after),
      isRemote: () => this.author !== null,
    });
  }

  stop() {
    this.stopped = true;
    this.unsub.forEach((u) => u());
    this.transport.close();
    for (const ch of CHANNELS) { clearTimeout(this.persistTimers[ch]); void this.persist(ch); }
    void this.persistMeta();
    if (this.scriptBound) session.setCollab(null);
    this.awareness.destroy();
    useSync.setState({ status: 'off', peers: [], write: null, admin: false, pending: 0 });
  }

  // ---------- local → room ----------

  private fillFromProject(p: Project, origin: symbol) {
    const byCh = new Map<Channel, string[]>();
    for (const field of Object.keys(p)) {
      if (LOCAL_ONLY.has(field)) continue;
      const ch = channelOf(field);
      byCh.set(ch, [...(byCh.get(ch) ?? []), field]);
    }
    for (const [ch, fields] of byCh) {
      this.docs[ch].transact(() => {
        for (const f of fields) {
          const entries = encodeField(f, (p as unknown as Record<string, unknown>)[f]);
          const last = new Map<string, Last>();
          for (const [k, v] of entries) { this.maps[ch].set(k, clone(v)); last.set(k, { ref: v }); }
          this.last.set(f, last);
        }
      }, origin);
    }
  }

  /** Store → Yjs, only for fields whose object changed (Immer keeps unchanged parts identical). */
  private pushChanges(p: Project, all = false) {
    const prev = this.lastProject as unknown as Record<string, unknown> | null;
    const cur = p as unknown as Record<string, unknown>;
    const byCh = new Map<Channel, string[]>();
    for (const field of Object.keys(cur)) {
      if (LOCAL_ONLY.has(field)) continue;
      if (!all && prev && prev[field] === cur[field]) continue;
      const ch = channelOf(field);
      if (!canWrite(ch)) continue;
      byCh.set(ch, [...(byCh.get(ch) ?? []), field]);
    }
    for (const [ch, fields] of byCh) {
      const map = this.maps[ch];
      this.docs[ch].transact(() => {
        for (const f of fields) {
          const entries = encodeField(f, cur[f]);
          const last = this.last.get(f) ?? new Map<string, Last>();
          for (const [k, v] of entries) {
            const l = last.get(k);
            if (l && l.ref === v) continue;
            const json = JSON.stringify(v);
            if (l && (l.json ?? JSON.stringify(l.ref)) === json) { last.set(k, { ref: v, json }); continue; }
            if (!l && map.has(k) && JSON.stringify(map.get(k)) === json) { last.set(k, { ref: v, json }); continue; }
            map.set(k, JSON.parse(json));
            last.set(k, { ref: v, json });
          }
          for (const k of [...last.keys()]) if (!entries.has(k)) { if (map.has(k)) map.delete(k); last.delete(k); }
          // Keys in the room for this field that we don't have (e.g. after an offline delete).
          if (all) for (const k of [...map.keys()]) if (fieldOf(k) === f && !entries.has(k)) map.delete(k);
          this.last.set(f, last);
        }
      }, LOCAL);
    }
  }

  private onDocUpdate(ch: Channel, u: Uint8Array, origin: unknown) {
    this.schedulePersist(ch);
    if (origin === REMOTE || origin === LOAD || origin === INIT) return;
    if (!canWrite(ch)) return;
    const item = { id: newId(), u };
    this.pending[ch].push(item);
    this.updatePendingCount();
    void this.sendUpdate(ch, item);
  }

  private async sendUpdate(ch: Channel, item: { id: string; u: Uint8Array }) {
    if (!this.ready) return;
    const d = await encryptToString(this.key, seal(this.authorStamp(), item.u));
    if (d.length > MAX_WS) {
      const res = await this.transport.http('POST', `up/${ch}`, d);
      if (res.ok) { const { s } = await res.json(); this.ack(ch, item.id, s); }
      return;
    }
    this.transport.send({ t: 'up', ch, id: item.id, d });
  }

  private ack(ch: Channel, id: string, s: number) {
    this.pending[ch] = this.pending[ch].filter((x) => x.id !== id);
    if (s > this.seq[ch]) this.seq[ch] = s;
    this.updatePendingCount();
    this.schedulePersist(ch);
  }

  private authorStamp(): Author {
    return { n: this.me.name, c: this.docs.script.clientID, t: Date.now() };
  }

  // ---------- room → local ----------

  private async handle(m: RelayMessage) {
    const ch = m.ch as Channel;
    switch (m.t) {
      case 'snap': {
        const res = await this.transport.http('GET', `snap/${ch}`);
        if (!res.ok) break;
        const { upTo, d } = await res.json();
        const { payload } = unseal(await decryptString(this.key, d));
        this.applyRemote(ch, payload, null);
        this.seq[ch] = Math.max(this.seq[ch], upTo);
        this.schedulePersist(ch);
        break;
      }
      case 'log': {
        for (const [s, d] of m.e ?? []) {
          if (s <= this.seq[ch]) continue;
          try {
            const { author, payload } = unseal(await decryptString(this.key, d));
            // Others' edits are reviewable once we're caught up with what existed before we joined.
            this.applyRemote(ch, payload, this.ready || this.hadState ? author : null);
          } catch (e) { console.warn('Could not read an update (wrong key?)', e); }
          this.seq[ch] = s;
          this.applied[ch]++;
        }
        this.schedulePersist(ch);
        void this.maybeCompact(ch);
        break;
      }
      case 'ack':
        this.ack(ch, m.id!, m.s!);
        void this.maybeCompact(ch);
        break;
      case 'denied':
        this.pending[ch] = this.pending[ch].filter((x) => x.id !== m.id);
        this.updatePendingCount();
        break;
      case 'ready': {
        const firstJoin = !this.hadState && !this.share.fresh;
        this.ready = true;
        this.hadState = true;
        if (m.perms) {
          useSync.setState({ write: m.perms.admin ? ['*'] : m.perms.write, admin: m.perms.admin });
          if (!sameJson(m.perms.write, this.share.write)) {
            useStore.getState().update((d) => { if (d.share) d.share.write = m.perms!.write; }, null);
          }
        }
        if (this.share.fresh) useStore.getState().update((d) => { if (d.share) delete d.share.fresh; }, null);
        if (firstJoin) { this.pullAll(); this.bindScript(null); }
        useSync.setState({ status: 'live', lastSync: Date.now() });
        for (const c of CHANNELS) for (const item of this.pending[c]) await this.sendUpdate(c, item);
        this.scheduleMedia(0);
        break;
      }
      case 'pres': {
        if (!m.d) break;
        try {
          const { author, payload } = unseal(await decryptString(this.key, m.d));
          if (m.c) this.peerOf.set(m.c, author.c);
          applyAwarenessUpdate(this.awareness, payload, 'remote');
          if (m.hello) void this.sendPresence(false);
        } catch { /* ignore */ }
        break;
      }
      case 'bye': {
        const id = m.c ? this.peerOf.get(m.c) : undefined;
        if (id !== undefined) removeAwarenessStates(this.awareness, [id], 'remote');
        break;
      }
    }
  }

  private applyRemote(ch: Channel, update: Uint8Array, author: Author | null) {
    // What they wrote, per entry — to spot edits that lost to ours (both changed it while apart).
    // An overwrite doesn't carry its key in the update, so read the values now and find the keys after applying.
    type Struct = { id: Y.ID; content?: { getContent?: () => unknown[] } };
    const written: { id: Y.ID; value: unknown }[] = [];
    if (author && ch !== 'script') {
      try {
        for (const s of Y.decodeUpdate(update).structs as unknown as Struct[]) {
          const c = s.content?.getContent?.();
          if (c && c.length === 1) written.push({ id: s.id, value: c[0] });
        }
      } catch { /* not decodable: skip the check */ }
    }
    this.author = author;
    try { Y.applyUpdate(this.docs[ch], update, REMOTE); } finally { this.author = null; }
    if (!author) return;
    const theirs = new Map<string, unknown>();
    for (const w of written) {
      try {
        const item = Y.getItem(this.docs[ch].store, w.id) as unknown as { parent: unknown; parentSub: string | null };
        if (item.parent === this.maps[ch] && item.parentSub) theirs.set(item.parentSub, w.value);
      } catch { /* not integrated (missing earlier updates) */ }
    }
    const map = this.maps[ch];
    for (const [key, value] of theirs) {
      if (key.endsWith('#order') || key.endsWith('#')) continue;
      const cur = map.get(key);
      if (cur === undefined || sameJson(cur, value)) continue;
      recordData(author.n, colorFor(author.c), ch, {
        key, before: cur, after: value, lost: true,
        label: `${describeEntry(key, value)} — their version (yours was kept)`,
      }, true);
      void this.persistMeta();
    }
  }

  /** For an edit that lost to yours: use their version instead. */
  useTheirs(change: ReviewChange, key: string) {
    const e = change.entries.find((x) => x.key === key && x.lost);
    if (!e || !canWrite(change.ch)) return;
    this.docs[change.ch].transact(() => this.maps[change.ch].set(key, clone(e.after)), LOCAL);
    this.pullFields(change.ch, [fieldOf(key)]);
    useReview.setState({ changes: useReview.getState().changes.map((c) => (c.id === change.id ? { ...c, entries: c.entries.map((x) => (x === e ? { ...x, usedTheirs: true } : x)) } : c)) });
    void this.persistMeta();
  }

  /** Yjs data map changed: rebuild the affected project fields in the store. */
  private onMapChange(ch: Channel, ev: Y.YMapEvent<unknown>, txn: Y.Transaction) {
    if (txn.origin !== REMOTE) return;
    const fields = new Set<string>();
    // Unsent edits of ours in this section when theirs arrived → flag it for a closer look.
    const conflict = this.pending[ch].length > 0;
    for (const [key, change] of ev.changes.keys) {
      fields.add(fieldOf(key));
      if (this.author && !key.endsWith('#order') && !key.endsWith('#')) {
        const after = this.maps[ch].get(key);
        recordData(this.author.n, colorFor(this.author.c), ch, {
          key, before: change.oldValue, after,
          label: `${describeEntry(key, after ?? change.oldValue)}${change.action === 'add' ? ' (added)' : change.action === 'delete' ? ' (removed)' : ''}`,
        }, conflict);
        void this.persistMeta();
      }
    }
    this.pullFields(ch, [...fields]);
  }

  private pullFields(ch: Channel, fields: string[]) {
    const map = this.maps[ch];
    const keys = [...map.keys()];
    const get = (k: string) => map.get(k);
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const v = decodeField(f, get, keys);
      if (v !== undefined) values[f] = v;
    }
    if (!Object.keys(values).length) return;
    this.applying = true;
    try {
      useStore.getState().update((d) => { Object.assign(d as unknown as Record<string, unknown>, values); }, null);
    } finally { this.applying = false; }
    const p = useStore.getState().project as unknown as Record<string, unknown>;
    for (const f of Object.keys(values)) {
      const last = new Map<string, Last>();
      for (const [k, v] of encodeField(f, p[f])) last.set(k, { ref: v });
      this.last.set(f, last);
    }
    this.lastProject = useStore.getState().project;
    this.scheduleMedia();
  }

  private pullAll() {
    for (const ch of CHANNELS) {
      if (ch === 'script') continue;
      const fields = new Set([...this.maps[ch].keys()].map(fieldOf));
      if (fields.size) this.pullFields(ch, [...fields]);
    }
  }

  // ---------- script review ----------

  private onRemoteScript(before: unknown, after: unknown) {
    if (!this.author) return;
    const b = blocks(before);
    if (this.scriptBatch && this.scriptBatch.author.c === this.author.c) {
      clearTimeout(this.scriptBatch.timer);
    } else {
      this.flushScriptBatch();
      this.scriptBatch = { before: b, author: this.author, timer: undefined as never };
    }
    const batch = this.scriptBatch!;
    batch.timer = setTimeout(() => this.flushScriptBatch(), 2500);
    void after;
  }

  private flushScriptBatch() {
    const batch = this.scriptBatch;
    if (!batch) return;
    clearTimeout(batch.timer);
    this.scriptBatch = null;
    const now = blocks(session.state?.doc.toJSON());
    const d = diffBlocks(batch.before, now);
    if (!d.before.length && !d.after.length) return;
    const heading = findHeading(now, d.start);
    const n = Math.max(d.before.length, d.after.length);
    recordScript(batch.author.n, colorFor(batch.author.c), {
      before: d.before, after: d.after, start: d.start,
      summary: `${n} paragraph${n === 1 ? '' : 's'} ${d.after.length > d.before.length ? 'added' : d.after.length < d.before.length ? 'removed' : 'changed'}${heading ? ` in ${heading}` : ''}`,
    }, this.pending.script.length > 0);
    void this.persistMeta();
  }

  // ---------- accept / reject ----------

  /** Undo someone else's merged change (as a new edit, so everyone sees it undone). */
  reject(change: ReviewChange): 'rejected' | 'partial' {
    if (change.kind === 'script' && change.script) return this.rejectScript(change);
    const ch = change.ch;
    if (!canWrite(ch)) return 'partial';
    const map = this.maps[ch];
    let skipped = 0;
    this.docs[ch].transact(() => {
      for (const e of change.entries) {
        if (e.lost && !e.usedTheirs) continue; // theirs never applied: nothing to undo
        if (e.lost && e.usedTheirs) { if (sameJson(map.get(e.key), e.after)) map.set(e.key, clone(e.before)); continue; }
        if (!sameJson(map.get(e.key), e.after)) { skipped++; continue; } // changed again since
        if (e.before === undefined) map.delete(e.key);
        else map.set(e.key, clone(e.before));
      }
    }, LOCAL);
    this.pullFields(ch, [...new Set(change.entries.map((e) => fieldOf(e.key)))]);
    const status = skipped ? 'partial' : 'rejected';
    setStatus(change.id, status, skipped ? `${skipped} item${skipped > 1 ? 's were' : ' was'} changed again since, so ${skipped > 1 ? 'they were' : 'it was'} kept.` : undefined);
    void this.persistMeta();
    return status;
  }

  private rejectScript(change: ReviewChange): 'rejected' | 'partial' {
    const rev = change.script!;
    const state = session.state;
    if (!state || !canWrite('script')) return 'partial';
    const now = blocks(state.doc.toJSON());
    const at = findSlice(now, rev.after, rev.start);
    if (at < 0) {
      setStatus(change.id, 'partial', 'That part of the script was edited again since, so it was kept.');
      return 'partial';
    }
    session.replaceBlocks(at, rev.after.length, rev.before.map((j) => JSON.parse(j)));
    setStatus(change.id, 'rejected');
    void this.persistMeta();
    return 'rejected';
  }

  // ---------- presence ----------

  setTab(tab: string) {
    this.awareness.setLocalStateField('user', { ...this.me, tab });
  }

  private async sendPresence(hello: boolean, ids: number[] = [this.docs.script.clientID]) {
    if (!this.transport.open) return;
    const upd = encodeAwarenessUpdate(this.awareness, ids);
    const d = await encryptToString(this.key, seal(this.authorStamp(), upd));
    this.transport.send({ t: 'pres', d, hello } as RelayMessage);
  }

  private emitPeers() {
    const peers: Peer[] = [];
    this.awareness.getStates().forEach((st, id) => {
      if (id === this.docs.script.clientID) return;
      const u = (st as { user?: { name: string; color: string; tab?: string } }).user;
      if (u) peers.push({ id, name: u.name, color: u.color, tab: u.tab });
    });
    useSync.setState({ peers });
  }

  // ---------- images ----------

  private scheduleMedia(ms = 1500) {
    clearTimeout(this.mediaTimer);
    this.mediaTimer = setTimeout(() => void this.syncMedia(), ms);
  }

  private async syncMedia() {
    if (!this.ready || this.stopped) return;
    const p = useStore.getState().project;
    if (!p) return;
    const writer = useSync.getState().admin || (useSync.getState().write ?? []).length > 0;
    for (const id of mediaIds(p)) {
      if (this.failedMedia.has(id)) continue;
      const local = await getMedia(id);
      if (local && !this.uploaded.has(id) && writer) {
        const enc = await encrypt(this.key, new Uint8Array(await local.arrayBuffer()));
        const typed = seal({ n: local.type || 'image/png', c: 0, t: Date.now() }, enc);
        const res = await this.transport.http('PUT', `media/${id}`, typed);
        if (res.ok) this.uploaded.add(id); else this.failedMedia.add(id);
      } else if (!local) {
        const res = await this.transport.http('GET', `media/${id}`);
        if (!res.ok) { this.failedMedia.add(id); continue; }
        const { author, payload } = unseal(new Uint8Array(await res.arrayBuffer()));
        const bytes = await decrypt(this.key, payload);
        await putMedia(this.projectId, new Blob([bytes], { type: author.n }), id);
        this.uploaded.add(id);
      }
    }
    void this.persistMeta();
  }

  // ---------- saving & compaction ----------

  private schedulePersist(ch: Channel) {
    clearTimeout(this.persistTimers[ch]);
    this.persistTimers[ch] = setTimeout(() => void this.persist(ch), 400);
  }

  private async persist(ch: Channel) {
    await db.sync.put({
      key: `${this.projectId}:${ch}`, projectId: this.projectId,
      state: Y.encodeStateAsUpdate(this.docs[ch]), seq: this.seq[ch], pending: this.pending[ch],
    });
  }

  private async persistMeta() {
    await db.meta.bulkPut([
      { key: `${this.projectId}:uploaded`, projectId: this.projectId, value: [...this.uploaded] },
      { key: `${this.projectId}:review`, projectId: this.projectId, value: useReview.getState().changes },
    ]);
  }

  private async uploadSnapshots() {
    for (const ch of CHANNELS) {
      const d = await encryptToString(this.key, seal(this.authorStamp(), Y.encodeStateAsUpdate(this.docs[ch])));
      const res = await this.transport.http('PUT', `snap/${ch}?upTo=${Math.max(0, this.seq[ch])}`, d);
      if (!res.ok) throw new Error(`Couldn't upload the project to the relay (${res.status}).`);
      this.seq[ch] = Math.max(0, this.seq[ch]);
      this.applied[ch] = 0;
      await this.persist(ch);
    }
  }

  /** After many small updates, a writer uploads one snapshot so newcomers load fast. */
  private async maybeCompact(ch: Channel) {
    if (this.applied[ch] < COMPACT_AFTER || !canWrite(ch) || this.pending[ch].length) return;
    this.applied[ch] = 0;
    const d = await encryptToString(this.key, seal(this.authorStamp(), Y.encodeStateAsUpdate(this.docs[ch])));
    await this.transport.http('PUT', `snap/${ch}?upTo=${this.seq[ch]}`, d).catch(() => {});
  }

  private updatePendingCount() {
    useSync.setState({ pending: CHANNELS.reduce((n, c) => n + this.pending[c].length, 0) });
  }

  /** Everything needed to rejoin later from a linked .opengate file. */
  exportState(): Record<string, { state: Uint8Array; seq: number; pending: { id: string; u: Uint8Array }[] }> {
    const out: Record<string, { state: Uint8Array; seq: number; pending: { id: string; u: Uint8Array }[] }> = {};
    for (const ch of CHANNELS) out[ch] = { state: Y.encodeStateAsUpdate(this.docs[ch]), seq: this.seq[ch], pending: this.pending[ch] };
    return out;
  }
}

// ---------- helpers ----------

function clone<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function colorFor(clientId: number): string {
  return COLORS[Math.abs(clientId) % COLORS.length];
}

function blocks(doc: unknown): string[] {
  const d = doc as { content?: unknown[] } | null;
  return (d?.content ?? []).map((n) => JSON.stringify(n));
}

function findHeading(list: string[], start: number): string {
  for (let i = Math.min(start, list.length - 1); i >= 0; i--) {
    const n = JSON.parse(list[i]) as { type: string; content?: { text?: string }[] };
    if (n.type === 'sceneHeading') return (n.content ?? []).map((t) => t.text ?? '').join('').slice(0, 50);
  }
  return '';
}

// ---------- the running sync for the open project ----------

let current: ProjectSync | null = null;

export function currentSync(): ProjectSync | null {
  return current;
}

export async function startSync(p: Project, transport?: Transport): Promise<ProjectSync | null> {
  stopSync();
  if (!p.share) return null;
  const s = new ProjectSync(p.id, p.share, transport);
  current = s;
  try {
    await s.start();
  } catch (e) {
    useSync.setState({ status: 'error', error: (e as Error).message });
  }
  return s;
}

export function stopSync() {
  current?.stop();
  current = null;
}
