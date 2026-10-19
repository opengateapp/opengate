import { Fragment, Node as PMNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { schema } from './schema';
import { session } from './session';
import { useStore } from '../store/project';
import { newId } from '../model/ids';

// Scene-level helpers: find a scene's blocks in the script, read them, replace them (switching
// to a scene variant, or copying a scene back from an older draft).

/** Document positions [from, to) of a scene: its heading up to the next heading. */
export function sceneRange(s: EditorState, sceneId: string): { from: number; to: number } | null {
  let from = -1, to = -1;
  s.doc.forEach((n, off) => {
    if (n.type.name !== 'sceneHeading') return;
    if (from >= 0 && to < 0) { to = off; return; }
    if (n.attrs.sceneId === sceneId) from = off;
  });
  if (from < 0) return null;
  return { from, to: to < 0 ? s.doc.content.size : to };
}

/** A scene's blocks as JSON (heading included). */
export function sceneBlocks(sceneId: string): unknown[] | null {
  const s = session.ensure();
  const r = sceneRange(s, sceneId);
  if (!r) return null;
  const out: unknown[] = [];
  s.doc.nodesBetween(r.from, r.to, (n, pos) => { if (pos >= r.from && pos < r.to && n.isBlock && n.type.name !== 'doc') out.push(n.toJSON()); return false; });
  return out;
}

/** Blocks of a scene inside a whole-document JSON (e.g. an older draft). */
export function sceneBlocksIn(doc: unknown, sceneId: string): unknown[] | null {
  const content = ((doc as { content?: { type: string; attrs?: Record<string, unknown> }[] } | null)?.content) ?? [];
  const start = content.findIndex((n) => n.type === 'sceneHeading' && n.attrs?.sceneId === sceneId);
  if (start < 0) return null;
  let end = start + 1;
  while (end < content.length && content[end].type !== 'sceneHeading') end++;
  return content.slice(start, end);
}

/**
 * Puts these blocks in place of the scene (keeping its id on the heading, so the breakdown,
 * schedule and shots stay attached). When the scene isn't in the script, the blocks go at the end.
 */
export function replaceScene(sceneId: string, blocks: unknown[]) {
  session.run((s) => {
    const nodes = blocks.map((b, i) => {
      const n = PMNode.fromJSON(schema, b);
      return i === 0 && n.type.name === 'sceneHeading' ? n.type.create({ ...n.attrs, sceneId }, n.content, n.marks) : n;
    });
    const r = sceneRange(s, sceneId);
    if (r) return s.tr.replaceWith(r.from, r.to, Fragment.fromArray(nodes));
    return s.tr.insert(s.doc.content.size, Fragment.fromArray(nodes));
  });
  session.flush();
}

/** Replaces the whole script (restoring a draft). */
export function replaceScript(doc: unknown) {
  session.run((s) => {
    const next = PMNode.fromJSON(schema, doc ?? { type: 'doc', content: [] });
    return s.tr.replaceWith(0, s.doc.content.size, next.content.size ? next.content : Fragment.empty);
  });
  session.flush();
}

/** Keeps the scene as it is now as a named variant (the script doesn't change). */
export function saveVariant(sceneId: string, name: string) {
  session.flush();
  const blocks = sceneBlocks(sceneId);
  if (!blocks) return;
  useStore.getState().update((d) => { (d.sceneVariants ??= []).push({ id: newId(), sceneId, name, blocks, createdAt: new Date().toISOString() }); }, `Save variant “${name}”`);
}

/** Swaps a variant into the script; the version that was there becomes a variant under its own name. */
export function switchVariant(variantId: string) {
  const p = useStore.getState().project!;
  const v = (p.sceneVariants ?? []).find((x) => x.id === variantId);
  if (!v) return;
  session.flush();
  const current = sceneBlocks(v.sceneId);
  const activeName = p.sceneVariantActive?.[v.sceneId] ?? 'Original';
  replaceScene(v.sceneId, v.blocks);
  useStore.getState().update((d) => {
    d.sceneVariants = (d.sceneVariants ?? []).filter((x) => x.id !== v.id);
    if (current) d.sceneVariants.push({ id: newId(), sceneId: v.sceneId, name: activeName, blocks: current, createdAt: new Date().toISOString() });
    (d.sceneVariantActive ??= {})[v.sceneId] = v.name;
  }, `Switch to “${v.name}”`);
}
