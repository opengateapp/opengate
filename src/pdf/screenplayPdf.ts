import { jsPDF } from 'jspdf';
import type { Project, TitlePage } from '../model/types';
import { getMedia, blobToImage } from '../store/media';
import type { Derived } from '../script/derive';
import { GEOMETRY, DUAL, LINES_PER_PAGE } from '../script/paginate';

// Screenplay PDF from the shared paginator: Courier 12pt, 1" top, 1.5" left, 6 lines/inch.

const LINE = 1 / 6;
const TOP = 1.0;
const BASE = 0.135; // baseline offset within a line box

export interface ScreenplayPdfOptions {
  sceneNumbers?: boolean;
  titlePage?: boolean;
  /** Only these pages (1-based); used by sides. */
  pages?: number[];
  watermark?: string;
  /** Sides: scenes (by id) to keep; every other scene on the printed pages is crossed out. */
  keepScenes?: Set<string>;
  /** Small header line printed at the top of each page (sides). */
  header?: string;
  /** Append to an existing document instead of starting a new one. */
  doc?: jsPDF;
  /** With `doc`: draw the first page onto the document's current (blank) page. */
  firstPageExists?: boolean;
  /** Title page logo, already loaded (see screenplayPdfAsync). */
  logo?: { data: string; w: number; h: number };
}

/** Where the title page logo and title sit, in inches (shared with the on-screen title page). */
export function titleLogoBox(tp: TitlePage, ratio: number): { x: number; y: number; w: number; h: number; titleTop: number; titleBaseline: number } | null {
  let titleBaseline = 3.5;
  if (!tp.logoId) return null;
  const w = Math.max(0.5, Math.min(7.5, 8.5 * (tp.logoScale ?? 40) / 100));
  const h = w * ratio;
  const x = (8.5 - w) / 2;
  let y: number;
  const pos = tp.logoPosition ?? 'title';
  if (pos === 'title') {
    // The logo stands in for the title: centered on the title line, credit follows below it.
    y = Math.max(1.0, titleBaseline - 0.1 - h * 0.6);
    titleBaseline = y + h - 0.05;
  } else if (pos === 'top') y = 0.9;
  else if (pos === 'above') {
    y = Math.max(0.8, titleBaseline - 0.45 - h);
    titleBaseline = Math.max(titleBaseline, y + h + 0.45);
  } else y = titleBaseline + LINE * 4 + LINE * 2 * 4;
  return { x, y, w, h, titleTop: titleBaseline - 0.16, titleBaseline };
}

/** Loads the title page logo, then builds the PDF. */
export async function screenplayPdfAsync(p: Project, d: Derived, opts: ScreenplayPdfOptions = {}): Promise<jsPDF> {
  let logo: ScreenplayPdfOptions['logo'];
  const id = p.titlePage.logoId;
  if (id && opts.titlePage !== false) {
    const blob = await getMedia(id);
    if (blob) {
      const img = await blobToImage(blob);
      const c = document.createElement('canvas');
      const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      logo = { data: c.toDataURL('image/jpeg', 0.92), w: c.width, h: c.height };
    }
  }
  return screenplayPdf(p, d, { ...opts, logo });
}

export function screenplayPdf(p: Project, d: Derived, opts: ScreenplayPdfOptions = {}): jsPDF {
  const doc = opts.doc ?? new jsPDF({ unit: 'in', format: 'letter' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(12);
  let first = !opts.doc || !!opts.firstPageExists;

  if (!opts.doc && opts.titlePage !== false && (p.titlePage.title || p.titlePage.author)) {
    const tp = p.titlePage;
    const box = opts.logo ? titleLogoBox(tp, opts.logo.h / Math.max(1, opts.logo.w)) : null;
    if (box && opts.logo) doc.addImage(opts.logo.data, 'JPEG', box.x, box.y, box.w, box.h);
    const ty = box?.titleBaseline ?? 3.5;
    doc.setFont('courier', 'bold');
    // A logo in place of the title replaces the typed title.
    if (!(box && (tp.logoPosition ?? 'title') === 'title')) doc.text((tp.title || p.title).toUpperCase(), 4.25, ty, { align: 'center' });
    doc.setFont('courier', 'normal');
    let y = ty + LINE * 4;
    for (const t of [tp.credit, tp.author, '', tp.source]) {
      if (t) doc.text(t, 4.25, y, { align: 'center' });
      y += LINE * 2;
    }
    const contact = tp.contact.split('\n').filter((x, i, a) => x || i < a.length - 1);
    contact.forEach((c, i) => doc.text(c, 1.5, 9.5 - (contact.length - 1 - i) * LINE));
    if (tp.draftDate) doc.text(tp.draftDate, 7.5, 9.5, { align: 'right' });
    first = false;
  }

  const numberByBlock = new Map<number, string>();
  d.scenes.forEach((s) => numberByBlock.set(d.pagination.scenes[s.index].blockIndex, s.number));
  // Heading block index → scene id, for crossing out scenes on sides.
  const headings = d.scenes.map((s) => ({ block: d.pagination.scenes[s.index].blockIndex, id: s.id }));
  const sceneOfBlock = (b: number): string | null => {
    let found: string | null = null;
    for (const h of headings) { if (h.block <= b) found = h.id; else break; }
    return found;
  };

  for (const page of d.pagination.pages) {
    if (opts.pages && !opts.pages.includes(page.number)) continue;
    if (!first) doc.addPage();
    first = false;
    doc.setFont('courier', 'normal');
    if (page.number > 1) doc.text(`${page.number}.`, 7.5, 0.5 + BASE, { align: 'right' });
    for (const ln of page.lines) {
      if (ln.row >= LINES_PER_PAGE + 2) continue;
      const y = TOP + ln.row * LINE + BASE;
      let x = GEOMETRY[ln.type].left;
      if (ln.col) {
        const c = DUAL[ln.col];
        x = ln.type === 'character' ? c.character : ln.type === 'parenthetical' ? c.parenthetical : c.dialogue;
      }
      const bold = ln.type === 'sceneHeading';
      doc.setFont('courier', bold ? 'bold' : 'normal');
      if (ln.type === 'transition') doc.text(ln.text, 7.5, y, { align: 'right' });
      else if (ln.type === 'centered') doc.text(ln.text, 4.25, y, { align: 'center' });
      else doc.text(ln.text, x, y);
      if (opts.sceneNumbers !== false && ln.type === 'sceneHeading') {
        const num = numberByBlock.get(ln.blockIndex);
        const isFirstLine = page.lines.find((l) => l.blockIndex === ln.blockIndex) === ln;
        if (num && isFirstLine) {
          doc.setFont('courier', 'normal');
          doc.text(num, 1.0, y, { align: 'right' });
          doc.text(num, 7.6, y);
        }
      }
    }
    if (opts.keepScenes) crossOut(doc, page.lines.filter((l) => l.row < LINES_PER_PAGE + 2), (b) => {
      const id = sceneOfBlock(b);
      return !!id && opts.keepScenes!.has(id);
    });
    if (opts.header) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(opts.header, 1.0, 0.5 + BASE);
      doc.setFont('courier', 'normal');
      doc.setFontSize(12);
    }
    if (opts.watermark) {
      doc.setTextColor(200);
      doc.setFontSize(48);
      doc.text(opts.watermark, 4.25, 5.5, { align: 'center', angle: 35 });
      doc.setFontSize(12);
      doc.setTextColor(0);
    }
  }
  return doc;
}

/** Draws an X over each run of lines that belongs to a scene not on the sides. */
function crossOut(doc: jsPDF, lines: { row: number; blockIndex: number }[], keep: (block: number) => boolean) {
  const sorted = [...lines].sort((a, b) => a.row - b.row);
  const runs: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  for (const ln of sorted) {
    if (keep(ln.blockIndex)) { cur = null; continue; }
    if (cur && ln.row <= cur.to + 2) cur.to = Math.max(cur.to, ln.row);
    else { cur = { from: ln.row, to: ln.row }; runs.push(cur); }
  }
  doc.setDrawColor(110);
  doc.setLineWidth(0.015);
  for (const r of runs) {
    const y0 = TOP + r.from * LINE - 0.02;
    const y1 = TOP + (r.to + 1) * LINE + 0.02;
    doc.line(1.35, y0, 7.5, y1);
    doc.line(7.5, y0, 1.35, y1);
    doc.rect(1.35, y0, 6.15, y1 - y0);
  }
  doc.setDrawColor(0);
}
