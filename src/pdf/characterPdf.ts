import { jsPDF } from 'jspdf';
import type { CharacterProfile, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { blobToImage, getMedia } from '../store/media';
import { PROFILE_SECTIONS, TRAIT_LISTS, alignmentLabel, normName, scenesFor } from '../script/characters';
import { kindOf, relationshipsOf, toneLabel } from '../script/relationships';

// Character profile sheets, laid out like a printed character profile template: section
// titles, shaded label cells with ruled answer lines, portrait top right, and a last page of
// continuity photos (wardrobe, hair & makeup) with their looks and scenes.

interface PdfImage { data: string; w: number; h: number }

const PW = 612, PH = 792, M = 40;
const NAVY: [number, number, number] = [24, 38, 110];
const LABEL_FILL: [number, number, number] = [236, 242, 248];

async function load(id: string | undefined, max: number): Promise<PdfImage | undefined> {
  if (!id) return;
  const blob = await getMedia(id);
  if (!blob) return;
  try {
    const img = await blobToImage(blob);
    const c = document.createElement('canvas');
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
  } catch { return undefined; }
}

/** Loads portraits and continuity photos, then builds the PDF. ids: which profiles (default: all). */
export async function characterPdfAsync(p: Project, d: Derived, ids?: string[]): Promise<jsPDF> {
  const profiles = ids ? p.characters.filter((c) => ids.includes(c.id)) : p.characters;
  const images = new Map<string, PdfImage>();
  for (const c of profiles) {
    for (const [id, max] of [[c.portraitId, 600], ...c.continuity.map((x) => [x.imageId, 700] as const)] as const) {
      if (id && !images.has(id)) { const img = await load(id, max); if (img) images.set(id, img); }
    }
  }
  return characterPdf(p, d, profiles, images);
}

function fitImage(doc: jsPDF, img: PdfImage | undefined, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(200);
  doc.rect(x, y, w, h);
  if (!img) return;
  const s = Math.min(w / img.w, h / img.h);
  const dw = img.w * s, dh = img.h * s;
  try { doc.addImage(img.data, 'JPEG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); } catch { /* unreadable */ }
}

export function characterPdf(p: Project, d: Derived, profiles: CharacterProfile[], images: Map<string, PdfImage> = new Map()): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  doc.setLineWidth(0.5);
  let first = true;

  for (const c of profiles) {
    if (!first) doc.addPage();
    first = false;
    let y = M;

    const newPage = () => { doc.addPage(); y = M; };
    const need = (h: number) => { if (y + h > PH - M) newPage(); };

    // Header
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0);
    doc.text('Character Profile', M, y + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text('OPEN GATE', PW - M, y + 14, { align: 'right' });
    y += 34;

    /** A shaded label cell and a ruled answer; returns the row height. */
    const row = (label: string, value: string, x: number, w: number, labelW: number): number => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const lines = doc.splitTextToSize(value || '', w - labelW - 10) as string[];
      const h = Math.max(20, lines.length * 11 + 9);
      doc.setFillColor(...LABEL_FILL); doc.setDrawColor(210);
      doc.rect(x, y, labelW, h, 'FD');
      doc.setTextColor(40);
      doc.text(`${label}:`, x + labelW - 5, y + 13, { align: 'right' });
      doc.setTextColor(0);
      doc.text(lines, x + labelW + 6, y + 13);
      doc.setDrawColor(120);
      doc.line(x + labelW + 4, y + h - 3, x + w, y + h - 3);
      return h;
    };

    // Script title / character name, with the portrait to the right of the core block.
    const portraitW = 120, portraitH = 150;
    const leftW = PW - 2 * M - portraitW - 14;
    const top = y;
    y += row('Script title', p.title, M, leftW, 100) + 4;
    y += row('Character name', c.name + (c.info.fullName ? ` (${c.info.fullName})` : ''), M, leftW, 100) + 4;
    const scenes = scenesFor(p, d, c.name);
    const cast = p.cast.find((x) => normName(x.characterName) === c.name);
    const core: [string, string][] = [
      ['Race / species', c.race], ['Gender', c.gender], ['Role', c.role], ['Alignment', alignmentLabel(c.alignment)],
      ['Intro / extrovert', c.introExtro == null ? '' : c.introExtro < 40 ? 'Introvert' : c.introExtro > 60 ? 'Extrovert' : 'Ambivert'],
      ['Played by', cast ? `${cast.actorName || '—'}${cast.castNumber ? ` (#${cast.castNumber})` : ''}` : ''],
      ['Scenes', scenes.length ? `${scenes.length} — ${scenes.map((s) => s.number).join(', ')}` : ''],
    ];
    for (const [l, v] of core) y += row(l, v, M, leftW, 100) + 2;
    fitImage(doc, images.get(c.portraitId ?? ''), PW - M - portraitW, top, portraitW, portraitH);
    y = Math.max(y, top + portraitH) + 8;

    const section = (title: string) => {
      need(44);
      y += 8;
      doc.setFont('times', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY);
      doc.text(title, PW / 2, y + 12, { align: 'center' });
      doc.setTextColor(0);
      y += 22;
    };

    section('Strengths & Weaknesses');
    for (const t of TRAIT_LISTS) { const v = c[t.k].join(', '); need(22); y += row(t.label, v, M, PW - 2 * M, 110) + 2; }

    const rels = relationshipsOf(p, c.name);
    if (rels.length) {
      section('Relationships');
      for (const { r, other, outgoing } of rels) {
        const dir = r.oneWay ? (outgoing ? ' (one way: ' + c.name + ' → ' + other + ')' : ' (one way: ' + other + ' → ' + c.name + ')') : '';
        const what = [kindOf(r.kind).label, toneLabel(r.tone), r.label].filter(Boolean).join(' · ') + dir + (r.notes ? ' — ' + r.notes : '');
        need(22);
        y += row(other, what, M, PW - 2 * M, 110) + 2;
      }
    }

    const colW = (PW - 2 * M - 16) / 2;
    for (const sec of PROFILE_SECTIONS) {
      section(sec.title);
      const short = sec.fields.filter((f) => !f.long);
      for (let i = 0; i < short.length; i += 2) {
        need(22);
        const y0 = y;
        const h1 = row(short[i].label, c.info[short[i].k] ?? '', M, colW, 110);
        y = y0;
        const h2 = short[i + 1] ? row(short[i + 1].label, c.info[short[i + 1].k] ?? '', M + colW + 16, colW, 110) : 0;
        y = y0 + Math.max(h1, h2) + 2;
      }
      for (const f of sec.fields.filter((x) => x.long)) { need(22); y += row(f.label, c.info[f.k] ?? '', M, PW - 2 * M, 110) + 2; }
    }

    // Continuity
    if (c.continuity.length) {
      newPage();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(`${c.name} — Continuity`, M, y + 14);
      y += 28;
      for (const kind of ['wardrobe', 'hair'] as const) {
        const photos = c.continuity.filter((x) => x.kind === kind);
        if (!photos.length) continue;
        section(kind === 'wardrobe' ? 'Wardrobe' : 'Hair & Makeup');
        const cols = 3, gap = 12, w = (PW - 2 * M - gap * (cols - 1)) / cols, ih = w * 1.1, h = ih + 42;
        photos.forEach((ph, i) => {
          if (i % cols === 0) { if (i) y += h + gap; need(h); }
          const x = M + (i % cols) * (w + gap);
          fitImage(doc, images.get(ph.imageId), x, y, w, ih);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
          doc.text((doc.splitTextToSize(ph.look || ph.caption || ' ', w) as string[])[0], x, y + ih + 12);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70);
          if (ph.look && ph.caption) doc.text((doc.splitTextToSize(ph.caption, w) as string[])[0], x, y + ih + 23);
          const sc = ph.sceneIds.map((id) => d.sceneById.get(id)?.number).filter(Boolean).join(', ');
          if (sc) doc.text((doc.splitTextToSize(`Scenes ${sc}`, w) as string[])[0], x, y + ih + 34);
          doc.setTextColor(0);
        });
        y += h + gap;
      }
    }
  }
  if (first) { doc.setFontSize(12); doc.text('No character profiles yet.', M, M + 20); }
  return doc;
}
