import { useMemo, useRef, useState } from 'react';
import { useProject, useStore } from '../../store/project';
import type { CharacterRelationship } from '../../model/types';
import { useMediaUrl } from '../../store/media';
import { RELATIONSHIP_KINDS, TONES, kindOf, mapLayout, newRelationship, relationshipsOf, toneLabel } from '../../script/relationships';
import { Hint } from '../../components/Hint';
import { toast } from '../../components/common';

// Character relationships: a list on each character sheet, and a map of everyone.

interface Entry { name: string; portraitId?: string }

function useRelEdit() {
  const update = useStore((s) => s.update);
  const set = (id: string, patch: Partial<CharacterRelationship>, label: string | null = null) =>
    update((dr) => { const r = dr.relationships.find((x) => x.id === id); if (r) Object.assign(r, patch); }, label);
  const remove = (id: string) => update((dr) => { dr.relationships = dr.relationships.filter((x) => x.id !== id); }, 'Remove relationship');
  const add = (r: CharacterRelationship) => update((dr) => { dr.relationships.push(r); }, 'Add relationship');
  return { set, remove, add };
}

/** One relationship, editable, seen from `me`'s side. */
function RelationshipRow({ r, me, names, onOpen }: { r: CharacterRelationship; me?: string; names: string[]; onOpen?: (n: string) => void }) {
  const { set, remove } = useRelEdit();
  const other = me ? (r.a === me ? r.b : r.a) : r.b;
  const outgoing = !me || r.a === me;
  const k = kindOf(r.kind);
  return (
    <div className="rel-row" style={{ ['--rel' as string]: k.color }}>
      <div className="rel-main">
        {me ? (
          <button className="link rel-who" onClick={() => onOpen?.(other)} title={`Open ${other}`}>{other}</button>
        ) : (
          <span className="rel-pair">
            <select value={r.a} onChange={(e) => set(r.id, { a: e.target.value }, 'Edit relationship')}>{names.map((n) => <option key={n}>{n}</option>)}</select>
            <select value={r.b} onChange={(e) => set(r.id, { b: e.target.value }, 'Edit relationship')}>{names.map((n) => <option key={n}>{n}</option>)}</select>
          </span>
        )}
        {me && !r.oneWay ? null : (
          <button className={`icon-btn rel-dir ${r.oneWay ? 'on' : ''}`} title={r.oneWay ? (outgoing ? `Only ${me ?? r.a} → ${other}` : `Only ${other} → ${me}`) : 'Both ways — click for one way'}
            onClick={() => set(r.id, { oneWay: !r.oneWay }, 'Edit relationship')}>{r.oneWay ? (outgoing ? '→' : '←') : '↔'}</button>
        )}
        <select className="rel-kind" value={r.kind} onChange={(e) => set(r.id, { kind: e.target.value }, 'Edit relationship')}>
          {RELATIONSHIP_KINDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className="rel-tone" value={r.tone ?? 0} title="How it feels" onChange={(e) => set(r.id, { tone: Number(e.target.value) }, 'Edit relationship')}>
          {TONES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>
        <button className="icon-btn" title="Remove relationship" onClick={() => remove(r.id)}>×</button>
      </div>
      <input className="rel-label" value={r.label ?? ''} placeholder={outgoing ? `${me ?? r.a} is ${other}'s… (e.g. older sister, owes money to)` : `${other} is ${me}'s… (e.g. mentor)`}
        onChange={(e) => set(r.id, { label: e.target.value || undefined })} />
      <textarea className="rel-notes" rows={1} value={r.notes ?? ''} placeholder="Notes — history, what's unresolved, how it changes" onChange={(e) => set(r.id, { notes: e.target.value || undefined })} />
      {me && <label className="check small"><input type="checkbox" checked={!!r.oneWay} onChange={(e) => set(r.id, { oneWay: e.target.checked }, 'Edit relationship')} /> One way only ({outgoing ? `${me} → ${other}` : `${other} → ${me}`})</label>}
    </div>
  );
}

/** The Relationships section of a character sheet. */
export function RelationshipList({ name, entries, onOpen }: { name: string; entries: Entry[]; onOpen: (n: string) => void }) {
  const p = useProject();
  const { add } = useRelEdit();
  const mine = relationshipsOf(p, name);
  const others = entries.map((e) => e.name).filter((n) => n !== name);
  const [pick, setPick] = useState('');
  const create = (other: string) => {
    if (!other) return;
    add(newRelationship(name, other));
    setPick('');
  };
  return (
    <div className="rel-list">
      <h4>Relationships <span className="muted small">{mine.length ? `· ${mine.length}` : ''}</span></h4>
      {mine.map(({ r }) => <RelationshipRow key={r.id} r={r} me={name} names={others} onOpen={onOpen} />)}
      {others.length ? (
        <label className="inline-field rel-add">
          <span>＋ Relationship with</span>
          <select value={pick} onChange={(e) => create(e.target.value)}>
            <option value="">Choose a character…</option>
            {others.map((n) => <option key={n} value={n}>{n}{mine.some((m) => m.other === n) ? ' (again)' : ''}</option>)}
          </select>
        </label>
      ) : <p className="muted small">Add more characters to connect them.</p>}
    </div>
  );
}

/** Everyone and how they connect. Drag characters to arrange; click two in Connect mode to link them. */
export function RelationshipMap({ entries, onOpen }: { entries: Entry[]; onOpen: (n: string) => void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const { add } = useRelEdit();
  const svg = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showLonely, setShowLonely] = useState(true);
  const [connect, setConnect] = useState<string | null | false>(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ name: string; x: number; y: number; moved: boolean } | null>(null);

  const linked = new Set(p.relationships.flatMap((r) => [r.a, r.b]));
  const names = entries.map((e) => e.name).filter((n) => showLonely || linked.has(n));
  const pos = useMemo(() => mapLayout(p, names), [p, names.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const at = (n: string) => (drag?.name === n ? drag : pos[n]);
  const rels = p.relationships.filter((r) => !hidden.has(r.kind) && names.includes(r.a) && names.includes(r.b));
  const sel = p.relationships.find((r) => r.id === selected);

  const toSvg = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return { x: Math.max(60, Math.min(940, pt.x)), y: Math.max(60, Math.min(920, pt.y)) };
  };
  const nodeDown = (n: string, e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    setDrag({ name: n, ...pos[n], moved: false });
  };
  const nodeMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const pt = toSvg(e);
    if (Math.hypot(pt.x - drag.x, pt.y - drag.y) > 2 || drag.moved) setDrag({ ...drag, ...pt, moved: true });
  };
  const nodeUp = () => {
    if (!drag) return;
    const { name, x, y, moved } = drag;
    setDrag(null);
    if (moved) {
      update((dr) => {
        // Pin everyone where they are now, so the layout stays put.
        for (const [n, v] of Object.entries(pos)) if (!dr.characterMap[n]) dr.characterMap[n] = v;
        dr.characterMap[name] = { x: Math.round(x), y: Math.round(y) };
      }, 'Move on relationship map');
      return;
    }
    if (connect !== false) {
      if (connect === null) { setConnect(name); return; }
      if (connect !== name) {
        const r = newRelationship(connect, name);
        add(r);
        setSelected(r.id);
        toast(`Connected ${connect} and ${name}`);
      }
      setConnect(false);
      return;
    }
    onOpen(name);
  };

  return (
    <section className="main rel-map-wrap">
      <div className="toolbar">
        <button className={connect !== false ? 'active' : ''} onClick={() => setConnect(connect === false ? null : false)}>
          {connect === false ? '＋ Connect two characters' : connect ? `Now pick who ${connect} is connected to…` : 'Pick the first character…'}
        </button>
        <span className="rel-legend">
          {RELATIONSHIP_KINDS.map((k) => (
            <label key={k.id} className={`rel-chip ${hidden.has(k.id) ? 'off' : ''}`} style={{ ['--rel' as string]: k.color }}>
              <input type="checkbox" checked={!hidden.has(k.id)} onChange={(e) => setHidden((h) => { const n = new Set(h); if (e.target.checked) n.delete(k.id); else n.add(k.id); return n; })} />
              {k.label}
            </label>
          ))}
        </span>
        <span className="spacer" />
        <label className="check small"><input type="checkbox" checked={showLonely} onChange={(e) => setShowLonely(e.target.checked)} /> Unconnected characters</label>
        <button onClick={() => update((dr) => { dr.characterMap = mapLayout({ ...p, characterMap: {} }, names, true); }, 'Arrange relationship map')}>Arrange in a circle</button>
      </div>
      {!entries.length ? <p className="muted pad">Characters from your script appear here.</p> : (
        <div className="rel-map">
          <svg ref={svg} viewBox="0 0 1000 1000" onPointerMove={nodeMove} onPointerUp={nodeUp} onClick={() => setSelected(null)} role="img" aria-label="Relationship map">
            <defs>
              {RELATIONSHIP_KINDS.map((k) => (
                <marker key={k.id} id={`arrow-${k.id}`} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill={k.color} />
                </marker>
              ))}
            </defs>
            {rels.map((r) => {
              const A = at(r.a), B = at(r.b);
              if (!A || !B) return null;
              const k = kindOf(r.kind);
              const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
              // Parallel relationships between the same pair are fanned out a little.
              const twins = rels.filter((x) => (x.a === r.a && x.b === r.b) || (x.a === r.b && x.b === r.a));
              const off = (twins.indexOf(r) - (twins.length - 1) / 2) * 44;
              const nx = -dy / len * off, ny = dx / len * off;
              const x1 = A.x + dx / len * 54 + nx, y1 = A.y + dy / len * 54 + ny, x2 = B.x - dx / len * 54 + nx, y2 = B.y - dy / len * 54 + ny;
              const tone = r.tone ?? 0;
              return (
                <g key={r.id} className={`rel-edge ${selected === r.id ? 'sel' : ''}`} onClick={(e) => { e.stopPropagation(); setSelected(r.id); }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} className="hit" />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={k.color} strokeWidth={3 + Math.abs(tone) * 1.8} strokeDasharray={tone < 0 ? '9 6' : undefined}
                    markerEnd={r.oneWay ? `url(#arrow-${k.id})` : undefined} />
                  <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="rel-edge-label">{r.label || k.label}</text>
                </g>
              );
            })}
            {names.map((n) => {
              const e = entries.find((x) => x.name === n)!;
              const pt = at(n);
              if (!pt) return null;
              return <MapNode key={n} name={n} portraitId={e.portraitId} x={pt.x} y={pt.y} picked={connect === n} onDown={(ev) => nodeDown(n, ev)} />;
            })}
          </svg>
          <p className="muted small rel-help"><Hint>{'Drag characters to arrange them · click a character to open it · click a line to edit it · dashed = tense or hostile, thicker = stronger feelings, arrow = one way.'}</Hint></p>
        </div>
      )}
      {sel && (
        <div className="rel-edit card">
          <div className="row"><b>{sel.a} {sel.oneWay ? '→' : '↔'} {sel.b}</b><span className="muted small">· {kindOf(sel.kind).label} · {toneLabel(sel.tone)}</span><span className="spacer" /><button className="icon-btn" onClick={() => setSelected(null)}>✕</button></div>
          <RelationshipRow r={sel} names={entries.map((x) => x.name)} />
        </div>
      )}
    </section>
  );
}

function MapNode({ name, portraitId, x, y, picked, onDown }: { name: string; portraitId?: string; x: number; y: number; picked: boolean; onDown: (e: React.PointerEvent) => void }) {
  const url = useMediaUrl(portraitId);
  const clip = `clip-${name.replace(/[^A-Za-z0-9]/g, '_')}`;
  return (
    <g className={`rel-node ${picked ? 'picked' : ''}`} transform={`translate(${x} ${y})`} onPointerDown={onDown} onClick={(e) => e.stopPropagation()}>
      <circle r={48} className="rel-node-bg" />
      {url ? (
        <>
          <clipPath id={clip}><circle r={44} /></clipPath>
          <image href={url} x={-44} y={-44} width={88} height={88} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" />
        </>
      ) : <text textAnchor="middle" dy="0.35em" className="rel-node-initial">{name[0]}</text>}
      <text y={74} textAnchor="middle" className="rel-node-name">{name}</text>
    </g>
  );
}
