// Connection to the relay: one websocket (live updates, presence) plus plain HTTP for
// snapshots, large updates, images and link management. Reconnects with backoff.

export interface RelayMessage {
  t: string;
  ch?: string;
  id?: string;
  s?: number;
  d?: string;
  e?: [number, string][];
  upTo?: number;
  c?: string;
  perms?: { write: string[]; admin: boolean; hide?: string[] };
  /** Room format (2 = per-tab channels); absent from older relays. */
  format?: number;
  hello?: boolean;
}

export interface HttpResult { ok: boolean; status: number; text(): Promise<string>; json(): Promise<any>; arrayBuffer(): Promise<ArrayBuffer> } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Transport {
  connect(): void;
  close(): void;
  send(m: RelayMessage): boolean;
  readonly open: boolean;
  onMessage: (m: RelayMessage) => void;
  onOpen: () => void;
  /** code: the close code; fatal = don't retry (revoked / stopped / bad link). */
  onClose: (code: number, fatal: boolean) => void;
  http(method: string, path: string, body?: string | Uint8Array | object): Promise<HttpResult>;
}

export function relayBase(relay: string): string {
  const u = relay.trim().replace(/\/+$/, '');
  return /^\w+:\/\//.test(u) ? u : `https://${u}`;
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  onMessage: (m: RelayMessage) => void = () => {};
  onOpen: () => void = () => {};
  onClose: (code: number, fatal: boolean) => void = () => {};

  constructor(private relay: string, private room: string, private token: string) {}

  get open() { return this.ws?.readyState === WebSocket.OPEN; }

  connect() {
    this.stopped = false;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const base = relayBase(this.relay).replace(/^http/, 'ws');
    let ws: WebSocket;
    try { ws = new WebSocket(`${base}/r/${this.room}/ws?tok=${encodeURIComponent(this.token)}`); } catch { this.schedule(); return; }
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.onOpen(); };
    ws.onmessage = (ev) => { try { this.onMessage(JSON.parse(String(ev.data))); } catch { /* ignore bad frame */ } };
    ws.onclose = (ev) => {
      this.ws = null;
      const fatal = ev.code === 4003 || ev.code === 4004;
      this.onClose(ev.code, fatal);
      if (!fatal && !this.stopped) this.schedule();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.stopped) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.retry++, 5)) * (0.75 + Math.random() / 2);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  /** Try again now (e.g. the browser just came back online). */
  kick() { if (!this.open && !this.stopped) { clearTimeout(this.timer); this.retry = 0; this.connect(); } }

  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  send(m: RelayMessage): boolean {
    if (!this.open) return false;
    this.ws!.send(JSON.stringify(m));
    return true;
  }

  async http(method: string, path: string, body?: string | Uint8Array | object): Promise<HttpResult> {
    const headers: Record<string, string> = { 'x-token': this.token };
    let b: BodyInit | undefined;
    if (body instanceof Uint8Array) { b = body; headers['content-type'] = 'application/octet-stream'; }
    else if (typeof body === 'string') { b = body; headers['content-type'] = 'text/plain'; }
    else if (body) { b = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    return fetch(`${relayBase(this.relay)}/r/${this.room}/${path}`, { method, headers, body: b });
  }
}

/** Creates a room on the relay (owner only). */
export async function initRoom(relay: string, room: string, adminHash: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${relayBase(relay)}/r/${room}/init`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adminHash }) });
  } catch {
    throw new Error("Couldn't reach the relay. Check the address and your connection.");
  }
  if (!res.ok) throw new Error(`The relay refused to create the project (${res.status}).`);
}
