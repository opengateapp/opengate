import { useEffect, useRef } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Node as PMNode } from 'prosemirror-model';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { docSchema } from '../tabs/DocsTab';

/** Small formatted-text box (bold, italic, underline, bullets). Reports the doc JSON and its plain text. */
export function docFromText(text: string) {
  const paras = text.split('\n').map((l) => docSchema.node('paragraph', null, l ? [docSchema.text(l)] : []));
  return docSchema.node('doc', null, paras.length ? paras : [docSchema.node('paragraph')]);
}

export function docToText(doc: PMNode): string {
  const out: string[] = [];
  doc.forEach((n) => {
    if (n.type === docSchema.nodes.bullet_list || n.type === docSchema.nodes.ordered_list) n.forEach((li) => out.push('• ' + li.textContent));
    else out.push(n.textContent);
  });
  return out.join('\n').replace(/\n+$/, '');
}

export function RichText({ value, text, onChange, placeholder }: { value?: unknown; text: string; onChange: (json: unknown, plain: string) => void; placeholder?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const lastPlain = useRef(text);

  const initialDoc = () => {
    // The stored formatting wins unless the plain text was edited elsewhere (e.g. in the Shot List).
    if (value) {
      try {
        const d = PMNode.fromJSON(docSchema, value);
        if (docToText(d) === text) return d;
      } catch { /* fall back to plain text */ }
    }
    return docFromText(text);
  };

  useEffect(() => {
    const s = docSchema;
    const v = new EditorView(host.current!, {
      state: EditorState.create({
        doc: initialDoc(),
        plugins: [
          history(),
          keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo, 'Mod-b': toggleMark(s.marks.strong), 'Mod-i': toggleMark(s.marks.em), 'Mod-u': toggleMark(s.marks.underline), Enter: splitListItem(s.nodes.list_item), Tab: sinkListItem(s.nodes.list_item), 'Shift-Tab': liftListItem(s.nodes.list_item) }),
          keymap(baseKeymap),
        ],
      }),
      dispatchTransaction(tr) {
        v.updateState(v.state.apply(tr));
        if (tr.docChanged) {
          const plain = docToText(v.state.doc);
          lastPlain.current = plain;
          cb.current(v.state.doc.toJSON(), plain);
        }
      },
      attributes: { 'data-placeholder': placeholder ?? '' },
    });
    view.current = v;
    return () => v.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Edited somewhere else (Shot List): reload as plain text.
  useEffect(() => {
    const v = view.current;
    if (!v || text === lastPlain.current) return;
    lastPlain.current = text;
    v.updateState(EditorState.create({ doc: docFromText(text), plugins: v.state.plugins }));
  }, [text]);

  const run = (c: Parameters<typeof toggleMark>[0] | 'bullets') => (e: React.MouseEvent) => {
    e.preventDefault();
    const v = view.current!;
    if (c === 'bullets') wrapInList(docSchema.nodes.bullet_list)(v.state, v.dispatch);
    else toggleMark(c)(v.state, v.dispatch);
    v.focus();
  };
  return (
    <div className="richtext">
      <div className="richtext-bar">
        <button onMouseDown={run(docSchema.marks.strong)} title="Bold (⌘B)"><b>B</b></button>
        <button onMouseDown={run(docSchema.marks.em)} title="Italic (⌘I)"><i>I</i></button>
        <button onMouseDown={run(docSchema.marks.underline)} title="Underline (⌘U)"><u>U</u></button>
        <button onMouseDown={run('bullets')} title="Bullets">•</button>
      </div>
      <div ref={host} className="richtext-body" />
    </div>
  );
}
