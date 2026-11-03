import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProjectMenu } from './components/ProjectMenu';
import { newProject } from './model/defaults';
import { useStore } from './store/project';
import { saveProject } from './store/db';
import { setChannelFormat } from './sync/channels';
import { useSync } from './sync/state';

vi.mock('./store/db', async (orig) => ({ ...(await orig<object>()), saveProject: vi.fn(async () => {}) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
async function mount() {
  const host = document.body.appendChild(document.createElement('div'));
  await act(async () => { root = createRoot(host); root.render(<ProjectMenu />); });
  return host;
}
const fileItems = async (host: HTMLElement) => {
  await act(async () => { host.querySelector<HTMLButtonElement>('.file-btn')!.click(); });
  return [...host.querySelectorAll('.menu button')].map((b) => b.textContent);
};

beforeEach(() => { vi.mocked(saveProject).mockClear(); useStore.setState({ project: newProject('Film') }); localStorage.setItem('slateline.last', 'x'); });
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  useStore.setState({ project: null });
  useSync.setState({ write: null, admin: false, budget: true, hidden: undefined });
  setChannelFormat(1);
});

describe('Home and File', () => {
  it('the logo saves, then goes Home', async () => {
    const host = await mount();
    const logo = host.querySelector<HTMLButtonElement>('button.logo')!;
    expect(logo.getAttribute('aria-label')).toBe('Home');
    await act(async () => { logo.click(); });
    expect(saveProject).toHaveBeenCalled();
    expect(useStore.getState().project).toBeNull();
    expect(localStorage.getItem('slateline.last')).toBeNull();
  });

  it('a failed save keeps the project open', async () => {
    vi.mocked(saveProject).mockRejectedValueOnce(new Error('Disk full'));
    const host = await mount();
    await act(async () => { host.querySelector<HTMLButtonElement>('button.logo')!.click(); });
    expect(useStore.getState().project?.title).toBe('Film');
    expect(localStorage.getItem('slateline.last')).toBe('x');
  });

  it('File holds saving, importing and exports, and no "All projects"', async () => {
    const items = await fileItems(await mount());
    expect(items[0]).toContain('Save');
    for (const x of ['Import screenplay…', 'Export screenplay PDF', 'Export Fountain', 'Export Final Draft (.fdx)', 'All exports…']) expect(items).toContain(x);
    expect(items.join()).not.toContain('All projects');
  });

  it('All exports… opens Exports, and goes away when that tab is hidden', async () => {
    const seen: string[] = [];
    const go = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('opengate:goto', go);
    const host = await mount();
    await fileItems(host);
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('.menu button')].find((b) => b.textContent === 'All exports…')!.click(); });
    window.removeEventListener('opengate:goto', go);
    expect(seen).toEqual(['reports']);

    setChannelFormat(2);
    useSync.setState({ write: [], admin: false, hidden: ['schedule'] });
    expect(await fileItems(host)).not.toContain('All exports…');
  });

  it('Escape closes File', async () => {
    const host = await mount();
    await fileItems(host);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(host.querySelector('.menu')).toBeNull();
  });
});
