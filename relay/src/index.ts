import { DurableObject } from 'cloudflare:workers';

// Open Gate relay: one Durable Object per shared project ("room").
//
// Everything a project sends here is encrypted in the browser with a key that only
// lives in the invite link (after the #, which browsers never send to servers), so the
// relay stores and forwards ciphertext it cannot read. It does know *which section*
// ("channel") each update belongs to, which is how it enforces edit / view-only /
// section-limited links without user accounts:
//
//   admin secret  — the project owner; can create and revoke links
//   link token    — stored here only as a SHA-256 hash, with the channels it may write
//                   and the restricted channels it may read
//
// Channels: format 1 rooms use one per section (script, write, breakdown, plan, visualize, shoot,
// settings, budget); format 2 rooms use one per tab (script, screenplay, characters, … budget), so
// links can edit, view or not see each tab. A link's `hide` list names channels never sent to it.
// Links made for format-1 rooms name sections; in a format-2 room each covers its tabs' channels.
// The budget is restricted: it's only sent to the owner and to links that were given it
// (it's also encrypted with a separate key that only those links carry).

interface Env { ROOMS: DurableObjectNamespace }
interface Perms { write: string[]; read?: string[]; hide?: string[]; admin: boolean; h?: string }
interface Attachment { c: string; perms: Perms }

const CHANNELS_V1 = ['script', 'write', 'breakdown', 'plan', 'visualize', 'shoot', 'settings', 'budget'];
const CHANNELS_V2 = ['script', 'screenplay', 'characters', 'bible', 'docs', 'av', 'breakdown', 'schedule', 'contacts', 'calendar', 'tasks',
  'storyboard', 'boards', 'shots', 'designer', 'gear', 'callsheets', 'locations', 'settings', 'budget'];
const CHANNELS = [...new Set([...CHANNELS_V1, ...CHANNELS_V2])];
const RESTRICTED = ['budget'];
/** Format-1 section names → the format-2 channels they cover. */
const LEGACY_EXPAND: Record<string, string[]> = {
  write: ['screenplay', 'characters', 'bible', 'docs', 'av'],
  breakdown: ['breakdown', 'schedule'],
  plan: ['contacts', 'calendar', 'tasks'],
  visualize: ['storyboard', 'boards', 'shots', 'designer', 'gear'],
  shoot: ['callsheets', 'locations'],
};
const CHUNK = 900_000;
const MAX_MEDIA = 25_000_000;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-token, x-admin',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });
const fail = (status: number, msg: string) => json({ error: msg }, status);

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const hidden = (p: Perms, ch: string) => !p.admin && !!p.hide?.includes(ch);
const canWrite = (p: Perms, ch: string) => p.admin || (!hidden(p, ch) && (p.write.includes(ch) || (p.write.includes('*') && !RESTRICTED.includes(ch)) || p.write.some((w) => LEGACY_EXPAND[w]?.includes(ch))));
const canRead = (p: Perms, ch: string) => p.admin || (!hidden(p, ch) && (!RESTRICTED.includes(ch) || p.write.includes(ch) || !!p.read?.includes(ch)));

export class Room extends DurableObject<Env> {
  sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS links (hash TEXT PRIMARY KEY, label TEXT, write TEXT, created INTEGER);
      CREATE TABLE IF NOT EXISTS log (ch TEXT, s INTEGER, d TEXT, PRIMARY KEY (ch, s));
      CREATE TABLE IF NOT EXISTS seq (ch TEXT PRIMARY KEY, s INTEGER);
      CREATE TABLE IF NOT EXISTS snap (ch TEXT, i INTEGER, upTo INTEGER, d TEXT, PRIMARY KEY (ch, i));
      CREATE TABLE IF NOT EXISTS media (id TEXT, i INTEGER, d BLOB, PRIMARY KEY (id, i));
    `);
    // Rooms made before budgets: add the read column.
    if (!this.sql.exec("SELECT 1 FROM pragma_table_info('links') WHERE name = 'read'").toArray().length) this.sql.exec('ALTER TABLE links ADD COLUMN read TEXT');
    // Rooms made before per-tab access: which channels a link never receives.
    if (!this.sql.exec("SELECT 1 FROM pragma_table_info('links') WHERE name = 'hide'").toArray().length) this.sql.exec('ALTER TABLE links ADD COLUMN hide TEXT');
  }

  private meta(k: string): string | null {
    const r = this.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return r ? (r.v as string) : null;
  }

  /** Token (link token or admin secret) → permissions, or null. */
  private async perms(token: string | null): Promise<Perms | null> {
    if (!token) return null;
    const h = await sha256(token);
    if (h === this.meta('adminHash')) return { write: ['*'], admin: true, h };
    const r = this.sql.exec('SELECT write, read, hide FROM links WHERE hash = ?', h).toArray()[0];
    return r ? { write: JSON.parse(r.write as string), read: r.read ? JSON.parse(r.read as string) : [], hide: r.hide ? JSON.parse(r.hide as string) : [], admin: false, h } : null;
  }

  private latest(ch: string): number {
    const r = this.sql.exec('SELECT s FROM seq WHERE ch = ?', ch).toArray()[0];
    return r ? (r.s as number) : 0;
  }

  private snapUpTo(ch: string): number {
    const r = this.sql.exec('SELECT upTo FROM snap WHERE ch = ? AND i = 0', ch).toArray()[0];
    return r ? (r.upTo as number) : 0;
  }

  /** Stores an update and sends it to everyone else in the room. */
  private append(ch: string, d: string, except?: WebSocket): number {
    const s = this.latest(ch) + 1;
    this.sql.exec('INSERT INTO log (ch, s, d) VALUES (?, ?, ?)', ch, s, d);
    this.sql.exec('INSERT INTO seq (ch, s) VALUES (?, ?) ON CONFLICT(ch) DO UPDATE SET s = excluded.s', ch, s);
    const msg = JSON.stringify({ t: 'log', ch, e: [[s, d]] });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || !canRead((ws.deserializeAttachment() as Attachment).perms, ch)) continue;
      try { ws.send(msg); } catch { /* closed */ }
    }
    return s;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const [, , , action, arg] = url.pathname.split('/'); // /r/<room>/<action>/<arg>
    const token = req.headers.get('x-token') ?? req.headers.get('x-admin') ?? url.searchParams.get('tok');

    // Create a room (first caller sets the owner's admin secret hash).
    if (action === 'init' && req.method === 'POST') {
      const { adminHash } = (await req.json()) as { adminHash?: string };
      if (!adminHash || !/^[0-9a-f]{64}$/.test(adminHash)) return fail(400, 'bad adminHash');
      const existing = this.meta('adminHash');
      if (existing && existing !== adminHash) return fail(409, 'room exists');
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('adminHash', ?)", adminHash);
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('created', ?)", String(Date.now()));
      return json({ ok: true });
    }

    if (!this.meta('adminHash')) return fail(404, 'no such room');
    const perms = await this.perms(token);
    if (!perms) return fail(403, 'this link is not valid (it may have been revoked)');

    if (action === 'ws') {
      if (req.headers.get('upgrade') !== 'websocket') return fail(426, 'websocket expected');
      const pair = new WebSocketPair();
      const att: Attachment = { c: crypto.randomUUID().slice(0, 8), perms };
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment(att);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (action === 'whoami') return json({ write: perms.write, read: perms.read ?? [], hide: perms.hide ?? [], admin: perms.admin, format: Number(this.meta('format') ?? 1) });

    // Owner: switch the room's format (after uploading the new channels). Everyone reconnects onto it.
    if (action === 'format' && req.method === 'POST') {
      if (!perms.admin) return fail(403, 'only the project owner can change the room format');
      const { format } = (await req.json()) as { format?: number };
      if (format !== 1 && format !== 2) return fail(400, 'bad format');
      this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('format', ?)", String(format));
      for (const ws of this.ctx.getWebSockets()) if (!(ws.deserializeAttachment() as Attachment).perms.admin) ws.close(4006, 'room format changed');
      return json({ ok: true, format });
    }

    if (action === 'links') {
      if (!perms.admin) return fail(403, 'only the project owner can manage links');
      if (req.method === 'GET') {
        return json(this.sql.exec('SELECT hash, label, write, read, hide, created FROM links ORDER BY created').toArray().map((r) => ({ hash: r.hash, label: r.label, write: JSON.parse(r.write as string), read: r.read ? JSON.parse(r.read as string) : [], hide: r.hide ? JSON.parse(r.hide as string) : [], created: r.created })));
      }
      if (req.method === 'POST') {
        const b = (await req.json()) as { hash?: string; label?: string; write?: string[]; read?: string[]; hide?: string[] };
        if (!b.hash || !/^[0-9a-f]{64}$/.test(b.hash) || !Array.isArray(b.write)) return fail(400, 'bad link');
        const write = b.write.filter((c) => c === '*' || CHANNELS.includes(c));
        const read = (Array.isArray(b.read) ? b.read : []).filter((c) => RESTRICTED.includes(c));
        const hide = (Array.isArray(b.hide) ? b.hide : []).filter((c) => CHANNELS.includes(c));
        this.sql.exec('INSERT OR REPLACE INTO links (hash, label, write, read, hide, created) VALUES (?, ?, ?, ?, ?, ?)', b.hash, (b.label ?? '').slice(0, 120), JSON.stringify(write), JSON.stringify(read), JSON.stringify(hide), Date.now());
        return json({ ok: true });
      }
      if (req.method === 'DELETE' && arg) {
        this.sql.exec('DELETE FROM links WHERE hash = ?', arg);
        // Disconnect anyone using the revoked link.
        for (const ws of this.ctx.getWebSockets()) {
          const a = ws.deserializeAttachment() as Attachment;
          if (a.perms.h === arg) ws.close(4003, 'link revoked');
        }
        return json({ ok: true });
      }
    }

    if (action === 'room' && req.method === 'DELETE') {
      if (!perms.admin) return fail(403, 'only the project owner can stop sharing');
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, 'sharing stopped');
      await this.ctx.storage.deleteAll();
      return json({ ok: true });
    }

    // Snapshots: a writer uploads the full (encrypted) state of a channel; older log entries are dropped.
    if (action === 'snap' && arg && CHANNELS.includes(arg)) {
      if (req.method === 'GET') {
        if (!canRead(perms, arg)) return fail(403, 'not shared with this link');
        const rows = this.sql.exec('SELECT upTo, d FROM snap WHERE ch = ? ORDER BY i', arg).toArray();
        if (!rows.length) return fail(404, 'no snapshot');
        return json({ upTo: rows[0].upTo, d: rows.map((r) => r.d).join('') });
      }
      if (req.method === 'PUT') {
        if (!canWrite(perms, arg)) return fail(403, 'read only');
        const upTo = Math.min(Number(url.searchParams.get('upTo') ?? 0), this.latest(arg));
        if (upTo < this.snapUpTo(arg)) return json({ ok: true, skipped: true });
        const d = await req.text();
        this.sql.exec('DELETE FROM snap WHERE ch = ?', arg);
        for (let i = 0, off = 0; off < d.length || i === 0; i++, off += CHUNK) this.sql.exec('INSERT INTO snap (ch, i, upTo, d) VALUES (?, ?, ?, ?)', arg, i, upTo, d.slice(off, off + CHUNK));
        this.sql.exec('DELETE FROM log WHERE ch = ? AND s <= ?', arg, upTo);
        return json({ ok: true, upTo });
      }
    }

    // Large updates that don't fit in a websocket message.
    if (action === 'up' && arg && CHANNELS.includes(arg) && req.method === 'POST') {
      if (!canWrite(perms, arg)) return fail(403, 'read only');
      return json({ s: this.append(arg, await req.text()) });
    }

    // Encrypted images.
    if (action === 'media' && arg && /^[\w-]{6,80}$/.test(arg)) {
      if (req.method === 'GET') {
        const rows = this.sql.exec('SELECT d FROM media WHERE id = ? ORDER BY i', arg).toArray();
        if (!rows.length) return fail(404, 'no media');
        const parts = rows.map((r) => new Uint8Array(r.d as ArrayBuffer));
        const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.length; }
        return new Response(out, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'private, max-age=31536000, immutable', ...CORS } });
      }
      if (req.method === 'PUT') {
        if (!perms.admin && !perms.write.length) return fail(403, 'read only');
        const buf = new Uint8Array(await req.arrayBuffer());
        if (buf.length > MAX_MEDIA) return fail(413, 'image too large');
        this.sql.exec('DELETE FROM media WHERE id = ?', arg);
        for (let i = 0, off = 0; off < buf.length; i++, off += CHUNK) this.sql.exec('INSERT INTO media (id, i, d) VALUES (?, ?, ?)', arg, i, buf.slice(off, off + CHUNK));
        return json({ ok: true });
      }
    }
    return fail(404, 'not found');
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a = ws.deserializeAttachment() as Attachment;
    let m: { t: string; ch?: string; id?: string; d?: string; since?: Record<string, number> };
    try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    if (m.t === 'sub') {
      // Only the channels this client asked for (its room format), that it may read.
      const asked = (ch: string) => !m.since || ch in m.since;
      for (const ch of CHANNELS) {
        if (!canRead(a.perms, ch) || !asked(ch)) continue;
        // since = last update this client has (-1: it has nothing yet, not even the starting snapshot).
        const since = m.since?.[ch] ?? -1;
        const hasSnap = this.sql.exec('SELECT 1 FROM snap WHERE ch = ? AND i = 0', ch).toArray().length > 0;
        const snapUpTo = this.snapUpTo(ch);
        let from = Math.max(0, since);
        if (hasSnap && (since < 0 || since < snapUpTo)) { ws.send(JSON.stringify({ t: 'snap', ch, upTo: snapUpTo })); from = snapUpTo; }
        if (from >= this.latest(ch)) continue;
        // Send in batches so no single message gets too large.
        let batch: [number, string][] = [];
        let size = 0;
        for (const r of this.sql.exec('SELECT s, d FROM log WHERE ch = ? AND s > ? ORDER BY s', ch, from)) {
          batch.push([r.s as number, r.d as string]);
          size += (r.d as string).length;
          if (size > 600_000) { ws.send(JSON.stringify({ t: 'log', ch, e: batch })); batch = []; size = 0; }
        }
        if (batch.length) ws.send(JSON.stringify({ t: 'log', ch, e: batch }));
      }
      const readable = CHANNELS.filter((c) => canRead(a.perms, c) && asked(c));
      ws.send(JSON.stringify({ t: 'ready', format: Number(this.meta('format') ?? 1), perms: { write: a.perms.write, read: a.perms.read ?? [], hide: a.perms.hide ?? [], admin: a.perms.admin }, latest: Object.fromEntries(readable.map((c) => [c, this.latest(c)])) }));
      return;
    }
    if (m.t === 'up' && m.ch && m.d && CHANNELS.includes(m.ch)) {
      if (!canWrite(a.perms, m.ch)) { ws.send(JSON.stringify({ t: 'denied', ch: m.ch, id: m.id })); return; }
      const s = this.append(m.ch, m.d, ws);
      ws.send(JSON.stringify({ t: 'ack', ch: m.ch, id: m.id, s }));
      return;
    }
    if (m.t === 'pres' && m.d) {
      const msg = JSON.stringify({ t: 'pres', c: a.c, d: m.d });
      for (const other of this.ctx.getWebSockets()) if (other !== ws) { try { other.send(msg); } catch { /* closed */ } }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const a = ws.deserializeAttachment() as Attachment;
    const msg = JSON.stringify({ t: 'bye', c: a.c });
    for (const other of this.ctx.getWebSockets()) if (other !== ws) { try { other.send(msg); } catch { /* closed */ } }
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    // What this relay supports (older relays answer only format 1).
    if (url.pathname === '/info') return json({ v: 2, formats: [1, 2] });
    const m = url.pathname.match(/^\/r\/([A-Za-z0-9_-]{16,64})\//);
    if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    return new Response('Open Gate relay is running. Share a project from Open Gate → Share.', { headers: { 'content-type': 'text/plain', ...CORS } });
  },
};
