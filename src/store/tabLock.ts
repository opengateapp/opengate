import { create } from 'zustand';

// One tab edits a project at a time. Each tab saves its whole copy of the project to IndexedDB, so
// two tabs editing the same project would overwrite each other (last save wins). The first tab to
// open a project holds a Web Lock on it; another tab opens it read-only with "Use it here", which
// asks the first tab to save and step back, then takes over. Browsers without Web Locks use a
// BroadcastChannel ping instead.

export interface TabLockState {
  /** This tab has the project open read-only because another tab of this browser is editing it. */
  readOnly: boolean;
  projectId?: string;
}

export const useTabLock = create<TabLockState>(() => ({ readOnly: false }));

const NAME = (id: string) => `opengate:project:${id}`;
type Msg = { t: 'who' | 'mine' | 'take' | 'released'; id: string; from: string };

const me = Math.random().toString(36).slice(2);
let channel: BroadcastChannel | null = null;
let release: (() => void) | null = null;
/** Saves this tab's copy before handing the project over (set by the store; avoids an import cycle). */
let beforeHandOver: () => Promise<void> = async () => {};
export function onHandOver(fn: () => Promise<void>) { beforeHandOver = fn; }

const locks = (): LockManager | undefined => (typeof navigator !== 'undefined' ? navigator.locks : undefined);

function bc(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel('opengate-tabs');
  channel.onmessage = (e: MessageEvent<Msg>) => void onMessage(e.data);
  return channel;
}
const post = (m: Omit<Msg, 'from'>) => bc()?.postMessage({ ...m, from: me });

async function onMessage(m: Msg) {
  if (!m || m.from === me) return;
  const { projectId, readOnly } = useTabLock.getState();
  if (m.id !== projectId) return;
  if (m.t === 'who' && !readOnly) post({ t: 'mine', id: m.id });
  if (m.t === 'take' && !readOnly) {
    // Another tab wants to edit: save, let go, and go read-only here.
    await beforeHandOver();
    release?.(); release = null;
    useTabLock.setState({ readOnly: true });
    post({ t: 'released', id: m.id });
  }
}

/** Holds the lock until `release` is called. Resolves with whether we got it. */
function hold(id: string, opts: LockOptions): Promise<boolean> {
  const lm = locks()!;
  return new Promise((done) => {
    void lm.request(NAME(id), opts, (lock) => {
      if (!lock) { done(false); return undefined; }
      done(true);
      return new Promise<void>((r) => { release = r; });
    }).catch(() => done(false));
  });
}

/** Opens a project in this tab: editable if no other tab has it, read-only otherwise. */
export async function claimProject(id: string): Promise<boolean> {
  release?.(); release = null;
  bc();
  useTabLock.setState({ projectId: id, readOnly: false });
  let got: boolean;
  if (locks()) got = await hold(id, { ifAvailable: true });
  else {
    // No Web Locks: ask the other tabs and wait briefly for an answer.
    got = await new Promise<boolean>((done) => {
      const c = bc();
      if (!c) { done(true); return; }
      const t = setTimeout(() => { c.removeEventListener('message', l); done(true); }, 300);
      const l = (e: MessageEvent<Msg>) => { if (e.data?.t === 'mine' && e.data.id === id && e.data.from !== me) { clearTimeout(t); c.removeEventListener('message', l); done(false); } };
      c.addEventListener('message', l);
      post({ t: 'who', id });
    });
  }
  if (useTabLock.getState().projectId === id) useTabLock.setState({ readOnly: !got });
  return got;
}

/** "Use it here": the other tab saves and steps back, then this tab edits. Resolves when it can edit. */
export async function takeOver(id: string): Promise<void> {
  const answered = new Promise<void>((done) => {
    const c = bc();
    if (!c) { done(); return; }
    const t = setTimeout(() => { c.removeEventListener('message', l); done(); }, 2000);
    const l = (e: MessageEvent<Msg>) => { if (e.data?.t === 'released' && e.data.id === id) { clearTimeout(t); c.removeEventListener('message', l); done(); } };
    c.addEventListener('message', l);
  });
  post({ t: 'take', id });
  await answered;
  // The other tab normally lets go; if it didn't answer (closed, frozen), take the lock anyway.
  if (locks()) await hold(id, { steal: true });
  useTabLock.setState({ projectId: id, readOnly: false });
}

/** Lets go when the project is closed in this tab. */
export function releaseProject() {
  release?.(); release = null;
  useTabLock.setState({ projectId: undefined, readOnly: false });
}
