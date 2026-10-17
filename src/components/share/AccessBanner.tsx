import { useProject } from '../../store/project';
import { useSync } from '../../sync/state';
import { accessSummary } from './ShareDialog';

/** A slim note under the tabs when your link limits what you can change. */
export function AccessBanner() {
  const p = useProject();
  const { write, admin, status, error } = useSync();
  if (!p.share) return null;
  if (status === 'error') return <div className="access-banner error">⚠ {error} You can keep working on this copy; use Share → Disconnect to make it your own.</div>;
  if (admin || !write || write.includes('*')) return null;
  if (!write.length) return <div className="access-banner">View only — you can see everything in this shared project but not change it.</div>;
  return <div className="access-banner">{accessSummary(write)} in this shared project — other sections are view only.</div>;
}
