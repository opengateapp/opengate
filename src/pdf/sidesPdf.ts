import { jsPDF } from 'jspdf';
import type { Project, ShootDay } from '../model/types';
import type { Derived } from '../script/derive';
import { formatDate } from '../model/dates';
import { dayNumbers } from '../schedule/engine';
import { dayScenes } from '../schedule/callsheet';
import { screenplayPdf } from './screenplayPdf';

// Script sides: for each shoot day, the paginated script pages that hold that day's scenes,
// with every other scene on those pages crossed out.

/** Script pages (1-based) covering a day's scenes, in page order. */
export function sidesPages(d: Derived, day: ShootDay): number[] {
  const pages = new Set<number>();
  for (const s of dayScenes(d, day)) for (let n = s.startPage; n <= s.endPage; n++) pages.add(n);
  return [...pages].sort((a, b) => a - b);
}

export function sidesPdf(p: Project, d: Derived, days: ShootDay[], opts: { crossOut?: boolean; watermark?: string } = {}): jsPDF {
  const doc = new jsPDF({ unit: 'in', format: 'letter' });
  const nums = dayNumbers(p.schedule);
  let any = false;
  for (const day of days) {
    const pages = sidesPages(d, day);
    if (!pages.length) continue;
    const scenes = dayScenes(d, day);
    const n = nums.get(day.id);
    const header = `${p.title} — SIDES — ${n ? `Day ${n}, ` : ''}${formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} — Sc. ${scenes.map((s) => s.number).join(', ')}`;
    if (any) doc.addPage();
    // The first day draws onto the blank first page; later days append after an added page.
    screenplayPdf(p, d, {
      doc, pages, titlePage: false, header, watermark: opts.watermark,
      keepScenes: opts.crossOut === false ? undefined : new Set(scenes.map((s) => s.id)),
      firstPageExists: true,
    });
    any = true;
  }
  if (!any) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text('No scenes scheduled on the selected days.', 1, 1.2);
  }
  return doc;
}
