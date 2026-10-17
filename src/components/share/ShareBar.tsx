import { useEffect, useState } from 'react';
import { useProject } from '../../store/project';
import { useSync } from '../../sync/state';
import { useReview } from '../../sync/review';
import { ShareDialog, accessSummary } from './ShareDialog';
import { ReviewPanel } from './ReviewPanel';

/** Top-bar: who's here, connection state, changes to review, and the Share button. */
export function ShareBar({ compact }: { compact?: boolean } = {}) {
  const p = useProject();
  const sync = useSync();
  const toReview = useReview((s) => s.changes.filter((c) => c.status === 'pending').length);
  const [share, setShare] = useState(false);
  const [review, setReview] = useState(false);

  // Other parts of the app (e.g. the mood board) can open the share dialog.
  useEffect(() => {
    const open = () => setShare(true);
    const openReview = () => setReview(true);
    window.addEventListener('opengate:share', open);
    window.addEventListener('opengate:review', openReview);
    return () => { window.removeEventListener('opengate:share', open); window.removeEventListener('opengate:review', openReview); };
  }, []);

  return (
    <div className="share-bar">
      {p.share && (
        <span className={`sync-dot s-${sync.status}`} title={
          sync.status === 'live' ? 'Connected — changes sync live' : sync.status === 'offline' ? 'Offline — your changes are saved here and will sync when you reconnect' : sync.status === 'error' ? sync.error : 'Connecting…'
        }>{sync.status === 'live' ? '●' : sync.status === 'connecting' ? '◌' : sync.status === 'error' ? '⚠' : '○'}{sync.pending > 0 && <small>{sync.pending}</small>}</span>
      )}
      {!compact && sync.peers.length > 0 && (
        <span className="avatars">
          {sync.peers.slice(0, 5).map((x) => <i key={x.id} style={{ background: x.color }} title={`${x.name}${x.tab ? ` — in ${x.tab}` : ''}`}>{x.name[0]?.toUpperCase()}</i>)}
          {sync.peers.length > 5 && <small>+{sync.peers.length - 5}</small>}
        </span>
      )}
      {p.share && (toReview > 0 || review) && (
        <button className={`review-btn ${toReview ? 'has' : ''}`} onClick={() => setReview(!review)} title="Changes from collaborators to review">Review{toReview ? ` ${toReview}` : ''}</button>
      )}
      {!compact && p.share && !p.share.admin && sync.write && !sync.write.includes('*') && (
        <span className="access-pill" title={accessSummary(sync.write)}>{sync.write.length ? 'Limited' : 'View only'}</span>
      )}
      {!compact && <button className="share-btn" onClick={() => setShare(true)}>{p.share ? 'Share' : 'Share…'}</button>}
      {share && <ShareDialog onClose={() => setShare(false)} />}
      {review && <ReviewPanel onClose={() => setReview(false)} />}
    </div>
  );
}
