import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake Web Locks manager shared by "tabs" (module instances) in this test.
function fakeLocks() {
  const held = new Map<string, () => void>();
  return {
    held,
    request: (name: string, opts: LockOptions, cb: (l: Lock | null) => Promise<void> | undefined) => {
      if (held.has(name) && opts.ifAvailable) return Promise.resolve(cb(null));
      if (held.has(name) && opts.steal) held.get(name)!();
      let free!: () => void;
      const done = new Promise<void>((r) => { free = r; });
      held.set(name, free);
      const p = cb({ name, mode: 'exclusive' } as Lock);
      void (p ?? Promise.resolve()).then(() => { if (held.get(name) === free) held.delete(name); });
      return done;
    },
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('one tab edits a project at a time', () => {
  it('the second tab is read-only until it takes over, and the first steps back', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
    const a = await import('./store/tabLock?a' as string) as typeof import('./store/tabLock');
    expect(await a.claimProject('p1')).toBe(true);
    expect(a.useTabLock.getState().readOnly).toBe(false);
    vi.resetModules();
    const b = await import('./store/tabLock?b' as string) as typeof import('./store/tabLock');
    expect(await b.claimProject('p1')).toBe(false);
    expect(b.useTabLock.getState().readOnly).toBe(true);
    // A different project is free.
    expect(await b.claimProject('p2')).toBe(true);
  });

  it('read-only blocks every edit', async () => {
    const { useTabLock } = await import('./store/tabLock');
    const { canWrite } = await import('./sync/state');
    useTabLock.setState({ readOnly: true, projectId: 'x' });
    expect(canWrite('screenplay')).toBe(false);
    useTabLock.setState({ readOnly: false });
    expect(canWrite('screenplay')).toBe(true);
  });
});
