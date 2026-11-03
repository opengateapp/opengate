import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ProjectMenu } from './components/ProjectMenu';
import { ProjectSidebar } from './components/ProjectSidebar';
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

  it('the row has File, Edit, View and Help, one open at a time', async () => {
    const host = await mount();
    const menu = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.menu-btn')].find((b) => b.textContent === name)!;
    expect([...host.querySelectorAll('.menu-btn')].map((b) => b.textContent)).toEqual(['File', 'Edit', 'View', 'Help']);
    await act(async () => { menu('Edit').click(); });
    expect(host.querySelector('.menu')!.textContent).toContain('Paste');
    await act(async () => { menu('View').click(); });
    expect(host.querySelectorAll('.menu')).toHaveLength(1);
    expect(host.querySelector('.menu')!.textContent).toContain('System');
    await act(async () => { menu('Help').click(); });
    expect(host.querySelector('.menu')!.textContent).toContain('FAQ');
  });
});

describe('the project sidebar', () => {
  const sections = [
    { id: 'write', label: 'Write', tabs: [{ id: 'screenplay', label: 'Screenplay', hint: '' }, { id: 'docs', label: 'Docs', hint: '' }] },
    { id: 'plan', label: 'Plan', tabs: [{ id: 'paperwork', label: 'Paperwork', hint: '' }] },
    { id: 'reference', label: 'Reference', tabs: [{ id: 'reference', label: 'Reference', hint: '' }] },
  ];
  async function side(collapsed: boolean) {
    const setTab = vi.fn();
    const onToggle = vi.fn();
    const host = document.body.appendChild(document.createElement('div'));
    await act(async () => { root = createRoot(host); root.render(<ProjectSidebar sections={sections} tab="docs" setTab={setTab} firstTabIn={(s) => s.tabs[0].id} collapsed={collapsed} onToggle={onToggle} />); });
    return { host, setTab, onToggle };
  }
  const named = (host: HTMLElement, name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent === name || b.getAttribute('aria-label') === name))!;

  it('opens the current section; other sections open on click, and tabs go there', async () => {
    const { host, setTab } = await side(false);
    expect(host.querySelector('[aria-current="page"]')!.textContent).toBe('Docs');
    expect(named(host, 'Paperwork')).toBeUndefined();
    await act(async () => { named(host, 'Plan').click(); });
    expect(host.textContent).toContain('private');
    expect(setTab).not.toHaveBeenCalled();
    await act(async () => { named(host, 'Screenplay').click(); });
    expect(setTab).toHaveBeenCalledWith('screenplay');
    await act(async () => { named(host, 'Reference').click(); });
    expect(setTab).toHaveBeenCalledWith('reference');
  });

  it('collapsed, a section icon goes to its tab, and the toggle says what it does', async () => {
    const { host, setTab, onToggle } = await side(true);
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Plan"]')!.click(); });
    expect(setTab).toHaveBeenCalledWith('paperwork');
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Expand sidebar"]')!.click(); });
    expect(onToggle).toHaveBeenCalled();
  });
});
