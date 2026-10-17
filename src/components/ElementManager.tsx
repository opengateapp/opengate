import { useState } from 'react';
import { Modal, toast } from './common';
import { useDerived, useProject, useStore } from '../store/project';
import { askConfirm } from './dialogs';
import { retagMarks, removeTagMarks, tagEverywhere } from '../script/tagging';

/** All breakdown elements across the project: rename (propagates everywhere), recategorize, merge, delete, auto-tag. */
export function ElementManager({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [filter, setFilter] = useState('');
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);

  const scenesFor = (id: string) => d.scenes.filter((s) => s.taggedElementIds.includes(id) || p.elements.find((e) => e.id === id)?.sceneIds.includes(s.id));
  const els = p.elements.filter((e) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal title="Breakdown elements" onClose={onClose} wide>
      <div className="toolbar">
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {mergeFrom && <span className="warn">Pick the element to merge “{p.elements.find((e) => e.id === mergeFrom)?.name}” into, or <button className="link" onClick={() => setMergeFrom(null)}>cancel</button></span>}
      </div>
      {p.categories.filter((c) => c.id !== 'cast').map((c) => {
        const list = els.filter((e) => e.categoryId === c.id);
        if (!list.length) return null;
        return (
          <div key={c.id} className="em-cat">
            <h4 style={{ color: c.color }}>{c.name} <span className="muted small">({list.length})</span></h4>
            <table className="table">
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className={mergeFrom === e.id ? 'sel' : ''}>
                    <td><input value={e.name} onChange={(ev) => update((dr) => { dr.elements.find((x) => x.id === e.id)!.name = ev.target.value; }, null)} /></td>
                    <td>
                      <select value={e.categoryId} onChange={(ev) => {
                        const cat = ev.target.value;
                        update((dr) => { dr.elements.find((x) => x.id === e.id)!.categoryId = cat; }, 'Change category');
                        retagMarks(e.id, e.id, cat);
                      }}>
                        {p.categories.filter((x) => x.id !== 'cast').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                    <td className="muted small">{scenesFor(e.id).map((s) => s.number).join(', ') || 'no scenes'}</td>
                    <td className="actions">
                      {mergeFrom && mergeFrom !== e.id ? (
                        <button onClick={() => {
                          const from = p.elements.find((x) => x.id === mergeFrom)!;
                          retagMarks(from.id, e.id, e.categoryId);
                          update((dr) => {
                            const to = dr.elements.find((x) => x.id === e.id)!;
                            to.sceneIds = [...new Set([...to.sceneIds, ...from.sceneIds])];
                            dr.elements = dr.elements.filter((x) => x.id !== from.id);
                          }, 'Merge elements');
                          setMergeFrom(null);
                        }}>Merge here</button>
                      ) : (
                        <>
                          <button title="Tag every mention of this name in the script" onClick={() => toast(`Tagged ${tagEverywhere(e.name, e.id, e.categoryId)} more mentions`)}>Tag all</button>
                          <button onClick={() => setMergeFrom(e.id)}>Merge…</button>
                          <button onClick={async () => {
                            if (!(await askConfirm(`Delete “${e.name}”?`, { message: 'Its highlights are removed from the script too.' }))) return;
                            removeTagMarks(e.id);
                            update((dr) => { dr.elements = dr.elements.filter((x) => x.id !== e.id); }, 'Delete element');
                          }}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {!p.elements.length && <p className="muted">No elements yet. In the Breakdown tab, select words in the script and click a category.</p>}
    </Modal>
  );
}
