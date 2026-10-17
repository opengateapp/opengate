import type { EditorState } from 'prosemirror-state';
import { schema } from './schema';
import { session } from './session';

/** sceneId of the scene containing a document position. */
export function sceneAt(state: EditorState, pos: number): string | undefined {
  const idx = state.doc.resolve(Math.min(pos, state.doc.content.size)).index(0);
  for (let i = Math.min(idx, state.doc.childCount - 1); i >= 0; i--) {
    const n = state.doc.child(i);
    if (n.type.name === 'sceneHeading') return n.attrs.sceneId;
  }
  return undefined;
}

export function selectedText(state: EditorState): string {
  const { from, to } = state.selection;
  return state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim();
}

export function addTagMark(elementId: string, categoryId: string) {
  session.run((s) => {
    const { from, to } = s.selection;
    if (from === to) return null;
    return s.tr.addMark(from, to, schema.marks.tag.create({ elementId, categoryId }));
  });
}

/** Removes an element's tag marks; returns a function that puts them back (for Undo). */
export function removeTagMarks(elementId: string, sceneId?: string): () => void {
  const removed: { from: number; to: number; attrs: Record<string, unknown> }[] = [];
  session.run((s) => {
    const tr = s.tr;
    let inScene = !sceneId;
    s.doc.forEach((node, off) => {
      if (sceneId && node.type.name === 'sceneHeading') inScene = node.attrs.sceneId === sceneId;
      if (!inScene) return;
      node.forEach((child, cOff) => {
        const m = child.marks.find((mk) => mk.type === schema.marks.tag && mk.attrs.elementId === elementId);
        if (m) {
          const from = off + 1 + cOff;
          tr.removeMark(from, from + child.nodeSize, m);
          removed.push({ from, to: from + child.nodeSize, attrs: m.attrs });
        }
      });
    });
    return tr.docChanged ? tr : null;
  });
  return () => session.run((s) => {
    const tr = s.tr;
    for (const r of removed) if (r.to <= s.doc.content.size) tr.addMark(r.from, r.to, schema.marks.tag.create(r.attrs));
    return tr.docChanged ? tr : null;
  });
}

/** Re-points tag marks (used when merging elements or changing an element's category). */
export function retagMarks(fromId: string, toId: string, categoryId: string) {
  session.run((s) => {
    const tr = s.tr;
    s.doc.forEach((node, off) => {
      node.forEach((child, cOff) => {
        const m = child.marks.find((mk) => mk.type === schema.marks.tag && mk.attrs.elementId === fromId);
        if (m) {
          const a = off + 1 + cOff;
          const b = a + child.nodeSize;
          tr.removeMark(a, b, m);
          tr.addMark(a, b, schema.marks.tag.create({ elementId: toId, categoryId }));
        }
      });
    });
    return tr.docChanged ? tr : null;
  });
}

/** Tags every whole-word occurrence of `name` in the script. Returns the number of new tags. */
export function tagEverywhere(name: string, elementId: string, categoryId: string): number {
  let count = 0;
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  session.run((s) => {
    const tr = s.tr;
    s.doc.forEach((node, off) => {
      if (!node.isTextblock || node.type.name === 'sceneHeading') return;
      const text = node.textContent;
      for (const m of text.matchAll(re)) {
        const a = off + 1 + m.index!;
        const b = a + m[0].length;
        if (!s.doc.rangeHasMark(a, b, schema.marks.tag)) {
          tr.addMark(a, b, schema.marks.tag.create({ elementId, categoryId }));
          count++;
        }
      }
    });
    return tr.docChanged ? tr : null;
  });
  return count;
}

export function addShotMark(shotId: string, from: number, to: number) {
  session.run((s) => s.tr.addMark(from, to, schema.marks.shotRef.create({ shotId })));
}

export function removeShotMarks(shotId: string) {
  session.run((s) => {
    const tr = s.tr;
    s.doc.forEach((node, off) => {
      node.forEach((child, cOff) => {
        const m = child.marks.find((mk) => mk.type === schema.marks.shotRef && mk.attrs.shotId === shotId);
        if (m) tr.removeMark(off + 1 + cOff, off + 1 + cOff + child.nodeSize, m);
      });
    });
    return tr.docChanged ? tr : null;
  });
}
