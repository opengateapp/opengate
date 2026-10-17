import { jsPDF } from 'jspdf';
import type { DerivedScene, Project } from '../model/types';
import { sceneCast, sceneElements, sceneEighths, sceneMinutes, sceneTime, type Derived } from '../script/derive';
import { formatDuration, formatEighths } from '../model/dates';
import { sceneLocation } from '../schedule/callsheet';
import { clip, hexToRgb } from './schedulePdf';

// Breakdown sheets, one page per scene, in the layout of CineSched's BreakdownExporter:
// sheet # / title / scene #, INT-EXT / setting / location, description + day/night + pages,
// then a three-across grid of department boxes. The boxes come from the project's own
// breakdown categories (Cast first, from the roster), and empty rows collapse.

const PW = 612, PH = 792, M = 36, CW = PW - 2 * M;

interface Box { label: string; color: string; items: string[] }

export function breakdownBoxes(p: Project, s: DerivedScene): { boxes: Box[]; notes: string[] } {
  const els = sceneElements(p, s);
  const castCat = p.categories.find((c) => c.id === 'cast');
  const cast = sceneCast(p, s).map((c) => {
    const m = p.cast.find((x) => x.characterName.toUpperCase() === c);
    return m ? `${m.castNumber}. ${c}${m.actorName ? ` (${m.actorName})` : ''}` : c;
  });
  const boxes: Box[] = [{ label: castCat?.name ?? 'Cast', color: castCat?.color ?? '#ef4444', items: cast }];
  for (const c of p.categories) {
    if (c.id === 'cast' || c.id === 'notes') continue;
    const items = els.filter((e) => e.categoryId === c.id).map((e) => e.name + (e.notes ? ` — ${e.notes}` : ''));
    boxes.push({ label: c.name, color: c.color, items: items.sort((a, b) => a.localeCompare(b)) });
  }
  // Cast-category elements tagged in the text join the roster cast.
  const castNames = new Set(sceneCast(p, s));
  for (const e of els) if (e.categoryId === 'cast' && !castNames.has(e.name.toUpperCase())) boxes[0].items.push(e.name);
  // Filled departments first (in category order), empty ones after, so the grid stays compact.
  const filled = boxes.filter((b) => b.items.length);
  const empty = boxes.filter((b) => !b.items.length);
  const notes = [p.sceneMeta[s.id]?.notes?.trim() ?? '', ...els.filter((e) => e.categoryId === 'notes').map((e) => e.name)].filter(Boolean);
  return { boxes: [...filled, ...empty], notes };
}

export function breakdownSheetsPdf(p: Project, d: Derived, scenes: DerivedScene[] = d.scenes): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setLineWidth(0.6);
  doc.setDrawColor(40);
  if (!scenes.length) {
    doc.setFontSize(12);
    doc.text('No scenes in the script yet.', M, M + 20);
    return doc;
  }
  scenes.forEach((s, idx) => {
    if (idx) doc.addPage();
    drawSheet(doc, p, s, idx, scenes.length);
  });
  return doc;
}

function cell(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string | string[], o: { size?: number; bold?: boolean; center?: boolean; color?: string; labelSize?: number } = {}) {
  doc.rect(x, y, w, h);
  let ty = y + 4;
  if (label) {
    if (o.color) {
      doc.setFillColor(...hexToRgb(o.color));
      doc.rect(x + 0.6, y + 0.6, 4, h - 1.2, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(o.labelSize ?? 8.5);
    doc.setTextColor(30);
    const lx = o.center ? x + w / 2 : x + (o.color ? 10 : 6);
    doc.text(clip(doc, label.toUpperCase(), w - 14), lx, ty, { baseline: 'top', align: o.center ? 'center' : 'left' });
    ty += (o.labelSize ?? 8.5) + 4;
  }
  doc.setTextColor(0);
  const lines = Array.isArray(value) ? value.map((v) => '• ' + v) : value ? [value] : [];
  if (!lines.length) return;
  let size = o.size ?? 9;
  const avail = y + h - ty - 3;
  const inner = w - (o.color ? 16 : 12);
  doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
  let wrapped: string[] = [];
  // Shrink to fit before clipping.
  for (; size >= 6.5; size -= 0.5) {
    doc.setFontSize(size);
    wrapped = lines.flatMap((l) => doc.splitTextToSize(l, inner) as string[]);
    if (wrapped.length * size * 1.18 <= avail) break;
  }
  const lh = size * 1.18;
  const fit = Math.max(0, Math.floor(avail / lh));
  if (wrapped.length > fit && fit > 0) {
    const more = wrapped.length - fit + 1;
    wrapped = [...wrapped.slice(0, fit - 1), `… +${more} more lines`];
  }
  const lx = o.center ? x + w / 2 : x + (o.color ? 10 : 6);
  const startY = o.center && !Array.isArray(value) ? y + (label ? (h + (o.labelSize ?? 8.5)) / 2 : h / 2) - (wrapped.length * lh) / 2 + 1 : ty;
  wrapped.slice(0, Math.max(fit, 1)).forEach((l, i) => doc.text(l, lx, startY + i * lh, { baseline: 'top', align: o.center ? 'center' : 'left' }));
}

function drawSheet(doc: jsPDF, p: Project, s: DerivedScene, idx: number, count: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('BREAKDOWN SHEET', M, M + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Pages ${s.startPage}${s.endPage !== s.startPage ? '–' + s.endPage : ''}`, PW - M, M + 14, { align: 'right' });
  doc.setTextColor(0);

  const top = M + 24;
  const bottom = PH - M - 14;
  const { boxes, notes } = breakdownBoxes(p, s);
  const synopsis = p.sceneMeta[s.id]?.synopsis || s.firstAction || '';
  const r0 = 44, r1 = 46, r2 = synopsis.length > 160 ? 90 : 72;
  const gridRows: Box[][] = [];
  for (let i = 0; i < boxes.length; i += 3) gridRows.push(boxes.slice(i, i + 3));
  const compact = 26;
  const weight = (row: Box[]) => (row.some((b) => b.items.length) ? 48 + 11 * Math.max(...row.map((b) => b.items.length)) : compact);
  const weights = gridRows.map(weight);
  const notesW = notes.length ? 70 + 10 * notes.length : 40;
  const avail = bottom - top - r0 - r1 - r2;
  const fixedCompact = weights.filter((w) => w === compact).length * compact;
  const flexTotal = weights.filter((w) => w !== compact).reduce((a, b) => a + b, 0) + notesW;
  const scale = Math.max(0.2, (avail - fixedCompact) / flexTotal);
  const heights = weights.map((w) => (w === compact ? compact : w * scale));
  const notesH = avail - heights.reduce((a, b) => a + b, 0);

  let y = top;
  // Row 0
  cell(doc, M, y, 115, r0, 'Breakdown sheet #', String(idx + 1), { size: 13, bold: true, center: true });
  cell(doc, M + 115, y, CW - 230, r0, '', p.title || 'Untitled', { size: 16, bold: true, center: true });
  cell(doc, M + CW - 115, y, 115, r0, 'Scene #', s.number || '—', { size: 15, bold: true, center: true });
  y += r0;
  // Row 1
  const loc = sceneLocation(p, s);
  cell(doc, M, y, 70, r1, 'INT / EXT', s.intExt, { size: 11, bold: true, center: true });
  cell(doc, M + 70, y, CW - 70 - 150, r1, 'Setting', s.set || s.heading, { size: 10 });
  cell(doc, M + CW - 150, y, 150, r1, 'Location', loc ? [loc.realName || loc.setName, loc.address].filter(Boolean).join(' — ') : '', { size: 8.5 });
  y += r1;
  // Row 2
  cell(doc, M, y, CW - 135, r2, 'Description', synopsis.replace(/\s+/g, ' '), { size: 9.5 });
  cell(doc, M + CW - 135, y, 135, r2 / 2, 'Day / Night', sceneTime(p, s) === 'CUSTOM' ? s.timeLabel || 'OTHER' : sceneTime(p, s), { size: 11, bold: true, center: true });
  cell(doc, M + CW - 135, y + r2 / 2, 135, r2 / 2, 'Script pages', formatEighths(sceneEighths(p, s)), { size: 11, bold: true, center: true });
  y += r2;
  // Department grid
  gridRows.forEach((row, i) => {
    const h = heights[i];
    const w = CW / row.length;
    row.forEach((b, k) => {
      const bw = k === row.length - 1 ? CW - w * k : w;
      cell(doc, M + k * w, y, bw, h, b.label, b.items, { color: b.color, size: 8.5, labelSize: h <= compact ? 8 : 9.5 });
    });
    y += h;
  });
  cell(doc, M, y, CW, notesH, 'Notes', notes.join('\n'), { size: 9 });
  y += notesH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(`Est. time: ${formatDuration(sceneMinutes(p, s))}`, M, y + 11);
  doc.text(`Scene ${idx + 1} of ${count}`, PW - M, y + 11, { align: 'right' });
  doc.setTextColor(0);
}
