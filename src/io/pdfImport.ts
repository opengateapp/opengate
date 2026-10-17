import type { RawLine } from './classify';

// PDF text extraction with pdf.js. Lines are rebuilt from text items by baseline,
// keeping each line's left edge (in inches) so the classifier can use indentation.

interface TextItem { str: string; transform: number[]; width: number; height: number }

export async function pdfToRawLines(data: ArrayBuffer): Promise<RawLine[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.js?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data }).promise;
  const out: RawLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((it) => typeof it.str === 'string' && it.str.trim().length);
    const rows = new Map<number, TextItem[]>();
    for (const it of items) {
      const y = Math.round(it.transform[5] / 2) * 2;
      rows.set(y, [...(rows.get(y) ?? []), it]);
    }
    const ys = [...rows.keys()].sort((a, b) => b - a);
    let lastY: number | null = null;
    // Line height = the smallest baseline step on the page (blank lines are multiples of it).
    const steps = ys.slice(1).map((y, k) => ys[k] - y).filter((g) => g >= 6);
    const lineHeight = steps.length ? Math.min(...steps) : 12;
    const joinItems = (its: TextItem[]) => {
      let text = '';
      let endX = 0;
      for (const it of its) {
        const x = it.transform[4];
        const charW = it.str.length ? it.width / it.str.length : 7.2;
        if (text && x - endX > charW * 0.5) text += ' ';
        text += it.str;
        endX = x + it.width;
      }
      return text;
    };
    // Dual dialogue prints as two columns on the same baselines; collect such runs.
    let dual: { left: string[]; right: string[]; gapBefore: boolean } | null = null;
    const flushDual = () => {
      if (!dual) return;
      const emit = (col: string[], isRight: boolean) => col.forEach((t, k) => out.push({
        text: t,
        hint: k === 0 ? 'character' : /^\(/.test(t) ? 'parenthetical' : 'dialogue',
        dual: isRight && k === 0,
        gapBefore: k === 0 && (isRight || dual!.gapBefore),
        page: p,
      }));
      emit(dual.left, false);
      emit(dual.right, true);
      dual = null;
    };
    ys.forEach((y, idx) => {
      const all = rows.get(y)!.sort((a, b) => a.transform[4] - b.transform[4]);
      const gapBefore = lastY !== null && lastY - y > lineHeight * 1.5;
      // Scene numbers printed in the margins: drop them, keeping the left one as a prefix.
      const isMarginNum = (it: TextItem) => /^\d+[A-Z]{0,2}\.?$/.test(it.str.trim()) && (it.transform[4] < 1.3 * 72 || it.transform[4] > 7.1 * 72);
      const leftNum = all.find((it) => isMarginNum(it) && it.transform[4] < 1.3 * 72)?.str.trim();
      // pdf.js may merge two columns into one item padded with spaces; split those back apart.
      const its = all.filter((it) => !isMarginNum(it)).flatMap((it) => {
        const m = it.str.match(/^(.*?\S)(\s{4,})(\S.*)$/);
        if (!m) return [it];
        const cw = it.width / it.str.length;
        const rightX = it.transform[4] + (m[1].length + m[2].length) * cw;
        return [
          { ...it, str: m[1], width: m[1].length * cw },
          { ...it, str: m[3], width: m[3].length * cw, transform: [...it.transform.slice(0, 4), rightX, it.transform[5]] },
        ];
      });
      if (!its.length) { lastY = y; return; }
      // Dual dialogue: two runs starting in the left (1.3–3.2") and right (>4") dialogue columns.
      let split = -1;
      if (its[0].transform[4] >= 1.3 * 72 && its[0].transform[4] < 3.2 * 72) {
        for (let k = 1; k < its.length; k++) {
          const prevEnd = its[k - 1].transform[4] + its[k - 1].width;
          if (its[k].transform[4] - prevEnd > 30 && its[k].transform[4] > 4 * 72 && its[k].transform[4] < 6.6 * 72) { split = k; break; }
        }
      }
      if (split > 0) {
        if (!dual || gapBefore) { flushDual(); dual = { left: [], right: [], gapBefore }; }
        dual.left.push(joinItems(its.slice(0, split)));
        dual.right.push(joinItems(its.slice(split)));
      } else {
        if (dual && its[0].transform[4] > 4 * 72) dual.right.push(joinItems(its)); // right column runs longer
        else if (dual && its[0].transform[4] < 3.2 * 72 && its[0].transform[4] > 1.7 * 72 && !gapBefore) dual.left.push(joinItems(its));
        else {
          flushDual();
          const text = joinItems(its);
          out.push({ text: leftNum ? `${leftNum} ${text}` : text, indent: its[0].transform[4] / 72, gapBefore, newPage: idx === 0 && p > 1, page: p });
        }
      }
      lastY = y;
    });
    flushDual();
  }
  return out;
}
