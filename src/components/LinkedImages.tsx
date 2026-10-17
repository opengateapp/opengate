import { useProject } from '../store/project';
import { useMediaUrl } from '../store/media';
import type { BoardItem } from '../model/types';

/** Mood-board images linked to a scene / location / character / shot, shown wherever that thing is edited. */
export function LinkedImages({ match, title = 'Mood board images', onOpenBoards }: { match: (i: BoardItem) => boolean; title?: string; onOpenBoards?: () => void }) {
  const p = useProject();
  const items = p.boards.flatMap((b) => b.items.filter((i) => (i.type === 'image' || i.type === 'swatch' || i.type === 'note') && match(i)).map((i) => ({ i, board: b.title })));
  if (!items.length) return null;
  return (
    <div className="linked-images">
      <div className="sheet-cat-head">{title} <span className="muted small">({items.length})</span>{onOpenBoards && <button className="link small" onClick={onOpenBoards}>Open boards</button>}</div>
      <div className="linked-grid">
        {items.slice(0, 24).map(({ i, board }) => <Thumb key={i.id} item={i} board={board} />)}
      </div>
    </div>
  );
}

function Thumb({ item, board }: { item: BoardItem; board: string }) {
  const url = useMediaUrl(item.imageId);
  const title = [item.caption, item.sourceUrl, `Board: ${board}`].filter(Boolean).join('\n');
  if (item.type === 'swatch') return <span className="linked-thumb swatch" style={{ background: item.color }} title={title} />;
  if (item.type === 'note') return <span className="linked-thumb note" style={{ background: item.color }} title={title}>{item.text?.slice(0, 40)}</span>;
  const src = url ?? item.imageUrl;
  const img = src ? <img src={src} alt={item.caption ?? ''} loading="lazy" /> : null;
  return item.sourceUrl
    ? <a className="linked-thumb" href={item.sourceUrl} target="_blank" rel="noreferrer noopener" title={title}>{img}</a>
    : <span className="linked-thumb" title={title}>{img}</span>;
}
