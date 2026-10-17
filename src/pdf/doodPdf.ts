import { jsPDF } from 'jspdf';
import type { Project } from '../model/types';
import type { Derived } from '../script/derive';
import { fromISO } from '../model/dates';
import { buildDood, doodRowLabel, DOOD_LEGEND, type DoodCode } from '../schedule/dood';
import { clip } from './schedulePdf';

// Landscape Day Out of Days grid after CineSched's DaysOutOfDaysExporter: pages split
// across day columns and cast rows when the grid doesn't fit.

export const DOOD_STYLE: Record<Exclude<DoodCode, ''>, { fill: [number, number, number]; text: number }> = {
  SW: { fill: [37, 99, 235], text: 255 },
  WF: { fill: [37, 99, 235], text: 255 },
  SWF: { fill: [37, 99, 235], text: 255 },
  W: { fill: [240, 240, 240], text: 0 },
  H: { fill: [253, 236, 170], text: 90 },
  X: { fill: [239, 128, 128], text: 255 },
};

export function doodPdf(p: Project, d: Derived, includeHold = true): jsPDF {
  const { days, rows } = buildDood(p, d, includeHold);
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  doc.setLineWidth(0.4);
  const PW = 792, PH = 612, M = 36;
  const nameW = 170, sumW = 30, dayW = 22, rowH = 18, headH = 32, titleH = 34, legendH = 22;
  const sums = includeHold ? ['TOT', 'WRK', 'HLD'] : ['TOT', 'WRK'];
  const fixed = nameW + sumW * sums.length;
  const perPage = Math.max(1, Math.floor((PW - 2 * M - fixed) / dayW));
  const rowsPerPage = Math.max(1, Math.floor((PH - 2 * M - titleH - headH - legendH) / rowH));
  const dayChunks = Math.max(1, Math.ceil(days.length / perPage));
  const rowChunks = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const total = dayChunks * rowChunks;
  let page = 0;

  for (let dc = 0; dc < dayChunks; dc++) {
    const cols = days.slice(dc * perPage, (dc + 1) * perPage);
    for (let rc = 0; rc < rowChunks; rc++) {
      if (page++) doc.addPage();
      const chunk = rows.slice(rc * rowsPerPage, (rc + 1) * rowsPerPage);
      let y = M;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text(`${p.title || 'Untitled'} — Days Out of Days`, M, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
      doc.text(`Page ${page} of ${total}  ·  ${new Date().toLocaleDateString()}`, PW - M, y + 12, { align: 'right' });
      doc.setTextColor(0);
      y += titleH;

      const cellAt = (text: string, x: number, w: number, h: number, opts: { bold?: boolean; size?: number; align?: 'left' | 'center'; fill?: [number, number, number]; color?: number } = {}) => {
        doc.setDrawColor(150);
        if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
        doc.setFontSize(opts.size ?? 9);
        doc.setTextColor(opts.color ?? 0);
        const left = opts.align === 'left';
        doc.text(clip(doc, text, w - 6), left ? x + 4 : x + w / 2, y + h / 2, { align: left ? 'left' : 'center', baseline: 'middle' });
        doc.setTextColor(0);
      };

      // Header: month / weekday / date, then shoot day number
      let x = M;
      cellAt('CAST', x, nameW, headH, { bold: true, align: 'left' }); x += nameW;
      for (const s of sums) { cellAt(s, x, sumW, headH, { bold: true, size: 8 }); x += sumW; }
      let lastMonth = '';
      for (const { day, number } of cols) {
        const dt = fromISO(day.date);
        const month = dt.toLocaleDateString(undefined, { month: 'short' });
        doc.setDrawColor(150);
        doc.rect(x, y, dayW, headH);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal');
        if (month !== lastMonth) doc.text(month, x + dayW / 2, y + 6, { align: 'center', baseline: 'middle' });
        lastMonth = month;
        doc.text(dt.toLocaleDateString(undefined, { weekday: 'narrow' }) + ' ' + dt.getDate(), x + dayW / 2, y + 14, { align: 'center', baseline: 'middle' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        doc.text(String(number), x + dayW / 2, y + 25, { align: 'center', baseline: 'middle' });
        x += dayW;
      }
      y += headH;

      for (const r of chunk) {
        x = M;
        cellAt(doodRowLabel(r), x, nameW, rowH, { align: 'left' }); x += nameW;
        cellAt(String(r.total), x, sumW, rowH, { bold: true }); x += sumW;
        cellAt(String(r.work), x, sumW, rowH); x += sumW;
        if (includeHold) { cellAt(String(r.hold), x, sumW, rowH); x += sumW; }
        const offset = dc * perPage;
        cols.forEach((_, i) => {
          const code = r.codes[offset + i];
          const st = code ? DOOD_STYLE[code] : undefined;
          cellAt(code, x, dayW, rowH, { bold: true, size: 7, fill: st?.fill, color: st?.text });
          x += dayW;
        });
        y += rowH;
      }
      if (!chunk.length) {
        doc.setFontSize(10); doc.setTextColor(120);
        doc.text(days.length ? 'No cast scheduled.' : 'No shoot days scheduled yet.', M, y + 20);
        doc.setTextColor(0);
      }

      // Legend
      y = PH - M - legendH + 6;
      x = M;
      doc.setFontSize(8);
      for (const l of DOOD_LEGEND) {
        if (l.code === 'H' && !includeHold) continue;
        const st = DOOD_STYLE[l.code];
        doc.setFillColor(...st.fill); doc.setDrawColor(150);
        doc.rect(x, y, 22, 12, 'FD');
        doc.setFont('helvetica', 'bold'); doc.setTextColor(st.text);
        doc.text(l.code, x + 11, y + 6, { align: 'center', baseline: 'middle' });
        doc.setTextColor(0); doc.setFont('helvetica', 'normal');
        doc.text(l.label, x + 26, y + 6, { baseline: 'middle' });
        x += 30 + doc.getTextWidth(l.label) + 14;
      }
      doc.text('TOT = first to last work day · WRK = work days · HLD = hold days', PW - M, y + 6, { align: 'right', baseline: 'middle' });
    }
  }
  return doc;
}
