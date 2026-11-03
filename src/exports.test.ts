import { describe, expect, it, vi } from 'vitest';
import { buildSampleProduction } from './model/sampleProduction';
import { derive } from './script/derive';
import { avCsv, avPdf, avTime, avTotal, contactRows, contactsCsv, contactsVcf, docHtml, expensesCsv, fdxText, fountainText, gearCsv, locationsCsv, mediaExt, socialCalendarFiles, storedDocHtml } from './io/exports';
import { docSchema, templateDoc } from './script/docSchema';
import { parseVCards } from './tabs/ContactsTab';
import { buildStoryboardPdf } from './tabs/storyboard/render';
import { pressKitHtmlFile } from './release/pressKitExport';
import type { AVScript, DocFile, SocialPost } from './model/types';

vi.mock('./store/media', async (orig) => ({ ...(await orig<object>()), getMedia: async (id: string) => (id === 'gone' ? undefined : new Blob(['x'], { type: 'image/png' })) }));

const p = buildSampleProduction();
const d = derive(p.scriptDoc, p.sceneNumbersLocked);
const av: AVScript = { id: 'a', title: 'Promo', updatedAt: '', rows: [
  { id: '1', segment: 'OPEN', shotType: 'WS', video: 'A cinema, "dark"', audio: 'Hum', duration: '0:15' },
  { id: '2', video: 'Reel, spinning', audio: '', duration: '1:05' },
] };

describe('moved exports', () => {
  it('screenplay text has the title and every scene', () => {
    const f = fountainText(p, d);
    expect(f).toContain(`Title: ${p.titlePage.title}`);
    expect(fdxText(p, d)).toContain('<FinalDraft');
    for (const s of d.scenes.slice(0, 3)) expect(f.toUpperCase()).toContain(s.heading.toUpperCase());
  });
  it('A/V: CSV quotes and PDF totals', async () => {
    expect(avTotal(av)).toBe(80);
    expect(avTime(80)).toBe('1:20');
    expect(avCsv(av)).toBe('#,Segment,Shot,Video,Audio,Duration\r\n1,OPEN,WS,"A cinema, ""dark""",Hum,0:15\r\n2,,,"Reel, spinning",,1:05\r\n');
    expect((await avPdf('Film', av)).output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
  it('Docs: the title is escaped; the body comes from the stored document', () => {
    const doc: DocFile = { id: 'd', title: 'Notes <draft> & "more"', updatedAt: '', doc: templateDoc(['# Heading', 'Body']) };
    const html = storedDocHtml(doc);
    expect(html).toContain('<title>Notes &lt;draft&gt; &amp; &quot;more&quot;</title>');
    expect(html).toContain('<h1>Heading</h1><p>Body</p>');
    expect(docHtml('T', docSchema.nodeFromJSON(doc.doc))).toContain('<title>T</title>');
    expect(() => storedDocHtml({ ...doc, doc: { type: 'nope' } })).toThrow();
  });
  it('Contacts: cast in number order, then crew, then contacts; vCards read back', () => {
    const rows = contactRows(p);
    expect(rows).toHaveLength(p.cast.length + p.crew.length + p.contacts.length);
    const cast = rows.filter((r) => r.group === 'Cast').map((r) => Number(r.role.match(/#(\d+)/)![1]));
    expect(cast).toEqual([...cast].sort((a, b) => a - b));
    expect(contactsCsv(rows).split('\r\n')[0]).toBe('Group,Name,Role,Company,Phone,Email,Union');
    expect(parseVCards(contactsVcf(rows))).toHaveLength(rows.length);
  });
  it('Locations, expenses and gear have a row each', () => {
    const count = (s: string) => s.trimEnd().split('\r\n').length - 1;
    expect(locationsCsv(p).startsWith('Real location,Script set,')).toBe(true);
    expect(locationsCsv(p)).toContain(p.locations[0].realName);
    expect(count(expensesCsv(p))).toBe(p.budget.expenses.length);
    const dates = expensesCsv(p).trimEnd().split('\r\n').slice(1).map((l) => l.split(',')[0]);
    expect(dates).toEqual([...dates].sort());
    expect(count(gearCsv(p))).toBe((p.gear ?? []).length);
  });
  it('Storyboard PDF builds with a swapped renderer, and asks for each frame and reference', async () => {
    const dot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';
    const render = vi.fn(async () => dot);
    const pdf = await buildStoryboardPdf(p, d, render);
    const refs = p.storyboard.filter((f) => f.refImageId || f.refDrawingId).length;
    expect(render).toHaveBeenCalledTimes(p.storyboard.length + refs);
    expect(pdf.output('arraybuffer').byteLength).toBeGreaterThan(1000);
  });
  it('Press kit web page builds without a download', async () => {
    expect(await pressKitHtmlFile(p, d)).toContain(p.title);
  });
  it('Social calendar: media once each, missing media skipped, then the CSVs and the note', async () => {
    const post = (x: Partial<SocialPost>) => ({ id: 'x', platforms: [], caption: '', status: 'idea', mediaIds: [], ...x }) as SocialPost;
    const files = await socialCalendarFiles([post({ date: '2026-01-02', milestone: 'First: day', mediaIds: ['a', 'gone', 'b'] }), post({ mediaIds: ['a', 'c'] })]);
    expect(files.map((f) => f.path)).toEqual(['media/2026-01-02 First day 1.png', 'media/2026-01-02 First day 2.png', 'media/undated post 1.png', 'calendar.csv', 'buffer.csv', 'README.txt']);
    expect(mediaExt('video/quicktime')).toBe('mov');
  });
});
