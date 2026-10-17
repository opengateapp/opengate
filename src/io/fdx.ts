import type { ElementType, ScriptLine, TitlePage } from '../model/types';
import type { ParsedScript } from './fountain';

// Final Draft (.fdx) import/export. Handles DualDialogue blocks — whose nested
// paragraphs silently swallowed later scenes in older CineSched builds.

const TYPE_MAP: Record<string, ElementType> = {
  'scene heading': 'sceneHeading',
  action: 'action',
  general: 'action',
  'cast list': 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  shot: 'shot',
  lyrics: 'lyric',
  'new act': 'centered',
  'end of act': 'centered',
};

function paraText(p: Element): string {
  let s = '';
  for (const child of Array.from(p.children)) if (child.tagName === 'Text') s += child.textContent ?? '';
  return s.replace(/ /g, ' ');
}

export function parseFDX(xml: string): ParsedScript {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This .fdx file is not valid XML.');
  const content = doc.querySelector('FinalDraft > Content') ?? doc.querySelector('Content');
  if (!content) throw new Error('No <Content> section found in the .fdx file.');
  const lines: ScriptLine[] = [];
  const warnings: string[] = [];

  const handle = (p: Element, dualIndex?: { n: number }) => {
    const type = (p.getAttribute('Type') ?? 'Action').toLowerCase();
    if (p.getAttribute('StartsNewPage') === 'Yes' && lines.length) lines.push({ type: 'pageBreak', text: '' });
    const dual = p.querySelector(':scope > DualDialogue');
    if (dual) {
      const counter = { n: 0 };
      for (const inner of Array.from(dual.querySelectorAll(':scope > Paragraph'))) handle(inner, counter);
      return;
    }
    if (type === 'more' || type === 'cont' || type === "cont'd") return;
    const mapped = TYPE_MAP[type] ?? 'action';
    const text = paraText(p);
    const line: ScriptLine = { type: mapped, text };
    if (mapped === 'sceneHeading') {
      const num = p.getAttribute('Number');
      if (num) line.sceneNumber = num;
    }
    if (mapped === 'character' && dualIndex) {
      dualIndex.n++;
      if (dualIndex.n === 2) line.dual = true;
    }
    lines.push(line);
  };
  for (const p of Array.from(content.querySelectorAll(':scope > Paragraph'))) handle(p);

  let titlePage: Partial<TitlePage> | undefined;
  const tp = doc.querySelector('TitlePage Content');
  if (tp) {
    const texts = Array.from(tp.querySelectorAll('Paragraph')).map(paraText).map((s) => s.trim()).filter(Boolean);
    if (texts.length) {
      const byIdx = texts.findIndex((t) => /^(written\s+)?by$/i.test(t) || /^screenplay by$/i.test(t));
      titlePage = {
        title: texts[0],
        credit: byIdx > 0 ? texts[byIdx] : 'Written by',
        author: byIdx > 0 ? texts[byIdx + 1] ?? '' : texts[1] ?? '',
        contact: texts.slice(byIdx > 0 ? byIdx + 2 : 2).join('\n'),
      };
    }
  }
  if (!lines.some((l) => l.type === 'sceneHeading')) warnings.push('No scene headings found in the .fdx file.');
  return { lines, titlePage, warnings };
}

const OUT_TYPE: Record<ElementType, string> = {
  sceneHeading: 'Scene Heading', action: 'Action', character: 'Character', parenthetical: 'Parenthetical',
  dialogue: 'Dialogue', transition: 'Transition', centered: 'Action', shot: 'Shot', lyric: 'Lyrics', pageBreak: 'Action',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toFDX(lines: ScriptLine[], titlePage?: Partial<TitlePage>, numbers?: string[]): string {
  const paras: string[] = [];
  let sceneIdx = 0;
  let pendingBreak = false;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (l.type === 'pageBreak') { pendingBreak = true; continue; }
    const attrs = [`Type="${OUT_TYPE[l.type]}"`];
    if (l.type === 'centered') attrs.push('Alignment="Center"');
    if (pendingBreak) { attrs.push('StartsNewPage="Yes"'); pendingBreak = false; }
    if (l.type === 'sceneHeading') {
      const n = numbers?.[sceneIdx++];
      if (n) attrs.push(`Number="${esc(n)}"`);
    }
    const para = `    <Paragraph ${attrs.join(' ')}>\n      <Text>${esc(l.text)}</Text>\n    </Paragraph>`;
    // Wrap a dual pair: previous character block + this one.
    if (l.type === 'character' && l.dual) {
      let start = paras.length - 1;
      while (start > 0 && !paras[start].includes('Type="Character"')) start--;
      const left = paras.splice(start);
      const right = [para];
      while (k + 1 < lines.length && (lines[k + 1].type === 'dialogue' || lines[k + 1].type === 'parenthetical')) {
        k++;
        right.push(`    <Paragraph Type="${OUT_TYPE[lines[k].type]}">\n      <Text>${esc(lines[k].text)}</Text>\n    </Paragraph>`);
      }
      paras.push(`    <Paragraph>\n      <DualDialogue>\n${[...left, ...right].join('\n')}\n      </DualDialogue>\n    </Paragraph>`);
      continue;
    }
    paras.push(para);
  }
  const tp = titlePage
    ? [titlePage.title, titlePage.credit, titlePage.author, titlePage.source, titlePage.draftDate, titlePage.contact]
        .filter(Boolean)
        .map((t) => `    <Paragraph Alignment="Center">\n      <Text>${esc(t!)}</Text>\n    </Paragraph>`)
        .join('\n')
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paras.join('\n')}
  </Content>
  <TitlePage>
    <Content>
${tp}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}
