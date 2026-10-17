import { useEffect, useState } from 'react';
import { useDerived, useProject, useStore } from '../../store/project';
import type { Board, BoardItem } from '../../model/types';
import { BoardCanvas, type Tool } from './BoardCanvas';
import { newBoard, updateItems, removeItems, hostOf, NOTE_COLORS, INK_COLORS } from './boardOps';
import { Empty, Modal, toast } from '../../components/common';
import { PinterestImport } from './PinterestImport';
import { useSync } from '../../sync/state';
import { usePinterestInbox } from './pinterest';
import { deletedToast } from '../../components/deleted';
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

  const create = (kind: Board['kind']) => {
    const b = newBoard(kind, kind === 'mood' ? `Mood board ${p.boards.filter((x) => x.kind === 'mood').length + 1}` : `Whiteboard ${p.boards.filter((x) => x.kind === 'whiteboard').length + 1}`);
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
      <aside className="side boards-side" onDoubleClick={(e) => { if (e.target === e.currentTarget) create('mood'); }}>
        <div className="side-head"><b>Boards</b></div>
        <div className="row pad-x">
          <button className="small" onClick={() => create('mood')}>+ Mood board</button>
          <button className="small" onClick={() => create('whiteboard')}>+ Whiteboard</button>
        </div>
        <ul className="board-list">
          {p.boards.map((b) => (
            <li key={b.id} className={board?.id === b.id ? 'active' : ''} onClick={() => setBoardId(b.id)} onDoubleClick={() => setRenaming(b.id)}>
              <span className="bk">{b.kind === 'mood' ? '🖼' : '✎'}</span>
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
        {!p.boards.length && <p className="muted small pad">Double-click here or use the buttons to make a board.</p>}
        {board && <LinkTargets />}
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
            <button onClick={() => setPinOpen(true)} title="Import a Pinterest board with sections and source links">📌 Import Pinterest</button>
            {live.peers.filter((x) => x.tab === 'Mood Boards').length > 0 && (
              <span className="presence live" title="Here now">
                {live.peers.filter((x) => x.tab === 'Mood Boards').slice(0, 5).map((x) => <i key={x.id} style={{ background: x.color }} title={x.name}>{x.name[0]}</i>)}
              </span>
            )}
            <button onClick={() => window.dispatchEvent(new Event('opengate:share'))} title="Share the project (boards included) with collaborators">Share…</button>
            <button onClick={() => { update((dr) => { dr.boards = dr.boards.filter((x) => x.id !== board.id); }, 'Delete board'); setBoardId(null); deletedToast(`“${board.title}”`); }}>Delete board</button>
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
      {pinOpen && <PinterestImport boardId={board?.id ?? null} onClose={() => setPinOpen(false)} onBoard={setBoardId} />}
    </div>
  );
}

/** Drop targets: drag board items onto these to link them into the production. */
function LinkTargets() {
  const p = useProject();
  const d = useDerived();
  const [open, setOpen] = useState<'scenes' | 'locations' | 'characters' | 'shots'>('scenes');
  return (
    <div className="link-targets">
      <div className="side-head"><b>Link by dragging</b></div>
      <div className="side-tabs small">
        {(['scenes', 'locations', 'characters', 'shots'] as const).map((k) => <button key={k} className={open === k ? 'active' : ''} onClick={() => setOpen(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
      </div>
      <ul className="target-list">
        {open === 'scenes' && d.scenes.map((s) => <li key={s.id} data-link-target={`scene:${s.id}`}><b>{s.number}</b> {s.heading}</li>)}
        {open === 'locations' && p.locations.map((l) => <li key={l.id} data-link-target={`location:${l.id}`}>{l.realName || l.setName || 'Untitled location'}</li>)}
        {open === 'characters' && d.characters.map((c) => <li key={c.name} data-link-target={`character:${c.name}`}>{c.name}</li>)}
        {open === 'shots' && p.shots.map((s) => <li key={s.id} data-link-target={`shot:${s.id}`}><b>{s.shotNumber}</b> {s.name}</li>)}
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
      <div className="row"><b className="spacer">{({ image: 'Image', note: 'Note', text: 'Text', link: 'Link', swatch: 'Color', shape: 'Shape', frame: 'Section', stroke: 'Drawing' } as const)[item.type]}</b><button className="icon-btn" onClick={onClose}>×</button></div>
      {item.type === 'image' && (src || item.imageUrl) && <button className="detail-thumb" onClick={() => setBig(true)} title="View larger"><img src={src ?? item.imageUrl} alt="" /></button>}
      {item.type !== 'stroke' && item.type !== 'note' && item.type !== 'text' && (
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
      {item.type !== 'frame' && (
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
