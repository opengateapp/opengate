import { jsPDF } from 'jspdf';
import type { CreditBlock } from '../credits/credits';
import { visibleBlocks } from '../credits/credits';

// End credits as a printable list: the order and spelling to check with cast and crew before the
// roll is built. Roles right-aligned against names, headings centred, like the roll itself.

const PW = 612, PH = 792, M = 54;

export function creditsPdf(title: string, blocks: CreditBlock[]): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setLineWidth(0.5);
  let y = M;
  const mid = PW / 2;
  const header = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`${title} — end credits (check spelling and order)`, M, M - 20);
    doc.text(new Date().toLocaleDateString(), PW - M, M - 20, { align: 'right' });
    doc.setTextColor(20);
  };
  header();
  const need = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M; header(); } };
  const centred = (t: string, bold = false, size = 10) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    for (const line of doc.splitTextToSize(t, PW - 2 * M) as string[]) { need(size + 4); doc.text(line, mid, y, { align: 'center' }); y += size + 4; }
  };
  for (const b of visibleBlocks(blocks)) {
    need(40);
    if (b.heading) { centred(b.heading.toUpperCase(), true, 11); y += 6; }
    for (const l of b.lines) {
      const names = l.name.split('\n');
      if (b.style === 'columns' && l.role) {
        doc.setFontSize(10);
        need(14);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(90);
        doc.text(doc.splitTextToSize(l.role, mid - M - 12)[0] as string, mid - 10, y, { align: 'right' });
        doc.setTextColor(20); doc.setFont('helvetica', 'bold');
        names.forEach((n, i) => { if (i) { y += 14; need(14); } doc.text(doc.splitTextToSize(n, mid - M - 12)[0] as string, mid + 10, y); });
        y += 14;
      } else {
        if (l.role) { doc.setTextColor(90); centred(l.role, false, 9); doc.setTextColor(20); }
        names.forEach((n) => centred(n, b.style === 'card', b.style === 'card' ? 13 : 10));
        y += b.style === 'card' ? 14 : b.style === 'centered' ? 6 : 0;
      }
    }
    y += 18;
  }
  return doc;
}
