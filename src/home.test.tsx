import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HomeScreen } from './tabs/HomeScreen';
import { PROJECT_FOLDERS_URL } from './model/links';
import { accentText } from './theme';

vi.mock('./store/db', async (orig) => ({ ...(await orig<object>()), listProjects: async () => [{ id: 'p', title: 'A very long project name that should wrap', updatedAt: '2026-11-03T12:00:00Z' }] }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
async function mount() {
  const host = document.body.appendChild(document.createElement('div'));
  await act(async () => { root = createRoot(host); root.render(<HomeScreen />); });
  const nav = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.home-nav button')].find((b) => b.textContent!.startsWith(name))!;
  const go = (name: string) => act(async () => { nav(name).click(); });
  return { host, nav, go };
}
afterEach(() => { act(() => root?.unmount()); document.body.innerHTML = ''; });

describe('Home', () => {
  it('opens on Open Gate, with every way to start and the recent projects', async () => {
    const { host, nav } = await mount();
    expect(nav('Open Gate').getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('h1')!.textContent).toBe('Start a project');
    expect([...host.querySelectorAll('.home-card b')].map((b) => b.textContent)).toEqual(['New screenplay', 'Start from a budget', 'Import a screenplay', 'Open project file', 'Try the sample production']);
    expect(host.textContent).toContain('A very long project name');
    expect(host.querySelector('button[title="Delete project"]')).toBeTruthy();
    expect(host.querySelector('.credits')!.textContent).toContain('CineSched');
  });

  it('Project Folders links to its own page, in a new tab', async () => {
    const { host, go } = await mount();
    await go('Project Folders');
    const a = [...host.querySelectorAll('a')].find((x) => x.textContent!.startsWith('Get Project Folders'))!;
    expect(a.getAttribute('href')).toBe(PROJECT_FOLDERS_URL);
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
  });

  it('Resources is third, marked Coming soon, and links nowhere', async () => {
    const { host, nav, go } = await mount();
    expect([...host.querySelectorAll('.home-nav button')].map((b) => b.textContent)).toEqual(['Open Gate', 'Project Folders', 'ResourcesComing soon']);
    await go('Resources');
    expect(nav('Resources').getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.home-main h1')!.textContent).toBe('Resources');
    expect(host.querySelector('.home-inner')!.querySelectorAll('a[href]').length).toBe(0);
  });

  it('text on the accent is readable in every theme', () => {
    const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    expect(accentText('#c2410c')).toBe('#ffffff');
    expect(accentText('#fb923c')).toBe('#18181b');
    for (const c of ['#c2410c', '#fb923c', '#2563eb', '#7c3aed', '#15803d', '#ffff00', '#000000', '#ffffff', '#808080', '#777777']) expect(ratio(accentText(c), c)).toBeGreaterThanOrEqual(4.5);
  });
});
