import { useProject } from '../../store/project';
import { useSync } from '../../sync/state';
import { useTabLock } from '../../store/tabLock';
import { editProjectHere } from '../../store/project';
import { toast } from '../common';
import { accessSummary } from './ShareDialog';

/** A slim note under the tabs when your link limits what you can change. */
export function AccessBanner() {
  const p = useProject();
  const { write, admin, status, error, hidden } = useSync();
  const some = hidden?.length ? ' Some tabs are hidden by your link.' : '';
  const elsewhere = useTabLock((s) => s.readOnly);
  if (elsewhere) return (
    <div className="access-banner tab-lock" role="status">
      This project is open in another tab of this browser, so it’s read only here (two tabs would overwrite each other’s changes).{' '}
      <button className="small primary" onClick={() => void editProjectHere().then(() => toast('You’re editing in this tab now; the other tab is read only.'))}>Use it here</button>
    </div>
  );
  if (!p.share) return null;
  if (status === 'error') return <div className="access-banner error">⚠ {error} You can keep working on this copy; use Share → Disconnect to make it your own.</div>;
  if (admin || !write || write.includes('*')) return null;
  if (!write.length) return <div className="access-banner">View only — you can look but not change anything in this shared project.{some}</div>;
  return <div className="access-banner">{accessSummary(write)} in this shared project — the rest is view only.{some}</div>;
}
