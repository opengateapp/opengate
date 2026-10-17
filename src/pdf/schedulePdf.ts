import { jsPDF } from 'jspdf';
import type { Project, ShootDay } from '../model/types';
import { sceneCast, sceneEighths, type Derived } from '../script/derive';
import { cascade, dayNumbers, dayTotals, stripColor } from '../schedule/engine';
import { formatDate, formatEighths, formatClock12, formatDuration, parseClock } from '../model/dates';

// Stripboard and Shooting Schedule PDFs (layouts after CineSched's exporters),
// using the shared timeline cascade so times match the on-screen board exactly.

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function textColorFor(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 20 : 255;
}

function header(doc: jsPDF, p: Project, title: string, pageNo: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(p.title, 0.5, 0.6);
  doc.setFontSize(10);
  doc.text(title, 8.0, 0.6, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Issued ${new Date().toLocaleDateString()}  ·  Page ${pageNo}`, 8.0, 0.78, { align: 'right' });
  doc.setDrawColor(180);
  doc.line(0.5, 0.88, 8.0, 0.88);
}

export function clip(doc: jsPDF, s: string, width: number): string {
  if (doc.getTextWidth(s) <= width) return s;
  let t = s;
  while (t.length > 1 && doc.getTextWidth(t + '…') > width) t = t.slice(0, -1);
  return t + '…';
}

export function stripboardPdf(p: Project, d: Derived, days?: ShootDay[]): jsPDF {
  return schedulePdf(p, d, 'STRIPBOARD', days, false);
}

export function shootingSchedulePdf(p: Project, d: Derived, days?: ShootDay[]): jsPDF {
  return schedulePdf(p, d, 'SHOOTING SCHEDULE', days, true);
}

function schedulePdf(p: Project, d: Derived, title: string, onlyDays: ShootDay[] | undefined, detailed: boolean): jsPDF {
  const doc = new jsPDF({ unit: 'in', format: 'letter' });
  doc.setLineWidth(0.01); // jsPDF's default is 0.2 user units — a fat border in inches
  const nums = dayNumbers(p.schedule);
  const days = (onlyDays ?? p.schedule.days).filter((day) => day.items.length && !(!nums.get(day.id) && !day.items.some((i) => i.kind === 'banner')));
  let page = 1;
  header(doc, p, title, page);
  let y = 1.1;
  const bottom = 10.5;
  const ensure = (h: number) => {
    if (y + h > bottom) {
      doc.addPage();
      page++;
      header(doc, p, title, page);
      y = 1.1;
    }
  };
  const stripH = detailed ? 0.42 : 0.25;

  for (const day of days) {
    const n = nums.get(day.id);
    const totals = dayTotals(p, d, day);
    ensure(0.35 + stripH);
    doc.setFillColor(55, 65, 81);
    doc.rect(0.5, y, 7.5, 0.3, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${n ? `DAY ${n}` : 'NO SHOOT'} — ${formatDate(day.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`, 0.6, y + 0.2);
    doc.setFont('helvetica', 'normal');
    const call = parseClock(day.times.generalCall) ?? parseClock(p.production.defaultCall);
    doc.text(`Crew call ${call !== null ? formatClock12(call) : '—'}  ·  ${totals.scenes} scenes  ·  ${formatEighths(totals.eighths)} pgs`, 7.9, y + 0.2, { align: 'right' });
    doc.setTextColor(0);
    y += 0.34;

    for (const t of cascade(p, d, day)) {
      ensure(stripH + 0.03);
      const it = t.item;
      if (it.kind === 'banner') {
        const [r, g, b] = hexToRgb(it.color);
        doc.setFillColor(r, g, b);
        doc.rect(0.5, y, 7.5, 0.24, 'F');
        doc.setTextColor(textColorFor(it.color));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${formatClock12(t.start)}  ${it.title.toUpperCase()}${it.minutes ? `  (${formatDuration(it.minutes)})` : ''}${it.note ? ' — ' + it.note : ''}`, 0.6, y + 0.16);
        doc.setTextColor(0);
        y += 0.27;
        continue;
      }
      const sc = d.sceneById.get(it.sceneId);
      if (!sc) continue;
      const color = it.completed ? '#9CA3AF' : stripColor(p, sc);
      const [r, g, b] = hexToRgb(color);
      doc.setFillColor(r, g, b);
      doc.setDrawColor(160);
      doc.rect(0.5, y, 7.5, stripH, 'FD');
      doc.setTextColor(textColorFor(color));
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(sc.number, 0.6, y + 0.17);
      doc.text(`${sc.intExt}.`, 1.05, y + 0.17);
      doc.text(clip(doc, sc.set || sc.heading, 3.0), 1.6, y + 0.17);
      doc.setFont('helvetica', 'normal');
      doc.text(sc.time, 4.7, y + 0.17);
      doc.text(`${formatEighths(sceneEighths(p, sc))} pgs`, 7.9, y + 0.17, { align: 'right' });
      doc.text(`${formatClock12(t.start)}–${formatClock12(t.end)}`, 5.4, y + 0.17);
      if (detailed) {
        doc.setFontSize(8);
        const cast = sceneCast(p, sc).map((c) => {
          const m = p.cast.find((x) => x.characterName === c);
          return m ? `${m.castNumber}. ${c}` : c;
        });
        doc.text(clip(doc, (p.sceneMeta[sc.id]?.synopsis || sc.firstAction || '').replace(/\s+/g, ' '), 3.3), 1.6, y + 0.34);
        doc.text(clip(doc, cast.join(', '), 2.8), 5.1, y + 0.34);
        doc.text(`Pg ${sc.startPage}`, 0.6, y + 0.34);
      }
      doc.setTextColor(0);
      y += stripH + 0.03;
    }
    if (n) {
      ensure(0.3);
      doc.setFillColor(17, 24, 39);
      doc.rect(0.5, y, 7.5, 0.24, 'F');
      doc.setTextColor(255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(
        `END OF DAY ${n} — ${formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })} — Total pages: ${formatEighths(totals.eighths)} — Est. time ${formatDuration(totals.minutes)}${totals.wrap !== null ? ' — Wrap ' + formatClock12(totals.wrap) : ''}`,
        4.25, y + 0.16, { align: 'center' },
      );
      doc.setTextColor(0);
      y += 0.38;
    } else y += 0.12;
  }
  return doc;
}
