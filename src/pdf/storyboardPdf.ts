import { jsPDF } from 'jspdf';
import type { Project, StoryboardSettings } from '../model/types';
import type { Derived } from '../script/derive';
import { storyboardPanels, PANEL_SHOT_TYPES, shotTypeCodes, type Panel } from '../script/storyboard';
import { clip } from './schedulePdf';
import { formatOf } from '../tabs/storyboard/formats';

// Storyboard PDF. 1–3 panels per page: portrait pages laid out like a classic storyboard
// sheet (scene / shot # header, frame, set plan box, shot-type checkboxes, lens, description).
// 4 or 6 per page: landscape grid. `images` maps frame id → frame JPEG and "ref:<id>" → set plan
// JPEG (rendered in the browser by tabs/storyboard/render.ts so this module stays testable).

export const DEFAULT_STORYBOARD: StoryboardSettings = { perPage: 2, showReference: true };

export function storyboardPdf(p: Project, d: Derived, images: Map<string, string>, settings: StoryboardSettings = DEFAULT_STORYBOARD): jsPDF {
  const panels = storyboardPanels(p, d);
  const per = settings.perPage;
  const grid = per >= 4;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: grid ? 'landscape' : 'portrait' });
  doc.setLineWidth(0.6);
  const PW = grid ? 792 : 612;
  const PH = grid ? 612 : 792;
  const M = 40;
  const pages = Math.max(1, Math.ceil(panels.length / per));
  for (let pg = 0; pg < pages; pg++) {
    if (pg) doc.addPage();
    header(doc, p.title, pg + 1, pages, PW, M);
    const list = panels.slice(pg * per, (pg + 1) * per);
    if (!list.length) { doc.setFontSize(11); doc.text('No storyboard panels yet.', M, M + 60); break; }
    if (grid) {
      const cols = per === 4 ? 2 : 3;
      const rows = 2;
      const gap = 18;
      const w = (PW - 2 * M - gap * (cols - 1)) / cols;
      const h = (PH - 2 * M - 40 - gap * (rows - 1)) / rows;
      list.forEach((panel, i) => gridPanel(doc, panel, images, M + (i % cols) * (w + gap), M + 40 + Math.floor(i / cols) * (h + gap), w, h, formatOf(settings).ratio));
    } else {
      const gap = per === 1 ? 0 : 26;
      const h = (PH - 2 * M - 46 - gap * (per - 1)) / per;
      list.forEach((panel, i) => sheetPanel(doc, panel, images, M, M + 46 + i * (h + gap), PW - 2 * M, h, settings.showReference, formatOf(settings).ratio, per === 1));
    }
  }
  return doc;
}

function header(doc: jsPDF, title: string, page: number, pages: number, PW: number, M: number) {
  doc.setTextColor(60);
  doc.setFont('times', 'normal');
  doc.setFontSize(15);
  doc.text('PROJECT', M, M + 14);
  doc.setFontSize(12);
  doc.setTextColor(20);
  doc.text(clip(doc, title || 'Untitled', PW - 2 * M - 220), M + 80, M + 12);
  doc.setDrawColor(150);
  doc.line(M + 76, M + 16, PW - M - 130, M + 16);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text('PAGE', PW - M - 112, M + 14);
  doc.setTextColor(20);
  doc.text(String(page), PW - M - 62, M + 12, { align: 'center' });
  doc.text(String(pages), PW - M - 16, M + 12, { align: 'center' });
  doc.line(PW - M - 78, M + 16, PW - M - 46, M + 16);
  doc.setTextColor(150);
  doc.text('/', PW - M - 39, M + 14);
  doc.line(PW - M - 30, M + 16, PW - M, M + 16);
  doc.setTextColor(0);
}

function sceneLabel(panel: Panel) {
  return panel.scene ? `${panel.scene.number}. ${panel.scene.heading}` : '';
}

function shotLabel(panel: Panel) {
  return `${panel.shot.shotNumber || ''}${panel.frameCount > 1 ? `  (${panel.frameNo}/${panel.frameCount})` : ''}`;
}

/** Image fitted into a box (letterboxed on white). */
function fit(doc: jsPDF, data: string | undefined, x: number, y: number, w: number, h: number) {
  if (!data) return;
  // Frames come in the storyboard's format (9:16, 2.39…): fit by the image's own shape.
  let iw = 16, ih = 9;
  try { const pr = doc.getImageProperties(data); if (pr.width && pr.height) { iw = pr.width; ih = pr.height; } } catch { /* keep 16:9 */ }
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  try { doc.addImage(data, data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); } catch { /* unreadable image */ }
}

function checkboxes(doc: jsPDF, panel: Panel, x: number, y: number, size = 9, gapAfter = 30) {
  const on = new Set(shotTypeCodes(panel.shot.shotType));
  let cx = x;
  doc.setFont('times', 'normal');
  doc.setFontSize(size + 1);
  for (const t of PANEL_SHOT_TYPES) {
    doc.setDrawColor(130);
    doc.rect(cx, y - size, size, size);
    if (on.has(t.code)) {
      doc.setDrawColor(20);
      doc.setLineWidth(1.2);
      doc.line(cx + 2, y - size / 2, cx + size * 0.42, y - 2);
      doc.line(cx + size * 0.42, y - 2, cx + size - 1.5, y - size + 2);
      doc.setLineWidth(0.6);
    }
    doc.setTextColor(60);
    doc.text(t.label, cx + size + 5, y - 1);
    cx += size + 5 + doc.getTextWidth(t.label) + gapAfter * 0.5;
  }
  const others = shotTypeCodes(panel.shot.shotType).filter((c) => !PANEL_SHOT_TYPES.some((t) => t.code === c));
  if (others.length) doc.text(others.join(' / '), cx, y - 1);
  doc.setTextColor(0);
}

function descriptionText(panel: Panel) {
  return (panel.shot.action || panel.frame?.caption || panel.shot.name || '').trim();
}

function sheetPanel(doc: jsPDF, panel: Panel, images: Map<string, string>, x: number, y: number, w: number, h: number, showRef: boolean, ratio = 16 / 9, single = false) {
  // One per page: the frame spans the page width and the set plan sits under it. 2–3 per page:
  // the set plan sits beside the frame. Either way the frame box keeps the format's shape.
  const refW = showRef && !single ? Math.round(w * 0.335) : 0;
  const gap = refW ? 18 : 0;
  const fw = w - refW - gap;
  const headH = 26;
  const below = single ? (showRef ? 300 : 190) : Math.min(118, h * 0.36);
  let iw = fw, ih = fw / ratio;
  const maxH = h - below - headH;
  if (ih > maxH) { ih = maxH; iw = ih * ratio; }
  const ix = x + (fw - iw) / 2;
  doc.setDrawColor(150);
  // SCENE / SHOT # header over the frame.
  doc.rect(x, y, fw, headH);
  const shotW = Math.min(150, fw * 0.24);
  doc.line(x + fw - shotW, y, x + fw - shotW, y + headH);
  doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(60);
  doc.text('SCENE:', x + 8, y + 17);
  doc.text('SHOT #:', x + fw - shotW + 8, y + 17);
  doc.setTextColor(10);
  doc.text(clip(doc, sceneLabel(panel), fw - shotW - 62), x + 50, y + 17);
  doc.text(clip(doc, shotLabel(panel), shotW - 56), x + fw - shotW + 52, y + 17);
  // The frame, in the storyboard's format, centred under the header.
  doc.rect(ix, y + headH, iw, ih);
  if (panel.frame) fit(doc, images.get(panel.frame.id), ix + 1, y + headH + 1, iw - 2, ih - 2);
  // Set plan / reference box beside the frame (16:9).
  if (refW) {
    const rx = x + fw + gap;
    const rh = Math.min(refW / (16 / 9), ih);
    doc.setDrawColor(150);
    doc.rect(rx, y, refW, headH);
    doc.rect(rx, y + headH, refW, rh);
    doc.setTextColor(60);
    doc.text('SET PLAN', rx + 8, y + 17);
    doc.setTextColor(0);
    if (panel.frame) fit(doc, images.get('ref:' + panel.frame.id), rx + 1, y + headH + 1, refW - 2, rh - 2);
  }
  // Checkboxes, lens, description lines.
  const cy = y + headH + ih + 22;
  checkboxes(doc, panel, x + 4, cy);
  if (refW) {
    const lx = x + fw + gap;
    doc.setTextColor(60); doc.setFontSize(10);
    doc.text('LENS:', lx, cy - 1);
    doc.setTextColor(10);
    doc.text(clip(doc, panel.shot.lens || '', refW - 44), lx + 38, cy - 2);
    doc.setDrawColor(150);
    doc.line(lx + 34, cy + 1, lx + refW, cy + 1);
  } else if (panel.shot.lens) {
    doc.setTextColor(60); doc.setFontSize(10);
    doc.text(`LENS: ${panel.shot.lens}`, x + w, cy - 1, { align: 'right' });
  }
  const lineGap = 17;
  let tx = x, tw = w, ty = cy + 16, nLines = Math.max(1, Math.floor((y + h - ty) / lineGap));
  if (single && showRef) {
    // Set plan under the frame on the left, description lines beside it.
    const sw = Math.round(w * 0.42), sh = sw / (16 / 9), sy = cy + 14;
    doc.setDrawColor(150);
    doc.rect(x, sy, sw, headH);
    doc.rect(x, sy + headH, sw, sh);
    doc.setTextColor(60); doc.setFontSize(10);
    doc.text('SET PLAN', x + 8, sy + 17);
    doc.setTextColor(0);
    if (panel.frame) fit(doc, images.get('ref:' + panel.frame.id), x + 1, sy + headH + 1, sw - 2, sh - 2);
    tx = x + sw + 18; tw = w - sw - 18; ty = sy + 14;
    nLines = Math.max(1, Math.floor((headH + sh) / lineGap));
  } else if (single) nLines = Math.min(nLines, 8);
  doc.setFont('times', 'normal'); doc.setFontSize(10); doc.setTextColor(20);
  const text = doc.splitTextToSize(descriptionText(panel), tw - 8) as string[];
  for (let i = 0; i < nLines; i++) {
    const ly = ty + i * lineGap;
    doc.setDrawColor(170);
    doc.line(tx, ly + 4, tx + tw, ly + 4);
    if (text[i]) doc.text(text[i], tx + 2, ly);
  }
  doc.setTextColor(0);
}

function gridPanel(doc: jsPDF, panel: Panel, images: Map<string, string>, x: number, y: number, w: number, h: number, ratio = 16 / 9) {
  const ih = Math.min(w / ratio, h - 58);
  const iw = ih * ratio;
  doc.setDrawColor(120);
  doc.rect(x, y, iw, ih);
  if (panel.frame) fit(doc, images.get(panel.frame.id), x + 1, y + 1, iw - 2, ih - 2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text(clip(doc, `${panel.scene ? `Sc ${panel.scene.number} · ` : ''}Shot ${shotLabel(panel) || '—'}`, iw * 0.6), x, y + ih + 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90);
  doc.text(clip(doc, [shotTypeCodes(panel.shot.shotType).map((c) => PANEL_SHOT_TYPES.find((t) => t.code === c)?.label ?? c).join('/'), panel.shot.lens, panel.shot.move].filter(Boolean).join(' · '), iw * 0.4), x + iw, y + ih + 12, { align: 'right' });
  doc.setTextColor(0); doc.setFontSize(8);
  const lines = (doc.splitTextToSize(descriptionText(panel), iw) as string[]).slice(0, Math.max(1, Math.floor((h - ih - 20) / 10)));
  lines.forEach((ln, k) => doc.text(ln, x, y + ih + 24 + k * 10));
}
