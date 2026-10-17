import { useEffect, useRef, useState } from 'react';
import { Schema, Node as PMNode, DOMSerializer } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { addListNodes, splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import { EditorState, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, setBlockType } from 'prosemirror-commands';
import { inputRules, wrappingInputRule, textblockTypeInputRule } from 'prosemirror-inputrules';
import { useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import { download, safeName } from '../io/files';
import { deletedToast } from '../components/deleted';
import { Empty } from '../components/common';

// Docs: treatments, synopses, director's notes, lookbook text — rich text saved in the project.

export const docSchema = new Schema({
  nodes: addListNodes(basic.spec.nodes, 'paragraph block*', 'block'),
  marks: basic.spec.marks.addToEnd('underline', { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] }),
});

const TEMPLATES: { title: string; body: string[] }[] = [
  { title: 'Blank document', body: [] },
  { title: 'Treatment', body: ['# Treatment', '## Logline', '', '## Synopsis', '', '## Characters', '', '## Tone & style', ''] },
  { title: 'Director’s notes', body: ['# Director’s notes', '## Vision', '', '## Visual approach', '', '## Performance', '', '## Sound & music', ''] },
  { title: 'Production notes', body: ['# Production notes', '## Budget', '', '## Schedule', '', '## Risks', ''] },
];

function templateDoc(lines: string[]): unknown {
  const nodes = lines.length ? lines.map((l) => {
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) return docSchema.node('heading', { level: h[1].length }, [docSchema.text(h[2])]);
    return docSchema.node('paragraph', null, l ? [docSchema.text(l)] : []);
  }) : [docSchema.node('paragraph')];
  return docSchema.node('doc', null, nodes).toJSON();
}

function plugins() {
  const s = docSchema;
  return [
    history(),
    inputRules({ rules: [
      textblockTypeInputRule(/^(#{1,3})\s$/, s.nodes.heading, (m) => ({ level: m[1].length })),
      wrappingInputRule(/^\s*([-+*])\s$/, s.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/, s.nodes.ordered_list),
      wrappingInputRule(/^\s*>\s$/, s.nodes.blockquote),
    ] }),
    keymap({
      'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo,
      'Mod-b': toggleMark(s.marks.strong), 'Mod-i': toggleMark(s.marks.em), 'Mod-u': toggleMark(s.marks.underline),
      Enter: splitListItem(s.nodes.list_item), Tab: sinkListItem(s.nodes.list_item), 'Shift-Tab': liftListItem(s.nodes.list_item),
      'Mod-Alt-1': setBlockType(s.nodes.heading, { level: 1 }), 'Mod-Alt-2': setBlockType(s.nodes.heading, { level: 2 }), 'Mod-Alt-0': setBlockType(s.nodes.paragraph),
    }),
    keymap(baseKeymap),
  ];
}

export function DocsTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const [docId, setDocId] = useState<string | null>(() => { try { return localStorage.getItem('slateline.doc'); } catch { return null; } });
  const [menu, setMenu] = useState(false);
  const doc = p.docs.find((x) => x.id === docId) ?? p.docs[0];
  useEffect(() => { if (doc) try { localStorage.setItem('slateline.doc', doc.id); } catch { /* ignore */ } }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = (t = TEMPLATES[0]) => {
    const d = { id: newId(), title: t.title === 'Blank document' ? 'Untitled document' : t.title, doc: templateDoc(t.body), updatedAt: new Date().toISOString() };
    update((dr) => { dr.docs.push(d); }, 'New document');
    setDocId(d.id);
    setMenu(false);
  };

  return (
    <div className="with-side docs-tab">
      <aside className="side" onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('doc-list')) create(); }}>
        <div className="side-head">
          <b>Documents</b>
          <div className="menu-wrap">
            <button className="small" onClick={() => setMenu(!menu)}>+ New</button>
            {menu && <div className="menu right-0">{TEMPLATES.map((t) => <button key={t.title} onClick={() => create(t)}>{t.title}</button>)}</div>}
          </div>
        </div>
        <ul className="doc-list">
          {p.docs.map((x) => (
            <li key={x.id} className={doc?.id === x.id ? 'active' : ''} onClick={() => setDocId(x.id)}>
              <span>{x.title || 'Untitled'}</span>
              <span className="muted small">{new Date(x.updatedAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
        {!p.docs.length && <p className="muted small pad">Double-click here to add a document.</p>}
      </aside>
      {doc ? <DocEditor key={doc.id} id={doc.id} /> : (
        <Empty title="No documents yet">
          <p className="muted">Treatments, synopses, director’s notes — anything that isn’t the screenplay.</p>
          <div className="row" style={{ justifyContent: 'center' }}>{TEMPLATES.map((t) => <button key={t.title} onClick={() => create(t)}>{t.title}</button>)}</div>
        </Empty>
      )}
    </div>
  );
}

function DocEditor({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const update = useStore((s) => s.update);
  const doc = useProject().docs.find((x) => x.id === id)!;

  useEffect(() => {
    const state = EditorState.create({ doc: PMNode.fromJSON(docSchema, doc.doc), plugins: plugins() });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const v = new EditorView(host.current!, {
      state,
      dispatchTransaction(tr) {
        v.updateState(v.state.apply(tr));
        if (tr.docChanged) {
          clearTimeout(timer);
          timer = setTimeout(() => save(v), 400);
        }
      },
    });
    const save = (vv: EditorView) => update((d) => {
      const x = d.docs.find((y) => y.id === id);
      if (x) { x.doc = vv.state.doc.toJSON(); x.updatedAt = new Date().toISOString(); }
    }, null);
    view.current = v;
    return () => { clearTimeout(timer); save(v); v.destroy(); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cmd = (c: Command) => () => {
    const v = view.current!;
    c(v.state, v.dispatch);
    v.focus();
  };
  const s = docSchema;

  const exportHtml = () => {
    const frag = DOMSerializer.fromSchema(s).serializeFragment(view.current!.state.doc.content);
    const div = document.createElement('div');
    div.appendChild(frag);
    download(`${safeName(doc.title)}.html`, `<!doctype html><meta charset="utf-8"><title>${doc.title}</title><style>body{font:16px/1.6 Georgia,serif;max-width:720px;margin:48px auto;padding:0 16px}</style>${div.innerHTML}`, 'text/html');
  };
  const exportMd = () => {
    const out: string[] = [];
    view.current!.state.doc.forEach((n) => {
      if (n.type === s.nodes.heading) out.push('#'.repeat(n.attrs.level) + ' ' + n.textContent);
      else if (n.type === s.nodes.bullet_list) n.forEach((li) => out.push('- ' + li.textContent));
      else if (n.type === s.nodes.ordered_list) { let i = 1; n.forEach((li) => out.push(`${i++}. ${li.textContent}`)); }
      else if (n.type === s.nodes.blockquote) out.push('> ' + n.textContent);
      else out.push(n.textContent);
      out.push('');
    });
    download(`${safeName(doc.title)}.md`, out.join('\n'), 'text/markdown');
  };

  return (
    <section className="main">
      <div className="toolbar">
        <input className="doc-title" value={doc.title} onChange={(e) => update((d) => { const x = d.docs.find((y) => y.id === id); if (x) x.title = e.target.value; }, null)} />
        <button onMouseDown={(e) => { e.preventDefault(); cmd(toggleMark(s.marks.strong))(); }} title="Bold (⌘B)"><b>B</b></button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(toggleMark(s.marks.em))(); }} title="Italic (⌘I)"><i>I</i></button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(toggleMark(s.marks.underline))(); }} title="Underline (⌘U)"><u>U</u></button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(setBlockType(s.nodes.heading, { level: 1 }))(); }} title="Heading 1 (or type # )">H1</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(setBlockType(s.nodes.heading, { level: 2 }))(); }} title="Heading 2 (or type ## )">H2</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(setBlockType(s.nodes.paragraph))(); }}>¶</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(wrapInList(s.nodes.bullet_list))(); }} title="Bullets (or type - )">• List</button>
        <button onMouseDown={(e) => { e.preventDefault(); cmd(wrapInList(s.nodes.ordered_list))(); }} title="Numbered (or type 1. )">1. List</button>
        <span className="spacer" />
        <button onClick={exportMd}>Export .md</button>
        <button onClick={exportHtml}>Export .html</button>
        <button onClick={() => { update((d) => { d.docs = d.docs.filter((x) => x.id !== id); }, 'Delete document'); deletedToast(`“${doc.title}”`); }}>Delete</button>
      </div>
      <div className="editor-scroll"><div className="doc-page" ref={host} /></div>
    </section>
  );
}
