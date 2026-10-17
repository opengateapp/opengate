import { useState } from 'react';
import type { Category } from '../model/types';
import { useProject, useStore } from '../store/project';
import { newId } from '../model/ids';

const SWATCHES = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

/** Category list for tagging, with a filter and "new tag" (name + color). Used by the dropdown and the selection pop-up. */
export function TagPicker({ onPick, compact }: { onPick: (c: Category) => void; compact?: boolean }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(SWATCHES[5]);
  const list = p.categories.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  const create = () => {
    const n = (name || q).trim();
    if (!n) return;
    const existing = p.categories.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) { onPick(existing); return; }
    const cat: Category = { id: 'c' + newId().slice(0, 8), name: n, color };
    update((d) => { d.categories.push(cat); }, `New tag: ${n}`);
    onPick(cat);
    setCreating(false);
    setName('');
    setQ('');
  };

  return (
    <div className={`tag-picker ${compact ? 'compact' : ''}`} onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); }}>
      <input className="tag-filter" placeholder="Find or create a tag…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { if (list.length === 1) onPick(list[0]); else if (!list.length) { setName(q); setCreating(true); } }
        }} />
      <div className="tag-list">
        {list.map((c) => {
          const i = p.categories.indexOf(c);
          return (
            <button key={c.id} onClick={() => onPick(c)} title={i < 9 ? `Alt+${i + 1}` : undefined}>
              <i style={{ background: c.color }} />{c.name}{i < 9 && <kbd>⌥{i + 1}</kbd>}
            </button>
          );
        })}
        {!list.length && <span className="muted small pad-x">No tag called “{q}”.</span>}
      </div>
      {creating ? (
        <div className="tag-create">
          <input autoFocus placeholder="Tag name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false); }} />
          <div className="swatches">
            {SWATCHES.map((s) => <button key={s} className={`swatch ${color === s ? 'on' : ''}`} style={{ background: s }} onClick={() => setColor(s)} aria-label={s} />)}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Any color" />
          </div>
          <div className="row"><button className="primary small" onClick={create} disabled={!(name || q).trim()}>Create &amp; tag</button><button className="small" onClick={() => setCreating(false)}>Cancel</button></div>
        </div>
      ) : (
        <button className="tag-new" onClick={() => { setName(q); setCreating(true); }}>+ New tag{q ? ` “${q}”` : ''}…</button>
      )}
    </div>
  );
}
