import { useEffect, useState } from 'react';
import { useDerived, useProject, useStore } from '../../store/project';
import type { Board, BoardItem } from '../../model/types';
import { BoardCanvas, type Tool } from './BoardCanvas';
import { newBoard, updateItems, removeItems, hostOf, arrange, addItems, makeItem, NOTE_COLORS, INK_COLORS } from './boardOps';
import { REF_MIME, TEMPLATES, openRef, templateItems, timelineOrder, type TemplateId } from './cards';
import { bibleOf } from '../../bible/bible';
import type { BoardRefKind } from '../../model/types';
import { Empty, Modal, toast } from '../../components/common';
import { PinterestImport } from './PinterestImport';
import { useSync } from '../../sync/state';
import { usePinterestInbox } from './pinterest';
import { deletedToast } from '../../components/deleted';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';
import { openActions } from '../../components/ActionSheet';
import { useMediaUrl } from '../../store/media';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: '➤' },
  { id: 'hand', label: 'Pan', key: 'H', icon: '✋' },
  { id: 'pen', label: 'Pen', key: 'P', icon: '✎' },
  { id: 'note', label: 'Sticky note', key: 'N', icon: '▤' },
  { id: 'text', label: 'Text', key: 'T', icon: 'T' },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: '◯' },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: '➝' },
  { id: 'frame', label: 'Section frame', key: 'F', icon: '⬚' },
  { id: 'connect', label: 'Connect two items', key: 'C', icon: '⤳' },
];

export function BoardsTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  const [boardId, setBoardId] = useState<string | null>(() => { try { return localStorage.getItem('slateline.board'); } catch { return null; } });
  const [selected, setSelected] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  // Default ink contrasts with the canvas (dark canvases in dark mode).
  const [ink, setInk] = useState(() => (document.documentElement.dataset.theme === 'dark' ? INK_COLORS[6] : INK_COLORS[0]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const board = p.boards.find((b) => b.id === boardId) ?? p.boards[0];
  const d = useDerived();
  const live = useSync();
  const pendingPins = usePinterestInbox((s) => s.pending);
  useEffect(() => { if (pendingPins) setPinOpen(true); }, [pendingPins]);
  // Other parts of the app (share links) can ask for a board to be shown.
  useEffect(() => {
    const onSel = (e: Event) => setBoardId((e as CustomEvent<string>).detail);
    window.addEventListener('slateline:select-board', onSel);
    return () => window.removeEventListener('slateline:select-board', onSel);
  }, []);

  useEffect(() => { if (board) try { localStorage.setItem('slateline.board', board.id); } catch { /* ignore */ } }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelected([]); }, [board?.id]);

  const [picking, setPicking] = useState(false);
  const create = (kind: Board['kind'], template?: TemplateId) => {
    const n = p.boards.filter((x) => x.kind === kind).length + 1;
    const b = newBoard(kind, kind === 'mood' ? `Mood board ${n}` : kind === 'story' ? `${template && template !== 'blank' ? TEMPLATES.find((t) => t.id === template)!.label : 'Story map'} ${n}` : `Whiteboard ${n}`);
    if (template) b.items = templateItems(template).map((it, i) => ({ ...it, z: it.type === 'frame' ? -1 - i : i + 1 }));
    update((d) => { d.boards.push(b); }, 'New board');
    setBoardId(b.id);
    setRenaming(b.id);
    if (kind === 'whiteboard') setTool('pen');
  };

  const link = (itemIds: string[], target: string) => {
    if (!board) return;
    const [kind, ...rest] = target.split(':');
    const val = rest.join(':');
    const field = ({ scene: 'sceneIds', location: 'locationIds', character: 'characters', shot: 'shotIds' } as const)[kind as 'scene'];
    if (!field) return;
    const imgs = board.items.filter((i) => itemIds.includes(i.id) && i.type !== 'frame');
    updateItems(board.id, imgs.map((i) => i.id), (it) => { it[field] = [...new Set([...(it[field] ?? []), val])]; }, 'Link to production');
    toast(`Linked ${imgs.length} item${imgs.length > 1 ? 's' : ''} — ${labelFor(target)}`);
  };

  const labelFor = (t: string) => {
    const [kind, ...rest] = t.split(':');
    const v = rest.join(':');
    if (kind === 'scene') return `scene ${d.sceneById.get(v)?.number ?? ''}`;
    if (kind === 'location') return p.locations.find((l) => l.id === v)?.realName || 'location';
    if (kind === 'shot') return `shot ${p.shots.find((s) => s.id === v)?.shotNumber ?? ''}`;
    return v;
  };
  const single = board && selected.length === 1 ? board.items.find((i) => i.id === selected[0]) : undefined;

  return (
    <div className="boards-tab">
      <aside className="side boards-side" data-panel="Boards" data-panel-pick onDoubleClick={(e) => { if (e.target === e.currentTarget) create('mood'); }}>
        <div className="side-head"><b>Boards</b></div>
        <div className="row pad-x new-board-row">
          <button className="small primary" onClick={(e) => openActions('New board', [
            { label: '🖼 Mood board — images, colours, references', run: () => create('mood') },
            { label: '✎ Whiteboard — sketch and plan', run: () => create('whiteboard') },
            { label: '🗺 Story map — connected cards, beats, timelines', run: () => setPicking(true) },
          ], { x: e.clientX, y: e.clientY })}>＋ New board</button>
        </div>
        <ul className="board-list">
          {p.boards.map((b) => (
            <li key={b.id} className={board?.id === b.id ? 'active' : ''} onClick={() => setBoardId(b.id)} onDoubleClick={() => setRenaming(b.id)}>
              <span className="bk">{b.kind === 'mood' ? '🖼' : b.kind === 'story' ? '🗺' : '✎'}</span>
              {renaming === b.id ? (
                <input autoFocus defaultValue={b.title} onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v) update((dr) => { dr.boards.find((x) => x.id === b.id)!.title = v; }, 'Rename board'); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} />
              ) : <span className="bt">{b.title}</span>}
              <span className="muted small">{b.items.length}</span>
              {b.roomId && <span className="live-dot" title="Shared live">●</span>}
            </li>
          ))}
        </ul>
        {!p.boards.length && <p className="muted small pad"><Hint>{'Double-click here or use the buttons to make a board.'}</Hint></p>}
        {board && <LinkTargets onAddCard={(kind, id) => { const c = makeItem('card', 0, 0, { ref: { kind, id } }); addItems(board.id, [c], 'Add card'); setSelected([c.id]); toast('Card added — it shows the latest details and opens on double-click'); }} />}
      </aside>

      {!board ? (
        <Empty title="No boards yet">
          <p className="muted">Mood boards collect images, colors and references. Whiteboards are for sketching and planning together.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="primary" onClick={() => create('mood')}>New mood board</button>
            <button onClick={() => create('whiteboard')}>New whiteboard</button>
          </div>
        </Empty>
      ) : (
        <section className="board-main">
          <div className="toolbar board-toolbar">
            <div className="seg tools">
              {TOOLS.map((t) => (
                <button key={t.id} className={tool === t.id ? 'active' : ''} title={`${t.label} (${t.key})`} onClick={() => setTool(t.id)}>{t.icon}</button>
              ))}
            </div>
            <div className="swatches small-sw">
              {INK_COLORS.map((c) => <button key={c} className={`swatch ${ink === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setInk(c)} aria-label={`Ink ${c}`} />)}
            </div>
            <span className="spacer" />
            <More label="Board actions">
            <select value="" aria-label="Arrange" title="Lay out the items on this board" onChange={(e) => {
              const mode = e.target.value as 'grid' | 'circle' | 'tree' | 'timeline';
              if (!mode) return;
              const pos = arrange(selected.length > 1 ? board.items.filter((i) => selected.includes(i.id) || i.type === 'connector') : board.items, mode, timelineOrder(p, d));
              updateItems(board.id, [...pos.keys()], (it) => { const q = pos.get(it.id)!; it.x = q.x; it.y = q.y; }, `Arrange (${mode})`);
            }}>
              <option value="">Arrange…</option><option value="grid">Grid</option><option value="circle">Circle</option><option value="tree">Tree (follows connectors)</option><option value="timeline">Timeline (story days)</option>
            </select>
            <button onClick={() => setPinOpen(true)} title="Import a Pinterest board with sections and source links">📌 Import Pinterest</button>
            {live.peers.filter((x) => x.tab === 'Mood Boards').length > 0 && (
              <span className="presence live" title="Here now">
                {live.peers.filter((x) => x.tab === 'Mood Boards').slice(0, 5).map((x) => <i key={x.id} style={{ background: x.color }} title={x.name}>{x.name[0]}</i>)}
              </span>
            )}
            <button onClick={() => window.dispatchEvent(new Event('opengate:share'))} title="Share the project (boards included) with collaborators">Share…</button>
            <button onClick={() => { update((dr) => { dr.boards = dr.boards.filter((x) => x.id !== board.id); }, 'Delete board'); setBoardId(null); deletedToast(`“${board.title}”`); }}>Delete board</button>
            </More>
          </div>
          <div className="board-area">
            <BoardCanvas board={board} selected={selected} onSelect={setSelected} onLinkDrop={link} tool={tool} setTool={setTool} ink={ink} />
            {single && <ItemDetails board={board} item={single} onClose={() => setSelected([])} />}
            {selected.length > 1 && (
              <div className="item-details multi">
                <b>{selected.length} selected</b>
                <p className="muted small">Drag them onto a scene, location, character or shot in the left panel to link them all.</p>
                <button onClick={() => { removeItems(board.id, selected); setSelected([]); }}>Delete</button>
              </div>
            )}
          </div>
        </section>
      )}
      {picking && (
        <Modal title="New story map" onClose={() => setPicking(false)}>
          <p className="muted small">A canvas for connecting ideas: cards for characters, places and scenes that stay up to date, notes with [[links]], and connectors that follow what they join.</p>
          <div className="template-list">
            {TEMPLATES.map((t) => <button key={t.id} className="template-pick" onClick={() => { create('story', t.id); setPicking(false); }}><b>{t.label}</b><span className="muted small">{t.hint}</span></button>)}
          </div>
        </Modal>
      )}
      {pinOpen && <PinterestImport boardId={board?.id ?? null} onClose={() => setPinOpen(false)} onBoard={setBoardId} />}
    </div>
  );
}

/** Drop targets: drag board items onto these to link them into the production. */
function LinkTargets({ onAddCard }: { onAddCard: (kind: BoardRefKind, id: string) => void }) {
  const p = useProject();
  const d = useDerived();
  const [open, setOpen] = useState<'scenes' | 'locations' | 'characters' | 'shots' | 'places'>('scenes');
  const places = bibleOf(p).places;
  const row = (kind: BoardRefKind, id: string, target: string | null, label: React.ReactNode) => (
    <li key={kind + id} {...(target ? { 'data-link-target': target } : {})} draggable onDragStart={(e) => { e.dataTransfer.setData(REF_MIME, JSON.stringify({ kind, id })); e.dataTransfer.effectAllowed = 'copy'; }}>
      <span className="grow">{label}</span>
      <button className="icon-btn add-card" title="Add as a card on the board" aria-label="Add as a card" onClick={() => onAddCard(kind, id)}>＋</button>
    </li>
  );
  return (
    <div className="link-targets keep-open">
      <div className="side-head"><b>Project</b></div>
      <p className="muted small pad-x"><Hint>{'Drag one onto the board for a live card (or ＋). Drag board images onto one here to link them.'}</Hint></p>
      <div className="side-tabs small">
        {(['scenes', 'characters', 'places', 'locations', 'shots'] as const).map((k) => <button key={k} className={open === k ? 'active' : ''} onClick={() => setOpen(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
      </div>
      <ul className="target-list">
        {open === 'scenes' && d.scenes.map((s) => row('scene', s.id, `scene:${s.id}`, <><b>{s.number}</b> {s.heading}</>))}
        {open === 'locations' && p.locations.map((l) => row('location', l.id, `location:${l.id}`, l.realName || l.setName || 'Untitled location'))}
        {open === 'characters' && d.characters.map((c) => row('character', c.name, `character:${c.name}`, c.name))}
        {open === 'shots' && p.shots.map((s) => row('shot', s.id, `shot:${s.id}`, <><b>{s.shotNumber}</b> {s.name}</>))}
        {open === 'places' && places.map((pl) => row('place', pl.id, null, pl.name))}
        {open === 'places' && !places.length && <li className="muted small">Add places in Write → Story Bible.</li>}
        {open === 'locations' && !p.locations.length && <li className="muted small">Add locations in Shoot → Locations.</li>}
        {open === 'shots' && !p.shots.length && <li className="muted small">No shots yet.</li>}
      </ul>
    </div>
  );
}

function ItemDetails({ board, item, onClose }: { board: Board; item: BoardItem; onClose: () => void }) {
  const p = useProject();
  const d = useDerived();
  const set = (patch: Partial<BoardItem>, label: string | null = null) => updateItems(board.id, [item.id], (it) => Object.assign(it, patch), label);
  const src = useMediaUrl(item.imageId);
  const [big, setBig] = useState(false);
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(item.sceneIds ?? []).map((id) => ({ key: 's' + id, label: `Sc ${d.sceneById.get(id)?.number ?? '?'}`, remove: () => set({ sceneIds: item.sceneIds!.filter((x) => x !== id) }, 'Unlink') })),
    ...(item.locationIds ?? []).map((id) => ({ key: 'l' + id, label: p.locations.find((l) => l.id === id)?.realName || 'Location', remove: () => set({ locationIds: item.locationIds!.filter((x) => x !== id) }, 'Unlink') })),
    ...(item.characters ?? []).map((n) => ({ key: 'c' + n, label: n, remove: () => set({ characters: item.characters!.filter((x) => x !== n) }, 'Unlink') })),
    ...(item.shotIds ?? []).map((id) => ({ key: 'h' + id, label: `Shot ${p.shots.find((s) => s.id === id)?.shotNumber ?? '?'}`, remove: () => set({ shotIds: item.shotIds!.filter((x) => x !== id) }, 'Unlink') })),
  ];
  const addLink = (v: string) => {
    if (!v) return;
    const [k, ...r] = v.split(':');
    const val = r.join(':');
    const f = ({ scene: 'sceneIds', location: 'locationIds', character: 'characters', shot: 'shotIds' } as const)[k as 'scene'];
    set({ [f]: [...new Set([...(item[f] ?? []), val])] } as Partial<BoardItem>, 'Link');
  };
  return (
    <div className="item-details" onPointerDown={(e) => e.stopPropagation()}>
      <div className="row"><b className="spacer">{({ image: 'Image', note: 'Note', text: 'Text', link: 'Link', swatch: 'Color', shape: 'Shape', frame: 'Section', stroke: 'Drawing', connector: 'Connector', card: 'Card' } as const)[item.type]}</b><button className="icon-btn" onClick={onClose}>×</button></div>
      {item.type === 'card' && item.ref && <button className="primary" onClick={() => openRef(item.ref!)}>Open</button>}
      {item.type === 'connector' && (
        <>
          <label className="field"><span>Label</span><input value={item.caption ?? ''} placeholder="e.g. sister of, betrays" onChange={(e) => set({ caption: e.target.value || undefined })} /></label>
          <div className="seg small">{(['none', 'end', 'both'] as const).map((a) => <button key={a} className={(item.arrow ?? 'end') === a ? 'active' : ''} onClick={() => set({ arrow: a }, 'Arrowheads')}>{a === 'none' ? '—' : a === 'end' ? '→' : '↔'}</button>)}</div>
          <label className="check"><input type="checkbox" checked={!!item.dashed} onChange={(e) => set({ dashed: e.target.checked }, 'Dashed')} /> Dashed</label>
          <div className="swatches">{['#71717A', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED', '#111827'].map((c) => <button key={c} className={`swatch ${item.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => set({ color: c }, 'Colour')} />)}</div>
          <button onClick={() => set({ from: item.to, to: item.from }, 'Reverse')}>Reverse direction</button>
        </>
      )}
      {item.type === 'image' && (src || item.imageUrl) && <button className="detail-thumb" onClick={() => setBig(true)} title="View larger"><img src={src ?? item.imageUrl} alt="" /></button>}
      {item.type !== 'stroke' && item.type !== 'note' && item.type !== 'text' && item.type !== 'card' && item.type !== 'connector' && (
        <label className="field"><span>{item.type === 'frame' ? 'Section title' : 'Caption'}</span><input value={item.caption ?? ''} onChange={(e) => set({ caption: e.target.value })} /></label>
      )}
      {(item.type === 'image' || item.type === 'link') && (
        <label className="field"><span>Source link</span>
          <div className="row"><input value={item.sourceUrl ?? ''} placeholder="https://…" onChange={(e) => set({ sourceUrl: e.target.value })} />
            {item.sourceUrl && <a className="button-like" href={item.sourceUrl} target="_blank" rel="noreferrer noopener" title="Open source">↗</a>}</div>
        </label>
      )}
      {item.pinUrl && <a className="small" href={item.pinUrl} target="_blank" rel="noreferrer noopener">Open pin on Pinterest ↗</a>}
      {item.type === 'image' && item.imageUrl && !item.imageId && <p className="muted small">Shown from the web (the site didn't allow a copy). If the original is removed, this image will disappear.</p>}
      {(item.type === 'note' || item.type === 'frame') && (
        <div className="swatches">{NOTE_COLORS.map((c) => <button key={c} className={`swatch ${item.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ color: c }, 'Color')} />)}</div>
      )}
      {(item.type === 'shape' || item.type === 'stroke' || item.type === 'text' || item.type === 'swatch') && (
        <label className="field"><span>Color</span><input type="color" value={item.color ?? '#000000'} onChange={(e) => set({ color: e.target.value })} /></label>
      )}
      {item.type !== 'frame' && item.type !== 'connector' && item.type !== 'card' && (
        <>
          <div className="field"><span>Linked to</span>
            <div className="chips">{chips.map((c) => <span key={c.key} className="chip">{c.label}<button className="icon-btn" onClick={c.remove}>×</button></span>)}{!chips.length && <span className="muted small">Nothing yet — drag onto the left panel, or pick:</span>}</div>
          </div>
          <select value="" onChange={(e) => addLink(e.target.value)}>
            <option value="">+ Link to…</option>
            <optgroup label="Scenes">{d.scenes.map((s) => <option key={s.id} value={`scene:${s.id}`}>{s.number}. {s.heading}</option>)}</optgroup>
            <optgroup label="Locations">{p.locations.map((l) => <option key={l.id} value={`location:${l.id}`}>{l.realName || l.setName}</option>)}</optgroup>
            <optgroup label="Characters">{d.characters.map((c) => <option key={c.name} value={`character:${c.name}`}>{c.name}</option>)}</optgroup>
            <optgroup label="Shots">{p.shots.map((s) => <option key={s.id} value={`shot:${s.id}`}>{s.shotNumber} {s.name}</option>)}</optgroup>
          </select>
        </>
      )}
      <button onClick={() => { removeItems(board.id, [item.id]); onClose(); }}>Delete</button>
      {big && (
        <Modal title={item.caption || hostOf(item.sourceUrl ?? '') || 'Image'} onClose={() => setBig(false)} wide>
          <img className="lightbox-img" src={src ?? item.imageUrl} alt="" />
          {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">{item.sourceUrl}</a>}
        </Modal>
      )}
    </div>
  );
}
