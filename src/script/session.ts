import { EditorState, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode, Fragment } from 'prosemirror-model';
import { initProseMirrorDoc, undo as yUndo, redo as yRedo } from 'y-prosemirror';
import { undo as historyUndo, redo as historyRedo } from 'prosemirror-history';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { schema, emptyDoc } from './schema';
import { buildPlugins, isYChange, layoutKey, type AutocompleteHooks, type LayoutInfo } from './commands';
import { canWrite, scriptMarksOnly } from '../sync/state';
import { useStore } from '../store/project';
import { derive } from './derive';

// One editing session per open project, shared by every tab that shows the script
// (Write, Breakdown, Shots). Keeping the EditorState here means undo history and
// cursor survive tab switches, and every view edits the same document.

type Listener = (state: EditorState) => void;

/** Set while the project is shared: the script is bound to a Yjs fragment. */
export interface SessionCollab {
  fragment: Y.XmlFragment;
  awareness: Awareness;
  /** Called with the doc JSON before and after collaborators' edits merge in. */
  onRemoteChange: (before: unknown, after: unknown) => void;
  /** True while the sync engine is applying someone else's update. */
  isRemote: () => boolean;
}

class ScriptSession {
  state: EditorState | null = null;
  private projectId: string | null = null;
  private writtenJson: unknown = null;
  private flushedDoc: unknown = null;
  private views = new Set<EditorView>();
  private listeners = new Set<Listener>();
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private layoutTimer: ReturnType<typeof setTimeout> | undefined;
  acHooks: AutocompleteHooks = { onKey: () => false };
  private collab: SessionCollab | null = null;
  /** Off-screen editor that keeps the shared script live while no script tab is open. */
  private hidden: EditorView | null = null;

  private plugins() {
    return buildPlugins({ onKey: (k) => this.acHooks.onKey(k) }, this.collab ? {
      fragment: this.collab.fragment,
      awareness: this.collab.awareness,
      allow: () => (!canWrite('script') ? 'none' : scriptMarksOnly() ? 'marks' : 'all'),
    } : undefined);
  }

  /** Switch the script between solo editing and shared (co-edited) editing. */
  setCollab(c: SessionCollab | null) {
    this.flush();
    this.destroyHidden();
    this.collab = c;
    this.state = null;
    if (!useStore.getState().project) return;
    this.ensure();
    if (c && !this.views.size) this.createHidden();
  }

  get shared() { return !!this.collab; }

  /** Returns the session state for the open project, rebuilding if the store doc changed externally. */
  ensure(): EditorState {
    const p = useStore.getState().project;
    if (!p) throw new Error('No project');
    if (this.state && this.projectId === p.id && (p.scriptDoc === this.writtenJson || this.writeTimer)) return this.state;
    // Shared: the script comes from the room's copy. A script replaced from outside (an import)
    // is written into the shared copy below so collaborators get it too.
    const external = this.collab && this.state && this.projectId === p.id && p.scriptDoc && p.scriptDoc !== this.writtenJson ? p.scriptDoc : null;
    let doc: PMNode;
    if (this.collab) {
      doc = this.collab.fragment.length ? initProseMirrorDoc(this.collab.fragment, schema).doc : (p.scriptDoc ? PMNode.fromJSON(schema, p.scriptDoc) : emptyDoc());
    } else doc = p.scriptDoc ? PMNode.fromJSON(schema, p.scriptDoc) : emptyDoc();
    if (doc.childCount === 0) doc = emptyDoc();
    this.state = EditorState.create({ doc, plugins: this.plugins() });
    this.projectId = p.id;
    this.writtenJson = p.scriptDoc;
    this.flushedDoc = p.scriptDoc ? this.state.doc : null;
    if (!p.scriptDoc) this.flush();
    this.scheduleLayout(0);
    this.views.forEach((v) => v.updateState(this.state!));
    this.hidden?.updateState(this.state);
    if (external) {
      const next = PMNode.fromJSON(schema, external);
      this.dispatch(this.state.tr.replaceWith(0, this.state.doc.content.size, next.content));
    }
    return this.state;
  }

  /** Call before creating a visible editor view (hands the shared binding over to it). */
  beforeMount() { this.destroyHidden(); }

  attach(view: EditorView) { this.destroyHidden(); this.views.add(view); this.scheduleLayout(0); }

  /** Call after the view is destroyed. */
  detach(view: EditorView) {
    this.views.delete(view);
    if (this.collab && !this.views.size && this.state) this.createHidden();
  }

  private createHidden() {
    if (this.hidden || !this.state) return;
    this.hidden = new EditorView(document.createElement('div'), { state: this.state, dispatchTransaction: (tr) => this.dispatch(tr) });
  }

  private destroyHidden() {
    const h = this.hidden;
    this.hidden = null;
    h?.destroy();
  }
  subscribe(l: Listener) { this.listeners.add(l); return () => { this.listeners.delete(l); }; }

  dispatch(tr: Transaction) {
    if (!this.state) return;
    const before = this.state.doc;
    this.state = this.state.apply(tr);
    const s = this.state;
    if (this.collab && tr.docChanged && isYChange(tr) && this.collab.isRemote() && s.doc !== before) {
      this.collab.onRemoteChange(before.toJSON(), s.doc.toJSON());
    }
    this.views.forEach((v) => v.updateState(s));
    this.hidden?.updateState(s);
    this.listeners.forEach((l) => l(s));
    if (tr.docChanged) {
      clearTimeout(this.writeTimer);
      this.writeTimer = setTimeout(() => this.flush(), 250);
      this.scheduleLayout(400);
    }
  }

  /** Writes the doc into the project store (not undoable there; ProseMirror owns script undo). */
  flush() {
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    if (!this.state || this.state.doc === this.flushedDoc) return;
    this.flushedDoc = this.state.doc;
    const json = this.state.doc.toJSON();
    this.writtenJson = json;
    useStore.getState().update((d) => { d.scriptDoc = json; }, null);
    this.writtenJson = useStore.getState().project?.scriptDoc ?? json;
  }

  private scheduleLayout(ms: number) {
    clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => this.applyLayout(), ms);
  }

  private applyLayout() {
    if (!this.state) return;
    const p = useStore.getState().project;
    const d = derive(this.state.doc.toJSON(), p?.sceneNumbersLocked ?? false);
    const pageStarts = new Map<number, number>();
    let lastPage = 0;
    d.pagination.blockStart.forEach((s, i) => {
      if (s.page > lastPage) { pageStarts.set(i, s.page + 1); lastPage = s.page; }
    });
    const numbers = new Map<number, string>();
    d.scenes.forEach((sc) => {
      const idx = d.pagination.scenes[sc.index]?.blockIndex;
      if (idx !== undefined) numbers.set(idx, sc.number);
    });
    const info: LayoutInfo = { pageStarts, numbers };
    this.dispatch(this.state.tr.setMeta(layoutKey, info).setMeta('addToHistory', false));
  }

  /** Run a transaction built from the current state. */
  run(build: (state: EditorState) => Transaction | null | false) {
    const s = this.ensure();
    const tr = build(s);
    if (tr) this.dispatch(tr);
  }

  /** Replaces `count` top-level blocks starting at block `index` (used to reject a merged change). */
  replaceBlocks(index: number, count: number, nodes: unknown[]) {
    this.run((s) => {
      let from = 0;
      for (let i = 0; i < index && i < s.doc.childCount; i++) from += s.doc.child(i).nodeSize;
      let to = from;
      for (let i = index; i < index + count && i < s.doc.childCount; i++) to += s.doc.child(i).nodeSize;
      return s.tr.replaceWith(from, to, Fragment.fromArray(nodes.map((n) => PMNode.fromJSON(schema, n))));
    });
  }

  undo() { const s = this.state; if (!s) return false; return this.collab ? yUndo(s) : historyUndo(s, (tr) => this.dispatch(tr)); }
  redo() { const s = this.state; if (!s) return false; return this.collab ? yRedo(s) : historyRedo(s, (tr) => this.dispatch(tr)); }

  /** Drops the editing state without writing it (call flush() first to keep edits). */
  reset() {
    this.destroyHidden();
    clearTimeout(this.writeTimer);
    this.writeTimer = undefined;
    this.state = null;
    this.projectId = null;
  }

  /** Makes sure a just-made mouse selection has reached the editor state. */
  syncSelection() {
    const v = this.view as unknown as { domObserver?: { flush: () => void } } | undefined;
    v?.domObserver?.flush();
  }

  focus() { [...this.views][0]?.focus(); }
  get view(): EditorView | undefined { return [...this.views][0] ?? this.hidden ?? undefined; }
}

export const session = new ScriptSession();
