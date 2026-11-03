import { Schema } from 'prosemirror-model';
import { schema as basic } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

// The rich text documents' schema (Docs, and the text boxes that use RichText).

export const docSchema = new Schema({
  nodes: addListNodes(basic.spec.nodes, 'paragraph block*', 'block'),
  marks: basic.spec.marks.addToEnd('underline', { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] }),
});

export function templateDoc(lines: string[]): unknown {
  const nodes = lines.length ? lines.map((l) => {
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) return docSchema.node('heading', { level: h[1].length }, [docSchema.text(h[2])]);
    return docSchema.node('paragraph', null, l ? [docSchema.text(l)] : []);
  }) : [docSchema.node('paragraph')];
  return docSchema.node('doc', null, nodes).toJSON();
}
