// @vitest-environment-options {"url":"https://www.pinterest.com/me/look/"}
import { describe, expect, it, vi } from 'vitest';
import { bookmarkletHref, type PinterestExport } from './tabs/boards/pinterest';

const APP = 'http://localhost:5173';
const pinJson = (id: string, title: string, link = '') => ({ id, title, grid_title: title, link, images: { orig: { url: `https://i.pinimg.com/originals/${id}.jpg` } } });

/** Runs the bookmarklet on a fake board page and returns what it sends to the app. */
async function run(routes: Record<string, unknown>, html = '') {
  document.body.innerHTML = html;
  let sent: PinterestExport | null = null;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const name = url.match(/^\/resource\/(\w+)\//)?.[1] ?? url;
    const body = routes[name];
    if (body === undefined) return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
    return { ok: true, status: 200, json: async () => ({ resource_response: body }), text: async () => String(body) };
  }));
  vi.spyOn(window, 'open').mockImplementation(() => ({
    postMessage: (msg: { data: PinterestExport }) => {
      sent = msg.data;
      window.dispatchEvent(new MessageEvent('message', { origin: APP, data: { type: 'slateline-pinterest-ack' } }));
    },
  }) as unknown as Window);
  const src = decodeURIComponent(bookmarkletHref(APP).slice('javascript:'.length));
  new Function(src)();
  for (let i = 0; i < 50 && !sent; i++) await new Promise((r) => setTimeout(r, 20));
  vi.unstubAllGlobals();
  return sent as PinterestExport | null;
}

describe('pinterest bookmarklet sections', () => {
  it('uses the sections data call when it works', async () => {
    const data = await run({
      BoardResource: { data: { id: 'B1', name: 'Look', url: '/me/look/' } },
      BoardSectionsResource: { data: [{ id: 'S1', slug: 'wardrobe', title: 'Wardrobe' }], bookmark: '-end-' },
      BoardFeedResource: { data: [pinJson('1', 'Neon')], bookmark: '-end-' },
      BoardSectionPinsResource: { data: [pinJson('2', 'Coat', 'https://shop.example/coat')], bookmark: '-end-' },
    });
    expect(data?.sections.map((s) => [s.name, s.pins.map((p) => p.id)])).toEqual([['', ['1']], ['Wardrobe', ['2']]]);
    expect(data?.sections[1].pins[0].link).toBe('https://shop.example/coat');
  });
  it('finds sections from the tiles on the page when the sections call fails', async () => {
    const data = await run({
      BoardResource: { data: { id: 'B1', name: 'Look', url: '/me/look/' } },
      BoardSectionResource: { data: { id: 'S9' } },
      BoardFeedResource: { data: [pinJson('1', 'Neon'), pinJson('3', 'Night')], bookmark: '-end-' },
      BoardSectionPinsResource: { data: [pinJson('3', 'Night')], bookmark: '-end-' },
    }, '<a href="/me/look/night-exteriors/">Night exteriors 12 pins</a><a href="/me/look/more_ideas/">More ideas</a><a href="/me/other/">x</a>');
    expect(data?.sections.map((s) => [s.name, s.pins.map((p) => p.id)])).toEqual([['', ['1']], ['Night exteriors', ['3']]]);
  });
});
