import { TextSelection } from 'prosemirror-state';
import { schema } from './schema';
import { session } from './session';
import { newId } from '../model/ids';

/**
 * Adds a scene to the end of the screenplay from any tab (stripboard, shot list, storyboard),
 * so work can start anywhere and still land in the one shared script. Returns the new sceneId.
 */
export function addSceneToScript(heading: string, action = ''): string {
  const id = newId();
  session.run((s) => {
    const nodes = [
      schema.node('sceneHeading', { sceneId: id, number: null }, heading.trim() ? [schema.text(heading.trim().toUpperCase())] : []),
      schema.node('action', null, action.trim() ? [schema.text(action.trim())] : []),
    ];
    // Replace a lone empty heading (brand-new script) instead of appending after it.
    const doc = s.doc;
    if (doc.childCount === 1 && doc.firstChild!.type.name === 'sceneHeading' && !doc.firstChild!.textContent.trim()) {
      return s.tr.replaceWith(0, doc.content.size, nodes);
    }
    const tr = s.tr.insert(doc.content.size, nodes);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size - 1)));
  });
  session.flush();
  return id;
}
