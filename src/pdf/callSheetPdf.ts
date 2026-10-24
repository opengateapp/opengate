import { jsPDF } from 'jspdf';
import type { CallSheetSection, Project, ShootDay } from '../model/types';
import { sceneCast, sceneEighths, type Derived } from '../script/derive';
import { formatClock12, formatDate, formatEighths, parseClock } from '../model/dates';
import { resolveCallSheet, infoValue, advanceSchedule, btsItems, callDayLabel, type ResolvedCallSheet } from '../schedule/callsheet';
import { buildDood } from '../schedule/dood';
import { getMedia, blobToImage } from '../store/media';
import { clip } from './schedulePdf';
import { castBadge, crewBadge } from '../paperwork/unions';

// Call sheet PDF with the same layout as the on-screen page: company + key contacts,
// logo + production title, times / hospital; location, big call time, notes; then every
// visible section in the order set on screen. US Letter portrait, in points.

const W = 612;
const H = 792;
const M = 28;
const CW = W - 2 * M;
const HEAD = 236;
const LINE_C = 150;

export interface PdfImage { data: string; w: number; h: number }

const t12 = (s: string | undefined) => {
  const m = parseClock(s);
  return m === null ? (s ?? '') : formatClock12(m);
};

class Sheet {
  y = M;
  page = 1;
  constructor(public doc: jsPDF, public footer: string) {
    this.doc.setLineWidth(0.5);
  }
  room(h: number) {
    if (this.y + h > H - M - 14) this.newPage();
  }
  newPage() {
    this.drawFooter();
    this.doc.addPage();
    this.page++;
    this.y = M;
  }
  drawFooter() {
    this.font(7);
    this.doc.setTextColor(120);
    this.doc.text(`${this.footer}  ·  Page ${this.page}`, W / 2, H - M + 6, { align: 'center' });
    this.doc.setTextColor(0);
  }
  font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
  }
  box(x: number, y: number, w: number, h: number, fill?: number) {
    this.doc.setDrawColor(LINE_C);
    if (fill !== undefined) { this.doc.setFillColor(fill, fill, fill); this.doc.rect(x, y, w, h, 'FD'); } else this.doc.rect(x, y, w, h);
  }
  cell(text: string, x: number, y: number, w: number, h: number, align: 'left' | 'center' | 'right' = 'left', pad = 4) {
    const s = clip(this.doc, text, Math.max(4, w - 2 * pad));
    const tx = align === 'left' ? x + pad : align === 'right' ? x + w - pad : x + w / 2;
    this.doc.text(s, tx, y + h / 2, { align, baseline: 'middle' });
  }
  lines(text: string, w: number): string[] {
    return text.trim() ? (this.doc.splitTextToSize(text.trim(), w) as string[]) : [];
  }
}

/** Loads logos so the (synchronous) renderer can embed them. */
export async function callSheetPdfAsync(p: Project, d: Derived, days: ShootDay[]): Promise<jsPDF> {
  const images = new Map<string, PdfImage>();
  for (const day of days) {
    const id = p.callSheets[day.id]?.logoId;
    if (!id || images.has(id)) continue;
    const blob = await getMedia(id);
    if (!blob) continue;
    const img = await blobToImage(blob);
    const c = document.createElement('canvas');
    const s = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    images.set(id, { data: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height });
  }
  return callSheetPdf(p, d, days, images);
}

export function callSheetPdf(p: Project, d: Derived, days: ShootDay[], images: Map<string, PdfImage> = new Map()): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const dood = buildDood(p, d);
  days.forEach((day, i) => {
    if (i > 0) doc.addPage();
    const r = resolveCallSheet(p, d, day, dood);
    const s = new Sheet(doc, `${r.sheet.productionTitle || p.title} — Call sheet — Day ${r.dayNumber ?? '—'} of ${r.totalDays} — ${formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
    drawCallSheet(s, p, d, day, r, images);
    s.drawFooter();
  });
  return doc;
}

function drawCallSheet(s: Sheet, p: Project, d: Derived, day: ShootDay, r: ResolvedCallSheet, images: Map<string, PdfImage>) {
  const { doc } = s;
  const cs = r.sheet;
  const GAP = 9;
  const wSide = 186;
  const wMid = CW - 2 * wSide - 2 * GAP;
  const xMid = M + wSide + GAP;
  const xR = xMid + wMid + GAP;
  const RH = 13;

  // ---- Row 1: company + key contacts | logo + title | times + hospital ----
  s.font(8);
  const company = s.lines(cs.companyInfo ?? '', wSide - 8).slice(0, 7);
  const contacts = (cs.keyContacts ?? []).filter((c) => c.role || c.name || c.phone);
  const leftH = 6 + company.length * 10 + 4 + contacts.length * RH;
  const info = (cs.infoRows ?? []).map((row) => [row.label, infoValue(row, r, day)] as const).filter(([l, v]) => l || v);
  s.font(8);
  const hosp = s.lines(cs.nearestHospital, wSide - 84);
  const rightH = info.length * RH + Math.max(RH, hosp.length * 10 + 4);
  const row1 = Math.max(100, leftH, rightH);

  // left
  s.box(M, s.y, wSide, row1);
  s.font(8);
  company.forEach((l, i) => doc.text(l, M + 4, s.y + 11 + i * 10));
  let cy = s.y + row1 - contacts.length * RH;
  for (const c of contacts) {
    doc.setDrawColor(LINE_C);
    doc.line(M, cy, M + wSide, cy);
    doc.line(M + 52, cy, M + 52, cy + RH);
    doc.line(M + wSide - 62, cy, M + wSide - 62, cy + RH);
    s.font(7.5);
    s.cell(c.role, M, cy, 52, RH);
    s.cell(c.name, M + 52, cy, wSide - 114, RH);
    s.cell(c.phone, M + wSide - 62, cy, 62, RH);
    cy += RH;
  }

  // middle: logo + title
  const logo = cs.logoId ? images.get(cs.logoId) : undefined;
  let my = s.y;
  if (logo) {
    const bw = wMid - 20;
    const bh = row1 - 34;
    const sc = Math.min(bw / logo.w, bh / logo.h);
    const iw = logo.w * sc;
    const ih = logo.h * sc;
    doc.addImage(logo.data, 'JPEG', xMid + (wMid - iw) / 2, my + (bh - ih) / 2 + 2, iw, ih);
    my += bh + 4;
  } else my += row1 / 2 - 14;
  s.font(15, 'bold');
  s.cell(cs.productionTitle || p.title, xMid, my, wMid, 26, 'center');

  // right: info rows + hospital
  let ry = s.y;
  s.box(xR, s.y, wSide, row1);
  for (const [label, value] of info) {
    doc.setDrawColor(LINE_C);
    doc.line(xR + 80, ry, xR + 80, ry + RH);
    s.font(7.5, 'bold');
    s.cell(label, xR, ry, 80, RH);
    s.font(7.5);
    s.cell(value, xR + 80, ry, wSide - 80, RH);
    ry += RH;
    doc.line(xR, ry, xR + wSide, ry);
  }
  doc.line(xR + 80, ry, xR + 80, s.y + row1);
  s.font(7.5, 'bold');
  s.cell('Nearest hospital', xR, ry, 80, Math.max(RH, 16));
  s.font(7.5);
  hosp.forEach((l, i) => doc.text(l, xR + 84, ry + 10 + i * 10));
  s.y += row1 + GAP;

  // ---- Row 2: location | big call | notes ----
  const row2 = 112;
  const loc = cs.locations[0];
  s.box(M, s.y, wSide, row2);
  s.font(8, 'bold');
  let ly = s.y + 12;
  if (loc?.name) { s.cell(loc.name, M, ly - 6, wSide, 12); ly += 11; }
  s.font(8);
  for (const l of s.lines(loc?.address ?? '', wSide - 8).slice(0, 3)) { doc.text(l, M + 4, ly); ly += 10; }
  if (cs.basecamp.trim()) {
    s.font(7.5, 'bold'); doc.text('Basecamp / parking', M + 4, ly + 4); ly += 14;
    s.font(7.5);
    for (const l of s.lines(cs.basecamp, wSide - 8).slice(0, 2)) { doc.text(l, M + 4, ly); ly += 10; }
  }
  if (loc?.address) {
    s.font(7.5);
    doc.setTextColor(30, 90, 200);
    doc.textWithLink('Open map', M + 4, s.y + row2 - 8, { url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.address)}` });
    doc.setTextColor(0);
  }
  if (cs.locations.length > 1) {
    s.font(7, 'italic');
    doc.text(`+ ${cs.locations.length - 1} more location${cs.locations.length > 2 ? 's' : ''}`, M + wSide - 4, s.y + row2 - 8, { align: 'right' });
  }

  const cx = xMid + wMid / 2;
  const cyy = s.y + row2 / 2;
  doc.setDrawColor(60);
  doc.setLineWidth(4);
  doc.circle(cx, cyy, 50);
  doc.setLineWidth(0.5);
  s.font(9, 'bold');
  doc.text('CALL', cx, cyy - 22, { align: 'center' });
  s.font(24, 'bold');
  doc.text(r.clock.generalCall !== null ? formatClock12(r.clock.generalCall).replace(':00 ', '').replace(' ', '') : '—', cx, cyy + 9, { align: 'center' });
  s.font(7, 'bold');
  doc.text(callDayLabel(day.date), cx, cyy + 24, { align: 'center' });

  s.box(xR, s.y, wSide, row2);
  s.font(7.5);
  const notes = [cs.topNotes ?? '', cs.quote.trim() ? `“${cs.quote.trim()}”` : '', day.notes ?? ''].filter((x) => x.trim()).join('\n\n');
  s.lines(notes, wSide - 8).slice(0, 10).forEach((l, i) => doc.text(l, xR + 4, s.y + 11 + i * 9.5));
  s.y += row2 + 14;

  // ---- Sections ----
  for (const sec of cs.sections ?? []) {
    if (sec.hidden) continue;
    drawSection(s, p, d, day, r, sec);
  }
}

const withBadge = (name: string, badge: string) => (badge ? `${name} (${badge})` : name);

function sectionTitle(s: Sheet, title: string) {
  s.room(40);
  s.font(8.5, 'bold');
  s.doc.text(title.toUpperCase(), M, s.y + 8);
  s.y += 12;
}

/** Table with a gray header row and rows that grow to fit wrapped text. */
function table(s: Sheet, headers: string[], widths: number[], rows: string[][], opts: { center?: number[]; bold?: number[] } = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const ws = widths.map((w) => (w / total) * CW);
  const xs = ws.map((_, i) => M + ws.slice(0, i).reduce((a, b) => a + b, 0));
  const header = () => {
    s.room(16 + 14);
    s.box(M, s.y, CW, 15, HEAD);
    s.font(7.5, 'bold');
    headers.forEach((h, i) => {
      if (i) s.doc.line(xs[i], s.y, xs[i], s.y + 15);
      s.cell(h.toUpperCase(), xs[i], s.y, ws[i], 15, 'center');
    });
    s.y += 15;
  };
  header();
  for (const row of rows) {
    s.font(7.5);
    const lines = row.map((c, i) => s.lines(c, ws[i] - 8));
    const h = Math.max(14, Math.max(...lines.map((l) => l.length)) * 9 + 5);
    if (s.y + h > H - M - 14) { s.newPage(); header(); }
    s.box(M, s.y, CW, h);
    lines.forEach((ls, i) => {
      if (i) s.doc.line(xs[i], s.y, xs[i], s.y + h);
      s.font(7.5, opts.bold?.includes(i) ? 'bold' : 'normal');
      const center = opts.center?.includes(i);
      ls.forEach((l, k) => s.doc.text(l, center ? xs[i] + ws[i] / 2 : xs[i] + 4, s.y + 10 + k * 9, { align: center ? 'center' : 'left' }));
    });
    s.y += h;
  }
  if (!rows.length) {
    s.box(M, s.y, CW, 14);
    s.font(7.5, 'italic');
    s.cell('—', M, s.y, CW, 14, 'center');
    s.y += 14;
  }
  s.y += 12;
}

function drawSection(s: Sheet, p: Project, d: Derived, day: ShootDay, r: ResolvedCallSheet, sec: CallSheetSection) {
  const cs = r.sheet;
  sectionTitle(s, sec.title);
  switch (sec.kind) {
    case 'scenes': {
      const rows = r.scenes.map((sc) => [
        sc.number, `${sc.intExt}. ${sc.set}${sc.synopsis ? `\n${sc.synopsis}` : ''}`, sc.cast, sc.time === 'CUSTOM' ? '' : sc.time, formatEighths(sc.eighths),
        cs.sceneNotes?.[sc.scene.id] || [r.locations[Number(sc.loc) - 1]?.name, sc.address].filter(Boolean).join('\n'),
      ]);
      for (const x of cs.extraScenes ?? []) rows.push([x.scene, [x.set, x.description].filter(Boolean).join('\n'), x.cast, x.dn, x.pages, x.notes]);
      rows.push(['', '', '', 'TOTAL', formatEighths(r.totalEighths), '']);
      table(s, ['Scenes', 'Set and description', 'Character #', 'D/N', 'Pages', 'Location / notes'], [7, 34, 11, 8, 7, 33], rows, { center: [0, 2, 3, 4], bold: [0] });
      break;
    }
    case 'cast':
      table(s, ['#', 'Cast', 'Character', 'Scenes', 'Status', 'Pick up', 'H/MU', 'Call', 'Special instructions'], [4, 15, 15, 9, 7, 8, 8, 8, 26],
        r.cast.map((c, i) => [String(c.castNumber ?? i + 1), withBadge(c.actorName, castBadge(p, c.characterName)), c.characterName, c.sceneNumbers, c.status, t12(c.pickup), t12(c.hmu), t12(c.onSet), c.notes ?? '']),
        { center: [0, 3, 4, 5, 6, 7] });
      break;
    case 'crew':
      table(s, ['Position', 'Name', 'Phone', 'Email', 'Call time'], [20, 22, 17, 27, 11],
        r.crew.map((c) => [c.role, withBadge(c.name, crewBadge(p, c.crewId, c.name)), c.phone, c.email ?? '', t12(c.call)]), { center: [4] });
      break;
    case 'locations':
      table(s, ['#', 'Location', 'Address'], [5, 35, 60], r.locations.map((l, i) => [String(i + 1), l.name, l.address]), { center: [0] });
      break;
    case 'advance': {
      const adv = advanceSchedule(p, d, day);
      if (!adv) { table(s, ['Advance schedule'], [1], [['No later shoot day scheduled.']]); break; }
      s.font(8, 'bold');
      s.doc.text(`Day ${adv.number} — ${formatDate(adv.day.date, { weekday: 'long', month: 'long', day: 'numeric' })}`, M, s.y + 4);
      s.y += 8;
      table(s, ['Sc', 'Set', 'D/N', 'Cast', 'Pages'], [7, 45, 10, 28, 10], adv.scenes.map((sc) => [
        sc.number, `${sc.intExt}. ${sc.set}`, sc.time, sceneCast(p, sc).map((c) => p.cast.find((m) => m.characterName === c)?.castNumber ?? c).join(', '), formatEighths(sceneEighths(p, sc)),
      ]), { center: [0, 2, 4], bold: [0] });
      break;
    }
    case 'notes': {
      s.font(8);
      const half = (CW - 8) / 2;
      const a = s.lines(sec.text ?? '', half - 8);
      const b = s.lines(sec.text2 ?? '', half - 8);
      const h = Math.max(40, Math.max(a.length, b.length) * 10 + 10);
      s.room(h + 12);
      s.box(M, s.y, half, h);
      s.box(M + half + 8, s.y, half, h);
      a.forEach((l, i) => s.doc.text(l, M + 4, s.y + 12 + i * 10));
      b.forEach((l, i) => s.doc.text(l, M + half + 12, s.y + 12 + i * 10));
      s.y += h + 12;
      break;
    }
    case 'bts': {
      const items = btsItems(p, day, sec);
      table(s, ['BTS & stills to get', 'For'], [70, 30], items.length ? items.map((x) => [x.what, x.why]) : [['Nothing listed.', '']]);
      break;
    }
    case 'table': {
      const cols = sec.columns?.length ? sec.columns : [''];
      table(s, cols, cols.map(() => 1), (sec.rows ?? []).map((row) => cols.map((_, i) => row.cells[i] ?? '')));
      break;
    }
  }
}
