import { DOMSerializer, Node as PMNode } from 'prosemirror-model';
import type { jsPDF } from 'jspdf';
import type { AVScript, Contact, ContactKind, DocFile, Festival, Project, SocialPost } from '../model/types';
import type { Derived } from '../script/derive';
import { blocksToLines } from '../script/schema';
import { docSchema } from '../script/docSchema';
import { accountLabel } from '../budget/accounts';
import { joinFestivals } from '../budget/festivals';
import { GEAR_CATEGORIES, SOURCE_LABEL, gearCost, gearTotals } from '../budget/gear';
import type { Societied } from '../paperwork/societies';
import { unionBadge, type Unioned } from '../paperwork/unions';
import { bufferCsv, calendarCsv } from '../release/socialShare';
import { getMedia } from '../store/media';
import { toFDX } from './fdx';
import { safeName } from './files';
import { toFountain } from './fountain';
import { csv } from './reports';

// Exports as plain functions that return their data: the buttons in each tab download what
// these return, and Export everything puts the same files into its ZIP.

// ── Screenplay ──
const scriptArgs = (p: Project, d: Derived) => ({ lines: blocksToLines(d.blocks), nums: p.sceneNumbersLocked ? d.scenes.map((s) => s.number) : undefined });
export function fountainText(p: Project, d: Derived): string {
  const { lines, nums } = scriptArgs(p, d);
  return toFountain(lines, p.titlePage, nums);
}
export function fdxText(p: Project, d: Derived): string {
  const { lines, nums } = scriptArgs(p, d);
  return toFDX(lines, p.titlePage, nums);
}

// ── A/V scripts ──
export function avSeconds(d: string): number {
  const m = d.trim().match(/^(?:(\d+):)?(\d+)(?:\.(\d+))?$/);
  if (!m) return 0;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}
export const avTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export const avTotal = (script: AVScript) => script.rows.reduce((a, r) => a + avSeconds(r.duration), 0);

export function avCsv(script: AVScript): string {
  return csv([['#', 'Segment', 'Shot', 'Video', 'Audio', 'Duration'], ...script.rows.map((r, i) => [i + 1, r.segment ?? '', r.shotType ?? '', r.video, r.audio, r.duration])]);
}

export async function avPdf(projectTitle: string, script: AVScript): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'in', format: 'letter' });
  doc.setLineWidth(0.01);
  let y = 0.8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(script.title, 0.6, y);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.text(`${projectTitle} · Total ${avTime(avTotal(script))}`, 7.9, y, { align: 'right' });
  y += 0.3;
  const head = () => { doc.setFont('helvetica', 'bold'); doc.text('VIDEO', 0.9, y); doc.text('AUDIO', 4.5, y); doc.text('TIME', 7.9, y, { align: 'right' }); doc.line(0.6, y + 0.06, 7.9, y + 0.06); y += 0.25; doc.setFont('helvetica', 'normal'); };
  head();
  script.rows.forEach((r, i) => {
    const v = doc.splitTextToSize((r.shotType ? `[${r.shotType}] ` : '') + r.video, 3.3);
    const a = doc.splitTextToSize(r.audio, 3.0);
    const h = Math.max(v.length, a.length) * 0.17 + (r.segment ? 0.3 : 0) + 0.1;
    if (y + h > 10.4) { doc.addPage(); y = 0.8; head(); }
    if (r.segment) { doc.setFont('helvetica', 'bold'); doc.text(r.segment.toUpperCase(), 0.6, y); doc.setFont('helvetica', 'normal'); y += 0.25; }
    doc.text(String(i + 1), 0.6, y);
    doc.text(v, 0.9, y);
    doc.text(a, 4.5, y);
    if (r.duration) doc.text(r.duration, 7.9, y, { align: 'right' });
    y += Math.max(v.length, a.length) * 0.17 + 0.1;
  });
  return doc;
}

// ── Docs ──
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function docHtml(title: string, node: PMNode): string {
  const frag = DOMSerializer.fromSchema(docSchema).serializeFragment(node.content);
  const div = document.createElement('div');
  div.appendChild(frag);
  return `<!doctype html><meta charset="utf-8"><title>${escHtml(title)}</title><style>body{font:16px/1.6 Georgia,serif;max-width:720px;margin:48px auto;padding:0 16px}</style>${div.innerHTML}`;
}

/** A saved document as a web page. Throws if it can't be read (damaged, or from a newer version). */
export const storedDocHtml = (doc: DocFile) => docHtml(doc.title, PMNode.fromJSON(docSchema, doc.doc));

// ── Contacts ──
export interface ContactRow extends Unioned, Societied { key: string; group: 'Cast' | 'Crew' | 'Contacts'; name: string; role: string; company: string; phone: string; email: string; kind?: ContactKind }

export function contactRows(p: Project): ContactRow[] {
  return [
    ...[...p.cast].sort((a, b) => a.castNumber - b.castNumber).map((c) => ({ key: 'cast:' + c.id, group: 'Cast' as const, name: c.actorName, role: `#${c.castNumber} ${c.characterName}`, company: '', phone: c.phone ?? '', email: c.email ?? '', union: c.union, unionStatus: c.unionStatus, unionLocal: c.unionLocal, societies: c.societies, pgaCertified: c.pgaCertified })),
    ...p.crew.map((c) => ({ key: 'crew:' + c.id, group: 'Crew' as const, name: c.name, role: c.role, company: '', phone: c.phone ?? '', email: '', union: c.union, unionStatus: c.unionStatus, unionLocal: c.unionLocal, societies: c.societies, pgaCertified: c.pgaCertified })),
    ...p.contacts.map((c: Contact) => ({ key: 'contact:' + c.id, group: 'Contacts' as const, name: c.name, role: c.role, company: c.company, phone: c.phone, email: c.email, kind: c.kind, union: c.union, unionStatus: c.unionStatus, unionLocal: c.unionLocal, societies: c.societies, pgaCertified: c.pgaCertified })),
  ];
}

function toVCard(r: ContactRow): string {
  const esc = (s: string) => s.replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(r.name)}`, r.company && `ORG:${esc(r.company)}`, r.role && `TITLE:${esc(r.role)}`, r.phone && `TEL:${r.phone}`, r.email && `EMAIL:${r.email}`, 'END:VCARD'].filter(Boolean).join('\r\n');
}
export const contactsVcf = (rows: ContactRow[]) => rows.map(toVCard).join('\r\n');
export const contactsCsv = (rows: ContactRow[]) => csv([['Group', 'Name', 'Role', 'Company', 'Phone', 'Email', 'Union'], ...rows.map((r) => [r.group, r.name, r.role, r.company, r.phone, r.email, unionBadge(r)])]);

// ── Locations ──
export function locationsCsv(p: Project, withFee = true): string {
  const rows: (string | undefined)[][] = [['Real location', 'Script set', 'Address', 'Status', 'Contact', 'Phone', 'Email', 'Permit', 'Parking', 'Power', 'Restrooms', 'Hospital', 'Fee', 'Notes'], ...p.locations.map((l) => [l.realName, l.setName, l.address, l.status ?? '', l.contactName ?? '', l.contactPhone ?? '', l.contactEmail ?? '', l.permit ?? '', l.parking ?? '', l.power ?? '', l.restrooms ?? '', l.nearestHospital ?? '', [l.feeAmount != null ? `${l.feeAmount} ${l.feePer === 'flat' ? 'flat' : 'per day'}` : '', l.fee ?? ''].filter(Boolean).join(' · '), l.notes ?? ''])];
  return csv(withFee ? rows : rows.map((r) => r.filter((_, i) => i !== 12)));
}

// ── Budget ──
export function expensesCsv(p: Project): string {
  const b = p.budget;
  const acc = new Map(b.accounts.map((a) => [a.id, accountLabel(a)]));
  const line = new Map(b.lines.map((l) => [l.id, l.description]));
  return csv([
    ['Date', 'Vendor', 'Description', 'Account', 'Line', 'Amount', 'Paid', 'Method'],
    ...[...b.expenses].sort((a, c) => a.date.localeCompare(c.date)).map((e) => [e.date, e.vendor, e.description, acc.get(e.accountId), e.lineId ? line.get(e.lineId) : '', e.amount.toFixed(2), e.paid ? 'yes' : 'no', e.method]),
  ]);
}

export function gearCsv(p: Project): string {
  const t = gearTotals(p);
  return csv([
    ['Item', 'Category', 'Qty', 'Own / rent', 'Rate', 'Per', 'Days', 'Cost', 'Notes'],
    ...(p.gear ?? []).map((g) => [g.name, GEAR_CATEGORIES.find((c) => c.id === g.category)?.label ?? g.category, String(g.qty), SOURCE_LABEL[g.source], String(g.rate), g.source === 'buy' ? 'purchase' : g.rateUnit, String(t.days.get(g.id) ?? 0),
      g.source === 'rent' || g.source === 'buy' ? String(gearCost(g, t.days.get(g.id) ?? 0, p.budget.rentalWeekDays ?? 3)) : '0', g.notes ?? '']),
  ]);
}

// ── Festivals ──
/** The festival list; fees, waivers and travel only for people who can see the budget. */
export function festivalsCsv(p: Project, withMoney: boolean): string {
  const list = joinFestivals(p);
  const when = (f: Festival) => f.deadlines.map((x) => [x.label, x.date, withMoney && x.fee ? String(x.fee) : ''].filter(Boolean).join(' ')).join(' · ');
  return csv([
    ['Name', 'Status', 'Tier', 'Premiere', 'Category', 'Location', 'Event start', 'Event end', 'Deadlines', 'Submitted', 'Notified', 'Laurel', 'Link', 'Notes', ...(withMoney ? ['Waiver', 'Fee paid', 'Travel'] : [])],
    ...list.map((f) => [f.name, f.status, f.tier, f.premiere ?? '', f.category ?? '', f.location ?? '', f.eventStart ?? '', f.eventEnd ?? '', when(f), f.submittedOn ?? '', f.notifyDate ?? '', f.laurel ?? '', f.url ?? '', f.notes ?? '', ...(withMoney ? [f.waiver ?? '', f.feePaid ?? '', f.travel ?? ''] : [])]),
  ]);
}

// ── Social calendar ──
export const mediaExt = (type: string) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }[type] ?? type.split('/')[1] ?? 'bin');

/** The calendar's files for scheduling tools: the media, a general CSV, a Buffer CSV and a note. */
export async function socialCalendarFiles(posts: SocialPost[], loadMedia: (id: string) => Promise<Blob | null | undefined> = getMedia): Promise<{ path: string; data: Blob | string }[]> {
  const files: { path: string; data: Blob | string }[] = [];
  const names = new Map<string, string>();
  for (const x of posts) {
    let i = 1;
    for (const id of x.mediaIds) {
      if (names.has(id)) continue;
      const b = await loadMedia(id);
      if (!b) continue;
      const n = `media/${x.date ?? 'undated'} ${safeName(x.milestone || 'post')} ${i++}.${mediaExt(b.type)}`;
      names.set(id, n);
      files.push({ path: n, data: b });
    }
  }
  files.push({ path: 'calendar.csv', data: calendarCsv(posts, (id) => names.get(id)) });
  files.push({ path: 'buffer.csv', data: bufferCsv(posts) });
  files.push({ path: 'README.txt', data: 'calendar.csv: every post, with its media file names (in media/).\r\nbuffer.csv: for Buffer\'s bulk upload (Text, Image URL, Tags, Posting Time). Image URL is empty because your media isn\'t online: add images in Buffer, or put the files somewhere public and paste their links.\r\nOther tools (Hootsuite, Later, Meta Business Suite): use their own template and copy the columns from calendar.csv.\r\n' });
  return files;
}
