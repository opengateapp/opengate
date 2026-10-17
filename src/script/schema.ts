import { Schema, type NodeSpec, type MarkSpec, type Node as PMNode } from 'prosemirror-model';
import type { ElementType, ScriptLine } from '../model/types';
import { newId } from '../model/ids';

export const TEXT_TYPES: Exclude<ElementType, 'pageBreak'>[] = [
  'sceneHeading', 'action', 'character', 'parenthetical', 'dialogue', 'transition', 'centered', 'shot', 'lyric',
];

export const ELEMENT_LABELS: Record<ElementType, string> = {
  sceneHeading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  centered: 'Centered',
  shot: 'Shot',
  lyric: 'Lyric',
  pageBreak: 'Page Break',
};

function textBlock(type: string, attrs: NodeSpec['attrs'] = {}): NodeSpec {
  return {
    group: 'block',
    content: 'text*',
    marks: '_',
    attrs,
    defining: true,
    parseDOM: [{ tag: `p.el-${type}` }],
    toDOM: (node) => {
      const a: Record<string, string> = { class: `el el-${type}` };
      if (type === 'sceneHeading') {
        a['data-scene-id'] = node.attrs.sceneId ?? '';
        if (node.attrs.number) a['data-number'] = node.attrs.number;
      }
      if (type === 'character' && node.attrs.dual) a['data-dual'] = 'true';
      return ['p', a, 0];
    },
  };
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  text: { group: 'inline' },
  sceneHeading: textBlock('sceneHeading', { sceneId: { default: null }, number: { default: null } }),
  action: textBlock('action'),
  character: textBlock('character', { dual: { default: false } }),
  parenthetical: textBlock('parenthetical'),
  dialogue: textBlock('dialogue'),
  transition: textBlock('transition'),
  centered: textBlock('centered'),
  shot: textBlock('shot'),
  lyric: textBlock('lyric'),
  pageBreak: {
    group: 'block',
    atom: true,
    selectable: true,
    parseDOM: [{ tag: 'hr.el-pageBreak' }],
    toDOM: () => ['hr', { class: 'el el-pageBreak' }],
  },
};

const marks: Record<string, MarkSpec> = {
  bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
  italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
  underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
  /** Breakdown tag: links a text range to a BreakdownElement. */
  tag: {
    attrs: { elementId: {}, categoryId: {} },
    inclusive: false,
    excludes: '',
    toDOM: (m) => ['span', { class: `tag cat-${m.attrs.categoryId}`, 'data-element-id': m.attrs.elementId }, 0],
    parseDOM: [{ tag: 'span.tag', getAttrs: (d) => ({ elementId: (d as HTMLElement).dataset.elementId, categoryId: '' }) }],
  },
  /** Shot anchor: links a text range to a Shot in the shot list. */
  shotRef: {
    attrs: { shotId: {} },
    inclusive: false,
    excludes: '',
    toDOM: (m) => ['span', { class: 'shot-ref', 'data-shot-id': m.attrs.shotId }, 0],
  },
};

export const schema = new Schema({ nodes, marks });

export function emptyDoc(): PMNode {
  return schema.node('doc', null, [
    schema.node('sceneHeading', { sceneId: newId() }),
  ]);
}

/** Builds a document from importer output. Optional `idFor` reuses existing scene ids on re-import. */
export function linesToDoc(lines: ScriptLine[], idFor?: (heading: string, occurrence: number) => string | undefined): PMNode {
  const seen = new Map<string, number>();
  const blocks: PMNode[] = [];
  for (const l of lines) {
    if (l.type === 'pageBreak') {
      blocks.push(schema.node('pageBreak'));
      continue;
    }
    const text = l.text.replace(/\s+$/g, '');
    const content = text ? [schema.text(text)] : [];
    if (l.type === 'sceneHeading') {
      const key = normalizeHeading(text);
      const occ = seen.get(key) ?? 0;
      seen.set(key, occ + 1);
      const sceneId = idFor?.(key, occ) ?? newId();
      blocks.push(schema.node('sceneHeading', { sceneId, number: l.sceneNumber ?? null }, content));
    } else if (l.type === 'character') {
      blocks.push(schema.node('character', { dual: !!l.dual }, content));
    } else {
      blocks.push(schema.node(l.type, null, content));
    }
  }
  if (blocks.length === 0) return emptyDoc();
  return schema.node('doc', null, blocks);
}

export function normalizeHeading(s: string): string {
  return s.toUpperCase().replace(/\s+/g, ' ').trim();
}

// ---- Plain-JSON view of the doc, used by derive/paginate/export without an EditorView ----

export interface MarkSpan { from: number; to: number; type: string; attrs: Record<string, unknown> }
export interface Block {
  type: ElementType;
  text: string;
  attrs: Record<string, unknown>;
  marks: MarkSpan[];
}

interface JSONNode { type: string; attrs?: Record<string, unknown>; content?: JSONNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }

export function docToBlocks(json: unknown): Block[] {
  const doc = json as JSONNode | null;
  if (!doc || !Array.isArray(doc.content)) return [];
  return doc.content.map((n) => {
    let text = '';
    const spans: MarkSpan[] = [];
    for (const t of n.content ?? []) {
      const s = t.text ?? '';
      for (const m of t.marks ?? []) spans.push({ from: text.length, to: text.length + s.length, type: m.type, attrs: m.attrs ?? {} });
      text += s;
    }
    return { type: n.type as ElementType, text, attrs: n.attrs ?? {}, marks: spans };
  });
}

export function blocksToLines(blocks: Block[]): ScriptLine[] {
  return blocks.map((b) => ({
    type: b.type,
    text: b.text,
    dual: b.type === 'character' ? !!b.attrs.dual : undefined,
    sceneNumber: b.type === 'sceneHeading' ? (b.attrs.number as string | undefined) ?? undefined : undefined,
  }));
}
