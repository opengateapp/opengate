import { useMemo, useState } from 'react';
import { TextSelection } from 'prosemirror-state';
import { session } from '../script/session';

interface Match { from: number; to: number }

function findAll(query: string, caseSensitive: boolean): Match[] {
  const s = session.state;
  if (!s || !query) return [];
  const out: Match[] = [];
  const q = caseSensitive ? query : query.toLowerCase();
  s.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = caseSensitive ? node.textContent : node.textContent.toLowerCase();
    let i = text.indexOf(q);
    while (i >= 0) {
      out.push({ from: pos + 1 + i, to: pos + 1 + i + q.length });
      i = text.indexOf(q, i + q.length);
    }
    return false;
  });
  return out;
}

export function FindReplace({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [cs, setCs] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [tick, setTick] = useState(0);
  const matches = useMemo(() => findAll(q, cs), [q, cs, tick]);

  const go = (dir: 1 | -1) => {
    if (!matches.length) return;
    const n = (idx + dir + matches.length) % matches.length;
    setIdx(n);
    const m = matches[n];
    session.run((s) => s.tr.setSelection(TextSelection.create(s.doc, m.from, m.to)).scrollIntoView());
    session.view?.focus();
  };
  const replaceOne = () => {
    const m = matches[idx];
    if (!m) return go(1);
    session.run((s) => s.tr.insertText(rep, m.from, m.to));
    setTick((t) => t + 1);
  };
  const replaceAll = () => {
    session.run((s) => {
      const tr = s.tr;
      for (const m of [...matches].reverse()) tr.insertText(rep, m.from, m.to);
      return tr;
    });
    setTick((t) => t + 1);
    setIdx(-1);
  };

  return (
    <div className="find-panel" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } }}>
      <input autoFocus placeholder="Find" value={q} onChange={(e) => { setQ(e.target.value); setIdx(-1); }} />
      <input placeholder="Replace with" value={rep} onChange={(e) => setRep(e.target.value)} />
      <label className="check"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} /> Aa</label>
      <span className="muted small">{matches.length ? `${idx + 1 > 0 ? idx + 1 : '–'} / ${matches.length}` : 'No matches'}</span>
      <button onClick={() => go(-1)}>↑</button>
      <button onClick={() => go(1)}>↓</button>
      <button onClick={replaceOne}>Replace</button>
      <button onClick={replaceAll}>All</button>
      <button className="icon-btn" onClick={onClose}>×</button>
    </div>
  );
}
