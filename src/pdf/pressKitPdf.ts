import { jsPDF } from 'jspdf';
import type { PressKitView } from '../release/pressKit';

// The press kit as a PDF: a cover with the poster, logline and laurels, then synopsis, director's
// statement, stills, filmmakers and cast, technical details and contact.

const PW = 612, PH = 792, M = 54;

export function pressKitPdf(v: PressKitView, images: Map<string, string>): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = M;
  const W = PW - 2 * M;
  const need = (h: number) => { if (y + h > PH - M) { doc.addPage(); y = M; } };
  const text = (t: string, size = 11, bold = false, color = 20, width = W, x = M) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(color);
    for (const line of doc.splitTextToSize(t, width) as string[]) { need(size + 4); doc.text(line, x, y); y += size + 4; }
  };
  const heading = (t: string) => { need(48); y += 14; doc.setDrawColor(210); doc.line(M, y - 12, PW - M, y - 12); text(t.toUpperCase(), 9, true, 110); y += 4; };
  const paras = (s: string) => { for (const p of s.split(/\n+/).filter((x) => x.trim())) { text(p.trim()); y += 6; } };
  const image = (id: string | undefined, x: number, top: number, w: number, h: number): number => {
    const data = id ? images.get(id) : undefined;
    if (!data) return 0;
    try {
      const pr = doc.getImageProperties(data);
      const s = Math.min(w / pr.width, h / pr.height);
      doc.addImage(data, data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, top, pr.width * s, pr.height * s);
      return pr.height * s;
    } catch { return 0; }
  };

  // Cover
  const posterH = image(v.posterId, M, y, 200, 300);
  const tx = posterH ? M + 220 : M, tw = posterH ? W - 220 : W;
  const top = y;
  text(v.title, 28, true, 20, tw, tx);
  y += 4;
  if (v.logline) text(v.logline, 13, false, 40, tw, tx);
  if (v.laurels.length) { y += 6; for (const l of v.laurels) text(`★ ${l.text} — ${l.festival}${l.year ? ` ${l.year}` : ''}`, 10, true, 60, tw, tx); }
  if (v.trailerUrl) { y += 6; text(`Trailer: ${v.trailerUrl}`, 10, false, 60, tw, tx); }
  if (v.shortSynopsis) { y += 8; for (const p of v.shortSynopsis.split(/\n+/).filter((x) => x.trim())) { text(p.trim(), 11, false, 20, tw, tx); y += 4; } }
  y = Math.max(y, top + posterH + 10);

  if (v.longSynopsis) { heading('Synopsis'); paras(v.longSynopsis); }
  if (v.directorStatement) { heading('Director’s statement'); paras(v.directorStatement); }

  const stills = v.stills.filter((id) => images.has(id));
  if (stills.length) {
    heading('Stills');
    const cw = (W - 12) / 2, ch = cw * 9 / 16;
    stills.forEach((id, i) => {
      if (i % 2 === 0) need(ch + 12);
      image(id, M + (i % 2) * (cw + 12), y, cw, ch);
      if (i % 2 === 1 || i === stills.length - 1) y += ch + 12;
    });
  }

  const people = (list: PressKitView['people'], title: string) => {
    if (!list.length) return;
    heading(title);
    for (const x of list) {
      need(40);
      const ph = image(x.photoId, M, y - 10, 48, 48);
      const px = ph ? M + 60 : M, pw = ph ? W - 60 : W;
      const start = y;
      text(x.name, 12, true, 20, pw, px);
      text(x.character ? `as ${x.character}` : x.role, 10, false, 100, pw, px);
      if (x.bio) { y += 2; text(x.bio, 10, false, 40, pw, px); }
      y = Math.max(y, start + (ph ? 44 : 0)) + 8;
    }
  };
  people(v.people.filter((x) => x.role !== 'Cast'), 'Filmmakers');
  people(v.people.filter((x) => x.role === 'Cast'), 'Cast');

  if (v.specs.length) {
    heading('Technical details');
    for (const s of v.specs) { need(16); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110); doc.text(s.label, M, y); doc.setTextColor(20); doc.text(s.value, M + 120, y); y += 15; }
  }
  const c = v.contact;
  if (c.name || c.email || c.phone || v.website) { heading('Contact'); for (const t of [c.name, c.email, c.phone, v.website]) if (t) text(t, 11); }
  return doc;
}
