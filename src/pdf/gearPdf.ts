import { jsPDF } from 'jspdf';
import type { Project } from '../model/types';
import type { Derived } from '../script/derive';
import { money } from '../budget/calc';
import { GEAR_CATEGORIES, SOURCE_LABEL, gearCost, gearTotals } from '../budget/gear';
import { clip } from './schedulePdf';

// Gear manifest PDF: every item by category with quantity, own / rent, days and cost
// (costs left out when the budget isn't shared with this person), plus totals and savings.

const PW = 612, PH = 792, M = 40;

export function gearPdf(p: Project, d: Derived, withCost = true): jsPDF {
  void d;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setLineWidth(0.5);
  const t = gearTotals(p);
  const $ = (n: number) => money(n, p.budget.currency);
  const wk = p.budget.rentalWeekDays ?? 3;
  let y = M;

  const header = (cont = false) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(cont ? 10 : 16); doc.setTextColor(20);
    doc.text(`${p.title || 'Untitled'} — gear manifest${cont ? ' (continued)' : ''}`, M, y + (cont ? 10 : 16));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
    doc.text(new Date().toLocaleDateString(), PW - M, y + (cont ? 10 : 16), { align: 'right' });
    y += cont ? 22 : 30;
    doc.setDrawColor(40); doc.line(M, y, PW - M, y); y += 14; doc.setTextColor(20);
  };
  const need = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M; header(true); } };
  const cols = withCost
    ? [{ l: 'Item', x: M, w: 200 }, { l: 'Qty', x: 250, w: 30 }, { l: 'Own / rent', x: 285, w: 60 }, { l: 'Days', x: 350, w: 35 }, { l: 'Rate', x: 390, w: 70 }, { l: 'Cost', x: PW - M, w: 70, right: true }]
    : [{ l: 'Item', x: M, w: 280 }, { l: 'Qty', x: 330, w: 30 }, { l: 'Own / rent', x: 370, w: 70 }, { l: 'Days', x: 450, w: 40 }, { l: 'Notes', x: 495, w: PW - M - 495 }];

  header();
  for (const c of GEAR_CATEGORIES) {
    const items = (p.gear ?? []).filter((g) => g.category === c.id);
    if (!items.length) continue;
    need(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(c.label.toUpperCase(), M, y); y += 14;
    doc.setFontSize(8); doc.setTextColor(110);
    for (const col of cols) doc.text(col.l, col.x, y, { align: col.right ? 'right' : 'left' });
    doc.setTextColor(20); y += 4; doc.setDrawColor(180); doc.line(M, y, PW - M, y); y += 11;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    for (const g of items) {
      need(14);
      const days = t.days.get(g.id) ?? 0;
      const cost = gearCost(g, days, wk);
      const paid = g.source === 'rent' || g.source === 'buy';
      const vals = withCost
        ? [g.name + (g.notes ? ` — ${g.notes}` : ''), String(g.qty), SOURCE_LABEL[g.source], g.source === 'buy' ? '—' : String(days), g.rate ? `${$(g.rate)}${g.source === 'buy' ? '' : ` / ${g.rateUnit}`}` : '—', paid ? $(cost) : '$0']
        : [g.name, String(g.qty), SOURCE_LABEL[g.source], g.source === 'buy' ? '—' : String(days), g.notes ?? ''];
      cols.forEach((col, i) => doc.text(clip(doc, vals[i], col.w), col.x, y, { align: col.right ? 'right' : 'left' }));
      y += 14;
    }
    y += 6;
  }
  if (withCost) {
    need(80);
    doc.setDrawColor(40); doc.line(M, y, PW - M, y); y += 16;
    const total = (label: string, v: number, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(10); doc.text(label, M, y); doc.text($(v), PW - M, y, { align: 'right' }); y += 15; };
    total('Rentals', t.rent);
    total('Purchases', t.buy);
    if (t.upkeep) total(`Insurance & upkeep on owned gear (${p.budget.ownedGearPct}%)`, t.upkeep);
    total('Gear total', t.rent + t.buy + t.upkeep, true);
    doc.setTextColor(30, 120, 60);
    if (t.ownSaves) total('Saved by gear you own', t.ownSaves);
    if (t.borrowSaves) total('Saved by borrowed gear', t.borrowSaves);
    doc.setTextColor(20);
  }
  if (!(p.gear ?? []).length) { doc.setFontSize(11); doc.text('No gear yet.', M, y + 10); }
  return doc;
}
