import { useState } from 'react';
import { useReview, setStatus, clearReviewed, type ReviewChange } from '../../sync/review';
import { CHANNEL_LABELS } from '../../sync/channels';
import { currentSync } from '../../sync/engine';
import { canWrite } from '../../sync/state';
import { toast } from '../common';

/** Others' changes that merged into your copy: accept (keep) or reject (undo for everyone). */
export function ReviewPanel({ onClose }: { onClose: () => void }) {
  const changes = useReview((s) => s.changes);
  const [open, setOpen] = useState<string | null>(null);
  const pending = changes.filter((c) => c.status === 'pending');
  const done = changes.filter((c) => c.status !== 'pending');

  const reject = (c: ReviewChange) => {
    const sync = currentSync();
    if (!sync) return;
    if (!canWrite(c.ch)) { toast(`Your link can't change ${CHANNEL_LABELS[c.ch]}, so you can't reject this.`); return; }
    const r = sync.reject(c);
    toast(r === 'rejected' ? 'Rejected — the change was undone for everyone' : 'Partly rejected — some of it was edited again since and was kept');
  };

  return (
    <aside className="review-panel" role="dialog" aria-label="Review changes">
      <div className="review-head">
        <h3>Changes from collaborators</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="muted small">Everyone's edits merge automatically, so nothing is lost — including edits made offline. Look them over here: <b>Accept</b> keeps a change, <b>Reject</b> undoes it for everyone.</p>
      {pending.length > 1 && (
        <div className="row"><span className="spacer" /><button className="small" onClick={() => pending.forEach((c) => setStatus(c.id, 'accepted'))}>Accept all ({pending.length})</button></div>
      )}
      {!pending.length && <p className="muted pad">Nothing to review.</p>}
      <ul className="review-list">
        {pending.slice().reverse().map((c) => (
          <li key={c.id} className={c.conflict ? 'conflict' : ''}>
            <div className="review-item-head" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <i style={{ background: c.color }}>{c.author[0]?.toUpperCase()}</i>
              <div>
                <b>{c.author}</b> · {CHANNEL_LABELS[c.ch]}
                <div className="muted small">{c.kind === 'script' ? c.script!.summary : `${c.entries.length} change${c.entries.length > 1 ? 's' : ''}`} · {ago(c.lastTime)}</div>
                {c.conflict && <div className="warn small">You had unsynced edits here too — check both versions.</div>}
              </div>
            </div>
            {open === c.id && (
              c.kind === 'script'
                ? <ScriptDiff before={c.script!.before} after={c.script!.after} />
                : (
                  <ul className="review-entries">
                    {c.entries.map((e) => (
                      <li key={e.key + (e.lost ? ':lost' : '')} className={e.lost ? 'lost' : ''}>
                        {e.label}
                        {e.lost && (e.usedTheirs
                          ? <span className="muted small"> · using theirs</span>
                          : <button className="link small" onClick={() => currentSync()?.useTheirs(c, e.key)}>Use theirs</button>)}
                      </li>
                    ))}
                  </ul>
                )
            )}
            <div className="row">
              <button className="small" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Hide' : 'Details'}</button>
              <span className="spacer" />
              <button className="small" onClick={() => reject(c)}>Reject</button>
              <button className="small primary" onClick={() => setStatus(c.id, 'accepted')}>Accept</button>
            </div>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <details className="review-done">
          <summary>Reviewed ({done.length}) <button className="link small" onClick={(e) => { e.preventDefault(); clearReviewed(); }}>Clear</button></summary>
          <ul>{done.slice().reverse().map((c) => <li key={c.id} className="muted small">{c.status === 'accepted' ? '✓ Accepted' : c.status === 'rejected' ? '↺ Rejected' : '◐ Partly rejected'} · {c.author} · {CHANNEL_LABELS[c.ch]}{c.note ? ` — ${c.note}` : ''}</li>)}</ul>
        </details>
      )}
    </aside>
  );
}

function ScriptDiff({ before, after }: { before: string[]; after: string[] }) {
  const text = (j: string) => {
    const n = JSON.parse(j) as { type: string; content?: { text?: string }[] };
    return { type: n.type, text: (n.content ?? []).map((t) => t.text ?? '').join('') };
  };
  return (
    <div className="script-diff">
      {before.map((b, i) => { const t = text(b); return <p key={'b' + i} className={`del el-${t.type}`}>{t.text || '(blank)'}</p>; })}
      {after.map((a, i) => { const t = text(a); return <p key={'a' + i} className={`ins el-${t.type}`}>{t.text || '(blank)'}</p>; })}
    </div>
  );
}

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
