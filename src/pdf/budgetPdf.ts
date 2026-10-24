import { jsPDF } from 'jspdf';
import type { Project } from '../model/types';
import type { Derived } from '../script/derive';
import { budgetReport, lineFringes, lineTotal, UNIT_LABEL } from '../budget/report';
import { clip } from './schedulePdf';

// Budget PDF: a top sheet (groups and accounts, with target / actual columns when used),
// then detail pages listing every line by account.

const PW = 612, PH = 792, M = 40, CW = PW - 2 * M;

export function budgetPdf(p: Project, d: Derived, scenarioId?: string): jsPDF {
  const r = budgetReport(p, d, scenarioId);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const b = p.budget;
  let y = M;
  const newPage = () => { doc.addPage(); y = M; header(true); };
  const need = (h: number) => { if (y + h > PH - M) newPage(); };
  const header = (cont = false) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(cont ? 10 : 16); doc.setTextColor(20);
    doc.text(cont ? `${r.title} — budget (continued)` : r.title, M, y + (cont ? 10 : 16));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    const meta = [r.version, `${r.shootDays} shoot day${r.shootDays === 1 ? '' : 's'}`, p.production.company, new Date().toLocaleDateString()].filter(Boolean).join('  ·  ');
    doc.text(meta, PW - M, y + (cont ? 10 : 16), { align: 'right' });
    y += cont ? 22 : 30;
    doc.setDrawColor(40); doc.setLineWidth(0.8); doc.line(M, y, PW - M, y); y += 12;
    doc.setTextColor(20);
  };

  // ---------- top sheet ----------
  header();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('TOP SHEET', M, y); y += 16;
  const cols = [{ k: 'total', label: 'Estimate' }, ...(r.hasTargets ? [{ k: 'target', label: 'Target' }] : []), ...(r.hasActuals ? [{ k: 'actual', label: 'Actual' }] : [])];
  const colX = (i: number) => PW - M - (cols.length - 1 - i) * 90;
  const row = (label: string, vals: Record<string, number | undefined>, o: { bold?: boolean; indent?: number; rule?: boolean; size?: number } = {}) => {
    need(16);
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal'); doc.setFontSize(o.size ?? 10);
    doc.text(clip(doc, label, colX(0) - 90 - M - (o.indent ?? 0)), M + (o.indent ?? 0), y);
    cols.forEach((c, i) => { const v = vals[c.k]; if (v != null) doc.text(v ? r.$(v) : '—', colX(i), y, { align: 'right' }); });
    if (o.rule) { doc.setLineWidth(0.4); doc.line(M, y + 4, PW - M, y + 4); }
    y += o.rule ? 16 : 14;
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(90);
  cols.forEach((c, i) => doc.text(c.label.toUpperCase(), colX(i), y, { align: 'right' }));
  doc.text('ACCOUNT', M, y); doc.setTextColor(20); y += 12;
  for (const g of r.groups) {
    row(g.label, { total: g.total, target: g.target, actual: g.actual }, { bold: true, rule: true });
    for (const x of g.accounts) row(`${x.a.code}  ${x.a.name}`, { total: x.total, target: x.a.target ?? 0, actual: x.actual }, { indent: 12 });
    y += 4;
  }
  y += 4;
  row('Fringes (included above)', { total: r.t.fringes });
  row('Subtotal', { total: r.t.subtotal }, { bold: true });
  row(`Contingency (${b.contingencyPct}%)`, { total: r.t.contingency });
  for (const a of r.t.applied) row(`${a.name} (${a.credit ? '−' : ''}${a.pct}%)`, { total: a.amount });
  y += 6;
  doc.setLineWidth(1); doc.line(M, y - 14, PW - M, y - 14);
  row('TOTAL', { total: r.t.total, target: b.targetTotal, actual: r.t.actual }, { bold: true, size: 12 });

  // ---------- notes & assumptions ----------
  if (b.notes?.trim()) {
    y += 14;
    need(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('NOTES & ASSUMPTIONS', M, y); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    for (const ln of doc.splitTextToSize(b.notes.trim(), CW) as string[]) { need(12); doc.text(ln, M, y); y += 12; }
  }

  // ---------- detail ----------
  const lineGroups = r.groups.flatMap((g) => g.accounts).filter((x) => x.lines.length);
  if (lineGroups.length) {
    newPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('DETAIL', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90);
    doc.text('Key: QTY = how long · × = how many · RATE = cost of one.  QTY × × × RATE = subtotal; + fringes = total.', M + 60, y);
    doc.setTextColor(20); y += 16;
    const X = { desc: M, qty: M + 300, units: M + 312, x: M + 370, rate: M + 432, fr: M + 480, total: PW - M };
    for (const x of lineGroups) {
      need(48);
      doc.setFillColor(238, 238, 238); doc.rect(M, y - 10, CW, 16, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(`${x.a.code}  ${x.a.name}`, M + 4, y + 1);
      y += 18;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(90);
      doc.text('DESCRIPTION', X.desc, y); doc.text('QTY', X.qty, y, { align: 'right' }); doc.text('UNITS', X.units, y); doc.text('×', X.x, y, { align: 'right' });
      doc.text('RATE', X.rate, y, { align: 'right' }); doc.text('FRINGE', X.fr, y, { align: 'right' }); doc.text('TOTAL', X.total, y, { align: 'right' });
      doc.setTextColor(20); y += 12;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      for (const l of x.lines) {
        need(14);
        doc.text(clip(doc, l.description || '—', X.qty - X.desc - 30), X.desc, y);
        doc.text(String(Math.round(l.qty * 100) / 100), X.qty, y, { align: 'right' });
        doc.text(UNIT_LABEL[l.units] ?? l.units, X.units, y);
        doc.text(String(l.x), X.x, y, { align: 'right' });
        doc.text(r.$(l.rate), X.rate, y, { align: 'right' });
        const fr = r.t.lineFringe.get(l.id) ?? lineFringes(b, l);
        doc.text(fr ? r.$(fr) : '', X.fr, y, { align: 'right' });
        doc.text(r.$(r.t.lineTotal.get(l.id) ?? lineTotal(b, l)), X.total, y, { align: 'right' });
        y += 13;
        // Sub-items (what the rate is made of) and the line's note, indented under it.
        doc.setFontSize(8); doc.setTextColor(90);
        for (const it of l.items ?? []) {
          need(11);
          doc.text(clip(doc, `– ${it.description || 'Item'}`, X.qty - X.desc - 40), X.desc + 10, y);
          doc.text(`${it.qty} × ${r.$(it.rate)}`, X.rate, y, { align: 'right' });
          y += 11;
        }
        if (l.notes) {
          for (const ln of doc.splitTextToSize(l.notes, X.rate - X.desc - 10) as string[]) { need(11); doc.text(ln, X.desc + 10, y); y += 11; }
        }
        doc.setFontSize(9); doc.setTextColor(20);
      }
      doc.setFont('helvetica', 'bold');
      doc.setLineWidth(0.4); doc.line(X.rate - 40, y - 9, PW - M, y - 9);
      doc.text(`Total ${x.a.code}`, X.fr, y, { align: 'right' });
      doc.text(r.$(x.total), X.total, y, { align: 'right' });
      y += 20;
    }
  }

  // Page numbers
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`Page ${i} of ${n}`, PW - M, PH - 20, { align: 'right' });
    doc.text('Made with Open Gate', M, PH - 20);
  }
  return doc;
}
