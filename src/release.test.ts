import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { buildSampleProduction } from './model/sampleProduction';
import { newProject } from './model/defaults';
import { derive } from './script/derive';
import { joinFestivals, writeFestivals } from './budget/festivals';
import { laurels, pressKitHtml, pressKitView, pressPeople, pressSpecs } from './release/pressKit';
import { pressKitPdf } from './pdf/pressKitPdf';
import { DELIVERABLE_TEMPLATE, licenceCovers, missingDeliverables, scopeWarnings } from './release/distribution';
import { milestonePosts, missingMilestonePosts, unreleased } from './release/social';
import { btsItems } from './schedule/callsheet';
import { mediaIds, releaseMediaIds } from './io/files';
import { channelOf } from './sync/channels';
import { migrate } from './store/migrate';

const p = buildSampleProduction();
const d = derive(p.scriptDoc, p.sceneNumbersLocked);

describe('press kit', () => {
  it('fills from the project: logline from the bible, key crew then cast, specs, what’s missing', () => {
    const v = pressKitView(p, d);
    expect(v.logline).toBe(p.bible!.logline);
    const roles = pressPeople(p).map((x) => x.role);
    expect(roles.indexOf('Cast')).toBeGreaterThan(0);
    expect(roles.slice(0, roles.indexOf('Cast')).every((r) => r !== 'Cast')).toBe(true);
    const specs = Object.fromEntries(pressSpecs(p, d).map((s) => [s.label, s]));
    expect(specs['Shot on'].value).toBe('Sony a7S III');
    expect(specs['Runtime'].auto).toBe(true);
    expect(specs['Language'].value).toBe('English');
    expect(v.missing).toContain('stills'); // the sample media adds them in the browser
  });

  it('shows laurels from accepted festivals', () => {
    const q = produce(p, (dr) => { const l = joinFestivals(dr); l[0].status = 'accepted'; l[0].laurel = 'Winner: Best Short'; writeFestivals(dr, l, true); });
    expect(laurels(q)[0]).toMatchObject({ text: 'Winner: Best Short', festival: 'Northern Lights International Film Festival' });
  });

  it('makes a self-contained web page that escapes what you typed', () => {
    const q = produce(p, (dr) => { dr.pressKit!.directorStatement = '<script>alert(1)</script>'; dr.pressKit!.trailerUrl = 'javascript:alert(1)'; });
    const html = pressKitHtml(pressKitView(q, d), new Map());
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toMatch(/^<!doctype html>/);
  });

  it('makes a PDF', () => {
    expect(pressKitPdf(pressKitView(p, d), new Map()).getNumberOfPages()).toBeGreaterThan(0);
  });
});

describe('distribution', () => {
  it('reads what a licence covers', () => {
    expect(licenceCovers({ media: 'All media' })).toBe('all');
    expect([...(licenceCovers({ media: 'Festivals and online' }) as Set<string>)].sort()).toEqual(['festival', 'online', 'streaming']);
  });
  it('flags the sample song: festivals and online, but the TV channel wants a trailer', () => {
    const w = scopeWarnings(p);
    expect(w.some((x) => /Starlite Serenade/.test(x.text) && /tv/.test(x.text) && /trailer/.test(x.text))).toBe(true);
  });
  it('flags a licence that runs out before a release', () => {
    const q = produce(p, (dr) => { dr.budget.licenses![0].media = 'All media'; dr.budget.licenses![0].expires = '2027-01-01'; dr.outlets![0].releaseDate = '2028-01-01'; });
    expect(scopeWarnings(q).map((x) => x.text).join(' ')).toMatch(/expires 2027-01-01/);
  });
  it('the usual list is added once', () => {
    expect(missingDeliverables(p.deliverables!)).toEqual([]);
    expect(missingDeliverables([])).toHaveLength(DELIVERABLE_TEMPLATE.length);
  });
});

describe('social & BTS', () => {
  it('suggests posts for the milestones, once', () => {
    expect(milestonePosts(p).map((x) => x.milestone)).toEqual(expect.arrayContaining(['First shoot day', 'Wrap', 'Picture lock']));
    expect(missingMilestonePosts(p)).toEqual([]);
  });
  it('warns about people shown without a signed release, only for people who can see the paperwork', () => {
    const post = p.socialPosts!.find((x) => x.milestone === 'First shoot day')!;
    expect(unreleased(p, post, true)!.length).toBeGreaterThan(0);
    expect(unreleased(p, post, false)).toBeNull();
  });
  it('puts BTS to get on the call sheet of that shoot day', () => {
    const post = p.socialPosts!.find((x) => x.milestone === 'First shoot day')!;
    const day = p.schedule.days.find((x) => x.date === post.date)!;
    const items = btsItems(p, day, { id: 's', kind: 'bts', title: 'BTS', text: 'Wide of the rig\n' });
    expect(items.map((x) => x.what)).toEqual(['Wide of the rig', post.caption]);
  });
});

describe('release data', () => {
  it('syncs on the release channel (Plan in older rooms)', () => {
    for (const k of ['festivals', 'pressKit', 'socialPosts', 'deliverables', 'outlets']) {
      expect(channelOf(k, 2)).toBe('release');
      expect(channelOf(k, 1)).toBe('plan');
    }
  });
  it('keeps its pictures with the project file', () => {
    const q = produce(newProject('M'), (dr) => {
      dr.pressKit = { stills: ['s1'], posterId: 'po', photos: { 'cast:1': 'h1' }, specs: {}, contact: {} };
      dr.socialPosts = [{ id: 'x', platforms: [], caption: '', mediaIds: ['m1'], people: [], status: 'idea' }];
      dr.deliverables = [{ id: 'y', name: 'E&O', group: 'legal', status: 'done', fileId: 'f1' }];
    });
    expect(releaseMediaIds(q).sort()).toEqual(['f1', 'h1', 'm1', 'po', 's1']);
    expect(mediaIds(q)).toEqual(expect.arrayContaining(['f1', 'h1', 'm1', 'po', 's1']));
  });
  it('older projects get empty release lists', () => {
    const old = JSON.parse(JSON.stringify(newProject('O')));
    for (const k of ['festivals', 'socialPosts', 'deliverables', 'outlets']) delete old[k];
    const m = migrate(old);
    expect([m.festivals, m.socialPosts, m.deliverables, m.outlets]).toEqual([[], [], [], []]);
  });
});

describe('press kit laurels', () => {
  const accepted = produce(p, (dr) => {
    const l = joinFestivals(dr);
    l[0].status = 'accepted'; l[0].laurel = 'Winner: Best Short';
    l[1].status = 'accepted';
    writeFestivals(dr, l, true);
    dr.pressKit!.laurels = [
      { id: 'a', imageId: 'img-a', darkImageId: 'img-a-dark', festivalId: l[1].id, festival: '', text: '', include: true },
      { id: 'b', imageId: 'img-b', festival: 'Not on the list Fest', text: 'Finalist', year: '2027', include: false },
    ];
  });
  it('uses your images first, in your order, then accepted festivals without one as text', () => {
    const l = laurels(accepted);
    expect(l.map((x) => [x.festival, x.text, !!x.imageId])).toEqual([
      ['Prairie Light Film Festival', 'Official Selection', true],
      ['Northern Lights International Film Festival', 'Winner: Best Short', false],
    ]);
  });
  it('keeps laurel images with the project file', () => {
    expect(releaseMediaIds(accepted)).toEqual(expect.arrayContaining(['img-a', 'img-a-dark', 'img-b']));
  });
  it('puts the images on the web page (with the dark version) and in the PDF', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imgs = new Map([['img-a', png], ['img-a-dark', png]]);
    const v = pressKitView(accepted, d);
    const html = pressKitHtml(v, imgs);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('class="laurel"');
    expect(html).toContain('Winner: Best Short');
    expect(pressKitPdf(v, imgs).getNumberOfPages()).toBeGreaterThan(0);
  });
});

import { bufferCsv, calendarCsv, captionLength, composeUrl, overLimits } from './release/socialShare';

describe('social posting', () => {
  it('builds compose links where platforms support them', () => {
    expect(composeUrl('x', 'Day 1 & go')).toBe('https://x.com/intent/tweet?text=Day%201%20%26%20go');
    expect(composeUrl('threads', 'Hi')).toBe('https://www.threads.com/intent/post?text=Hi');
    expect(composeUrl('bluesky', 'Hi')).toBe('https://bsky.app/intent/compose?text=Hi');
    expect(composeUrl('instagram', 'Hi')).toBeUndefined();
    expect(composeUrl('linkedin', 'Hi')).toBeUndefined();
  });
  it('counts emoji once and warns per platform', () => {
    expect(captionLength('🎬🎬')).toBe(2);
    const long = 'a'.repeat(301);
    expect(overLimits({ caption: long, platforms: ['x', 'bluesky', 'threads', 'instagram'] }).map((o) => o.label)).toEqual(['X', 'Bluesky']);
  });
  it('exports the calendar, and Buffer’s format', () => {
    const posts = [
      { id: 'a', date: '2027-01-02', milestone: 'Wrap', platforms: ['instagram' as const], caption: 'That’s a wrap, "everyone"', mediaIds: ['m1'], people: [], status: 'idea' as const },
      { id: 'b', platforms: ['x' as const], caption: 'Old news', mediaIds: [], people: [], status: 'posted' as const },
    ];
    const cal = calendarCsv(posts, (id) => (id === 'm1' ? 'media/wrap 1.jpg' : undefined));
    expect(cal.split('\r\n')[0]).toBe('Date,Time,Platforms,Milestone,Caption,Media files,Status,Link');
    expect(cal).toContain('2027-01-02,10:00,Instagram,Wrap,"That’s a wrap, ""everyone""",media/wrap 1.jpg,idea,');
    const buf = bufferCsv(posts).split('\r\n');
    expect(buf[0]).toBe('Text,Image URL,Tags,Posting Time');
    expect(buf[1]).toBe('"That’s a wrap, ""everyone""",,Wrap,2027-01-02 10:00');
    expect(buf.length).toBe(3); // posted posts are left out
  });
});
