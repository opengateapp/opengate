import { describe, expect, it } from 'vitest';
import { readTransfer, makeItem, bounds, isProbablyImageUrl } from './tabs/boards/boardOps';
import { bookmarkletHref, isPinterestExport } from './tabs/boards/pinterest';
import { inviteUrl, parseInvite, relayHost } from './sync/links';
import { parseVCards } from './tabs/ContactsTab';
import { migrate } from './store/migrate';
import { mediaIds } from './io/files';
import { newProject } from './model/defaults';

function dt(data: Record<string, string>): DataTransfer {
  return {
    files: [] as unknown as FileList,
    getData: (k: string) => data[k] ?? '',
    types: Object.keys(data),
  } as unknown as DataTransfer;
}

describe('board drop / paste parsing', () => {
  it('reads an image dragged from a web page, keeping the page link', () => {
    const c = readTransfer(dt({ 'text/html': '<a href="https://site.com/page"><img src="https://cdn.site.com/a.jpg" alt="Neon diner"></a>', 'text/uri-list': 'https://cdn.site.com/a.jpg' }));
    expect(c.images).toEqual([{ url: 'https://cdn.site.com/a.jpg', source: 'https://site.com/page', caption: 'Neon diner' }]);
  });
  it('treats image URLs as images and other URLs as link cards', () => {
    expect(readTransfer(dt({ 'text/uri-list': 'https://x.com/pic.png' })).images).toHaveLength(1);
    expect(readTransfer(dt({ 'text/plain': 'https://www.imdb.com/title/tt0068646/' })).links).toEqual(['https://www.imdb.com/title/tt0068646/']);
    expect(readTransfer(dt({ 'text/plain': 'warm tungsten, smoky' })).text).toBe('warm tungsten, smoky');
    expect(isProbablyImageUrl('https://i.pinimg.com/originals/ab/cd/ef.jpg')).toBe(true);
  });
  it('makes items centered on the click point and measures bounds', () => {
    const a = makeItem('note', 100, 100);
    expect(a.x + a.w / 2).toBe(100);
    const b = makeItem('swatch', 400, 300);
    expect(bounds([a, b])).toEqual({ x: a.x, y: a.y, w: b.x + b.w - a.x, h: b.y + b.h - a.y });
  });
});

describe('pinterest bookmarklet', () => {
  it('is valid JavaScript with the app origin baked in', () => {
    const href = bookmarkletHref('http://localhost:5173');
    expect(href.startsWith('javascript:')).toBe(true);
    const src = decodeURIComponent(href.slice('javascript:'.length));
    expect(src).toContain('http://localhost:5173');
    expect(() => new Function(src)).not.toThrow();
  });
  it('opens the app under its path (GitHub Pages project sites)', () => {
    const src = decodeURIComponent(bookmarkletHref('https://me.github.io/open-gate/index.html').slice('javascript:'.length));
    expect(src).toMatch(/APP_URL = ["']https:\/\/me\.github\.io\/open-gate\/["']/);
    expect(src).toMatch(/APP = ["']https:\/\/me\.github\.io["']/);
  });
  it('recognizes exported boards', () => {
    expect(isPinterestExport({ source: 'pinterest', board: { name: 'x', url: '' }, sections: [] })).toBe(true);
    expect(isPinterestExport({ sections: [] })).toBe(false);
  });
});

describe('invite links', () => {
  it('round-trips relay, room, token, key and access, all after the #', () => {
    const inv = { relay: 'https://relay.example.workers.dev', room: 'abcdefghijklmnopqrst', token: 'tok', key: 'k3y', projectId: 'p1', title: 'Look & feel', write: ['breakdown', 'script'] };
    const link = inviteUrl(inv, 'https://opengate.app/');
    expect(link.startsWith('https://opengate.app/#join=')).toBe(true);
    expect(link.split('#')[0]).not.toContain('tok');
    expect(parseInvite(link)).toEqual(inv);
    expect(parseInvite('#join=garbage')).toBeNull();
  });
  it('carries the budget key only in links that share the budget', async () => {
    const base = { relay: 'https://r.dev', room: 'abcdefghijklmnopqrst', token: 't', key: 'k', projectId: 'p', title: 'x', write: ['*'] };
    expect(parseInvite(inviteUrl(base, 'https://a/'))).toEqual(base);
    expect(parseInvite(inviteUrl({ ...base, budgetKey: 'bk' }, 'https://a/'))?.budgetKey).toBe('bk');
    const { useSync, canWrite, budgetVisible } = await import('./sync/state');
    useSync.setState({ write: ['*'], admin: false, budget: false });
    expect(canWrite('plan')).toBe(true);
    expect(canWrite('budget')).toBe(false); // "everything" never includes the budget
    expect(budgetVisible()).toBe(false);
    useSync.setState({ write: ['budget'], budget: true });
    expect(canWrite('budget')).toBe(true);
    expect(budgetVisible()).toBe(true);
    useSync.setState({ write: null, admin: false, budget: true });
  });
  it('turns relay addresses into websocket hosts', () => {
    expect(relayHost('open-gate-relay.me.workers.dev')).toEqual({ host: 'open-gate-relay.me.workers.dev', protocol: 'wss' });
    expect(relayHost('http://localhost:8787')).toEqual({ host: 'localhost:8787', protocol: 'ws' });
    expect(relayHost('')).toBeNull();
  });
});

describe('contacts', () => {
  it('reads vCards', () => {
    const cards = parseVCards('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ana Ruiz\r\nORG:Ruiz Grip & Electric\r\nTITLE:Key Grip\r\nTEL;TYPE=CELL:555-0101\r\nEMAIL:ana@example.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:Lee;Sam;;;\r\nEND:VCARD');
    expect(cards[0]).toMatchObject({ name: 'Ana Ruiz', company: 'Ruiz Grip & Electric', role: 'Key Grip', phone: '555-0101', email: 'ana@example.com' });
    expect(cards[1].name).toBe('Sam Lee');
  });
});

describe('project migration', () => {
  it('adds plan, docs, A/V and boards to older projects', () => {
    const old = { ...newProject('Old') } as Record<string, unknown>;
    for (const k of ['contacts', 'tasks', 'docs', 'avScripts', 'boards']) delete old[k];
    const p = migrate(old);
    expect(p.boards).toEqual([]);
    expect(p.tasks).toEqual([]);
    expect(p.schemaVersion).toBe(5);
    expect(p.characters).toEqual([]);
    expect(p.budget.accounts.length).toBeGreaterThan(20);
    expect(p.budget.lines).toEqual([]);
  });
  it('bundles board images and location photos in project files', () => {
    const p = newProject('x');
    p.boards.push({ id: 'b', title: 'b', kind: 'mood', items: [makeItem('image', 0, 0, { imageId: 'img1' })], updatedAt: '' });
    p.locations.push({ id: 'l', setName: '', realName: '', address: '', photoIds: ['ph1'] });
    expect(mediaIds(p).sort()).toEqual(['img1', 'ph1']);
  });
});

describe('appearance', () => {
  it('writes custom colors, including the logo color, for one mode', async () => {
    const { paletteCss } = await import('./theme');
    const css = paletteCss('dark', { accent: '#ff0000', logo: '#00ff00' });
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('--accent:#ff0000');
    expect(css).toContain('--logo:#00ff00');
    expect(paletteCss('light', {})).toBe('');
  });
  it('saves, exports and imports named themes', async () => {
    const { useTheme, exportThemes, parseThemes } = await import('./theme');
    useTheme.setState({ light: { accent: '#112233' }, dark: { bg: '#000000', accent: '#ffcc00' }, saved: [] });
    useTheme.getState().saveTheme('Night shoot');
    const [th] = useTheme.getState().saved;
    expect(th).toMatchObject({ name: 'Night shoot', light: { accent: '#112233' }, dark: { accent: '#ffcc00' } });
    const file = JSON.parse(exportThemes(useTheme.getState().saved));
    expect(file.themes).toEqual([{ name: 'Night shoot', light: { accent: '#112233' }, dark: { bg: '#000000', accent: '#ffcc00' } }]);
    // Same colors again are skipped; a different theme with a taken name gets a number.
    expect(useTheme.getState().importThemes(file)).toBe(0);
    expect(useTheme.getState().importThemes({ themes: [{ name: 'Night shoot', light: { accent: '#abcdef' }, dark: {} }] })).toBe(1);
    expect(useTheme.getState().saved.map((t) => t.name)).toEqual(['Night shoot', 'Night shoot 2']);
    // Junk is dropped.
    expect(parseThemes([{ name: 'x', light: { accent: 'red; } body { display:none' } }, 42])).toEqual([{ id: expect.any(String), name: 'x', light: {}, dark: {} }]);
  });
});

describe('A/V import from the screenplay', () => {
  it('makes a segment per scene, action as video and dialogue as audio', async () => {
    const { produce } = await import('immer');
    const { parseFountain } = await import('./io/fountain');
    const { applyImportedScript } = await import('./io/applyImport');
    const { SAMPLE_FOUNTAIN } = await import('./model/sample');
    const { derive } = await import('./script/derive');
    const { avRowsFromScript } = await import('./script/avImport');
    const p = produce(newProject('x'), (dr) => { applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN)); });
    const d = derive(p.scriptDoc);
    const heads = avRowsFromScript(d, 'headings');
    expect(heads.map((r) => r.segment)).toEqual(d.scenes.map((s) => `${s.number}. ${s.heading}`));
    const full = avRowsFromScript(d, 'full');
    const first = full.filter((r) => r.sceneId === d.scenes[0].id);
    expect(first[0].segment).toBe('1. EXT. DRIVE-IN THEATER - DUSK');
    expect(first.some((r) => r.video.startsWith('An abandoned drive-in'))).toBe(true);
    expect(full.some((r) => r.audio.includes("MAYA: Forty years and it's still standing."))).toBe(true);
    expect(full.some((r) => r.audio.includes('THEO (wheezing): Barely. Like me.'))).toBe(true);
    // Re-import skips scenes already there.
    const again = avRowsFromScript(d, 'headings', new Set(d.scenes.slice(0, 3).map((s) => s.id)));
    expect(again.map((r) => r.sceneId)).toEqual(d.scenes.slice(3).map((s) => s.id));
  });
});
