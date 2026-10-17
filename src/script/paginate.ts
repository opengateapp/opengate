import type { ElementType } from '../model/types';
import type { Block } from './schema';

// Screenplay pagination with real word wrap (Courier 12pt = 10 chars/inch, 6 lines/inch).
// One layout feeds the on-screen page markers, scene eighths, PDF export and sides.

export const LINES_PER_PAGE = 54;
export const ROWS_PER_EIGHTH = LINES_PER_PAGE / 8;

/** Column geometry in inches from the left edge of an 8.5" page. */
export const GEOMETRY: Record<ElementType | 'more' | 'contd', { left: number; width: number }> = {
  sceneHeading: { left: 1.5, width: 60 },
  action: { left: 1.5, width: 60 },
  shot: { left: 1.5, width: 60 },
  transition: { left: 1.5, width: 60 },
  centered: { left: 1.5, width: 60 },
  character: { left: 3.7, width: 38 },
  contd: { left: 3.7, width: 38 },
  parenthetical: { left: 3.1, width: 25 },
  dialogue: { left: 2.5, width: 35 },
  lyric: { left: 2.5, width: 35 },
  more: { left: 3.7, width: 20 },
  pageBreak: { left: 1.5, width: 60 },
};

/** Dual-dialogue columns (left speaker, right speaker). */
export const DUAL = {
  L: { character: 2.6, parenthetical: 1.9, dialogue: 1.5, width: 27, parenWidth: 22 },
  R: { character: 5.4, parenthetical: 4.7, dialogue: 4.3, width: 27, parenWidth: 22 },
};

export interface LaidLine {
  row: number;
  text: string;
  type: ElementType | 'more' | 'contd';
  blockIndex: number;
  col?: 'L' | 'R';
}

export interface Page {
  number: number;
  lines: LaidLine[];
}

export interface SceneSpan {
  blockIndex: number; // index of the heading block
  startPage: number;
  endPage: number;
  rows: number;
  eighths: number;
}

export interface Pagination {
  pages: Page[];
  /** Page/row where each block's first line landed (-1 for blocks with no lines). */
  blockStart: { page: number; row: number }[];
  scenes: SceneSpan[];
}

const SPACE_BEFORE: Record<ElementType, number> = {
  sceneHeading: 1, action: 1, character: 1, parenthetical: 0, dialogue: 0,
  transition: 1, centered: 1, shot: 1, lyric: 0, pageBreak: 0,
};

const isDialoguePart = (t: ElementType) => t === 'parenthetical' || t === 'dialogue' || t === 'lyric';

export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (let w of words) {
      while (w.length > width) {
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= width) line += ' ' + w;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

function displayText(b: Block): string {
  const t = b.text;
  switch (b.type) {
    case 'sceneHeading':
    case 'character':
    case 'transition':
    case 'shot':
      return t.toUpperCase();
    case 'parenthetical': {
      const s = t.trim();
      if (!s) return '()';
      return (s.startsWith('(') ? s : '(' + s) + (s.endsWith(')') ? '' : ')');
    }
    default:
      return t;
  }
}

interface Piece { type: ElementType | 'more' | 'contd'; text: string; blockIndex: number; col?: 'L' | 'R'; gap: number }

export function paginate(blocks: Block[]): Pagination {
  const pages: Page[] = [{ number: 1, lines: [] }];
  const blockStart = blocks.map(() => ({ page: -1, row: -1 }));
  let page = 0;
  let row = 0;

  const remaining = () => LINES_PER_PAGE - row;
  const newPage = () => {
    page++;
    row = 0;
    pages.push({ number: page + 1, lines: [] });
  };
  const gapAt = (gap: number) => (row === 0 ? 0 : gap);
  const put = (p: Omit<Piece, 'gap'>, rowOverride?: number) => {
    const r = rowOverride ?? row;
    pages[page].lines.push({ row: r, text: p.text, type: p.type, blockIndex: p.blockIndex, col: p.col });
    const bs = blockStart[p.blockIndex];
    if (bs.page === -1) { bs.page = page; bs.row = r; }
  };

  const linesOf = (i: number, width?: number): string[] => {
    const b = blocks[i];
    return wrap(displayText(b), width ?? GEOMETRY[b.type].width);
  };

  /** Character + parenthetical/dialogue run starting at i. Returns end index (exclusive). */
  const groupEnd = (i: number) => {
    let j = i + 1;
    while (j < blocks.length && isDialoguePart(blocks[j].type)) j++;
    return j;
  };

  const groupPieces = (i: number, end: number, col?: 'L' | 'R'): Piece[] => {
    const pieces: Piece[] = [];
    for (let k = i; k < end; k++) {
      const t = blocks[k].type;
      let width: number | undefined;
      if (col) width = t === 'parenthetical' ? DUAL[col].parenWidth : DUAL[col].width;
      for (const text of linesOf(k, width)) pieces.push({ type: t, text, blockIndex: k, col, gap: 0 });
    }
    return pieces;
  };

  /** Height of the first unit starting at block i (used for keep-with-next). */
  const leadHeight = (i: number): number => {
    if (i >= blocks.length) return 0;
    const b = blocks[i];
    if (b.type === 'character') return 2; // cue + first dialogue line
    if (b.type === 'pageBreak') return 0;
    return Math.min(2, linesOf(i).length);
  };

  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];

    if (b.type === 'pageBreak') {
      if (row > 0) newPage();
      i++;
      continue;
    }

    if (b.type === 'character') {
      const end = groupEnd(i);
      // Dual dialogue: next group's cue flagged dual → lay both side by side.
      if (end < blocks.length && blocks[end].type === 'character' && blocks[end].attrs.dual) {
        const end2 = groupEnd(end);
        const left = groupPieces(i, end, 'L');
        const right = groupPieces(end, end2, 'R');
        const h = Math.max(left.length, right.length);
        let gap = gapAt(SPACE_BEFORE.character);
        if (gap + h > remaining() && row > 0) { newPage(); gap = 0; }
        row += gap;
        const base = row;
        left.forEach((p, k) => put(p, base + k));
        right.forEach((p, k) => put(p, base + k));
        row = base + h;
        i = end2;
        continue;
      }

      const pieces = groupPieces(i, end);
      let gap = gapAt(SPACE_BEFORE.character);
      if (gap + pieces.length <= remaining()) {
        row += gap;
        for (const p of pieces) { put(p); row++; }
        i = end;
        continue;
      }
      // Try to split with (MORE) / (CONT'D): need cue + 2 lines here, 1+ line there.
      const avail = remaining() - gap - 1; // reserve a row for (MORE)
      let split = -1;
      for (let k = Math.min(avail, pieces.length - 1); k >= 3; k--) {
        if (pieces[k - 1].type === 'dialogue' && pieces[k].type !== 'character') { split = k; break; }
      }
      if (split === -1 && row > 0) {
        newPage();
        gap = 0;
        if (pieces.length <= remaining()) {
          for (const p of pieces) { put(p); row++; }
          i = end;
          continue;
        }
        split = Math.max(3, remaining() - 1);
      }
      if (split === -1) split = Math.max(3, remaining() - 1);
      row += gap;
      const cue = pieces[0].text.replace(/\s*\(CONT'D\)\s*$/i, '');
      for (let k = 0; k < split; k++) { put(pieces[k]); row++; }
      put({ type: 'more', text: '(MORE)', blockIndex: pieces[split - 1].blockIndex });
      newPage();
      put({ type: 'contd', text: `${cue} (CONT'D)`, blockIndex: pieces[split].blockIndex });
      row++;
      // Remaining lines may still overflow a whole page; spill naturally.
      for (let k = split; k < pieces.length; k++) {
        if (remaining() <= 0) newPage();
        put(pieces[k]);
        row++;
      }
      i = end;
      continue;
    }

    const lines = linesOf(i);
    let gap = gapAt(SPACE_BEFORE[b.type] ?? 1);

    if (b.type === 'sceneHeading') {
      const next = i + 1 < blocks.length ? leadHeight(i + 1) : 0;
      const nextGap = i + 1 < blocks.length ? SPACE_BEFORE[blocks[i + 1].type] ?? 0 : 0;
      if (row > 0 && gap + lines.length + (next ? nextGap + next : 0) > remaining()) { newPage(); gap = 0; }
      row += gap;
      for (const text of lines) { put({ type: b.type, text, blockIndex: i }); row++; }
      i++;
      continue;
    }

    if (gap + lines.length <= remaining()) {
      row += gap;
      for (const text of lines) { put({ type: b.type, text, blockIndex: i }); row++; }
      i++;
      continue;
    }

    // Split long action across pages: at least 2 lines on each side, else push to next page.
    const room = remaining() - gap;
    if (b.type === 'action' && room >= 2 && lines.length - room >= 2) {
      row += gap;
      lines.forEach((text, k) => {
        if (k === room) newPage();
        put({ type: b.type, text, blockIndex: i });
        row++;
      });
    } else {
      if (row > 0) newPage();
      for (const text of lines) {
        if (remaining() <= 0) newPage();
        put({ type: b.type, text, blockIndex: i });
        row++;
      }
    }
    i++;
  }

  // Scene spans in global rows (page × LINES_PER_PAGE + row), so page-bottom filler counts.
  const headings: number[] = [];
  blocks.forEach((b, k) => { if (b.type === 'sceneHeading') headings.push(k); });
  const lastRow = page * LINES_PER_PAGE + row;
  const scenes: SceneSpan[] = headings.map((h, idx) => {
    const s = blockStart[h];
    const start = s.page * LINES_PER_PAGE + s.row;
    let end = lastRow;
    let endPage = page;
    const nh = headings[idx + 1];
    if (nh !== undefined) {
      const ns = blockStart[nh];
      end = ns.page * LINES_PER_PAGE + ns.row;
      endPage = ns.row === 0 ? ns.page - 1 : ns.page;
    }
    const rows = Math.max(1, end - start);
    return {
      blockIndex: h,
      startPage: s.page + 1,
      endPage: Math.max(s.page, endPage) + 1,
      rows,
      eighths: Math.max(1, Math.round(rows / ROWS_PER_EIGHTH)),
    };
  });

  return { pages, blockStart, scenes };
}
