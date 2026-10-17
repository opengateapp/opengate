import JSZip from 'jszip';
import { parseFountain, type ParsedScript } from './fountain';
import { parseFDX } from './fdx';
import { classify, classifyPlainText, type RawLine } from './classify';
import type { ElementType, ScriptLine } from '../model/types';

export const SCRIPT_ACCEPT = '.fountain,.spmd,.md,.txt,.fdx,.xml,.pdf,.docx,.highland,.celtx,.html,.htm';

/** Imports any supported screenplay file into format-neutral script lines. */
export async function importScriptFile(file: File): Promise<ParsedScript> {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() ?? '';
  if (ext === 'fdx' || ext === 'xml') return parseFDX(await file.text());
  if (ext === 'fountain' || ext === 'spmd' || ext === 'md') return parseFountain(await file.text());
  if (ext === 'txt') {
    const text = await file.text();
    // Plain text exported from screenwriting apps is usually valid Fountain.
    const f = parseFountain(text);
    return f.lines.some((l) => l.type === 'character') ? f : classifyPlainText(text);
  }
  if (ext === 'pdf') {
    const { pdfToRawLines } = await import('./pdfImport');
    let raw = await pdfToRawLines(await file.arrayBuffer());
    // A first page with no scene headings and little text is a title page.
    const first = raw.filter((l) => l.page === 1 && l.text.trim());
    let titlePage: ParsedScript['titlePage'];
    if (raw.some((l) => (l.page ?? 1) > 1) && first.length < 20 && !first.some((l) => /^(\d+\s+)?(INT|EXT|I\/E)[.\s]/i.test(l.text))) {
      raw = raw.filter((l) => l.page !== 1);
      const texts = first.map((l) => l.text.trim());
      const by = texts.findIndex((t) => /^((written|screenplay|story)\s+)?by\b/i.test(t));
      const byLine = by >= 0 ? texts[by] : '';
      const inlineAuthor = byLine.replace(/^((written|screenplay|story)\s+)?by\s*/i, '');
      titlePage = {
        title: texts[0] ?? '',
        credit: by >= 0 ? byLine.slice(0, byLine.length - inlineAuthor.length).trim() || 'Written by' : '',
        author: inlineAuthor || (by >= 0 ? texts[by + 1] ?? '' : ''),
        contact: texts.slice(by >= 0 ? by + (inlineAuthor ? 1 : 2) : 1).join('\n'),
      };
    }
    const r = classify(raw);
    r.titlePage = titlePage;
    r.warnings.unshift('Imported from PDF — check element types, especially dual dialogue and centered text.');
    return r;
  }
  if (ext === 'docx') return importDocx(await file.arrayBuffer());
  if (ext === 'doc') throw new Error('Old .doc files are not supported. Save as .docx, PDF or Fountain and import that.');
  if (ext === 'highland') return importHighland(await file.arrayBuffer());
  if (ext === 'celtx') return importCeltx(await file.arrayBuffer());
  if (ext === 'html' || ext === 'htm') return importCeltxHtml(await file.text());
  throw new Error(`Unsupported file type: .${ext}`);
}

async function importDocx(buf: ArrayBuffer): Promise<ParsedScript> {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paras = Array.from(doc.body.children).map((el) => ({
    text: (el.textContent ?? '').trim(),
    centered: !!el.getAttribute('style')?.includes('center'),
  }));
  // Word paragraphs are the unit: insert a gap except between a cue and its dialogue.
  const raw: RawLine[] = paras.map((p, i) => ({ ...p, gapBefore: i === 0 || needsBlank(paras[i - 1].text, p.text) }));
  const res = classify(raw);
  res.warnings.unshift('Imported from Word — check element types.');
  return res;
}

/** DOCX scripts rarely have empty paragraphs between cue and dialogue, but do between action blocks. */
function needsBlank(prev: string, cur: string): boolean {
  const caps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
  if (caps(prev) && prev.length < 40 && !/[:.]$/.test(prev)) return false; // cue → dialogue
  if (/^\(.*\)$/.test(prev)) return false;
  if (/^\(.*\)$/.test(cur)) return false;
  return true;
}

async function importHighland(buf: ArrayBuffer): Promise<ParsedScript> {
  const zip = await JSZip.loadAsync(buf);
  const entry = Object.values(zip.files).find((f) => /(^|\/)text\.(fountain|markdown|md|txt)$/i.test(f.name))
    ?? Object.values(zip.files).find((f) => /\.(fountain|md|txt)$/i.test(f.name) && !f.dir);
  if (!entry) throw new Error('No script text found inside the .highland file.');
  return parseFountain(await entry.async('string'));
}

async function importCeltx(buf: ArrayBuffer): Promise<ParsedScript> {
  const zip = await JSZip.loadAsync(buf);
  const entry = Object.values(zip.files).find((f) => /script[^/]*\.html?$/i.test(f.name));
  if (!entry) throw new Error('No screenplay found inside the .celtx file. In Celtx, export the script as Final Draft (.fdx) or PDF and import that instead.');
  return importCeltxHtml(await entry.async('string'));
}

const CELTX_CLASSES: Record<string, ElementType> = {
  sceneheading: 'sceneHeading', action: 'action', character: 'character', dialog: 'dialogue', dialogue: 'dialogue',
  parenthetical: 'parenthetical', transition: 'transition', shot: 'shot', act: 'centered',
};

function importCeltxHtml(html: string): ParsedScript {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: ScriptLine[] = [];
  for (const p of Array.from(doc.querySelectorAll('p'))) {
    const cls = (p.className || '').toLowerCase();
    const type = CELTX_CLASSES[cls];
    const text = (p.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!type || !text) continue;
    lines.push({ type, text });
  }
  if (!lines.length) return classifyPlainText(doc.body.innerText ?? doc.body.textContent ?? '');
  return { lines, warnings: [] };
}
