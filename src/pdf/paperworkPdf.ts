import { jsPDF } from 'jspdf';
import type { PaperDoc, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { getMedia } from '../store/media';
import { money } from '../budget/calc';
import { isForm, paperLabel, personOf } from '../paperwork/paperwork';
import { LAWYER_NOTE, fillTemplate, templateFor } from '../paperwork/templates';
import { clearanceReportRows } from '../paperwork/clearanceScan';
import { unionBadge } from '../paperwork/unions';

// Paperwork as PDFs: a release or deal memo with its signature, and the script clearance report.

const PW = 612, PH = 792, M = 60;

/** The text of a document: its saved text, or (for a deal memo) the template filled from its terms. */
export function docText(p: Project, doc: PaperDoc): string {
  if (doc.body) return doc.body;
  const tpl = templateFor(p, doc.kind);
  if (!tpl) return '';
  const who = personOf(p, doc.person);
  const t = doc.deal;
  const $ = (n: number) => money(n, p.budget.currency);
  const per = (x?: string) => (x === 'flat' ? 'flat' : x === 'week' ? 'per week' : 'per day');
  return fillTemplate(tpl, p, who, t ? {
    rate: t.rate ? `${$(t.rate)} ${per(t.per)}` : '__________',
    kit: t.kitFee ? `${$(t.kitFee)} ${per(t.kitPer)}` : 'none',
    guarantee: t.guaranteedDays ? `${t.guaranteedDays} days` : 'none',
    overtime: t.per === 'flat' ? 'included in the flat rate' : `after ${t.otAfter ?? p.budget.payrollRules?.otAfter ?? 8} hours, at ${t.otMult ?? 1.5}×`,
    engagement: t.contractor ? 'an independent contractor' : 'an employee',
  } : {});
}

async function dataUrl(id?: string): Promise<string | undefined> {
  if (!id) return undefined;
  const b = await getMedia(id);
  if (!b) return undefined;
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(undefined); r.readAsDataURL(b); });
}

export async function paperDocPdfAsync(p: Project, doc: PaperDoc): Promise<jsPDF> {
  return paperDocPdf(p, doc, await dataUrl(doc.signature?.mediaId));
}

export function paperDocPdf(p: Project, doc: PaperDoc, signaturePng?: string): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = M;
  const who = personOf(p, doc.person);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(120);
  pdf.text(`${p.titlePage.title || p.title} — ${paperLabel(doc.kind)}`, M, M - 24);
  if (who && unionBadge(who)) pdf.text(unionBadge(who), PW - M, M - 24, { align: 'right' });
  pdf.setTextColor(20);
  const need = (h: number) => { if (y + h > PH - M) { pdf.addPage(); y = M; } };
  const text = docText(p, doc) || (isForm(doc.kind) ? `${paperLabel(doc.kind)} for ${who?.name ?? '—'}\n\nStatus: ${doc.status}${doc.where ? `\nKept at: ${doc.where}` : ''}\n\n(Open Gate records only that this form was received and where it's kept.)` : doc.title);
  pdf.setFontSize(10.5);
  for (const para of text.split('\n')) {
    const isHead = para.trim() && para === para.toUpperCase() && /[A-Z]/.test(para) && para.length < 40;
    pdf.setFont('helvetica', isHead ? 'bold' : 'normal');
    pdf.setFontSize(isHead ? 13 : 10.5);
    const lines = (pdf.splitTextToSize(para || ' ', PW - 2 * M) as string[]);
    for (const l of lines) { need(15); pdf.text(l, M, y); y += isHead ? 20 : 14.5; }
  }
  if (doc.signature) {
    need(130);
    y += 16;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.text('Signed in Open Gate', M, y); y += 8;
    let h = 0;
    if (signaturePng) {
      try {
        // Fit the drawing in 240 × 90 pt, keeping its shape.
        const { width, height } = pdf.getImageProperties(signaturePng);
        const s = Math.min(240 / width, 90 / height);
        h = height * s;
        pdf.addImage(signaturePng, 'PNG', M, y, width * s, h, undefined, 'FAST');
      } catch { /* unreadable */ }
    }
    y += Math.max(h, 30) + 6;
    pdf.setDrawColor(120); pdf.line(M, y, M + 240, y); y += 13;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
    pdf.text(`${doc.signature.name} — ${new Date(doc.signature.at).toLocaleString()}`, M, y);
  }
  pdf.setFontSize(7.5); pdf.setTextColor(130);
  for (let i = 1; i <= pdf.getNumberOfPages(); i++) { pdf.setPage(i); pdf.text(LAWYER_NOTE, PW / 2, PH - 30, { align: 'center' }); }
  return pdf;
}

/** The script clearance report (clearances log + licenses), for E&O insurance and festivals. */
export function clearanceReportPdf(p: Project, d: Derived): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const W = 792, H = 612, m = 40;
  const cols = [{ h: 'Kind', w: 110 }, { h: 'Item', w: 190 }, { h: 'Scenes', w: 70 }, { h: 'Status', w: 80 }, { h: 'Source', w: 90 }, { h: 'Notes', w: W - 2 * m - 540 }];
  let y = m;
  const head = () => {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.text(`${p.titlePage.title || p.title} — Script clearance report`, m, y); y += 18;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110);
    pdf.text(`${new Date().toLocaleDateString()} · Suggestions from a script scan plus your own entries and licenses. Review with your clearance counsel.`, m, y); y += 16;
    pdf.setTextColor(20); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    let x = m; for (const c of cols) { pdf.text(c.h, x, y); x += c.w; }
    y += 5; pdf.setDrawColor(160); pdf.line(m, y, W - m, y); y += 12;
    pdf.setFont('helvetica', 'normal');
  };
  head();
  for (const row of clearanceReportRows(p, d)) {
    const cells = row.map((v, i) => pdf.splitTextToSize(v || '—', cols[i].w - 8) as string[]);
    const h = Math.max(...cells.map((c) => c.length)) * 11 + 4;
    if (y + h > H - m) { pdf.addPage(); y = m; head(); }
    let x = m; cells.forEach((c, i) => { pdf.text(c, x, y); x += cols[i].w; });
    y += h;
  }
  return pdf;
}
