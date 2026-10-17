import { EditorState, Plugin, PluginKey, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, undo as historyUndo, redo as historyRedo } from 'prosemirror-history';
import { ySyncPlugin, ySyncPluginKey, yCursorPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from 'y-prosemirror';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { Node as PMNode } from 'prosemirror-model';
import type { ElementType } from '../model/types';
import { newId } from '../model/ids';
import { schema } from './schema';

/** Element created by Enter at the end of a block (from the screenwriting reference, NEXT_TYPE). */
export const ENTER_NEXT: Partial<Record<ElementType, ElementType>> = {
  sceneHeading: 'action',
  action: 'action',
  character: 'dialogue',
  parenthetical: 'dialogue',
  dialogue: 'character',
  transition: 'sceneHeading',
  centered: 'action',
  shot: 'action',
  lyric: 'lyric',
};

/** Tab changes the current element, Final Draft style. */
export const TAB_NEXT: Partial<Record<ElementType, ElementType>> = {
  action: 'character',
  character: 'transition',
  transition: 'sceneHeading',
  sceneHeading: 'action',
  dialogue: 'parenthetical',
  parenthetical: 'dialogue',
  centered: 'action',
  shot: 'action',
  lyric: 'dialogue',
};

const AUTO_HEADING = /^(INT\.?\/EXT|EXT\.?\/INT|INT|EXT|I\/E)\.?\s/i;

export const CYCLE: ElementType[] = ['action', 'sceneHeading', 'character', 'dialogue', 'parenthetical', 'transition', 'centered', 'shot'];

function currentBlock(state: EditorState) {
  const { $from } = state.selection;
  const node = $from.node(1);
  return { node, pos: $from.before(1), $from };
}

export function setElementType(type: ElementType): Command {
  return (state, dispatch) => {
    if (type === 'pageBreak') {
      if (dispatch) {
        const { pos, node } = currentBlock(state);
        const tr = state.tr.insert(pos + node.nodeSize, schema.node('pageBreak'));
        dispatch(tr);
      }
      return true;
    }
    const { node, pos } = currentBlock(state);
    if (!node || node.type.name === type) return false;
    if (dispatch) {
      const attrs = type === 'sceneHeading' ? { sceneId: newId(), number: null } : null;
      dispatch(state.tr.setNodeMarkup(pos, schema.nodes[type], attrs).scrollIntoView());
    }
    return true;
  };
}

const enter: Command = (state, dispatch) => {
  const { node, $from } = currentBlock(state);
  if (!node || node.type.name === 'pageBreak') return false;
  const type = node.type.name as ElementType;
  const empty = node.content.size === 0;
  if (empty && (type === 'dialogue' || type === 'parenthetical' || type === 'character' || type === 'transition')) {
    return setElementType('action')(state, dispatch);
  }
  if (!state.selection.empty) return false;
  const atEnd = $from.parentOffset === node.content.size;
  const nextType = atEnd ? ENTER_NEXT[type] ?? 'action' : type === 'sceneHeading' ? 'action' : type;
  if (dispatch) {
    const tr = state.tr;
    const attrs = nextType === 'sceneHeading' ? { sceneId: newId() } : undefined;
    tr.split($from.pos, 1, [{ type: schema.nodes[nextType], attrs }]);
    dispatch(tr.scrollIntoView());
  }
  return true;
};

const tab: Command = (state, dispatch) => {
  const { node } = currentBlock(state);
  if (!node || node.type.name === 'pageBreak') return false;
  const type = node.type.name as ElementType;
  const next = TAB_NEXT[type] ?? 'action';
  return setElementType(next)(state, dispatch);
};

const shiftTab: Command = (state, dispatch) => {
  const { node } = currentBlock(state);
  if (!node) return false;
  const i = CYCLE.indexOf(node.type.name as ElementType);
  const prev = CYCLE[(i - 1 + CYCLE.length) % CYCLE.length];
  return setElementType(prev)(state, dispatch);
};

/** Backspace at the start of an empty block deletes it (keeps the previous one). */
const backspaceEmpty: Command = (state, dispatch) => {
  const { node, pos } = currentBlock(state);
  if (!node || node.content.size !== 0 || !state.selection.empty || pos === 0) return false;
  if (dispatch) {
    const tr = state.tr.delete(pos, pos + node.nodeSize);
    const sel = TextSelection.near(tr.doc.resolve(Math.max(0, pos - 1)), -1);
    dispatch(tr.setSelection(sel).scrollIntoView());
  }
  return true;
};

export const ELEMENT_SHORTCUTS: [string, ElementType][] = [
  ['Mod-1', 'sceneHeading'], ['Mod-2', 'action'], ['Mod-3', 'character'], ['Mod-4', 'parenthetical'],
  ['Mod-5', 'dialogue'], ['Mod-6', 'transition'], ['Mod-7', 'shot'], ['Mod-8', 'centered'], ['Mod-Enter', 'pageBreak'],
];

/** Keeps every scene heading's sceneId present and unique; turns "INT. " action lines into headings. */
const integrity = new Plugin({
  appendTransaction(trs, _old, state) {
    if (!trs.some((t) => t.docChanged)) return null;
    // Collaborators' merged edits are already fixed on their side; don't echo fixes back.
    if (trs.every((t) => !t.docChanged || isYChange(t))) return null;
    let tr: Transaction | null = null;
    const seen = new Set<string>();
    state.doc.forEach((node: PMNode, offset: number) => {
      const t = node.type.name;
      if (t === 'action' && AUTO_HEADING.test(node.textContent)) {
        tr = tr ?? state.tr;
        tr.setNodeMarkup(offset, schema.nodes.sceneHeading, { sceneId: newId(), number: null });
        return;
      }
      if (t === 'sceneHeading') {
        const id = node.attrs.sceneId as string | null;
        if (!id || seen.has(id)) {
          tr = tr ?? state.tr;
          tr.setNodeMarkup(offset, undefined, { ...node.attrs, sceneId: newId() });
        } else seen.add(id);
      }
    });
    return tr;
  },
});

// ---- Layout decorations: page-break markers + scene numbers, computed by the paginator ----

export interface LayoutInfo {
  /** Block index → page number for blocks that begin a new page. */
  pageStarts: Map<number, number>;
  /** Block index of each heading → displayed scene number. */
  numbers: Map<number, string>;
}

export const layoutKey = new PluginKey<DecorationSet>('layout');

function buildDecorations(doc: PMNode, info: LayoutInfo): DecorationSet {
  const decos: Decoration[] = [];
  let i = 0;
  doc.forEach((node, offset) => {
    const page = info.pageStarts.get(i);
    if (page) {
      decos.push(Decoration.widget(offset, () => {
        const el = document.createElement('div');
        el.className = 'page-marker';
        el.contentEditable = 'false';
        el.innerHTML = `<span>${page}.</span>`;
        return el;
      }, { side: -1, key: `p${page}` }));
    }
    const num = info.numbers.get(i);
    if (num && node.type.name === 'sceneHeading') {
      decos.push(Decoration.node(offset, offset + node.nodeSize, { 'data-num': num }));
    }
    i++;
  });
  return DecorationSet.create(doc, decos);
}

const layout = new Plugin<DecorationSet>({
  key: layoutKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const info = tr.getMeta(layoutKey) as LayoutInfo | undefined;
      if (info) return buildDecorations(tr.doc, info);
      return set.map(tr.mapping, tr.doc);
    },
  },
  props: { decorations: (s) => layoutKey.getState(s) },
});

export interface AutocompleteHooks {
  /** Returns true if the popup consumed the key. */
  onKey: (key: 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Tab' | 'Escape') => boolean;
}

export interface CollabOptions {
  fragment: Y.XmlFragment;
  awareness: Awareness;
  /** Which local edits are allowed: everything, highlights only (tags / shot anchors), or none. */
  allow: () => 'all' | 'marks' | 'none';
}

/** Blocks local edits a shared-project link doesn't allow (others' merged edits always apply). */
function permissionFilter(allow: () => 'all' | 'marks' | 'none') {
  return new Plugin({
    filterTransaction(tr) {
      if (!tr.docChanged || isYChange(tr)) return true;
      const a = allow();
      if (a === 'all') return true;
      if (a === 'none') return false;
      return tr.steps.every((s) => ['addMark', 'removeMark'].includes((s.toJSON() as { stepType: string }).stepType));
    },
  });
}

/** True for transactions y-prosemirror makes when applying collaborators' edits (or rebuilding from them). */
export function isYChange(tr: Transaction): boolean {
  return !!(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin;
}

export function buildPlugins(ac: AutocompleteHooks, collab?: CollabOptions): Plugin[] {
  const acKey = (k: 'ArrowUp' | 'ArrowDown' | 'Enter' | 'Tab' | 'Escape'): Command => () => ac.onKey(k);
  const shortcuts: Record<string, Command> = {};
  for (const [key, type] of ELEMENT_SHORTCUTS) shortcuts[key] = setElementType(type);
  // In a shared project, undo only takes back your own edits (y-prosemirror's undo manager).
  const undo: Command = collab ? (s) => yUndo(s) : historyUndo;
  const redo: Command = collab ? (s) => yRedo(s) : historyRedo;
  const collabPlugins = collab
    ? [ySyncPlugin(collab.fragment), yCursorPlugin(collab.awareness), yUndoPlugin(), permissionFilter(collab.allow)]
    : [history()];
  return [
    ...collabPlugins,
    keymap({
      ArrowUp: acKey('ArrowUp'),
      ArrowDown: acKey('ArrowDown'),
      Escape: acKey('Escape'),
    }),
    keymap({
      Enter: (s, d) => ac.onKey('Enter') || enter(s, d),
      Tab: (s, d) => ac.onKey('Tab') || tab(s, d),
      'Shift-Tab': shiftTab,
      Backspace: backspaceEmpty,
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      'Mod-b': toggleMark(schema.marks.bold),
      'Mod-i': toggleMark(schema.marks.italic),
      'Mod-u': toggleMark(schema.marks.underline),
      ...shortcuts,
    }),
    keymap(baseKeymap),
    integrity,
    layout,
  ];
}

export function createState(doc: PMNode, plugins: Plugin[]): EditorState {
  return EditorState.create({ doc, plugins });
}
