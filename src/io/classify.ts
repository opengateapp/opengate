import type { ElementType, ScriptLine } from '../model/types';
import type { ParsedScript } from './fountain';
import { parseHeading } from '../script/heading';

// Turns unformatted lines (from PDF, DOCX or plain text) into screenplay elements.
// Based on the screenwriting reference's 5-pass smartReformat, with indentation
// actually used for PDFs (the reference lost it when trimming lines).

export interface RawLine {
  text: string;
  /** Left edge in inches from the page edge, if known (PDF). */
  indent?: number;
  /** True if a vertical gap precedes the line. */
  gapBefore?: boolean;
  newPage?: boolean;
  /** Paragraph alignment hint (DOCX). */
  centered?: boolean;
  /** Element type already known (e.g. PDF dual-dialogue columns). */
  hint?: ElementType;
  /** Second cue of a dual-dialogue pair. */
  dual?: boolean;
  /** 1-based source page (PDF). */
  page?: number;
}

const HEADING = /^(\d+[A-Z]?\.?\s+)?(INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)[.\s]/i;
const TRANSITION = /^((FADE|CUT|DISSOLVE|SMASH CUT|MATCH CUT|JUMP CUT|TIME CUT|WIPE|IRIS)( IN| OUT| TO)?[\s\S]*[:.]|.*\bTO:)$/;
const NOT_CHARACTER = /^(THE END|END|CONTINUED|FADE IN:?|FADE OUT\.?|BLACK\.?|BACK TO SCENE|SUPER:?|TITLE:?|INTERCUT.*|OVER BLACK:?|LATER|MONTAGE.*|END MONTAGE|SERIES OF SHOTS.*|FLASHBACK.*|END FLASHBACK.*)$/;

function isCaps(s: string) {
  const core = s.replace(/\([^)]*\)/g, '');
  return /[A-Z]/.test(core) && core === core.toUpperCase();
}

function isJunk(t: string): boolean {
  return /^\d+\.?$/.test(t) || /^\(?CONTINUED\)?:?$/i.test(t) || /^\(MORE\)$/i.test(t) || /^CONTINUED:\s*\(\d+\)$/i.test(t);
}

/** Classifies by absolute indent for standard-format PDFs (Courier, 1.5" left margin). */
function byIndent(indent: number): ElementType | null {
  if (indent < 2.1) return null; // action / heading / transition decided by text
  if (indent < 2.9) return 'dialogue';
  if (indent < 3.5) return 'parenthetical';
  if (indent < 5.2) return 'character';
  return 'transition';
}

export function classify(raw: RawLine[]): ParsedScript {
  const warnings: string[] = [];
  // Pass 1: clean.
  const cleaned = raw
    .map((l) => ({ ...l, text: l.text.replace(/\s+$/, '').replace(/^\s+/, '').replace(/ /g, ' ') }))
    .filter((l, i, arr) => {
      if (!l.text) return true;
      if (isJunk(l.text)) {
        // Carry the gap so paragraphs don't merge across removed page furniture.
        if (arr[i + 1]) arr[i + 1].gapBefore = arr[i + 1].gapBefore || l.gapBefore || l.newPage;
        return false;
      }
      return true;
    });

  // Detect the action margin to normalize indents from PDFs with non-standard margins.
  const indents = cleaned.filter((l) => l.indent !== undefined && l.text).map((l) => Math.round(l.indent! * 10) / 10);
  let offset = 0;
  if (indents.length > 20) {
    const counts = new Map<number, number>();
    indents.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
    const base = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (base < 2.0) offset = 1.5 - base;
  }
  const hasIndents = indents.length > 20 && new Set(indents.map(Math.round)).size > 1;

  const out: ScriptLine[] = [];
  let prev: ElementType | null = null;
  let blank = true;

  for (const l of cleaned) {
    const t = l.text;
    if (!t) { blank = true; continue; }
    const gap = blank || !!l.gapBefore || !!l.newPage;
    blank = false;
    let type: ElementType | null = null;
    const inDialogue = prev === 'character' || prev === 'dialogue' || prev === 'parenthetical';

    if (l.hint) type = l.hint;
    else if (HEADING.test(t) && isCaps(t)) type = 'sceneHeading';
    else if (hasIndents && l.indent !== undefined) {
      type = byIndent(l.indent + offset);
      if (type === 'transition' && !isCaps(t)) type = 'action';
      if (type === 'character' && (!isCaps(t) || NOT_CHARACTER.test(t))) type = l.centered ? 'centered' : 'action';
      if (type === 'dialogue' && /^\(.*\)?$/.test(t) && t.length < 40) type = 'parenthetical';
      if (!type) type = TRANSITION.test(t) && isCaps(t) ? 'transition' : 'action';
    } else {
      if (TRANSITION.test(t) && isCaps(t) && t.length < 30) type = 'transition';
      else if (l.centered && !inDialogue) type = 'centered';
      else if (inDialogue && !gap && /^\(.*\)?$/.test(t) && t.length < 60) type = 'parenthetical';
      else if (inDialogue && !gap) type = 'dialogue';
      else if (gap && isCaps(t) && t.length <= 42 && !/[.!?:]$/.test(t.replace(/\([^)]*\)/g, '').trim()) && !NOT_CHARACTER.test(t)) type = 'character';
      else type = 'action';
    }

    // Pass 3: context fixes.
    if (!l.hint && type === 'parenthetical' && !inDialogue) type = 'action';
    if (!l.hint && type === 'dialogue' && !inDialogue) type = 'action';

    let text = t;
    let sceneNumber: string | undefined;
    if (type === 'sceneHeading') {
      const h = parseHeading(t);
      sceneNumber = h.number;
      text = t.replace(/^\d+[A-Z]{0,2}\.?\s+/, '').replace(/\s+\d+[A-Z]{0,2}\.?$/, '').toUpperCase();
    }
    if (type === 'character') text = t.replace(/\s*\(CONT'?D\)\s*$/i, '').replace(/\s*\(CONTINUING\)\s*$/i, '');

    // Pass 4: re-join wrapped lines into paragraphs.
    const last = out[out.length - 1];
    if (last && !gap && !l.newPage && type === last.type && (type === 'action' || type === 'dialogue' || type === 'parenthetical')) {
      last.text += ' ' + text;
    } else if (last && !gap && type === 'dialogue' && last.type === 'parenthetical' && !/\)$/.test(last.text)) {
      last.text += ' ' + text; // wrapped parenthetical
    } else {
      out.push({ type, text, sceneNumber, dual: l.dual || undefined });
    }
    prev = type;
  }

  if (!out.some((l) => l.type === 'sceneHeading')) warnings.push('No scene headings were detected. Check that headings start with INT. or EXT.');
  return { lines: out, warnings };
}

export function classifyPlainText(text: string): ParsedScript {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((t) => ({ text: t }));
  return classify(lines);
}
