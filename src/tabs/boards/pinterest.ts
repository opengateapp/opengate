import { create } from 'zustand';
import type { BoardItem } from '../../model/types';
import { imageItemFromBlob, imageItemFromUrl, makeItem, IMAGE_WIDTH } from './boardOps';

// Pinterest board import. Pinterest has no open API for reading boards, so a bookmarklet
// runs on pinterest.com (where you're signed in), collects the board's pins and sections
// with their source links, and hands them to Open Gate with postMessage (or the clipboard).

export interface PinData {
  id: string;
  title: string;
  description: string;
  image: string;
  /** Original website the pin links to ("" for pins uploaded straight to Pinterest). */
  link: string;
  pinUrl: string;
  /** Downsized copy made by the bookmark on pinterest.com (when Pinterest allows it). */
  data?: string;
}

export interface PinterestExport {
  source: 'pinterest';
  board: { name: string; url: string };
  sections: { name: string; pins: PinData[] }[];
  /** True when the page had to be scraped instead of read through Pinterest's own data calls. */
  scraped?: boolean;
  /** How parts were read (shown in the import dialog when something used a fallback). */
  notes?: string[];
}

export function isPinterestExport(x: unknown): x is PinterestExport {
  const e = x as PinterestExport;
  return !!e && e.source === 'pinterest' && Array.isArray(e.sections);
}

/** Incoming import waiting for the user to confirm (set by the postMessage receiver). */
export const usePinterestInbox = create<{ pending: PinterestExport | null; set: (p: PinterestExport | null) => void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));

/**
 * Bookmarklet source. Kept as a plain function so it can be stringified; it must not
 * reference anything outside itself except APP_ORIGIN, substituted when the link is built.
 */
function bookmarklet() {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const APP = '__APP_ORIGIN__';
  const APP_URL = '__APP_URL__'; // can be under a path, e.g. a GitHub Pages project site
  const say = (m: string) => {
    let el = document.getElementById('slateline-pin-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'slateline-pin-status';
      el.setAttribute('style', 'position:fixed;z-index:2147483647;top:16px;right:16px;background:#18181b;color:#fff;font:600 14px system-ui;padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.35);max-width:380px;white-space:pre-line');
      document.body.appendChild(el);
    }
    el.textContent = m;
  };
  type Pin = { id: string; title: string; description: string; image: string; link: string; pinUrl: string; data?: string };
  const pin = (p: any): Pin => {
    const imgs = p.images || {};
    const best = imgs.orig || imgs['736x'] || imgs['564x'] || imgs['474x'] || Object.values(imgs)[0] || {};
    return {
      id: String(p.id), title: p.grid_title || p.title || '', description: String(p.description || p.closeup_unified_description || '').trim(), image: best.url || '',
      link: p.link || (p.rich_summary && p.rich_summary.url) || '', pinUrl: `https://www.pinterest.com/pin/${p.id}/`,
    };
  };
  /** Every pin-shaped object (has an id and images) anywhere inside some JSON. */
  const pinsIn = (root: any): Pin[] => {
    const out = new Map<string, Pin>();
    const walk = (o: any, depth: number) => {
      if (!o || typeof o !== 'object' || depth > 40) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      if (o.id && o.images && typeof o.images === 'object' && (o.images.orig || o.images['736x'] || o.images['474x']) && /^\d+$/.test(String(o.id))) {
        const p = pin(o);
        if (p.image && !out.has(p.id)) out.set(p.id, p);
      }
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(root, 0);
    return [...out.values()];
  };
  /** The JSON Pinterest embeds in its pages (works on fetched HTML too). */
  const pageJson = (doc: Document): any[] => {
    const out: any[] = [];
    doc.querySelectorAll('script[type="application/json"], script#__PWS_DATA__, script#__PWS_INITIAL_PROPS__').forEach((s) => {
      try { out.push(JSON.parse(s.textContent || '')); } catch { /* skip */ }
    });
    return out;
  };

  (async () => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (!/pinterest\./.test(location.hostname) || parts.length < 2 || parts[0] === 'pin') {
      say('Open one of your Pinterest boards (pinterest.com/you/board-name), then click “Send to Open Gate” again.');
      return;
    }
    const [user, slug, sectionSlug] = parts;
    say('Open Gate: reading board…');
    const resource = async (name: string, options: Record<string, unknown>) => {
      const url = `/resource/${name}/get/?source_url=${encodeURIComponent(location.pathname)}&data=${encodeURIComponent(JSON.stringify({ options, context: {} }))}`;
      const r = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Pinterest-PWS-Handler': 'www/[username]/[slug].js' } });
      if (!r.ok) throw new Error(`${name} ${r.status}`);
      return (await r.json()).resource_response;
    };
    const paged = async (name: string, options: Record<string, unknown>, label: string) => {
      let out: any[] = [];
      let bookmark: string | undefined;
      for (let i = 0; i < 80; i++) {
        const rr = await resource(name, { ...options, page_size: 100, bookmarks: bookmark ? [bookmark] : undefined });
        out = out.concat(rr.data || []);
        bookmark = rr.bookmark;
        say(`Open Gate: ${label} — ${out.length} pins…`);
        if (!bookmark || bookmark === '-end-') break;
      }
      return out;
    };
    /** Pins of a page we fetch as HTML (fallback when the data calls fail). */
    const htmlPins = async (path: string) => {
      const r = await fetch(path, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      return pinsIn(pageJson(doc));
    };
    /** Section tiles on the board page: links to /user/board/section/ (with the pin count shown on the tile). */
    const sectionLinks = () => {
      const seen = new Map<string, { name: string; count?: number }>();
      document.querySelectorAll('a[href]').forEach((a) => {
        const href = (a.getAttribute('href') || '').split('?')[0];
        const p = href.split('/').filter(Boolean);
        if (p.length === 3 && p[0] === user && p[1] === slug && !['pins', 'more_ideas', 'organize', 'followers', '_tools'].includes(p[2])) {
          const text = a.textContent || '';
          const name = text.replace(/[\d,.]+\s*k?\s*(pins?|sections?).*$/i, '').trim() || p[2].replace(/-/g, ' ');
          const count = Number((text.match(/([\d,]+)\s*pins?/i)?.[1] ?? '').replace(/,/g, '')) || undefined;
          if (!seen.has(p[2])) seen.set(p[2], { name, count });
        }
      });
      return [...seen.entries()].map(([s, v]) => ({ slug: s, name: v.name, count: v.count }));
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    /** "More ideas" / "More like this": Pinterest's suggestions start here, so pins after it aren't the board's. */
    const suggestionsStart = (doc: Document): Element | null => {
      for (const el of Array.from(doc.querySelectorAll('h1, h2, h3, h4, [role="heading"], [data-test-id*="more-ideas"], [data-test-id*="moreIdeas"]'))) {
        if (/^(more ideas|more like this|find more ideas|more to explore|ideas you might love)/i.test((el.textContent || '').trim())) return el;
      }
      return null;
    };
    /** Pins rendered in a document, in order, stopping at the suggestions. */
    const renderedPins = (doc: Document, into: Map<string, Pin>) => {
      const stop = suggestionsStart(doc);
      doc.querySelectorAll('a[href*="/pin/"]').forEach((a) => {
        if (stop && (stop.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
        const m = (a.getAttribute('href') || '').match(/\/pin\/(\d+)/);
        const img = a.querySelector('img');
        if (!m || !img || into.has(m[1])) return;
        const srcset = img.getAttribute('srcset') || '';
        const big = srcset.split(',').map((x) => x.trim().split(' ')[0]).filter(Boolean).pop() || img.src;
        into.set(m[1], { id: m[1], title: img.alt || '', description: '', image: big, link: '', pinUrl: `https://www.pinterest.com/pin/${m[1]}/` });
      });
      return !!stop;
    };
    /** Scrolls a window until no new pins appear (or the expected count / the suggestions are reached). */
    const scrollCollect = async (win: Window, doc: Document, label: string, expected?: number) => {
      const seen = new Map<string, Pin>();
      let idle = 0;
      for (let i = 0; i < 150 && idle < 5; i++) {
        const before = seen.size;
        const atSuggestions = renderedPins(doc, seen);
        say(`Open Gate: ${label} — ${seen.size}${expected ? ` of ${expected}` : ''} pins…`);
        if ((expected && seen.size >= expected) || (atSuggestions && seen.size === before && i > 2)) break;
        win.scrollBy(0, Math.max(600, win.innerHeight * 0.9));
        await sleep(650);
        idle = seen.size === before ? idle + 1 : 0;
      }
      const list = [...seen.values()];
      return expected ? list.slice(0, expected) : list;
    };
    /** Opens a section in an invisible same-site frame and reads the pins it renders. */
    const framePins = (path: string, label: string, expected?: number) => new Promise<Pin[]>((resolve) => {
      const f = document.createElement('iframe');
      // On screen (pages only render pins that are in view) but invisible and click-through.
      f.setAttribute('style', 'position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0.01;pointer-events:none;z-index:2147483640');
      let done = false;
      const finish = (pins: Pin[]) => { if (done) return; done = true; f.remove(); resolve(pins); };
      f.onload = async () => {
        try {
          await sleep(1500);
          finish(await scrollCollect(f.contentWindow!, f.contentDocument!, label, expected));
        } catch { finish([]); }
      };
      setTimeout(() => finish([]), 120000);
      f.src = path;
      document.body.appendChild(f);
    });

    const data: { source: 'pinterest'; board: { name: string; url: string }; sections: { name: string; pins: Pin[] }[]; scraped?: boolean; notes: string[] } =
      { source: 'pinterest', board: { name: document.title.replace(/\s*[|-].*$/, ''), url: `https://www.pinterest.com/${user}/${slug}/` }, sections: [], notes: [] };

    let boardId: string | undefined;
    try {
      const board = (await resource('BoardResource', { username: user, slug, field_set_key: 'detailed' })).data;
      boardId = board.id;
      data.board = { name: board.name, url: `https://www.pinterest.com${board.url}` };
    } catch { data.notes.push('board info from page'); }

    // 1) Sections, three ways: the sections data call, the board page JSON, the section tiles on the page.
    let sections: { id?: string; slug: string; name: string; count?: number }[] = [];
    if (boardId) {
      try {
        sections = ((await paged('BoardSectionsResource', { board_id: boardId }, 'sections')) as any[])
          .map((s) => ({ id: s.id, slug: s.slug, name: s.title }));
      } catch { /* try the next way */ }
    }
    if (!sections.length) {
      const fromJson = new Map<string, { id?: string; slug: string; name: string }>();
      const walk = (o: any, d: number) => {
        if (!o || typeof o !== 'object' || d > 30) return;
        if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
        if (o.type === 'board_section' && o.slug && o.title) fromJson.set(o.slug, { id: o.id, slug: o.slug, name: o.title });
        for (const k in o) walk(o[k], d + 1);
      };
      walk(pageJson(document), 0);
      sections = [...fromJson.values()];
    }
    const tiles = sectionLinks();
    if (!sections.length) sections = tiles;
    for (const s of sections) s.count ??= tiles.find((t) => t.slug === s.slug)?.count;
    if (sectionSlug) sections = sections.filter((s) => s.slug === sectionSlug).concat(sections.some((s) => s.slug === sectionSlug) ? [] : [{ slug: sectionSlug, name: sectionSlug.replace(/-/g, ' ') }]);

    // 2) Pins that aren't in a section.
    if (!sectionSlug) {
      let loose: Pin[] = [];
      if (boardId) {
        try {
          loose = (await paged('BoardFeedResource', { board_id: boardId, board_url: `/${user}/${slug}/`, field_set_key: 'react_grid_pin', filter_section_pins: true }, 'board'))
            .filter((p) => p && p.images).map(pin);
        } catch { /* fall back */ }
      }
      if (!loose.length) {
        window.scrollTo(0, 0);
        loose = await scrollCollect(window, document, 'board');
        window.scrollTo(0, 0);
        if (loose.length) data.notes.push('board pins read from the page');
      }
      if (!loose.length) {
        try { loose = await htmlPins(`/${user}/${slug}/`); } catch { /* ignore */ }
      }
      if (loose.length) data.sections.push({ name: '', pins: loose });
    }

    // 3) Each section's pins.
    for (const s of sections) {
      say(`Open Gate: section “${s.name}”…`);
      let pins: Pin[] = [];
      let id = s.id;
      if (!id) {
        try { id = (await resource('BoardSectionResource', { board_slug: slug, section_slug: s.slug, username: user })).data?.id; } catch { /* ignore */ }
      }
      if (id) {
        for (const opts of [{ section_id: id }, { section_id: id, field_set_key: 'react_grid_pin', redux_normalize_feed: true }]) {
          if (pins.length) break;
          try { pins = (await paged('BoardSectionPinsResource', opts, s.name)).filter((p) => p && p.images).map(pin); } catch { /* next way */ }
        }
      }
      if (!pins.length) {
        pins = await framePins(`/${user}/${slug}/${s.slug}/`, `section “${s.name}”`, s.count);
        if (pins.length) data.notes.push(`“${s.name}” read from its page`);
      }
      if (!pins.length) {
        try { pins = await htmlPins(`/${user}/${slug}/${s.slug}/`); } catch { /* ignore */ }
      }
      if (!pins.length) data.notes.push(`couldn't read the pins in “${s.name}”`);
      data.sections.push({ name: s.name, pins });
    }
    // A pin shown on the board page may also sit in a section: keep it only in its section.
    const inSections = new Set(data.sections.filter((x) => x.name).flatMap((x) => x.pins.map((p) => p.id)));
    for (const x of data.sections) if (!x.name) x.pins = x.pins.filter((p) => !inSections.has(p.id));

    // 4) Last resort: scroll the page and read the pins that render.
    if (!data.sections.some((x) => x.pins.length)) {
      window.scrollTo(0, 0);
      data.sections = [{ name: '', pins: await scrollCollect(window, document, 'reading pins from the page') }];
      data.scraped = true;
    }

    // Copies: try to save a downsized copy of each image (so the board doesn't depend on Pinterest later).
    const all = data.sections.flatMap((s) => s.pins);
    const copy = async (p: Pin) => {
      const r = await fetch(p.image, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) throw new Error(String(r.status));
      const bmp = await createImageBitmap(await r.blob());
      const sc = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      (p as Pin & { data?: string }).data = c.toDataURL('image/jpeg', 0.82);
    };
    if (all.length) {
      let ok = true;
      try { await copy(all[0]); } catch { ok = false; data.notes.push('images linked to Pinterest (copies not allowed)'); }
      for (let i = 1; ok && i < all.length; i += 6) {
        say(`Open Gate: copying images ${Math.min(i + 6, all.length)} / ${all.length}…`);
        await Promise.all(all.slice(i, i + 6).map((p) => copy(p).catch(() => undefined)));
      }
    }
    const total = data.sections.reduce((a, s) => a + s.pins.length, 0);
    const named = data.sections.filter((s) => s.name).length;
    // The clipboard copy leaves out image data (too big to paste); the direct hand-off keeps it.
    const json = JSON.stringify(data, (k, v) => (k === 'data' ? undefined : v));
    try { await navigator.clipboard.writeText(json); } catch { /* clipboard may be blocked */ }
    say(`Open Gate: sending ${total} pins in ${named} section${named === 1 ? '' : 's'}…`);
    const w = window.open(`${APP_URL}#pinterest`, 'slateline');
    let acked = false;
    const onMsg = (e: MessageEvent) => {
      if (e.origin === APP && e.data && e.data.type === 'slateline-pinterest-ack') {
        acked = true;
        say(`Open Gate: sent ${total} pins in ${named} section${named === 1 ? '' : 's'} ✓\nConfirm the import in Open Gate.`);
      }
    };
    window.addEventListener('message', onMsg);
    for (let i = 0; i < 60 && !acked; i++) {
      try { w?.postMessage({ type: 'slateline-pinterest', data }, APP); } catch { /* window not ready */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!acked) say(`Open Gate didn't answer. The ${total} pins are copied — in Open Gate open Visualize → Mood Boards → Import Pinterest → paste.`);
  })().catch((e) => say(`Open Gate import failed: ${e && e.message}`));
}

/** `appUrl` is the app's full address (origin + path); messages are checked against its origin. */
export function bookmarkletHref(appUrl: string): string {
  const u = new URL(appUrl);
  const page = u.origin + u.pathname.replace(/[^/]*$/, '');
  const src = `(${bookmarklet.toString()})()`.replace('__APP_ORIGIN__', u.origin).replace('__APP_URL__', page);
  return 'javascript:' + encodeURIComponent(src);
}

/** Lays a Pinterest export out on the board: one section frame per Pinterest section, images in a grid inside. */
export async function pinterestToItems(
  data: PinterestExport, origin: { x: number; y: number },
  onProgress: (done: number, total: number) => void,
): Promise<BoardItem[]> {
  const items: BoardItem[] = [];
  const COLS = 5;
  const GAP = 20;
  const total = data.sections.reduce((a, s) => a + s.pins.length, 0);
  let done = 0;
  let y = origin.y;
  for (const s of data.sections) {
    if (!s.pins.length) continue;
    const top = y;
    const inner: BoardItem[] = [];
    const colY = Array(COLS).fill(top + 56);
    // Fetch a few at a time.
    for (let i = 0; i < s.pins.length; i += 6) {
      const batch = s.pins.slice(i, i + 6);
      const meta = (pin: PinData) => ({ caption: pin.title || pin.description.slice(0, 120) || undefined, sourceUrl: pin.link || undefined, pinUrl: pin.pinUrl });
      const fromData = async (pin: PinData) => imageItemFromBlob(await (await fetch(pin.data!)).blob(), 0, 0, meta(pin));
      const made = await Promise.all(batch.map((pin) => (pin.data ? fromData(pin) : imageItemFromUrl(pin.image, 0, 0, {
        caption: pin.title || pin.description.slice(0, 120) || undefined,
        sourceUrl: pin.link || undefined,
        pinUrl: pin.pinUrl,
      })).catch(() => null)));
      for (const it of made) {
        done++;
        if (!it) continue;
        // Masonry: drop each image into the shortest column.
        const c = colY.indexOf(Math.min(...colY));
        it.x = origin.x + 24 + c * (IMAGE_WIDTH + GAP);
        it.y = colY[c];
        colY[c] += it.h + GAP + (it.caption ? 22 : 0);
        inner.push(it);
      }
      onProgress(done, total);
    }
    const height = Math.max(...colY) - top + 8;
    const frame = makeItem('frame', 0, 0, {
      caption: s.name || (data.sections.length > 1 ? 'General' : data.board.name),
      x: origin.x, y: top, w: COLS * (IMAGE_WIDTH + GAP) + 28, h: height,
      sourceUrl: data.board.url,
    });
    items.push(frame, ...inner);
    y = top + height + 80;
  }
  return items;
}
