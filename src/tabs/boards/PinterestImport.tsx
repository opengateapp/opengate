import { useEffect, useRef, useState } from 'react';
import { Modal, toast } from '../../components/common';
import { bookmarkletHref, isPinterestExport, pinterestToItems, usePinterestInbox, type PinterestExport } from './pinterest';
import { addItems, bounds, newBoard } from './boardOps';
import { useStore } from '../../store/project';

/** Pinterest import: install the bookmark once, then send boards from pinterest.com (or paste). */
export function PinterestImport({ boardId, onClose, onBoard }: { boardId: string | null; onClose: () => void; onBoard?: (id: string) => void }) {
  const pending = usePinterestInbox((s) => s.pending);
  const clear = usePinterestInbox((s) => s.set);
  const [data, setData] = useState<PinterestExport | null>(pending);
  const [paste, setPaste] = useState('');
  const [target, setTarget] = useState<'current' | 'new'>(boardId ? 'current' : 'new');
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => { if (pending) setData(pending); }, [pending]);
  // Set the javascript: URL directly (React warns about javascript: hrefs in JSX).
  useEffect(() => { link.current?.setAttribute('href', bookmarkletHref(location.origin + location.pathname)); }, []);

  const readPaste = (text: string) => {
    setPaste(text);
    try {
      const j = JSON.parse(text);
      if (isPinterestExport(j)) setData(j);
    } catch { /* keep typing */ }
  };

  const run = async () => {
    if (!data) return;
    let id = boardId;
    if (target === 'new' || !id) {
      const b = newBoard('mood', data.board.name || 'Pinterest board');
      useStore.getState().update((d) => { d.boards.push(b); }, 'New board');
      id = b.id;
      onBoard?.(b.id);
    }
    const board = useStore.getState().project!.boards.find((b) => b.id === id)!;
    const bb = bounds(board.items);
    const origin = { x: bb ? bb.x : 0, y: bb ? bb.y + bb.h + 120 : 0 };
    const total = data.sections.reduce((a, s) => a + s.pins.length, 0);
    setProgress([0, total]);
    try {
      const items = await pinterestToItems(data, origin, (d, t) => setProgress([d, t]));
      addItems(id, items, `Import Pinterest board (${total} pins)`);
      const remote = items.filter((i) => i.imageUrl).length;
      toast(`Imported ${items.filter((i) => i.type === 'image').length} pins${remote ? ` (${remote} shown from Pinterest's servers — they couldn't be copied)` : ''}. Press 0 on the board to fit.`);
      clear(null);
      onClose();
    } catch (e) {
      toast((e as Error).message);
      setProgress(null);
    }
  };

  const total = data?.sections.reduce((a, s) => a + s.pins.length, 0) ?? 0;
  const withSource = data?.sections.reduce((a, s) => a + s.pins.filter((p) => p.link).length, 0) ?? 0;

  return (
    <Modal title="Import a Pinterest board" onClose={() => { clear(null); onClose(); }} wide footer={
      <>
        <button onClick={() => { clear(null); onClose(); }}>Cancel</button>
        <button className="primary" disabled={!data || !!progress} onClick={run}>
          {progress ? `Importing ${progress[0]} / ${progress[1]}…` : data ? `Import ${total} pins` : 'Import'}
        </button>
      </>
    }>
      {!data && (
        <>
          <ol className="steps">
            <li>
              Drag this button to your browser's bookmarks bar:{' '}
              <a ref={link} className="bookmarklet" onClick={(e) => { e.preventDefault(); toast('Drag it to your bookmarks bar instead of clicking it here.'); }}>📌 Send to Open Gate</a>
            </li>
            <li>Open one of your boards on pinterest.com (a whole board, or a single section).</li>
            <li>Click <b>Send to Open Gate</b> in your bookmarks. The board's pins, sections, captions and source links come straight here.</li>
          </ol>
          <p className="small"><b>Added the bookmark before Oct 17?</b> Delete the old one and drag this one again — it now reads board sections more reliably.</p>
          <p className="muted small">
            Pinterest has no public way for other apps to read boards, so the bookmark reads the board in your own signed-in browser tab. If Pinterest changes its site and the bookmark stops working, it falls back to reading the pins on the page (without sections). Images belong to their creators — each one keeps its source link.
          </p>
          <label className="field"><span>Or paste what the bookmark copied</span>
            <textarea rows={4} value={paste} placeholder='{"source":"pinterest",…}' onChange={(e) => readPaste(e.target.value)} />
          </label>
        </>
      )}
      {data && (
        <>
          <div className="stats">
            <div><b>{data.board.name}</b></div>
            <div><b>{total}</b> pins</div>
            <div><b>{data.sections.filter((s) => s.name).length}</b> sections</div>
            <div><b>{withSource}</b> with source links</div>
          </div>
          {data.scraped && <p className="warn small">Read from the page, so sections and source links may be missing.</p>}
          {!data.scraped && !!data.notes?.length && <p className="muted small">Some parts were read from Pinterest's pages directly ({data.notes.join('; ')}).</p>}
          <ul className="pin-sections">
            {data.sections.map((s, i) => (
              <li key={i}>
                <b>{s.name || 'Pins not in a section'}</b> <span className="muted small">{s.pins.length} pins</span>
                <div className="pin-strip">{s.pins.slice(0, 12).map((p) => <img key={p.id} src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" />)}</div>
              </li>
            ))}
          </ul>
          <div className="row">
            <label className="check"><input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} /> New mood board</label>
            <label className="check"><input type="radio" checked={target === 'current'} disabled={!boardId} onChange={() => setTarget('current')} /> Add to this board</label>
          </div>
          <p className="muted small">Each Pinterest section becomes a labeled section frame. Images are copied into the project when Pinterest allows it; otherwise they're shown from Pinterest with the link kept.</p>
        </>
      )}
    </Modal>
  );
}
